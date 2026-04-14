/*
 * config_manager.cpp - LittleFS Configuration Persistence Implementation
 *
 * Based on reference code profile/slave persistence patterns.
 * Uses ArduinoJson v6 DynamicJsonDocument for large payloads.
 */

#include "config_manager.h"
#include "config.h"
#include <ArduinoJson.h>
#include <LittleFS.h>

// Global config data
DeviceProfile   deviceProfiles[MAX_PROFILES];
int             profileCount = 0;
SlaveAssignment slaveAssignments[MAX_SLAVES];
int             slaveCount = 0;
MotorConfig     motorConfig;
ModbusUARTConfig modbusUARTConfig;
SystemSettings  systemSettings;
NetworkConfig   networkConfig;

// Slave health tracking (used by modbus_handler)
uint8_t         slaveConsecutiveFails[MAX_SLAVES] = {0};
unsigned long   slaveNextRetryTime[MAX_SLAVES]    = {0};

// ============================================================
//  INIT
// ============================================================

bool config_init() {
    if (!LittleFS.begin(true)) {  // true = format on first use
        Serial.println("[CONFIG] LittleFS mount FAILED");
        return false;
    }
    Serial.println("[CONFIG] LittleFS mounted");

    loadProfiles();
    loadSlaveAssignments();
    loadMotorConfig();
    loadModbusUARTConfig();
    loadSystemSettings();
    loadNetworkConfig();

    return true;
}

// ============================================================
//  JSON -> STRUCT HELPERS
// ============================================================

void jsonToParameter(JsonObject src, ProfileParameter &dst) {
    const char* name = src["parameter_name"] | src["name"] | "";
    strncpy(dst.name, name, NAME_LEN - 1);
    dst.name[NAME_LEN - 1] = '\0';
    dst.offset_address   = src["offset_address"]   | (uint16_t)0;
    dst.absolute_address = src["absolute_address"]  | (uint16_t)0;
    const char* dt = src["data_type"] | "float32";
    strncpy(dst.data_type, dt, TYPE_LEN - 1);
    dst.data_type[TYPE_LEN - 1] = '\0';
    dst.multiplier = src["multiplier"] | 1.0f;
    const char* u = src["unit"] | "";
    strncpy(dst.unit, u, UNIT_LEN - 1);
    dst.unit[UNIT_LEN - 1] = '\0';
}

void jsonToBlock(JsonObject src, ProfileBlock &dst) {
    const char* bn = src["block_name"] | "";
    strncpy(dst.block_name, bn, NAME_LEN - 1);
    dst.block_name[NAME_LEN - 1] = '\0';
    dst.start_address   = src["start_address"]   | (uint16_t)0;
    dst.registers_count = src["registers_count"]  | (uint8_t)1;
    dst.function_code   = src["function_code"]    | (uint8_t)3;
    dst.parameter_count = 0;

    if (src.containsKey("parameters")) {
        JsonArray params = src["parameters"].as<JsonArray>();
        for (JsonObject p : params) {
            if (dst.parameter_count >= MAX_PARAMS_PER_BLOCK) break;
            jsonToParameter(p, dst.parameters[dst.parameter_count]);
            dst.parameter_count++;
        }
    }
}

void jsonToProfile(JsonObject src, DeviceProfile &dst) {
    const char* pid = src["profile_id"] | "";
    strncpy(dst.profile_id, pid, ID_LEN - 1);
    dst.profile_id[ID_LEN - 1] = '\0';

    // Device metadata - can be nested under "device" or flat
    JsonObject dev = src.containsKey("device") ? src["device"].as<JsonObject>() : src;
    const char* dtype = dev["device_type"] | "";
    strncpy(dst.device_type, dtype, NAME_LEN - 1);
    dst.device_type[NAME_LEN - 1] = '\0';
    const char* mk = dev["make"] | "";
    strncpy(dst.make, mk, NAME_LEN - 1);
    dst.make[NAME_LEN - 1] = '\0';
    const char* mdl = dev["model"] | "";
    strncpy(dst.model, mdl, NAME_LEN - 1);
    dst.model[NAME_LEN - 1] = '\0';
    dst.byte_swap = dev["byte_swap"] | false;
    dst.word_swap = dev["word_swap"] | false;

    // Blocks
    dst.block_count = 0;
    if (src.containsKey("blocks")) {
        JsonArray blocks = src["blocks"].as<JsonArray>();
        for (JsonObject b : blocks) {
            if (dst.block_count >= MAX_BLOCKS_PER_PROFILE) break;
            jsonToBlock(b, dst.blocks[dst.block_count]);
            dst.block_count++;
        }
    }
}

