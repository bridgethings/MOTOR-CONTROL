/*
 * mqtt_handler.cpp - ThingsBoard MQTT Communication Implementation
 *
 * PubSubClient initialized at global scope with TinyGsmClient
 * (matching the proven reference code pattern).
 */

#include "modem_handler.h"   // Must be first (defines TINY_GSM_MODEM_SIM7600)
#include "mqtt_handler.h"
#include "config.h"

// PubSubClient must be included AFTER MQTT_MAX_PACKET_SIZE is defined
#define MQTT_MAX_PACKET_SIZE MQTT_BUFFER_SIZE
#include <PubSubClient.h>
#include <ArduinoJson.h>

// MQTT client - initialized at global scope with TinyGsmClient
// (same pattern as reference: PubSubClient mqtt(client))
PubSubClient mqttClient(gsm_client);

// User callbacks
static MqttRpcCallback  _rpcCallback  = nullptr;
static MqttAttrCallback _attrCallback = nullptr;

// Reconnect tracking
static unsigned long _lastReconnectAttempt = 0;

// --------------- Internal: MQTT message handler -------------------

static void _onMqttMessage(char* topic, byte* payload, unsigned int length) {
    // Null-terminate the payload for string operations
    char* message = (char*)malloc(length + 1);
    if (!message) {
        Serial.println("[MQTT] ERROR: malloc failed in callback");
        return;
    }
    memcpy(message, payload, length);
    message[length] = '\0';

    String topicStr(topic);
    Serial.printf("[MQTT] << Topic: %s\n", topic);
    Serial.printf("[MQTT] << Payload (%u bytes): %s\n", length, message);

    // ---- Server-side RPC request ----
    // Topic format: v1/devices/me/rpc/request/{requestId}
    if (topicStr.startsWith("v1/devices/me/rpc/request/")) {
        int requestId = topicStr.substring(strlen("v1/devices/me/rpc/request/")).toInt();

        if (_rpcCallback) {
            // Parse JSON to extract method and params
            StaticJsonDocument<512> doc;
            DeserializationError err = deserializeJson(doc, message);
            if (err) {
                Serial.printf("[MQTT] RPC JSON parse error: %s\n", err.c_str());
                // Send error response
                char errResp[128];
                snprintf(errResp, sizeof(errResp), "{\"error\":\"JSON parse failed: %s\"}", err.c_str());
                mqtt_send_rpc_response(requestId, errResp);
            } else {
                const char* method = doc["method"] | "unknown";

                // Serialize params back to string for the callback
                char paramsBuf[512];
                serializeJson(doc["params"], paramsBuf, sizeof(paramsBuf));

                _rpcCallback(method, paramsBuf, requestId);
            }
        } else {
            Serial.println("[MQTT] WARNING: RPC received but no callback registered");
        }
    }
    // ---- Shared attribute update ----
    // Topic: v1/devices/me/attributes
    else if (topicStr.equals("v1/devices/me/attributes")) {
        if (_attrCallback) {
            _attrCallback(message);
        }
    }
    // ---- Shared attribute request response ----
    // Topic format: v1/devices/me/attributes/response/{requestId}
    else if (topicStr.startsWith("v1/devices/me/attributes/response/")) {
        if (_attrCallback) {
            // The response contains {"shared":{...}} - extract the shared part
            StaticJsonDocument<512> doc;
            DeserializationError err = deserializeJson(doc, message);
            if (!err && doc.containsKey("shared")) {
                char sharedBuf[512];
                serializeJson(doc["shared"], sharedBuf, sizeof(sharedBuf));
                _attrCallback(sharedBuf);
            } else {
                // Pass raw message if no "shared" wrapper
                _attrCallback(message);
            }
        }
    }

    free(message);
}

// --------------- Internal: subscribe to ThingsBoard topics --------

static void _subscribeTopics() {
    // Subscribe to server-side RPC requests
    if (mqttClient.subscribe(TOPIC_RPC_REQUEST)) {
        Serial.println("[MQTT] Subscribed: RPC requests");
    } else {
        Serial.println("[MQTT] FAILED to subscribe: RPC requests");
    }
    delay(50); // Rate-limit mitigation

    // Subscribe to shared attribute updates (push from server)
    if (mqttClient.subscribe(TOPIC_ATTRIBUTES)) {
        Serial.println("[MQTT] Subscribed: Attribute updates");
    } else {
        Serial.println("[MQTT] FAILED to subscribe: Attribute updates");
    }
    delay(50); // Rate-limit mitigation

    // Subscribe to attribute request responses
    if (mqttClient.subscribe(TOPIC_ATTR_RESPONSE)) {
        Serial.println("[MQTT] Subscribed: Attribute responses");
    } else {
        Serial.println("[MQTT] FAILED to subscribe: Attribute responses");
    }
    delay(50); // Rate-limit mitigation
}

// --------------- Public API ---------------------------------------

