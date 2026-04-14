/*
 * ESP32_4G_TEST.ino - 4G Motor Controller Main Sketch
 *
 * Dual-core architecture:
 *   Core 0: BLE task (always responsive for web app commands)
 *   Core 1: Main loop (modem, MQTT, Modbus polling, motor control)
 *
 * Modules:
 *   - modem_handler:    SIMCOM A7672S 4G LTE connectivity
 *   - mqtt_handler:     ThingsBoard MQTT (telemetry, RPC, attributes)
 *   - ble_handler:      BLE server for local configuration via web app
 *   - ble_logger:       BLE log streaming
 *   - config_manager:   LittleFS persistence (profiles, slaves, motor config)
 *   - command_handler:  Unified JSON command dispatcher (BLE + MQTT)
 *   - modbus_handler:   RS485 Modbus RTU master (profile-based reading)
 *   - motor_controller: Non-blocking relay control + level tracking
 *   - rtc_handler:      PCF85063 RTC driver
 *   - status_led:       LED pattern status indicator
 *   - ota_manager:      SoftAP-based OTA firmware update
 *
 * Required Libraries:
 *   - TinyGSM by Volodymyr Shymanskyy
 *   - PubSubClient by Nick O'Leary
 *   - ArduinoJson by Benoit Blanchon (v6.x)
 *   - ModbusMaster by Doc Walker
 *   - PCF85063TP (RTC)
 *
 * ThingsBoard RPC Methods:
 *   - setMotorState     {"state": true/false}
 *   - getStatus         {}
 *   - restartDevice     {}
 *   - configCommand     {"cmd":"...", "section":"...", "data":{...}}
 */

#include "config.h"
#include "modem_handler.h"
#include "mqtt_handler.h"
#include "ble_handler.h"
#include "ble_logger.h"
#include "config_manager.h"
#include "command_handler.h"
#include "modbus_handler.h"
#include "motor_controller.h"
#include "rtc_handler.h"
#include "status_led.h"
#include "ota_manager.h"
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <Wire.h>
#include <PCF85063TP.h>
// =============================================================
//  GLOBAL OBJECTS
// =============================================================
StatusLED statusLed(STATUS_LED_PIN, true);
static bool bleConnectedFlag = false;

// =============================================================
//  TIMING TRACKERS
// =============================================================
static unsigned long lastTelemetryMs   = 0;
static unsigned long lastWdtFeedMs     = 0;
static unsigned long lastModemCheckMs  = 0;
static unsigned long lastModbusReadMs  = 0;
static unsigned long lastMqttConnectMs = 0;  // last ms MQTT was confirmed alive

// =============================================================
//  FORWARD DECLARATIONS
// =============================================================
void feedWatchdog();
void updateSystemStatus();
void publishTelemetry();
void publishDeviceAttributes();
void requestSharedAttributes();
void onRpcRequest(const char* method, const char* params, int requestId);
void onAttributeUpdate(const char* payload);
void processModbusAndLevel();