// ============================================================
//  PROFILE PERSISTENCE
// ============================================================

void saveProfiles() {
    Serial.printf("[CONFIG] Saving %d profiles (heap=%u)\n", profileCount, ESP.getFreeHeap());
    DynamicJsonDocument doc(32768);
    JsonArray arr = doc.to<JsonArray>();

    for (int i = 0; i < profileCount; i++) {
        DeviceProfile &p = deviceProfiles[i];
        JsonObject pObj = arr.createNestedObject();
        pObj["profile_id"] = p.profile_id;

        JsonObject dev = pObj.createNestedObject("device");
        dev["device_type"] = p.device_type;
        dev["make"]        = p.make;
        dev["model"]       = p.model;
        dev["byte_swap"]   = p.byte_swap;
        dev["word_swap"]   = p.word_swap;

        JsonArray blocks = pObj.createNestedArray("blocks");
        for (int b = 0; b < p.block_count; b++) {
            ProfileBlock &blk = p.blocks[b];
            JsonObject bObj = blocks.createNestedObject();
            bObj["block_name"]       = blk.block_name;
            bObj["start_address"]    = blk.start_address;
            bObj["registers_count"]  = blk.registers_count;
            bObj["function_code"]    = blk.function_code;

            JsonArray params = bObj.createNestedArray("parameters");
            for (int r = 0; r < blk.parameter_count; r++) {
                ProfileParameter &param = blk.parameters[r];
                JsonObject rObj = params.createNestedObject();
                rObj["parameter_name"]   = param.name;
                rObj["offset_address"]   = param.offset_address;
                rObj["absolute_address"] = param.absolute_address;
                rObj["data_type"]        = param.data_type;
                rObj["multiplier"]       = param.multiplier;
                rObj["unit"]             = param.unit;
            }
        }
    }

    File f = LittleFS.open(PROFILES_JSON_PATH, "w");
    if (!f) {
        Serial.printf("[CONFIG] Failed to open %s for writing\n", PROFILES_JSON_PATH);
        return;
    }
    size_t written = serializeJson(doc, f);
    f.close();
    Serial.printf("[CONFIG] Saved %d profiles (%zu bytes)\n", profileCount, written);
}

void loadProfiles() {
    profileCount = 0;

    if (!LittleFS.exists(PROFILES_JSON_PATH)) {
        Serial.println("[CONFIG] No profiles.json found - starting fresh");
        return;
    }

    File f = LittleFS.open(PROFILES_JSON_PATH, "r");
    if (!f) {
        Serial.println("[CONFIG] Failed to open profiles.json");
        return;
    }

    DynamicJsonDocument doc(32768);
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        Serial.printf("[CONFIG] Profiles JSON parse error: %s\n", err.c_str());
        return;
    }

    JsonArray arr = doc.as<JsonArray>();
    for (JsonObject pObj : arr) {
        if (profileCount >= MAX_PROFILES) break;
        jsonToProfile(pObj, deviceProfiles[profileCount]);
        profileCount++;
    }

    Serial.printf("[CONFIG] Loaded %d profiles\n", profileCount);
}

int findProfileIndex(const char* profileId) {
    for (int i = 0; i < profileCount; i++) {
        if (strcmp(deviceProfiles[i].profile_id, profileId) == 0) return i;
    }
    return -1;
}

// ============================================================
//  SLAVE ASSIGNMENT PERSISTENCE
// ============================================================

void saveSlaveAssignments() {
    Serial.printf("[CONFIG] Saving %d slave assignments (heap=%u)\n", slaveCount, ESP.getFreeHeap());
    DynamicJsonDocument doc(4096);
    JsonArray arr = doc.to<JsonArray>();

    for (int i = 0; i < slaveCount; i++) {
        SlaveAssignment &s = slaveAssignments[i];
        JsonObject sObj = arr.createNestedObject();
        sObj["slave_id"]   = s.slave_id;
        sObj["profile_id"] = s.profile_id;
        sObj["name"]       = s.name;
        sObj["enabled"]    = s.enabled;
    }

    File f = LittleFS.open(SLAVES_JSON_PATH, "w");
    if (!f) {
        Serial.printf("[CONFIG] Failed to open %s for writing\n", SLAVES_JSON_PATH);
        return;
    }
    size_t written = serializeJson(doc, f);
    f.close();
    Serial.printf("[CONFIG] Saved %d slaves (%zu bytes)\n", slaveCount, written);
}

