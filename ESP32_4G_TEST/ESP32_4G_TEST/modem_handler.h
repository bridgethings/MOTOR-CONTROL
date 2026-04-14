/*
 * modem_handler.h - SIMCOM A7672S 4G Modem Driver
 *
 * Uses TinyGSM (SIM7600 mode) for modem init + TCP client.
 * Uses direct AT commands for GPRS/NETOPEN (proven reliable).
 *
 * Required Library: TinyGSM by Volodymyr Shymanskyy
 */

#ifndef MODEM_HANDLER_H
#define MODEM_HANDLER_H

// TinyGSM modem type - SIM7600 mode works with A7672S-LASC
#define TINY_GSM_MODEM_SIM7600

// Enable AT command debug on Serial (shows all AT traffic)
// Comment out the next line to disable modem debug output
#define TINY_GSM_DEBUG Serial

#include <TinyGsmClient.h>

// Modem and client instances (global, needed by PubSubClient at init)
extern TinyGsm       gsm_modem;
extern TinyGsmClient gsm_client;

// Initialize modem: power on, wait for boot, register on network
bool modem_init();

// Connect data: set APN, open TCP/IP stack (AT+NETOPEN), get IP
bool modem_connect();

// Check if SIM card is detected and ready
bool modem_is_sim_ready();

// Check if data connection is active
bool modem_is_connected();

// Get signal quality (0-31, 99=unknown)
int modem_get_signal();

// Get modem IMEI
String modem_get_imei();

// Get assigned IP address
String modem_get_ip();

// Get network operator name
String modem_get_operator();

// Lightweight data reconnect: NETCLOSE → NETOPEN (no modem reset)
// Use when MQTT/data fails but modem is still registered on network
bool modem_reconnect_data();

// Hardware reset the modem
void modem_reset();

// Wait for a specific response string from modem serial
// Returns true if 'success' string found, false if 'failure' found or timeout
bool modem_wait_for(String success, String failure, bool checkBoth, int timeout_ms);

#endif // MODEM_HANDLER_H