// =============================================================
//  SETUP
// =============================================================
void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("================================================");
    Serial.println("  ESP32 4G Motor Controller");
    Serial.printf("  Firmware: %s (built %s)\n", FW_VERSION, OTAManager::getBuildDate().c_str());
    uint64_t mac = ESP.getEfuseMac();
    Serial.printf("  MAC Address: %02X:%02X:%02X:%02X:%02X:%02X\n",
                  (uint8_t)(mac >> 0),
                  (uint8_t)(mac >> 8),
                  (uint8_t)(mac >> 16),
                  (uint8_t)(mac >> 24),
                  (uint8_t)(mac >> 32),
                  (uint8_t)(mac >> 40));
    Serial.println("================================================");
    Serial.println();

    // --- Step 1: Hardware watchdog ---
    pinMode(WDT_FEED_PIN, OUTPUT);
    feedWatchdog();

    // --- Step 2: Status LED ---
    statusLed.begin();

    // --- Step 3: LittleFS config ---
    Serial.println("[SETUP] Loading configuration...");
    if (!config_init()) {
        Serial.println("[SETUP] WARNING: Config init failed, using defaults");
    }

    // --- Step 4: RTC ---
    Serial.println("[SETUP] Initializing RTC...");
    if (rtc_init()) {
        Serial.printf("[SETUP] RTC time: %s\n", rtc_get_datetime_string().c_str());
    } else {
        Serial.println("[SETUP] RTC not available");
    }

    // --- Step 5: Motor controller ---
    Serial.println("[SETUP] Initializing motor controller...");
    motor_init();

    // --- Step 6: Modbus RS485 ---
    Serial.println("[SETUP] Initializing RS485 Modbus...");
    modbus_init();

    // --- Step 7: OTA manager ---
    otaManager.begin();
    OTAManager::markFirmwareValid();

    // --- Step 8: BLE Logger ---
    BLELogger::getInstance().begin(ble_send_log, &bleConnectedFlag);

    // --- Step 9: BLE server ---
    Serial.println("[SETUP] Initializing BLE...");
    ble_init();
    ble_start_task();  // Starts BLE processing on Core 0

    // --- Step 10: 4G Modem ---
    Serial.println("[SETUP] Initializing 4G Modem...");
    if (!modem_init()) {
        Serial.println("[SETUP] Modem init FAILED - will retry in loop()");
    } else {
        Serial.println("[SETUP] Connecting to data network...");
        if (modem_connect()) {
            Serial.println("[SETUP] Data network connected!");
        } else {
            Serial.println("[SETUP] Data connection FAILED - will retry in loop()");
        }
    }

    // --- Step 11: MQTT (only if SIM is present) ---
    if (modem_is_sim_ready()) {
        Serial.println("[SETUP] Initializing MQTT...");
        mqtt_init();
        mqtt_set_rpc_callback(onRpcRequest);
        mqtt_set_attr_callback(onAttributeUpdate);

        if (modem_is_connected()) {
            Serial.println("[SETUP] Connecting to ThingsBoard...");
            if (mqtt_connect()) {
                Serial.println("[SETUP] ThingsBoard connected!");
                delay(50);
                publishDeviceAttributes();
                delay(50);
                requestSharedAttributes();
            } else {
                Serial.println("[SETUP] MQTT connect failed - will retry in loop()");
            }
        }
    } else {
        Serial.println("[SETUP] No SIM card - skipping MQTT initialization");
    }

    // --- Initial status update ---
    updateSystemStatus();

    Serial.println();
    Serial.println("[SETUP] === Setup Complete ===");
    Serial.printf("[SETUP] Free heap: %u bytes\n", ESP.getFreeHeap());
    Serial.println();
}

// =============================================================
//  MAIN LOOP (Core 1)
// =============================================================
void loop() {
    unsigned long now = millis();

    // --- Feed external hardware watchdog ---
    if (now - lastWdtFeedMs >= WDT_FEED_INTERVAL) {
        feedWatchdog();
        lastWdtFeedMs = now;
    }

    // --- Update status LED ---
    updateSystemStatus();
    statusLed.update();

    // --- Motor relay state machine (non-blocking) ---
    motor_update();

    // --- OTA manager update ---
    otaManager.update();

    // --- BLE connected flag for logger ---
    bleConnectedFlag = ble_is_connected();

    // --- Process pending BLE/MQTT commands ---
    if (ble_command_pending()) {
        CommandSource src;
        String cmd = ble_get_pending_command(src);
        if (cmd.length() > 0) {
            processConfigCommand(cmd, src);
        }
    }

    // --- BLE Logger update ---
    BLELogger::getInstance().update();

    // --- Skip all heavy tasks while OTA is active ---
    // OTA (especially WiFi AP upload) needs uninterrupted CPU time.
    // Modbus reads, MQTT, and telemetry can interfere and cause upload failures.
    if (otaManager.isActive()) {
        return;  // Only WDT, LED, motor_update, OTA, BLE run during OTA
    }

    // --- Network operations (only when SIM is present) ---
    if (modem_is_sim_ready()) {

        if (mqtt_is_connected()) {
            // ── MQTT healthy ──────────────────────────────────────────────
            lastMqttConnectMs = now;
            mqtt_loop();

        } else if (modem_is_connected()) {
            // ── Data up, MQTT down: attempt reconnect ─────────────────────
            if (mqtt_connect()) {
                // Just (re)connected
                lastMqttConnectMs = now;
                
                // Rate-limit mitigation: Only sync attributes if >60s passed since last sync
                static unsigned long lastAttrSyncMs = 0;
                if (lastAttrSyncMs == 0 || (now - lastAttrSyncMs > 60000UL)) {
                    Serial.println("[LOOP] MQTT reconnected - syncing attributes (cooldown passed)");
                    lastAttrSyncMs = now;
                    delay(50);
                    publishDeviceAttributes();
                    delay(50);
                    requestSharedAttributes();
                } else {
                    Serial.println("[LOOP] MQTT reconnected - skipping attribute sync (cooling down)");
                }
            } else {
                // mqtt_connect() failed (or was rate-limited for 5 s)
                // Escalate: if MQTT has been down > 30 s, reset data layer
                unsigned long downMs = (lastMqttConnectMs > 0)
                                       ? (now - lastMqttConnectMs)
                                       : now;   // treat "never connected" as "down since boot"
                if (downMs > 30000UL) {
                    Serial.printf("[LOOP] MQTT down %lus - reconnecting data layer...\n",
                                  downMs / 1000UL);
                    lastMqttConnectMs = now;  // reset so we don't spam this
                    if (!modem_reconnect_data()) {
                        Serial.println("[LOOP] Data layer reconnect FAILED - restarting");
                        delay(2000);
                        ESP.restart();
                    }
                    // mqtt_connect() will be tried again next loop iteration
                }
            }

        } else {
            // ── Data connection lost ──────────────────────────────────────
            if (now - lastModemCheckMs >= MODEM_CHECK_INTERVAL) {
                lastModemCheckMs = now;
                Serial.println("[LOOP] Data connection lost - reconnecting...");
                modem_connect();
            }
        }

        // Periodic telemetry
        if (mqtt_is_connected() && (now - lastTelemetryMs >= systemSettings.telemetry_interval_ms)) {
            lastTelemetryMs = now;
            publishTelemetry();
        }
    }

    // --- Periodic Modbus reading + level check ---
    if (now - lastModbusReadMs >= systemSettings.modbus_poll_interval_ms) {
        lastModbusReadMs = now;
        if (!modbusReadPaused) {
            processModbusAndLevel();
        }
    }
}