void loadSlaveAssignments() {
    slaveCount = 0;
    memset(slaveConsecutiveFails, 0, sizeof(slaveConsecutiveFails));
    memset(slaveNextRetryTime, 0, sizeof(slaveNextRetryTime));

    if (!LittleFS.exists(SLAVES_JSON_PATH)) {
        Serial.println("[CONFIG] No slaves.json found - starting fresh");
        return;
    }

    File f = LittleFS.open(SLAVES_JSON_PATH, "r");
    if (!f) {
        Serial.println("[CONFIG] Failed to open slaves.json");
        return;
    }

    DynamicJsonDocument doc(4096);
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        Serial.printf("[CONFIG] Slaves JSON parse error: %s\n", err.c_str());
        return;
    }

    JsonArray arr = doc.as<JsonArray>();
    for (JsonObject sObj : arr) {
        if (slaveCount >= MAX_SLAVES) break;
        SlaveAssignment &s = slaveAssignments[slaveCount];
        s.slave_id = sObj["slave_id"] | (uint8_t)0;
        if (s.slave_id == 0) continue;

        const char* pid = sObj["profile_id"] | "";
        strncpy(s.profile_id, pid, ID_LEN - 1);
        s.profile_id[ID_LEN - 1] = '\0';
        const char* nm = sObj["name"] | "";
        strncpy(s.name, nm, NAME_LEN - 1);
        s.name[NAME_LEN - 1] = '\0';
        s.enabled = sObj["enabled"] | true;
        slaveCount++;
    }

    Serial.printf("[CONFIG] Loaded %d slave assignments\n", slaveCount);
}

int findSlaveIndex(uint8_t slaveId) {
    for (int i = 0; i < slaveCount; i++) {
        if (slaveAssignments[i].slave_id == slaveId) return i;
    }
    return -1;
}

// ============================================================
//  MOTOR CONFIG PERSISTENCE
// ============================================================

void saveMotorConfig() {
    StaticJsonDocument<512> doc;
    doc["remote_control_enabled"] = motorConfig.remote_control_enabled;
    doc["auto_turn_on"]           = motorConfig.auto_turn_on;
    doc["day_start_hour"]         = motorConfig.day_start_hour;
    doc["level_low_threshold"]    = motorConfig.level_low_threshold;
    doc["level_high_threshold"]   = motorConfig.level_high_threshold;
    doc["level_slave_id"]         = motorConfig.level_slave_id;
    doc["level_param_name"]       = motorConfig.level_param_name;
    doc["relay_pulse_ms"]         = motorConfig.relay_pulse_ms;

    File f = LittleFS.open(MOTOR_CONFIG_PATH, "w");
    if (!f) {
        Serial.println("[CONFIG] Failed to save motor config");
        return;
    }
    serializeJson(doc, f);
    f.close();
    Serial.println("[CONFIG] Motor config saved");
}

void loadMotorConfig() {
    // Defaults
    motorConfig.remote_control_enabled = true;
    motorConfig.auto_turn_on = false;
    motorConfig.day_start_hour = 6;
    motorConfig.level_low_threshold = 0;
    motorConfig.level_high_threshold = 0;
    motorConfig.level_slave_id = 0;
    memset(motorConfig.level_param_name, 0, NAME_LEN);
    motorConfig.relay_pulse_ms = RELAY_PULSE_DURATION;

    if (!LittleFS.exists(MOTOR_CONFIG_PATH)) {
        Serial.println("[CONFIG] No motor.json found - using defaults");
        return;
    }

    File f = LittleFS.open(MOTOR_CONFIG_PATH, "r");
    if (!f) return;

    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        Serial.printf("[CONFIG] Motor config parse error: %s\n", err.c_str());
        return;
    }

    motorConfig.remote_control_enabled = doc.containsKey("remote_control_enabled") ? doc["remote_control_enabled"].as<bool>() : true;
    motorConfig.auto_turn_on           = doc["auto_turn_on"].as<bool>();
    motorConfig.day_start_hour         = doc.containsKey("day_start_hour") ? doc["day_start_hour"].as<int>() : 6;
    motorConfig.level_low_threshold    = doc["level_low_threshold"].as<float>();
    motorConfig.level_high_threshold   = doc["level_high_threshold"].as<float>();
    motorConfig.level_slave_id         = doc["level_slave_id"].as<uint8_t>();
    const char* vpn = doc["level_param_name"] | "";
    strncpy(motorConfig.level_param_name, vpn, NAME_LEN - 1);
    motorConfig.relay_pulse_ms         = doc.containsKey("relay_pulse_ms") ? doc["relay_pulse_ms"].as<uint16_t>() : RELAY_PULSE_DURATION;

    Serial.println("[CONFIG] Motor config loaded");
}

