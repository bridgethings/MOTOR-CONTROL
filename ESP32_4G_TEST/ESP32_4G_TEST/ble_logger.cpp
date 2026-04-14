/*
 * ble_logger.cpp - BLE Log Streaming Implementation
 *
 * Adapted from reference BLELogger implementation.
 */

#include "ble_logger.h"

BLELogger& BLELogger::getInstance() {
    static BLELogger instance;
    return instance;
}

BLELogger::BLELogger()
    : _head(0)
    , _tail(0)
    , _streaming(false)
    , _initialized(false)
    , _lastSend(0)
    , _sendFunc(nullptr)
    , _bleConnectedFlag(nullptr)
    , _linePos(0)
{
    memset(_buffer, 0, BUFFER_SIZE);
    memset(_lineBuffer, 0, sizeof(_lineBuffer));
}

void BLELogger::begin(BLELogSendCallback sendFunc, bool* bleConnectedFlag) {
    _sendFunc = sendFunc;
    _bleConnectedFlag = bleConnectedFlag;
    _initialized = true;
    _head = 0;
    _tail = 0;
    _linePos = 0;
    Serial.println("[LOG] BLELogger initialized");
}

void BLELogger::setStreaming(bool enable) {
    _streaming = enable;
    if (enable) {
        clearBuffer();
        Serial.println("[LOG] Streaming ENABLED");
    } else {
        Serial.println("[LOG] Streaming DISABLED");
    }
}

bool BLELogger::isStreaming() {
    return _streaming;
}

void BLELogger::clearBuffer() {
    _head = 0;
    _tail = 0;
    _linePos = 0;
}

uint8_t BLELogger::getBufferUsage() {
    size_t used = available();
    return (uint8_t)((used * 100) / BUFFER_SIZE);
}

size_t BLELogger::available() {
    if (_head >= _tail) {
        return _head - _tail;
    } else {
        return BUFFER_SIZE - _tail + _head;
    }
}

size_t BLELogger::write(uint8_t c) {
    Serial.write(c);

    if (_streaming && _initialized) {
        size_t nextHead = (_head + 1) % BUFFER_SIZE;
        if (nextHead == _tail) {
            _tail = (_tail + 1) % BUFFER_SIZE;
        }
        _buffer[_head] = c;
        _head = nextHead;
    }

    return 1;
}

size_t BLELogger::write(const uint8_t* buffer, size_t size) {
    for (size_t i = 0; i < size; i++) {
        write(buffer[i]);
    }
    return size;
}

size_t BLELogger::read(char* dest, size_t maxLen) {
    size_t count = 0;
    while (count < maxLen && _tail != _head) {
        dest[count++] = _buffer[_tail];
        _tail = (_tail + 1) % BUFFER_SIZE;
    }
    return count;
}

void BLELogger::update() {
    if (!_initialized || !_streaming || _sendFunc == nullptr) return;
    if (_bleConnectedFlag != nullptr && !(*_bleConnectedFlag)) return;

    unsigned long now = millis();
    if (now - _lastSend < SEND_INTERVAL) return;
    if (available() == 0) return;

    _lastSend = now;
    sendBufferedLogs();
}

void BLELogger::sendBufferedLogs() {
    char logData[MAX_SEND_SIZE + 1];
    size_t bytesRead = read(logData, MAX_SEND_SIZE);
    if (bytesRead == 0) return;

    logData[bytesRead] = '\0';

    // Escape for JSON
    String escapedData = "";
    escapedData.reserve(bytesRead * 2);

    for (size_t i = 0; i < bytesRead; i++) {
        char c = logData[i];
        switch (c) {
            case '\\': escapedData += "\\\\"; break;
            case '"':  escapedData += "\\\""; break;
            case '\n': escapedData += "\\n"; break;
            case '\r': escapedData += "\\r"; break;
            case '\t': escapedData += "\\t"; break;
            default:
                if (c >= 32 && c < 127) {
                    escapedData += c;
                }
                break;
        }
    }

    String jsonPacket = "{\"type\":\"log\",\"data\":\"";
    jsonPacket += escapedData;
    jsonPacket += "\"}\n";

    if (_sendFunc != nullptr) {
        _sendFunc(jsonPacket);
    }
}
