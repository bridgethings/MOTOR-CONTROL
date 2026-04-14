/*
 * modem_handler.cpp - SIMCOM A7672S 4G Modem Driver Implementation
 *
 * Based on proven working reference code for A7672S-LASC modem.
 * Uses TinyGSM for modem.init() and TCP client, but direct AT commands
 * for GPRS connection and NETOPEN (TinyGSM's gprsConnect is unreliable
 * on A7672X modems that auto-activate PDP context).
 */

#include "modem_handler.h"
#include "config.h"
#include "config_manager.h"
#include <HardwareSerial.h>

// UART for modem communication (using Serial2 like reference code)
#define SerialAT Serial2

// Global TinyGSM instances (extern declared in header)
TinyGsm       gsm_modem(SerialAT);
TinyGsmClient gsm_client(gsm_modem);

// SIM detection flag
static bool _simReady = false;

// --------------- Helper: wait for AT response -------------------
// Matches the reference code's waitFor() function exactly
bool modem_wait_for(String success, String failure, bool checkBoth, int timeout_ms) {
    unsigned long startMillis = millis();
    while (millis() - startMillis < (unsigned long)timeout_ms) {
        if (SerialAT.available()) {
            String response = SerialAT.readStringUntil('\n');
            Serial.printf("[AT] %s\n", response.c_str());  // Debug print
            if (response.indexOf(success) != -1) {
                return true;
            } else if (checkBoth && response.indexOf(failure) != -1) {
                return false;
            }
        }
        delay(10);
    }
    return false;
}

// --------------- Helper: close TCP/IP stack ---------------------
static bool net_close() {
    SerialAT.print("AT+NETCLOSE\r\n");
    if (modem_wait_for("+NETCLOSE: 0", "ERROR", true, 10000L)) {
        Serial.println("[MODEM] NETCLOSE success");
        return true;
    } else {
        Serial.println("[MODEM] NETCLOSE failed");
        return false;
    }
}

// --------------- Helper: open TCP/IP stack ----------------------
// Matches the reference code's openNet() with retries
static bool net_open(uint8_t retries) {
    uint8_t retry = 0;
    while (retry < retries) {
        SerialAT.print("AT+NETOPEN\r\n");
        if (modem_wait_for("+NETOPEN: 0", "+NETOPEN: 1", true, 10000L)) {
            Serial.println("[MODEM] NETOPEN success");
            return true;
        } else {
            Serial.println("[MODEM] NETOPEN failed, closing and retrying...");
            net_close();
        }
        delay(2000);
        retry++;
    }
    return false;
}

// --------------- Public API -------------------------

