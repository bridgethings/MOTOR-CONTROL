/*
 * ble_handler.h - BLE Server for Configuration
 *
 * BLE server with SPP-like characteristic for JSON command exchange.
 * Uses same UUIDs and protocol as reference BLE web application.
 * Runs BLE stack on Core 0 for responsiveness.
 */

#ifndef BLE_HANDLER_H
#define BLE_HANDLER_H

#include <Arduino.h>

// Command source tracking for response routing
enum CommandSource { CMD_SRC_BLE, CMD_SRC_MQTT };

// Initialize BLE server and start advertising
void ble_init();

// Start BLE command processing task on Core 0
void ble_start_task();

// Send response string via BLE (chunked if needed)
void ble_send_response(const String& jsonResponse);

// Send raw data via BLE characteristic (chunked)
void ble_send_data(const uint8_t* data, size_t len);

// Send log data callback (for BLELogger)
void ble_send_log(const String& logData);

// Check if BLE client is connected
bool ble_is_connected();

// Check if a command is pending from BLE
bool ble_command_pending();

// Get the pending command and clear the flag
// Sets commandSource to indicate where the command came from
String ble_get_pending_command(CommandSource& source);

// Queue a command from MQTT (called from Core 1)
void ble_queue_mqtt_command(const String& command);

// Get/set last command source (for response routing)
CommandSource ble_get_last_source();
void ble_set_last_source(CommandSource src);

#endif // BLE_HANDLER_H
