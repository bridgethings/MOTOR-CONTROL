/*
 * mqtt_handler.h - ThingsBoard MQTT Communication
 *
 * Handles MQTT connection to ThingsBoard server:
 *   - Telemetry publishing
 *   - Client attribute publishing
 *   - Shared attribute subscription & requests
 *   - Server-side RPC handling
 *
 * Required Libraries:
 *   - PubSubClient by Nick O'Leary (install via Arduino Library Manager)
 *   - ArduinoJson by Benoit Blanchon v6.x (install via Arduino Library Manager)
 */

#ifndef MQTT_HANDLER_H
#define MQTT_HANDLER_H

#include <Arduino.h>

// --- Callback types ---

// RPC callback: called when server sends an RPC request
//   method    - RPC method name (e.g. "setMotorState")
//   params    - Parameters as JSON string (e.g. "{\"state\":true}")
//   requestId - ThingsBoard RPC request ID (for sending response)
typedef void (*MqttRpcCallback)(const char* method, const char* params, int requestId);

// Attribute callback: called when server updates shared attributes
//   payload - JSON string with updated attributes
typedef void (*MqttAttrCallback)(const char* payload);

// --- Public API ---

// Initialize MQTT client (call AFTER modem_init and modem_connect)
void mqtt_init();

// Connect to ThingsBoard MQTT broker
// Returns true if connected successfully
bool mqtt_connect();

// Check if MQTT is currently connected
bool mqtt_is_connected();

// Process incoming MQTT messages - MUST be called in loop()
void mqtt_loop();

// Publish telemetry data as JSON string
// Example: mqtt_send_telemetry("{\"temperature\":25.5,\"humidity\":60}")
bool mqtt_send_telemetry(const char* json);

// Publish client-side attributes as JSON string
// Example: mqtt_send_attributes("{\"firmware_version\":\"1.0.0\"}")
bool mqtt_send_attributes(const char* json);

// Request shared attributes from server by key names
// requestId: unique ID for matching response
// keys: comma-separated list of attribute keys
bool mqtt_request_attributes(int requestId, const char* keys);

// Send RPC response back to server
bool mqtt_send_rpc_response(int requestId, const char* json);

// Register callback for server-side RPC requests
void mqtt_set_rpc_callback(MqttRpcCallback cb);

// Register callback for shared attribute updates
void mqtt_set_attr_callback(MqttAttrCallback cb);

#endif // MQTT_HANDLER_H