// ============================================================
//  MODBUS UART CONFIG PERSISTENCE
// ============================================================

void saveModbusUARTConfig() {
    StaticJsonDocument<256> doc;
    doc["baud_rate"]   = modbusUARTConfig.baud_rate;
    doc["data_bits"]   = modbusUARTConfig.data_bits;
    doc["parity"]      = String(modbusUARTConfig.parity);
    doc["stop_bits"]   = modbusUARTConfig.stop_bits;
    doc["timeout_ms"]  = modbusUARTConfig.timeout_ms;
    doc["retry_count"] = modbusUARTConfig.retry_count;

    File f = LittleFS.open(MODBUS_UART_PATH, "w");
    if (!f) {
        Serial.println("[CONFIG] Failed to save Modbus UART config");
        return;
    }
    serializeJson(doc, f);
    f.close();
    Serial.println("[CONFIG] Modbus UART config saved");
}

void loadModbusUARTConfig() {
    // Defaults
    modbusUARTConfig.baud_rate   = RS485_DEFAULT_BAUD;
    modbusUARTConfig.data_bits   = 8;
    modbusUARTConfig.parity      = 'N';
    modbusUARTConfig.stop_bits   = 1;
    modbusUARTConfig.timeout_ms  = MODBUS_RESPONSE_TIMEOUT;
    modbusUARTConfig.retry_count = 2;

    if (!LittleFS.exists(MODBUS_UART_PATH)) {
        Serial.println("[CONFIG] No modbus_uart.json found - using defaults");
        return;
    }

    File f = LittleFS.open(MODBUS_UART_PATH, "r");
    if (!f) return;

    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        Serial.printf("[CONFIG] Modbus UART parse error: %s\n", err.c_str());
        return;
    }

    modbusUARTConfig.baud_rate   = doc["baud_rate"] | (uint32_t)RS485_DEFAULT_BAUD;
    modbusUARTConfig.data_bits   = doc["data_bits"] | (uint8_t)8;
    const char* p = doc["parity"] | "N";
    modbusUARTConfig.parity      = p[0];
    modbusUARTConfig.stop_bits   = doc["stop_bits"] | (uint8_t)1;
    modbusUARTConfig.timeout_ms  = doc["timeout_ms"] | (uint16_t)MODBUS_RESPONSE_TIMEOUT;
    modbusUARTConfig.retry_count = doc["retry_count"] | (uint8_t)2;

    Serial.println("[CONFIG] Modbus UART config loaded");
}

// ============================================================
//  SYSTEM SETTINGS PERSISTENCE
// ============================================================

void saveSystemSettings() {
    StaticJsonDocument<256> doc;
    doc["modbus_poll_interval_ms"] = systemSettings.modbus_poll_interval_ms;
    doc["telemetry_interval_ms"]   = systemSettings.telemetry_interval_ms;
    doc["relay_pulse_ms"]          = systemSettings.relay_pulse_ms;

    File f = LittleFS.open(SYSTEM_SETTINGS_PATH, "w");
    if (!f) {
        Serial.println("[CONFIG] Failed to save system settings");
        return;
    }
    serializeJson(doc, f);
    f.close();
    Serial.printf("[CONFIG] System settings saved - modbus_poll=%ums, telemetry=%ums, relay_pulse=%ums\n",
        systemSettings.modbus_poll_interval_ms, systemSettings.telemetry_interval_ms, systemSettings.relay_pulse_ms);
}

