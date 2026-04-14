/*
 * ble_handler.cpp - BLE Server Implementation
 *
 * Based on reference BLE implementation patterns.
 * Uses BLEDevice with SPP-like characteristic for JSON commands.
 */

#include "ble_handler.h"
#include "config.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <esp_gap_ble_api.h>

// BLE objects
static BLEServer*         pServer         = NULL;
static BLECharacteristic* pCharacteristic = NULL;
static bool               _deviceConnected = false;
static String             _bleReceivedCommand = "";

// Command queue (Core 0 -> Core 1)
static char               _pendingCommandBuffer[BLE_MAX_CMD_LEN + 1];
static volatile bool      _commandReady = false;
static volatile CommandSource _lastCommandSource = CMD_SRC_BLE;
static portMUX_TYPE       _commandMux = portMUX_INITIALIZER_UNLOCKED;

// Task handle
static TaskHandle_t       _bleTaskHandle = NULL;

// Send mutex to prevent concurrent BLE writes from multiple contexts
static SemaphoreHandle_t  _bleSendMux = NULL;

// Forward declarations
static void bleCommandTask(void* parameter);

// ============================================================
//  BLE CALLBACKS
// ============================================================

// Flag: welcome message not yet sent for this connection
static bool _welcomeSent = false;

class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* pServer, esp_ble_gatts_cb_param_t* param) {
        _deviceConnected = true;
        _welcomeSent = false;
        Serial.println("[BLE] Client connected");
        BLEDevice::getAdvertising()->stop();

        // Request longer connection interval + supervision timeout for stability.
        // This prevents disconnects when Core 1 is busy with Modbus/MQTT.
        esp_ble_conn_update_params_t conn_params = {};
        memcpy(conn_params.bda, param->connect.remote_bda, sizeof(esp_bd_addr_t));
        conn_params.min_int  = 0x10;   // 20ms   (0x10 * 1.25ms)
        conn_params.max_int  = 0x30;   // 60ms   (0x30 * 1.25ms)
        conn_params.latency  = 0;
        conn_params.timeout  = 600;    // 6000ms (600 * 10ms)
        esp_ble_gap_update_conn_params(&conn_params);

        // NOTE: Do NOT send welcome message here. The client hasn't completed
        // service discovery / notification subscription yet. Sending a notify()
        // before the client subscribes causes an immediate disconnect.
        // Welcome is sent on the first write from the client instead.
    }

    void onConnect(BLEServer* pServer) {
        // Fallback - called if the overload above isn't triggered
    }

    void onDisconnect(BLEServer* pServer) {
        _deviceConnected = false;
        _welcomeSent = false;
        _bleReceivedCommand = "";
        Serial.println("[BLE] Client disconnected");
        delay(500);
        BLEDevice::startAdvertising();
    }
};

class MyCharacteristicCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pChar) {
        // Send welcome message on first write (client has subscribed by now)
        if (!_welcomeSent) {
            _welcomeSent = true;
            String welcome = "{\"status\":\"connected\",\"device\":\"4G Motor Controller\",\"version\":\"";
            welcome += FW_VERSION;
            welcome += "\"}\n";
            ble_send_response(welcome);
        }

        std::string rxValue = pChar->getValue();

        if (rxValue.length() > 0) {
            for (size_t i = 0; i < rxValue.length(); i++) {
                char c = rxValue[i];

                if (c == '\n') {
                    // Complete command received
                    portENTER_CRITICAL(&_commandMux);
                    strncpy(_pendingCommandBuffer, _bleReceivedCommand.c_str(), BLE_MAX_CMD_LEN);
                    _pendingCommandBuffer[BLE_MAX_CMD_LEN] = '\0';
                    _commandReady = true;
                    _lastCommandSource = CMD_SRC_BLE;
                    portEXIT_CRITICAL(&_commandMux);

                    _bleReceivedCommand = "";
                } else {
                    _bleReceivedCommand += c;

                    if (_bleReceivedCommand.length() > BLE_MAX_CMD_LEN) {
                        Serial.println("[BLE] Command buffer overflow");
                        _bleReceivedCommand = "";
                        ble_send_response("{\"status\":\"error\",\"error_code\":1000,\"message\":\"Command too long\"}\n");
                    }
                }
            }
        }
    }
};