// =============================================================
//  WATCHDOG FEED
// =============================================================
void feedWatchdog() {
    static bool wdtPinState = false;
    wdtPinState = !wdtPinState;
    digitalWrite(WDT_FEED_PIN, wdtPinState);
}

// =============================================================
//  SYSTEM STATUS -> LED PATTERN
// =============================================================
void updateSystemStatus() {
    SystemStatus status;
    status.networkConnected = modem_is_connected();
    status.mqttConnected    = mqtt_is_connected();
    status.modbusHealthy    = true;
    status.otaActive        = otaManager.isActive();
    status.criticalError    = false;
    statusLed.setStatus(status);
}

bool is_radar_reading_invalid(float level) {
    // Check for large error constants defined in config.h
    // (Cast to float for comparison with results from modbus_get_last_value)
    if (level == (float)RADAR_ERR_NO_DETECTION || 
        level == (float)RADAR_ERR_OVERFLOW || 
        level == (float)RADAR_ERR_OUT_OF_RANGE) {
        return true;
    }
    return false;
}

// =============================================================
//  MODBUS READ + LEVEL CHECK
// =============================================================
void processModbusAndLevel() {
    feedWatchdog();
    modbus_read_all_meters();
    feedWatchdog();

    // Level check: extract configured level parameter from level meter slave
    if (motorConfig.level_slave_id > 0 && strlen(motorConfig.level_param_name) > 0) {
        float currentLevel = modbus_get_last_value(
            motorConfig.level_slave_id,
            motorConfig.level_param_name
        );
        
        // --- Radar Retry Logic ---
        if (!isnan(currentLevel) && is_radar_reading_invalid(currentLevel)) {
            Serial.printf("[LEVEL] Invalid detection (%.0f) - starting retries...\n", currentLevel);
            
            for (int i = 0; i < RADAR_RETRY_COUNT; i++) {
                delay(1000); // 1 second delay between retries to allow sensor to stabilize
                feedWatchdog();
                
                if (modbus_read_slave(motorConfig.level_slave_id)) {
                    currentLevel = modbus_get_last_value(
                        motorConfig.level_slave_id,
                        motorConfig.level_param_name
                    );
                    
                    if (!isnan(currentLevel) && !is_radar_reading_invalid(currentLevel)) {
                        Serial.printf("[LEVEL] Normal reading recovered: %.4f (retry %d)\n", currentLevel, i+1);
                        break;
                    }
                }
                Serial.printf("[LEVEL] Retry %d/%d failed...\n", i+1, RADAR_RETRY_COUNT);
            }
        }
        
        if (!isnan(currentLevel)) {
            if (is_radar_reading_invalid(currentLevel)) {
                if (motor_is_running()) {
                    Serial.println("[LEVEL] CRITICAL: Sensor error persisted after retries - turning OFF motor");
                    motor_set_state(false);
                } else {
                    Serial.println("[LEVEL] WARNING: Sensor reporting error state (motor is idle)");
                }
            } else {
                level_check(currentLevel);
            }
        }
    }
}