void loadSystemSettings() {
    // Defaults from config.h #defines
    systemSettings.modbus_poll_interval_ms = MODBUS_POLL_INTERVAL;
    systemSettings.telemetry_interval_ms   = TELEMETRY_INTERVAL;
    systemSettings.relay_pulse_ms          = RELAY_PULSE_DURATION;

    if (!LittleFS.exists(SYSTEM_SETTINGS_PATH)) {
        Serial.println("[CONFIG] No system_settings.json found - using defaults");
        return;
    }

    File f = LittleFS.open(SYSTEM_SETTINGS_PATH, "r");
    if (!f) return;

    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        Serial.printf("[CONFIG] System settings parse error: %s\n", err.c_str());
        return;
    }

    systemSettings.modbus_poll_interval_ms = doc["modbus_poll_interval_ms"] | (uint32_t)MODBUS_POLL_INTERVAL;
    systemSettings.telemetry_interval_ms   = doc["telemetry_interval_ms"]   | (uint32_t)TELEMETRY_INTERVAL;
    systemSettings.relay_pulse_ms          = doc["relay_pulse_ms"]          | (uint16_t)RELAY_PULSE_DURATION;

    Serial.printf("[CONFIG] System settings loaded - modbus_poll=%ums, telemetry=%ums, relay_pulse=%ums\n",
        systemSettings.modbus_poll_interval_ms, systemSettings.telemetry_interval_ms, systemSettings.relay_pulse_ms);
}

// ============================================================
//  NETWORK CONFIG PERSISTENCE
// ============================================================

void saveNetworkConfig() {
    StaticJsonDocument<256> doc;
    doc["apn"]          = networkConfig.apn;
    doc["apn_username"] = networkConfig.apn_username;
    doc["apn_password"] = networkConfig.apn_password;

    File f = LittleFS.open(NETWORK_CONFIG_PATH, "w");
    if (!f) {
        Serial.println("[CONFIG] Failed to save network config");
        return;
    }
    serializeJson(doc, f);
    f.close();
    Serial.printf("[CONFIG] Network config saved - APN: %s\n", networkConfig.apn);
}

void loadNetworkConfig() {
    // Defaults: use compile-time macros from config.h
    strncpy(networkConfig.apn,          GSM_APN,  sizeof(networkConfig.apn) - 1);
    networkConfig.apn[sizeof(networkConfig.apn) - 1] = '\0';
    strncpy(networkConfig.apn_username, GSM_USER, sizeof(networkConfig.apn_username) - 1);
    networkConfig.apn_username[sizeof(networkConfig.apn_username) - 1] = '\0';
    strncpy(networkConfig.apn_password, GSM_PASS, sizeof(networkConfig.apn_password) - 1);
    networkConfig.apn_password[sizeof(networkConfig.apn_password) - 1] = '\0';

    if (!LittleFS.exists(NETWORK_CONFIG_PATH)) {
        Serial.printf("[CONFIG] No network.json found - using default APN: %s\n", networkConfig.apn);
        return;
    }

    File f = LittleFS.open(NETWORK_CONFIG_PATH, "r");
    if (!f) return;

    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        Serial.printf("[CONFIG] Network config parse error: %s\n", err.c_str());
        return;
    }

    const char* apn = doc["apn"] | GSM_APN;
    strncpy(networkConfig.apn, apn, sizeof(networkConfig.apn) - 1);
    networkConfig.apn[sizeof(networkConfig.apn) - 1] = '\0';

    const char* user = doc["apn_username"] | GSM_USER;
    strncpy(networkConfig.apn_username, user, sizeof(networkConfig.apn_username) - 1);
    networkConfig.apn_username[sizeof(networkConfig.apn_username) - 1] = '\0';

    const char* pass = doc["apn_password"] | GSM_PASS;
    strncpy(networkConfig.apn_password, pass, sizeof(networkConfig.apn_password) - 1);
    networkConfig.apn_password[sizeof(networkConfig.apn_password) - 1] = '\0';

    Serial.printf("[CONFIG] Network config loaded - APN: %s\n", networkConfig.apn);
}

// ============================================================
//  FACTORY RESET
// ============================================================

void config_factory_reset() {
    Serial.println("[CONFIG] Factory reset - clearing all saved configuration");
    LittleFS.remove(PROFILES_JSON_PATH);
    LittleFS.remove(SLAVES_JSON_PATH);
    LittleFS.remove(MOTOR_CONFIG_PATH);
    LittleFS.remove(MODBUS_UART_PATH);
    LittleFS.remove(SYSTEM_SETTINGS_PATH);
    LittleFS.remove(NETWORK_CONFIG_PATH);

    profileCount = 0;
    slaveCount = 0;
    loadMotorConfig();       // Reset to defaults
    loadModbusUARTConfig();  // Reset to defaults
    loadSystemSettings();    // Reset to defaults
    loadNetworkConfig();     // Reset to defaults

    Serial.println("[CONFIG] Factory reset complete");
}