// ============================================================
//  BLE SEND FUNCTIONS
// ============================================================

void ble_send_data(const uint8_t* data, size_t len) {
    if (!_deviceConnected || pCharacteristic == NULL) return;
    if (_bleSendMux == NULL) return;

    // Protect against concurrent sends from different contexts
    if (xSemaphoreTake(_bleSendMux, pdMS_TO_TICKS(1000)) != pdTRUE) {
        Serial.println("[BLE] Send mutex timeout");
        return;
    }

    size_t offset = 0;
    while (offset < len && _deviceConnected) {
        size_t chunkSize = min((size_t)(len - offset), (size_t)BLE_CHUNK_SIZE);
        pCharacteristic->setValue((uint8_t*)(data + offset), chunkSize);
        pCharacteristic->notify();
        offset += chunkSize;
        if (offset < len) {
            delay(50); // Increased from 30ms for higher stability
        }
    }

    xSemaphoreGive(_bleSendMux);
}

void ble_send_response(const String& jsonResponse) {
    String resp = jsonResponse;
    if (!resp.endsWith("\n")) {
        resp += "\n";
    }
    Serial.printf("[BLE] Sending response (%d bytes)\n", resp.length());
    ble_send_data((uint8_t*)resp.c_str(), resp.length());
}

void ble_send_log(const String& logData) {
    if (_deviceConnected && pCharacteristic != NULL) {
        ble_send_data((uint8_t*)logData.c_str(), logData.length());
    }
}

// ============================================================
//  PUBLIC API
// ============================================================

void ble_init() {
    _bleSendMux = xSemaphoreCreateMutex();

    BLEDevice::init(BLE_DEVICE_NAME);
    BLEDevice::setMTU(BLE_MTU_SIZE);

    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());

    BLEService* pService = pServer->createService(BLE_SERVICE_UUID);

    pCharacteristic = pService->createCharacteristic(
        BLE_CHAR_UUID,
        BLECharacteristic::PROPERTY_WRITE_NR | BLECharacteristic::PROPERTY_NOTIFY
    );
    pCharacteristic->addDescriptor(new BLE2902());
    pCharacteristic->setCallbacks(new MyCharacteristicCallbacks());

    pService->start();

    BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(BLE_SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);   // Min connection interval hint (7.5ms)
    pAdvertising->setMaxPreferred(0x12);   // Max connection interval hint (22.5ms)
    BLEDevice::startAdvertising();

    Serial.printf("[BLE] Server started - Name: %s\n", BLE_DEVICE_NAME);
}

void ble_start_task() {
    xTaskCreatePinnedToCore(
        bleCommandTask,
        "BLE_Task",
        4096,
        NULL,
        1,
        &_bleTaskHandle,
        0  // Core 0
    );
    Serial.println("[BLE] Task started on Core 0");
}

static void bleCommandTask(void* parameter) {
    while (true) {
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

bool ble_is_connected() {
    return _deviceConnected;
}

bool ble_command_pending() {
    return _commandReady;
}

String ble_get_pending_command(CommandSource& source) {
    String cmd = "";
    portENTER_CRITICAL(&_commandMux);
    if (_commandReady) {
        cmd = String(_pendingCommandBuffer);
        source = _lastCommandSource;
        _commandReady = false;
    }
    portEXIT_CRITICAL(&_commandMux);
    return cmd;
}

void ble_queue_mqtt_command(const String& command) {
    portENTER_CRITICAL(&_commandMux);
    strncpy(_pendingCommandBuffer, command.c_str(), BLE_MAX_CMD_LEN);
    _pendingCommandBuffer[BLE_MAX_CMD_LEN] = '\0';
    _commandReady = true;
    _lastCommandSource = CMD_SRC_MQTT;
    portEXIT_CRITICAL(&_commandMux);
}

CommandSource ble_get_last_source() {
    return _lastCommandSource;
}

void ble_set_last_source(CommandSource src) {
    _lastCommandSource = src;
}