// =============================================================
//  TELEMETRY PUBLISHING
// =============================================================
void publishTelemetry() {
    StaticJsonDocument<1024> doc;

    doc["signal_quality"] = modem_get_signal();
    doc["uptime_sec"]     = millis() / 1000;
    doc["free_heap"]      = ESP.getFreeHeap();

    doc["motor_running"]          = motor_is_running();
    doc["remote_control_enabled"] = motorConfig.remote_control_enabled;

    doc["current_level"]          = level_get_current();

    if (rtc_is_available()) {
        doc["rtc_time"] = rtc_get_datetime_string();
    }

    doc["ble_connected"] = ble_is_connected();
    doc["led_pattern"]   = StatusLED::getPatternName(statusLed.getCurrentPattern());

    char buf[1024];
    size_t len = serializeJson(doc, buf, sizeof(buf));

    Serial.printf("[TELEM] JSON (%u bytes): %s\n", (unsigned)len, buf);

    if (mqtt_send_telemetry(buf)) {
        Serial.printf("[TELEM] Sent OK\n");
    } else {
        Serial.println("[TELEM] Send FAILED");
    }
}

void publishMotorConfigAttributes() {
    StaticJsonDocument<256> doc;
    doc["remote_control_enabled"] = motorConfig.remote_control_enabled;
    doc["level_low_threshold"]    = motorConfig.level_low_threshold;
    doc["level_high_threshold"]   = motorConfig.level_high_threshold;
    doc["auto_turn_on"]           = motorConfig.auto_turn_on;
    doc["day_start_hour"]         = motorConfig.day_start_hour;

    char buf[256];
    serializeJson(doc, buf, sizeof(buf));

    if (mqtt_send_attributes(buf)) {
        Serial.printf("[ATTR] Motor Config Published: %s\n", buf);
    }
}

// =============================================================
//  PUBLISH DEVICE (CLIENT) ATTRIBUTES
// =============================================================
void publishDeviceAttributes() {
    StaticJsonDocument<256> doc;
    doc["firmware_version"] = FW_VERSION;
    doc["build_date"]       = OTAManager::getBuildDate();
    doc["ip_address"]       = modem_get_ip();
    doc["imei"]             = modem_get_imei();
    doc["operator"]         = modem_get_operator();
    doc["partition"]        = OTAManager::getPartitionInfo();

    char buf[256];
    serializeJson(doc, buf, sizeof(buf));

    if (mqtt_send_attributes(buf)) {
        Serial.printf("[ATTR] System Published: %s\n", buf);
    }

    // Also sync motor settings
    publishMotorConfigAttributes();
}

// =============================================================
//  REQUEST SHARED ATTRIBUTES FROM SERVER
// =============================================================
void requestSharedAttributes() {
    mqtt_request_attributes(1,
        "remote_control_enabled,"
        "level_low_threshold,"
        "level_high_threshold,"
        "auto_turn_on,"
        "day_start_hour"
    );
}