bool modem_init() {
    // Configure control pins
    pinMode(MODEM_POWER_PIN, OUTPUT);
    pinMode(MODEM_RESET_PIN, OUTPUT);
    digitalWrite(MODEM_RESET_PIN, LOW);

    // Power on the modem
    digitalWrite(MODEM_POWER_PIN, LOW);
    Serial.println("[MODEM] Power pin LOW - powering on");
    delay(1000);

    // Start UART
    SerialAT.begin(MODEM_BAUD, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
    delay(1000);

    // Reset modem and wait for it to boot
    Serial.println("[MODEM] Resetting modem...");
    modem_reset();

    // Wait for modem to be fully ready (look for boot messages)
    // Reference code waits for "RDY", "READY", "PB DONE", "ATREADY"
    Serial.println("[MODEM] Waiting for modem to boot...");
    unsigned long startMillis = millis();
    bool modemReady = false;
    while (millis() - startMillis < 60000L) {
        if (SerialAT.available() > 0) {
            String line = SerialAT.readStringUntil('\n');
            line.trim();
            Serial.printf("[MODEM BOOT] %s\n", line.c_str());
            if (line.indexOf("RDY") != -1 ||
                line.indexOf("READY") != -1 ||
                line.indexOf("PB DONE") != -1 ||
                line.indexOf("ATREADY") != -1) {
                Serial.println("[MODEM] Modem is UP");
                modemReady = true;
                break;
            }
        }
        delay(500);
    }

    if (!modemReady) {
        Serial.println("[MODEM] WARNING: No boot message received, trying AT anyway...");
    }

    // Verify AT communication
    Serial.println("[MODEM] Checking AT communication...");
    bool atOk = false;
    for (int i = 0; i < 10; i++) {
        SerialAT.println("AT");
        if (modem_wait_for("OK", "", false, 2000)) {
            Serial.println("[MODEM] AT communication OK");
            atOk = true;
            break;
        }
        delay(1000);
    }

    if (!atOk) {
        Serial.println("[MODEM] FAILED - no AT response");
        return false;
    }

    // Initialize TinyGSM (for modem info queries and TCP client)
    gsm_modem.init();

    // Print modem info
    String modemName = gsm_modem.getModemName();
    String modemInfo = gsm_modem.getModemInfo();
    Serial.printf("[MODEM] Name: %s\n", modemName.c_str());
    Serial.printf("[MODEM] Info: %s\n", modemInfo.c_str());
    Serial.printf("[MODEM] IMEI: %s\n", gsm_modem.getIMEI().c_str());

    // Check SIM card status
    Serial.println("[MODEM] Checking SIM card...");
    SerialAT.println("AT+CPIN?");
    if (modem_wait_for("READY", "ERROR", true, 5000)) {
        Serial.println("[MODEM] SIM card ready");
        _simReady = true;
    } else {
        Serial.println("[MODEM] SIM card NOT detected or not ready");
        _simReady = false;
        return false;
    }

    // Wait for network registration
    Serial.println("[MODEM] Waiting for network registration...");
    if (!gsm_modem.waitForNetwork(60000L, true)) {
        Serial.println("[MODEM] Network registration FAILED");
        return false;
    }

    Serial.printf("[MODEM] Registered on: %s\n", gsm_modem.getOperator().c_str());
    Serial.printf("[MODEM] Signal quality: %d\n", gsm_modem.getSignalQuality());

    return true;
}

bool modem_connect() {
    // Direct AT command approach (from proven reference code)
    // Step 1: Set APN (use stored config, falls back to compile-time default)
    Serial.printf("[MODEM] Setting APN: %s\n", networkConfig.apn);
    String apnCmd = String("AT+CGDCONT=1,\"IP\",\"") + networkConfig.apn + String("\"\r\n");
    SerialAT.print(apnCmd);
    delay(1000);

    // Step 2: Open TCP/IP network stack (AT+NETOPEN with retries)
    // This is the critical step - without NETOPEN, TCP connections won't work
    if (!net_open(10)) {
        Serial.println("[MODEM] NETOPEN failed after retries - restarting...");
        ESP.restart();
        return false;
    }

    // Step 3: Get IP address
    Serial.println("[MODEM] Getting IP address...");
    SerialAT.print("AT+IPADDR\r\n");
    unsigned long startMillis = millis();
    bool gotIp = false;
    while (millis() - startMillis < 5000L) {
        delay(500);
        if (SerialAT.available()) {
            String ipResponse = SerialAT.readStringUntil('\n');
            Serial.printf("[AT] %s\n", ipResponse.c_str());
            if (ipResponse.indexOf("+IPADDR:") != -1) {
                Serial.println("[MODEM] IP assigned!");
                ipResponse.replace("+IPADDR: ", "");
                Serial.printf("[MODEM] IP: %s\n", ipResponse.c_str());
                gotIp = true;
                break;
            }
        }
    }

    if (!gotIp) {
        Serial.println("[MODEM] WARNING: Could not read IP address");
    }

    // Step 4: Verify data connection via TinyGSM
    if (gsm_modem.isGprsConnected()) {
        Serial.println("[MODEM] Data connection verified!");
    } else {
        Serial.println("[MODEM] WARNING: isGprsConnected() returned false, but NETOPEN succeeded");
    }

    Serial.println("[MODEM] Data connection ready!");
    return true;
}

bool modem_is_sim_ready() {
    return _simReady;
}

bool modem_is_connected() {
    return _simReady && gsm_modem.isGprsConnected();
}

int modem_get_signal() {
    return gsm_modem.getSignalQuality();
}

String modem_get_imei() {
    return gsm_modem.getIMEI();
}

String modem_get_ip() {
    return gsm_modem.getLocalIP();
}

String modem_get_operator() {
    return gsm_modem.getOperator();
}

bool modem_reconnect_data() {
    Serial.println("[MODEM] Reconnecting data layer (NETCLOSE → NETOPEN)...");
    net_close();
    delay(2000);
    if (!net_open(3)) {
        Serial.println("[MODEM] Data reconnect FAILED");
        return false;
    }
    // Re-verify IP
    SerialAT.print("AT+IPADDR\r\n");
    delay(2000);
    while (SerialAT.available()) {
        String line = SerialAT.readStringUntil('\n');
        Serial.printf("[AT] %s\n", line.c_str());
    }
    Serial.println("[MODEM] Data reconnected OK");
    return true;
}

void modem_reset() {
    Serial.println("[MODEM] Performing hard reset...");
    digitalWrite(MODEM_RESET_PIN, HIGH);
    delay(5000);  // Keep reset asserted long enough (reference uses 5s)
    digitalWrite(MODEM_RESET_PIN, LOW);
    delay(1000);
    Serial.println("[MODEM] Reset released");
}
