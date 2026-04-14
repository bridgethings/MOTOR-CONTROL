/*
 * ble_logger.h - BLE Log Streaming
 *
 * Captures Serial output and streams to BLE web application.
 * Implements Print interface for drop-in Serial replacement.
 * Adapted from reference BLELogger implementation.
 */

#ifndef BLE_LOGGER_H
#define BLE_LOGGER_H

#include <Arduino.h>

typedef void (*BLELogSendCallback)(const String& jsonLog);

class BLELogger : public Print {
public:
    static BLELogger& getInstance();

    void begin(BLELogSendCallback sendFunc, bool* bleConnectedFlag);
    void setStreaming(bool enable);
    bool isStreaming();
    void update();
    void clearBuffer();
    uint8_t getBufferUsage();

    size_t write(uint8_t c) override;
    size_t write(const uint8_t* buffer, size_t size) override;

private:
    BLELogger();
    BLELogger(const BLELogger&) = delete;
    BLELogger& operator=(const BLELogger&) = delete;

    static const size_t BUFFER_SIZE = 2048;
    static const size_t MAX_SEND_SIZE = 450;
    static const unsigned long SEND_INTERVAL = 200;

    char _buffer[BUFFER_SIZE];
    volatile size_t _head;
    volatile size_t _tail;

    bool _streaming;
    bool _initialized;
    unsigned long _lastSend;
    BLELogSendCallback _sendFunc;
    bool* _bleConnectedFlag;

    char _lineBuffer[256];
    size_t _linePos;

    size_t available();
    size_t read(char* dest, size_t maxLen);
    void sendBufferedLogs();
};

#define LOG BLELogger::getInstance()

#endif // BLE_LOGGER_H
