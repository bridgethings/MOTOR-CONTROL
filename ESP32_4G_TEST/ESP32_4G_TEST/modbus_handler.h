/*
 * modbus_handler.h - RS485 Modbus RTU Master
 *
 * Profile-based Modbus reading with endianness support.
 * Uses ModbusMaster library on UART1 via MAX485 transceiver.
 */

#ifndef MODBUS_HANDLER_H
#define MODBUS_HANDLER_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include "modbus_config.h"

// Global pause flag (command handler can pause reading during test operations)
extern bool modbusReadPaused;

// Initialize RS485 UART and ModbusMaster
void modbus_init();

// Re-initialize with new baud rate
void modbus_reinit(uint32_t baudRate);

// Read all enabled slave meters and publish telemetry via MQTT
void modbus_read_all_meters();

// Read a single slave meter specifically (useful for retries)
bool modbus_read_slave(uint8_t slaveId);

// Test read: reads all blocks from a slave using a profile, returns detailed results
bool modbus_test_read(uint8_t slaveId, const char* profileId, DynamicJsonDocument& resp);

// Get the last read value for a specific slave and parameter name
// Returns NAN if not found
float modbus_get_last_value(uint8_t slaveId, const char* paramName);

// Get all slave current data for status responses
void modbus_get_all_slave_data(JsonArray& arr);

// Register conversion functions (32-bit: 2 registers)
uint32_t convertRegistersToUint32(uint16_t reg0, uint16_t reg1, String endianness);
float    convertRegistersToFloat32(uint16_t reg0, uint16_t reg1, String endianness);
int32_t  convertRegistersToInt32(uint16_t reg0, uint16_t reg1, String endianness);

// Register conversion functions (64-bit: 4 registers)
uint64_t convertRegistersToUint64(uint16_t r0, uint16_t r1, uint16_t r2, uint16_t r3, String endianness);
int64_t  convertRegistersToInt64(uint16_t r0, uint16_t r1, uint16_t r2, uint16_t r3, String endianness);
double   convertRegistersToFloat64(uint16_t r0, uint16_t r1, uint16_t r2, uint16_t r3, String endianness);

// Get endianness string from byte_swap/word_swap flags
const char* getEndianness(bool byte_swap, bool word_swap);

#endif // MODBUS_HANDLER_H