// =============================================================
//  RPC REQUEST HANDLER (Server -> Device)
// =============================================================
void onRpcRequest(const char* method, const char* params, int requestId) {
    Serial.printf("[RPC] Method: %s | Params: %s | ID: %d\n", method, params, requestId);

    char response[512];

    // ----- setMotorState -----
    if (strcmp(method, "setMotorState") == 0) {
        if (!motorConfig.remote_control_enabled) {
            snprintf(response, sizeof(response),
                "{\"success\":false,\"error\":\"Remote control is disabled\"}");
        } else {
            StaticJsonDocument<128> pdoc;
            deserializeJson(pdoc, params);
            bool newState;
            if (pdoc.is<JsonObject>()) {
                newState = pdoc["state"] | false;
            } else {
                newState = pdoc.as<bool>();
            }
            bool ok = motor_set_state(newState);
            snprintf(response, sizeof(response),
                "{\"success\":%s,\"motor_running\":%s}",
                ok ? "true" : "false",
                motor_is_running() ? "true" : "false");

            // Immediate telemetry update
            if (ok && mqtt_is_connected()) {
                char telBuf[64];
                snprintf(telBuf, sizeof(telBuf), "{\"motor_running\":%s}",
                    motor_is_running() ? "true" : "false");
                mqtt_send_telemetry(telBuf);
            }
        }
    }

    // ----- getStatus -----
    else if (strcmp(method, "getStatus") == 0) {
        StaticJsonDocument<512> rdoc;
        rdoc["motor_running"]          = motor_is_running();
        rdoc["signal_quality"]         = modem_get_signal();
        rdoc["uptime_sec"]             = millis() / 1000;
        rdoc["firmware"]               = FW_VERSION;
        rdoc["remote_control_enabled"] = motorConfig.remote_control_enabled;
        rdoc["level_low_threshold"]    = motorConfig.level_low_threshold;
        rdoc["level_high_threshold"]   = motorConfig.level_high_threshold;
        rdoc["auto_turn_on"]           = motorConfig.auto_turn_on;
        rdoc["day_start_hour"]         = motorConfig.day_start_hour;
        rdoc["free_heap"]              = ESP.getFreeHeap();
        rdoc["ble_connected"]          = ble_is_connected();

        rdoc["current_level"]          = level_get_current();

        if (rtc_is_available()) {
            rdoc["rtc_time"] = rtc_get_datetime_string();
        }

        serializeJson(rdoc, response, sizeof(response));
    }

    // ----- restartDevice -----
    else if (strcmp(method, "restartDevice") == 0) {
        snprintf(response, sizeof(response),
            "{\"success\":true,\"message\":\"Restarting in 1 second...\"}");
        mqtt_send_rpc_response(requestId, response);
        delay(1000);
        ESP.restart();
        return;
    }

    // ----- configCommand (forward to unified command handler) -----
    else if (strcmp(method, "configCommand") == 0) {
        // Forward params as JSON command to the command handler
        // Response is sent by command_handler via sendCommandResponse
        String cmdStr(params);
        processConfigCommand(cmdStr, CMD_SRC_MQTT);
        return;
    }

    // ----- Unknown method -----
    else {
        snprintf(response, sizeof(response),
            "{\"error\":\"Unknown RPC method: %s\"}", method);
    }

    mqtt_send_rpc_response(requestId, response);
}

// =============================================================
//  SHARED ATTRIBUTE UPDATE HANDLER (Server -> Device)
// =============================================================
void onAttributeUpdate(const char* payload) {
    Serial.printf("[ATTR] Received: %s\n", payload);

    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        Serial.printf("[ATTR] JSON parse error: %s\n", err.c_str());
        return;
    }

    bool changed = false;

    if (doc.containsKey("remote_control_enabled")) {
        motorConfig.remote_control_enabled = doc["remote_control_enabled"].as<bool>();
        Serial.printf("[ATTR] remote_control_enabled = %s\n",
            motorConfig.remote_control_enabled ? "true" : "false");
        changed = true;
    }

    if (doc.containsKey("level_low_threshold")) {
        motorConfig.level_low_threshold = doc["level_low_threshold"].as<float>();
        Serial.printf("[ATTR] level_low_threshold = %.2f\n", motorConfig.level_low_threshold);
        changed = true;
    }

    if (doc.containsKey("level_high_threshold")) {
        motorConfig.level_high_threshold = doc["level_high_threshold"].as<float>();
        Serial.printf("[ATTR] level_high_threshold = %.2f\n", motorConfig.level_high_threshold);
        changed = true;
    }

    if (doc.containsKey("auto_turn_on")) {
        motorConfig.auto_turn_on = doc["auto_turn_on"].as<bool>();
        Serial.printf("[ATTR] auto_turn_on = %s\n", motorConfig.auto_turn_on ? "true" : "false");
        changed = true;
    }

    if (doc.containsKey("day_start_hour")) {
        motorConfig.day_start_hour = doc["day_start_hour"].as<int>();
        Serial.printf("[ATTR] day_start_hour = %d\n", motorConfig.day_start_hour);
        changed = true;
    }

    if (changed) {
        saveMotorConfig();
        publishMotorConfigAttributes(); // Sync back to cloud to reflect changes on all UIs
    }
}