void mqtt_init() {
    mqttClient.setServer(TB_SERVER, TB_PORT);
    mqttClient.setCallback(_onMqttMessage);
    mqttClient.setKeepAlive(60);
    // setBufferSize() is the ONLY reliable way to set the packet size.
    // The #define MQTT_MAX_PACKET_SIZE only affects this .cpp compilation unit,
    // not the PubSubClient library which is compiled separately with its 256-byte default.
    mqttClient.setBufferSize(MQTT_BUFFER_SIZE);

    Serial.printf("[MQTT] Initialized - Server: %s:%d, Buffer: %d bytes\n",
                  TB_SERVER, TB_PORT, MQTT_BUFFER_SIZE);
}

bool mqtt_connect() {
    if (mqttClient.connected()) {
        return true;
    }

    // Rate-limit reconnect attempts
    unsigned long now = millis();
    if (now - _lastReconnectAttempt < MQTT_RECONNECT_DELAY) {
        return false;
    }
    _lastReconnectAttempt = now;

    // Generate unique Client ID from MAC address to use as ThingsBoard Access Token
    uint64_t mac = ESP.getEfuseMac();
    char clientId[40];
    snprintf(clientId, sizeof(clientId), "%04X%08X_ACCTKN", (uint16_t)(mac >> 32), (uint32_t)mac);

    Serial.printf("[MQTT] Connecting to ThingsBoard (Token: %s)\n", clientId);

    // Provide the clientId as BOTH the client ID and the MQTT Username (ThingsBoard Access Token)
    if (mqttClient.connect(clientId, clientId, NULL)) {
        Serial.println("[MQTT] Connected to ThingsBoard!");
        delay(100); // Wait briefly before firing subscriptions
        _subscribeTopics();
        return true;
    }

    int state = mqttClient.state();
    Serial.printf("[MQTT] Connection FAILED, rc=%d ", state);
    switch (state) {
        case -4: Serial.println("(MQTT_CONNECTION_TIMEOUT)"); break;
        case -3: Serial.println("(MQTT_CONNECTION_LOST)"); break;
        case -2: Serial.println("(MQTT_CONNECT_FAILED)"); break;
        case -1: Serial.println("(MQTT_DISCONNECTED)"); break;
        case  1: Serial.println("(MQTT_BAD_PROTOCOL)"); break;
        case  2: Serial.println("(MQTT_BAD_CLIENT_ID)"); break;
        case  3: Serial.println("(MQTT_UNAVAILABLE)"); break;
        case  4: Serial.println("(MQTT_BAD_CREDENTIALS - check token!)"); break;
        case  5: Serial.println("(MQTT_UNAUTHORIZED)"); break;
        default: Serial.println("(UNKNOWN)"); break;
    }
    return false;
}

bool mqtt_is_connected() {
    return mqttClient.connected();
}

void mqtt_loop() {
    mqttClient.loop();
}

bool mqtt_send_telemetry(const char* json) {
    if (!mqttClient.connected()) return false;
    // Sanity check: warn if payload is close to the buffer limit
    size_t payloadLen = strlen(json);
    size_t packetLen  = payloadLen + strlen(TOPIC_TELEMETRY) + 4; // 4 = header(2)+topic_len(2)
    if (packetLen > MQTT_BUFFER_SIZE) {
        Serial.printf("[MQTT] ERROR: payload too large (%u bytes, limit %d)\n",
                      (unsigned)packetLen, MQTT_BUFFER_SIZE);
        return false;
    }
    bool ok = mqttClient.publish(TOPIC_TELEMETRY, json);
    if (!ok) {
        Serial.println("[MQTT] Telemetry publish FAILED - disconnecting to force reconnect");
        mqttClient.disconnect();  // socket is dead; let loop() detect and reconnect
    }
    return ok;
}

bool mqtt_send_attributes(const char* json) {
    if (!mqttClient.connected()) return false;
    bool ok = mqttClient.publish(TOPIC_ATTRIBUTES, json);
    if (!ok) {
        Serial.println("[MQTT] Attribute publish FAILED - disconnecting to force reconnect");
        mqttClient.disconnect();
    }
    return ok;
}

bool mqtt_request_attributes(int requestId, const char* keys) {
    if (!mqttClient.connected()) return false;

    // Build request topic: v1/devices/me/attributes/request/{id}
    char topic[64];
    snprintf(topic, sizeof(topic), "%s%d", TOPIC_ATTR_REQUEST, requestId);

    // Build request payload
    char payload[256];
    snprintf(payload, sizeof(payload), "{\"sharedKeys\":\"%s\"}", keys);

    Serial.printf("[MQTT] Requesting attributes: %s\n", keys);
    return mqttClient.publish(topic, payload);
}

bool mqtt_send_rpc_response(int requestId, const char* json) {
    if (!mqttClient.connected()) return false;

    // Build response topic: v1/devices/me/rpc/response/{id}
    char topic[64];
    snprintf(topic, sizeof(topic), "%s%d", TOPIC_RPC_RESPONSE, requestId);

    Serial.printf("[MQTT] >> RPC response [%d]: %s\n", requestId, json);
    bool ok = mqttClient.publish(topic, json);
    if (!ok) {
        Serial.println("[MQTT] RPC response publish FAILED - disconnecting to force reconnect");
        mqttClient.disconnect();
    }
    return ok;
}

void mqtt_set_rpc_callback(MqttRpcCallback cb) {
    _rpcCallback = cb;
}

void mqtt_set_attr_callback(MqttAttrCallback cb) {
    _attrCallback = cb;
}
