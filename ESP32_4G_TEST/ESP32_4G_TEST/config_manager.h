/*
 * config_manager.h - LittleFS Configuration Persistence
 *
 * Manages persistent storage of device profiles, slave assignments,
 * motor configuration, and Modbus UART settings on LittleFS.
 */

#ifndef CONFIG_MANAGER_H
#define CONFIG_MANAGER_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include "modbus_config.h"

// Global config data arrays
extern DeviceProfile   deviceProfiles[MAX_PROFILES];
extern int             profileCount;
extern SlaveAssignment slaveAssignments[MAX_SLAVES];
extern int             slaveCount;
extern MotorConfig     motorConfig;
extern ModbusUARTConfig modbusUARTConfig;
extern SystemSettings  systemSettings;
extern NetworkConfig   networkConfig;

// Modbus backoff tracking (used by modbus_handler)
extern uint8_t       slaveConsecutiveFails[MAX_SLAVES];
extern unsigned long slaveNextRetryTime[MAX_SLAVES];

// Initialize LittleFS and load all configs
bool config_init();

// Profile management
void saveProfiles();
void loadProfiles();
int  findProfileIndex(const char* profileId);

// Slave assignment management
void saveSlaveAssignments();
void loadSlaveAssignments();
int  findSlaveIndex(uint8_t slaveId);

// Motor config management
void saveMotorConfig();
void loadMotorConfig();

// Modbus UART config management
void saveModbusUARTConfig();
void loadModbusUARTConfig();

// System settings management
void saveSystemSettings();
void loadSystemSettings();

// Network config management
void saveNetworkConfig();
void loadNetworkConfig();

// JSON-to-struct helpers (used by command_handler)
void jsonToParameter(JsonObject src, ProfileParameter &dst);
void jsonToBlock(JsonObject src, ProfileBlock &dst);
void jsonToProfile(JsonObject src, DeviceProfile &dst);

// Factory reset - clear all saved config
void config_factory_reset();

#endif // CONFIG_MANAGER_H
