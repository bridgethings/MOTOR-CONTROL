/*
 * command_handler.cpp - Unified Command Dispatcher Implementation
 *
 * Handles all configuration commands from BLE and MQTT.
 * Based on reference processConfigCommand() patterns.
 */

#include "command_handler.h"
#include "config.h"
#include "config_manager.h"
#include "modbus_config.h"
#include "motor_controller.h"
#include "rtc_handler.h"
#include "ble_handler.h"
#include "ble_logger.h"
#include "mqtt_handler.h"
#include "modem_handler.h"
#include "ota_manager.h"
#include "modbus_handler.h"
#include <ArduinoJson.h>

extern void publishMotorConfigAttributes();

// ============================================================
//  HELPER: Build profile list JSON
// ============================================================

static String getProfilesList() {
    DynamicJsonDocument resp(8192);
    resp["status"] = "success";
    resp["cmd"] = "GET";
    resp["section"] = "profiles";

    JsonArray arr = resp.createNestedArray("data");
    for (int i = 0; i < profileCount; i++) {
        JsonObject p = arr.createNestedObject();
        p["profile_id"]  = deviceProfiles[i].profile_id;
        p["device_type"] = deviceProfiles[i].device_type;
        p["make"]        = deviceProfiles[i].make;
        p["model"]       = deviceProfiles[i].model;
        p["block_count"] = deviceProfiles[i].block_count;

        // Count total parameters
        int paramCount = 0;
        for (int b = 0; b < deviceProfiles[i].block_count; b++) {
            paramCount += deviceProfiles[i].blocks[b].parameter_count;
        }
        p["parameter_count"] = paramCount;
    }

    String out;
    serializeJson(resp, out);
    return out + "\n";
}

// ============================================================
//  HELPER: Build profile detail JSON
// ============================================================

static String getProfileDetail(const char* profileId) {
    int idx = findProfileIndex(profileId);
    if (idx < 0) {
        return "{\"status\":\"error\",\"cmd\":\"GET\",\"section\":\"profile\",\"message\":\"Profile not found\"}\n";
    }

    DynamicJsonDocument resp(16384);
    resp["status"] = "success";
    resp["cmd"] = "GET";
    resp["section"] = "profile";

    JsonObject data = resp.createNestedObject("data");
    DeviceProfile &p = deviceProfiles[idx];
    data["profile_id"] = p.profile_id;

    JsonObject dev = data.createNestedObject("device");
    dev["device_type"] = p.device_type;
    dev["make"]        = p.make;
    dev["model"]       = p.model;
    dev["byte_swap"]   = p.byte_swap;
    dev["word_swap"]   = p.word_swap;

    JsonArray blocks = data.createNestedArray("blocks");
    for (int b = 0; b < p.block_count; b++) {
        ProfileBlock &blk = p.blocks[b];
        JsonObject bObj = blocks.createNestedObject();
        bObj["block_name"]      = blk.block_name;
        bObj["start_address"]   = blk.start_address;
        bObj["registers_count"] = blk.registers_count;
        bObj["function_code"]   = blk.function_code;

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

    String out;
    serializeJson(resp, out);
    return out + "\n";
}

// ============================================================
//  HELPER: Build slaves list JSON
// ============================================================

static String getSlavesList() {
    DynamicJsonDocument resp(4096);
    resp["status"] = "success";
    resp["cmd"] = "GET";
    resp["section"] = "slaves";

    JsonArray arr = resp.createNestedArray("data");
    for (int i = 0; i < slaveCount; i++) {
        JsonObject s = arr.createNestedObject();
        s["slave_id"]   = slaveAssignments[i].slave_id;
        s["profile_id"] = slaveAssignments[i].profile_id;
        s["name"]       = slaveAssignments[i].name;
        s["enabled"]    = slaveAssignments[i].enabled;
    }

    String out;
    serializeJson(resp, out);
    return out + "\n";
}

// ============================================================
//  HELPER: Get motor config JSON
// ============================================================

static String getMotorConfigJson() {
    StaticJsonDocument<512> resp;
    resp["status"] = "success";
    resp["cmd"] = "GET";
    resp["section"] = "motor";

    JsonObject data = resp.createNestedObject("data");
    data["remote_control_enabled"] = motorConfig.remote_control_enabled;
    data["auto_turn_on"]           = motorConfig.auto_turn_on;
    data["day_start_hour"]         = motorConfig.day_start_hour;
    data["level_low_threshold"]    = motorConfig.level_low_threshold;
    data["level_high_threshold"]   = motorConfig.level_high_threshold;
    data["level_slave_id"]         = motorConfig.level_slave_id;
    data["level_param_name"]       = motorConfig.level_param_name;
    data["relay_pulse_ms"]         = motorConfig.relay_pulse_ms;
    data["motor_running"]          = motor_is_running();
    data["motor_busy"]             = motor_is_busy();

    String out;
    serializeJson(resp, out);
    return out + "\n";
}

// ============================================================
//  HELPER: Get Modbus UART config JSON
// ============================================================

static String getModbusUARTJson() {
    StaticJsonDocument<384> resp;
    resp["status"] = "success";
    resp["cmd"] = "GET";
    resp["section"] = "modbus";

    JsonObject data = resp.createNestedObject("data");
    JsonObject uart = data.createNestedObject("uart_config");
    uart["baud_rate"]   = modbusUARTConfig.baud_rate;
    uart["data_bits"]   = modbusUARTConfig.data_bits;
    uart["parity"]      = String(modbusUARTConfig.parity);
    uart["stop_bits"]   = modbusUARTConfig.stop_bits;
    uart["timeout_ms"]  = modbusUARTConfig.timeout_ms;
    data["retry_count"] = modbusUARTConfig.retry_count;
    data["read_paused"] = modbusReadPaused;

    String out;
    serializeJson(resp, out);
    return out + "\n";
}

// ============================================================
//  HELPER: Get network (modem) status JSON
// ============================================================

static String getNetworkStatus() {
    StaticJsonDocument<512> resp;
    resp["status"] = "success";
    resp["cmd"] = "GET";
    resp["section"] = "network";

    JsonObject data = resp.createNestedObject("data");
    data["type"]     = "4G_MODEM";
    data["apn"]      = networkConfig.apn;
    data["connected"] = modem_is_connected();
    data["signal"]   = modem_get_signal();
    data["ip"]       = modem_get_ip();
    data["imei"]     = modem_get_imei();
    data["operator"] = modem_get_operator();

    String out;
    serializeJson(resp, out);
    return out + "\n";
}

// ============================================================
//  HELPER: Get full device status JSON
// ============================================================

static String getDeviceStatus() {
    DynamicJsonDocument resp(2048);
    resp["status"] = "success";
    resp["cmd"] = "GET_STATUS";
    resp["section"] = "status";

    JsonObject data = resp.createNestedObject("data");

    // Motor status
    JsonObject motor = data.createNestedObject("motor");
    motor["motor_running"]          = motor_is_running();
    motor["motor_busy"]             = motor_is_busy();
    motor["remote_control_enabled"] = motorConfig.remote_control_enabled;

    // Full motor config so the web app can sync threshold UI on every poll
    JsonObject motorCfg = motor.createNestedObject("config");
    motorCfg["level_low_threshold"]    = motorConfig.level_low_threshold;
    motorCfg["level_high_threshold"]   = motorConfig.level_high_threshold;
    motorCfg["auto_turn_on"]           = motorConfig.auto_turn_on;
    motorCfg["day_start_hour"]         = motorConfig.day_start_hour;
    motorCfg["level_slave_id"]         = motorConfig.level_slave_id;
    motorCfg["level_param_name"]       = motorConfig.level_param_name;
    motorCfg["relay_pulse_ms"]         = motorConfig.relay_pulse_ms;
    motorCfg["remote_control_enabled"] = motorConfig.remote_control_enabled;

    // Level tracking
    JsonObject levelObj = motor.createNestedObject("level");
    levelObj["current_level"] = level_get_current();

    // Network
    JsonObject network = data.createNestedObject("network");
    network["sim_ready"] = modem_is_sim_ready();
    network["connected"] = modem_is_connected();
    network["signal"]    = modem_get_signal();
    network["type"]      = "4G_MODEM";
    network["ip"]        = modem_get_ip();

    // MQTT
    JsonObject mqtt = data.createNestedObject("mqtt");
    mqtt["connected"] = mqtt_is_connected();

    // Time
    JsonObject timeObj = data.createNestedObject("time");
    timeObj["datetime"]  = rtc_get_datetime_string();
    timeObj["timestamp"] = rtc_get_timestamp();
    timeObj["rtc_valid"] = rtc_is_valid();

    // System
    JsonObject sys = data.createNestedObject("system");
    sys["firmware"]    = FW_VERSION;
    sys["free_heap"]   = ESP.getFreeHeap();
    sys["uptime"]      = millis() / 1000;
    
    uint64_t mac = ESP.getEfuseMac();
    char clientId[40];
    snprintf(clientId, sizeof(clientId), "%04X%08X_ACCTKN", (uint16_t)(mac >> 32), (uint32_t)mac);
    sys["mac_token"]   = String(clientId);

    // Modbus
    JsonObject modbus = data.createNestedObject("modbus");
    modbus["slave_count"]   = slaveCount;
    modbus["profile_count"] = profileCount;
    JsonArray results = data.createNestedArray("results");
    modbus_get_all_slave_data(results);

    String out;
    serializeJson(resp, out);
    return out + "\n";
}

// ============================================================
//  PROFILE/SLAVE ADD/UPDATE/DELETE
// ============================================================

static bool addProfile(JsonObject data) {
    if (profileCount >= MAX_PROFILES) return false;

    const char* pid = data["profile_id"] | "";
    if (strlen(pid) == 0) return false;
    if (findProfileIndex(pid) >= 0) return false;  // Duplicate

    jsonToProfile(data, deviceProfiles[profileCount]);
    profileCount++;
    saveProfiles();
    return true;
}

static bool updateProfile(JsonObject data) {
    const char* pid = data["profile_id"] | "";
    int idx = findProfileIndex(pid);
    if (idx < 0) return false;

    jsonToProfile(data, deviceProfiles[idx]);
    saveProfiles();
    return true;
}

static bool deleteProfile(const char* profileId) {
    int idx = findProfileIndex(profileId);
    if (idx < 0) return false;

    // Check if any slave uses this profile
    for (int i = 0; i < slaveCount; i++) {
        if (strcmp(slaveAssignments[i].profile_id, profileId) == 0) {
            Serial.printf("[CMD] Cannot delete profile '%s' - used by slave %d\n", 
                profileId, slaveAssignments[i].slave_id);
            return false;
        }
    }

    // Shift remaining profiles down
    for (int i = idx; i < profileCount - 1; i++) {
        deviceProfiles[i] = deviceProfiles[i + 1];
    }
    profileCount--;
    saveProfiles();
    return true;
}

static bool addSlaveAssignment(JsonObject data) {
    if (slaveCount >= MAX_SLAVES) return false;

    uint8_t sid = data["slave_id"] | (uint8_t)0;
    if (sid == 0) return false;
    if (findSlaveIndex(sid) >= 0) return false;  // Duplicate

    SlaveAssignment &s = slaveAssignments[slaveCount];
    s.slave_id = sid;
    const char* pid = data["profile_id"] | "";
    strncpy(s.profile_id, pid, ID_LEN - 1);
    s.profile_id[ID_LEN - 1] = '\0';
    const char* nm = data["name"] | "";
    strncpy(s.name, nm, NAME_LEN - 1);
    s.name[NAME_LEN - 1] = '\0';
    s.enabled = data["enabled"] | true;

    slaveCount++;
    saveSlaveAssignments();
    return true;
}

static bool updateSlaveAssignment(JsonObject data) {
    uint8_t sid = data["slave_id"] | (uint8_t)0;
    int idx = findSlaveIndex(sid);
    if (idx < 0) return false;

    SlaveAssignment &s = slaveAssignments[idx];
    if (data.containsKey("profile_id")) {
        const char* pid = data["profile_id"];
        strncpy(s.profile_id, pid, ID_LEN - 1);
        s.profile_id[ID_LEN - 1] = '\0';
    }
    if (data.containsKey("name")) {
        const char* nm = data["name"];
        strncpy(s.name, nm, NAME_LEN - 1);
        s.name[NAME_LEN - 1] = '\0';
    }
    if (data.containsKey("enabled")) {
        s.enabled = data["enabled"];
    }

    saveSlaveAssignments();
    return true;
}

static bool deleteSlaveAssignment(uint8_t slaveId) {
    int idx = findSlaveIndex(slaveId);
    if (idx < 0) return false;

    for (int i = idx; i < slaveCount - 1; i++) {
        slaveAssignments[i] = slaveAssignments[i + 1];
    }
    slaveCount--;
    saveSlaveAssignments();
    return true;
}

// ============================================================
//  SEND RESPONSE (routes to BLE or MQTT)
// ============================================================

void sendCommandResponse(const String& response, CommandSource source) {
    if (source == CMD_SRC_BLE) {
        ble_send_response(response);
    } else if (source == CMD_SRC_MQTT) {
        // For MQTT, we send via the existing RPC response mechanism
        // The caller should handle MQTT response routing
        ble_send_response(response);  // Also echo to BLE if connected
    }
}

// ============================================================
//  MAIN COMMAND DISPATCHER
// ============================================================

void processConfigCommand(const String& command, CommandSource source) {
    Serial.printf("[CMD] Processing command (%d bytes) from %s\n",
        command.length(), source == CMD_SRC_BLE ? "BLE" : "MQTT");

    if (command.length() == 0) {
        sendCommandResponse("{\"status\":\"error\",\"error_code\":1001,\"message\":\"Empty command\"}\n", source);
        return;
    }

    DynamicJsonDocument doc(8192);
    DeserializationError error = deserializeJson(doc, command);
    if (error) {
        Serial.printf("[CMD] JSON parse error: %s\n", error.c_str());
        sendCommandResponse("{\"status\":\"error\",\"error_code\":1000,\"message\":\"Invalid JSON\"}\n", source);
        return;
    }

    String cmd = doc["cmd"].as<String>();
    String section = doc["section"].as<String>();

    if (cmd.length() == 0) {
        sendCommandResponse("{\"status\":\"error\",\"error_code\":1002,\"message\":\"Missing cmd field\"}\n", source);
        return;
    }

    Serial.printf("[CMD] cmd=%s section=%s\n", cmd.c_str(), section.c_str());

    // ---- GET ----
    if (cmd == "GET") {
        String response;
        if (section == "network")       response = getNetworkStatus();
        else if (section == "modbus")   response = getModbusUARTJson();
        else if (section == "motor")    response = getMotorConfigJson();
        else if (section == "system_settings") {
            StaticJsonDocument<256> resp;
            resp["status"] = "success";
            resp["cmd"] = "GET";
            resp["section"] = "system_settings";
            JsonObject data = resp.createNestedObject("data");
            data["modbus_poll_interval_ms"] = systemSettings.modbus_poll_interval_ms;
            data["telemetry_interval_ms"]   = systemSettings.telemetry_interval_ms;
            data["relay_pulse_ms"]          = systemSettings.relay_pulse_ms;
            serializeJson(resp, response);
            response += "\n";
        }
        else if (section == "profiles") response = getProfilesList();
        else if (section == "profile") {
            JsonObject data = doc["data"];
            const char* pid = data["profile_id"] | "";
            response = getProfileDetail(pid);
        }
        else if (section == "slaves")   response = getSlavesList();
        else response = "{\"status\":\"error\",\"error_code\":1003,\"message\":\"Unknown section\"}\n";

        sendCommandResponse(response, source);
    }

    // ---- SET ----
    else if (cmd == "SET") {
        JsonObject data = doc["data"];

        if (section == "modbus") {
            // Web app sends uart fields nested under "uart_config", support both flat and nested
            JsonObject uart = data.containsKey("uart_config") ? data["uart_config"].as<JsonObject>() : data;
            if (uart.containsKey("baud_rate"))   modbusUARTConfig.baud_rate   = uart["baud_rate"];
            if (uart.containsKey("data_bits"))   modbusUARTConfig.data_bits   = uart["data_bits"];
            if (uart.containsKey("parity")) {
                const char* p = uart["parity"];
                modbusUARTConfig.parity = p[0];
            }
            if (uart.containsKey("stop_bits"))   modbusUARTConfig.stop_bits   = uart["stop_bits"];
            if (uart.containsKey("timeout_ms"))  modbusUARTConfig.timeout_ms  = uart["timeout_ms"];
            if (data.containsKey("retry_count")) modbusUARTConfig.retry_count = data["retry_count"];
            saveModbusUARTConfig();
            sendCommandResponse("{\"status\":\"success\",\"cmd\":\"SET\",\"section\":\"modbus\",\"message\":\"Modbus config saved\"}\n", source);
        }
        else if (section == "motor") {
            if (data.containsKey("remote_control_enabled")) motorConfig.remote_control_enabled = data["remote_control_enabled"].as<bool>();
            if (data.containsKey("auto_turn_on"))           motorConfig.auto_turn_on = data["auto_turn_on"].as<bool>();
            if (data.containsKey("day_start_hour"))         motorConfig.day_start_hour = data["day_start_hour"].as<int>();
            if (data.containsKey("level_low_threshold"))    motorConfig.level_low_threshold = data["level_low_threshold"].as<float>();
            if (data.containsKey("level_high_threshold"))   motorConfig.level_high_threshold = data["level_high_threshold"].as<float>();
            if (data.containsKey("level_slave_id"))         motorConfig.level_slave_id = (uint8_t)data["level_slave_id"].as<int>();
            if (data.containsKey("level_param_name")) {
                const char* vpn = data["level_param_name"] | "";
                strncpy(motorConfig.level_param_name, vpn, NAME_LEN - 1);
                motorConfig.level_param_name[NAME_LEN - 1] = '\0';
            }
            if (data.containsKey("relay_pulse_ms"))         motorConfig.relay_pulse_ms = data["relay_pulse_ms"].as<int>();
            saveMotorConfig();
            publishMotorConfigAttributes(); // Sync to cloud
            sendCommandResponse("{\"status\":\"success\",\"cmd\":\"SET\",\"section\":\"motor\",\"message\":\"Automation config saved\"}\n", source);
        }
        else if (section == "system_settings") {
            if (data.containsKey("modbus_poll_interval_ms")) systemSettings.modbus_poll_interval_ms = data["modbus_poll_interval_ms"];
            if (data.containsKey("telemetry_interval_ms"))   systemSettings.telemetry_interval_ms   = data["telemetry_interval_ms"];
            if (data.containsKey("relay_pulse_ms"))          systemSettings.relay_pulse_ms          = data["relay_pulse_ms"];
            saveSystemSettings();
            Serial.printf("[CMD] System settings updated - modbus_poll=%ums, telemetry=%ums, relay_pulse=%ums\n",
                systemSettings.modbus_poll_interval_ms, systemSettings.telemetry_interval_ms, systemSettings.relay_pulse_ms);
            sendCommandResponse("{\"status\":\"success\",\"cmd\":\"SET\",\"section\":\"system_settings\",\"message\":\"System settings saved\"}\n", source);
        }
        else if (section == "network") {
            if (data.containsKey("apn")) {
                const char* apn = data["apn"];
                strncpy(networkConfig.apn, apn, sizeof(networkConfig.apn) - 1);
                networkConfig.apn[sizeof(networkConfig.apn) - 1] = '\0';
            }
            if (data.containsKey("apn_username")) {
                const char* user = data["apn_username"];
                strncpy(networkConfig.apn_username, user, sizeof(networkConfig.apn_username) - 1);
                networkConfig.apn_username[sizeof(networkConfig.apn_username) - 1] = '\0';
            }
            if (data.containsKey("apn_password")) {
                const char* pass = data["apn_password"];
                strncpy(networkConfig.apn_password, pass, sizeof(networkConfig.apn_password) - 1);
                networkConfig.apn_password[sizeof(networkConfig.apn_password) - 1] = '\0';
            }
            saveNetworkConfig();
            Serial.printf("[CMD] Network config updated - APN: %s\n", networkConfig.apn);
            sendCommandResponse("{\"status\":\"success\",\"cmd\":\"SET\",\"section\":\"network\",\"message\":\"Network config saved. Reboot required for APN change to take effect.\"}\n", source);
        }
        else {
            sendCommandResponse("{\"status\":\"error\",\"cmd\":\"SET\",\"message\":\"Unknown section\"}\n", source);
        }
    }

    // ---- SET_MODBUS_PAUSE ----
    else if (cmd == "SET_MODBUS_PAUSE") {
        JsonObject data = doc["data"];
        if (data.containsKey("paused")) {
            modbusReadPaused = data["paused"];
            Serial.printf("[CMD] Modbus polling %s\n", modbusReadPaused ? "PAUSED" : "RESUMED");
        }
        StaticJsonDocument<128> resp;
        resp["status"] = "success";
        resp["cmd"] = "SET_MODBUS_PAUSE";
        resp["section"] = "modbus";
        resp["paused"] = modbusReadPaused;
        String out;
        serializeJson(resp, out);
        sendCommandResponse(out + "\n", source);
    }

    // ---- SET_MOTOR ----
    else if (cmd == "SET_MOTOR") {
        JsonObject data = doc["data"];
        bool state = data["state"] | false;

        if (!motorConfig.remote_control_enabled) {
            sendCommandResponse("{\"status\":\"error\",\"cmd\":\"SET_MOTOR\",\"message\":\"Remote control is disabled\"}\n", source);
            return;
        }

        bool ok = motor_set_state(state);
        StaticJsonDocument<256> resp;
        resp["status"] = ok ? "success" : "error";
        resp["cmd"] = "SET_MOTOR";
        JsonObject respData = resp.createNestedObject("data");
        respData["motor_running"] = motor_is_running();
        respData["motor_busy"]    = motor_is_busy();
        respData["current_level"] = level_get_current();
        respData["message"] = ok ? (state ? "Motor starting" : "Motor stopping") : "Motor busy";
        String out;
        serializeJson(resp, out);
        sendCommandResponse(out + "\n", source);
    }

    // ---- ADD ----
    else if (cmd == "ADD") {
        JsonObject data = doc["data"];
        bool ok = false;
        String msg;

        if (section == "profile") {
            ok = addProfile(data);
            msg = ok ? "Profile added" : "Failed to add profile (duplicate or limit reached)";
        } else if (section == "slave") {
            ok = addSlaveAssignment(data);
            msg = ok ? "Slave assigned" : "Failed to assign slave (duplicate or limit reached)";
        } else {
            sendCommandResponse("{\"status\":\"error\",\"cmd\":\"ADD\",\"message\":\"Unknown section\"}\n", source);
            return;
        }

        StaticJsonDocument<256> resp;
        resp["status"] = ok ? "success" : "error";
        resp["cmd"] = "ADD";
        resp["section"] = section;
        resp["message"] = msg;
        String out;
        serializeJson(resp, out);
        sendCommandResponse(out + "\n", source);
    }

    // ---- UPDATE ----
    else if (cmd == "UPDATE") {
        JsonObject data = doc["data"];
        bool ok = false;
        String msg;

        if (section == "profile") {
            ok = updateProfile(data);
            msg = ok ? "Profile updated" : "Profile not found";
        } else if (section == "slave") {
            ok = updateSlaveAssignment(data);
            msg = ok ? "Slave updated" : "Slave not found";
        } else {
            sendCommandResponse("{\"status\":\"error\",\"cmd\":\"UPDATE\",\"message\":\"Unknown section\"}\n", source);
            return;
        }

        StaticJsonDocument<256> resp;
        resp["status"] = ok ? "success" : "error";
        resp["cmd"] = "UPDATE";
        resp["section"] = section;
        resp["message"] = msg;
        String out;
        serializeJson(resp, out);
        sendCommandResponse(out + "\n", source);
    }

    // ---- DELETE ----
    else if (cmd == "DELETE") {
        JsonObject data = doc["data"];
        bool ok = false;
        String msg;

        if (section == "profile") {
            const char* pid = data["profile_id"] | "";
            ok = deleteProfile(pid);
            if (!ok) {
                // Check if it was because it's in use
                bool inUse = false;
                for (int i = 0; i < slaveCount; i++) {
                    if (strcmp(slaveAssignments[i].profile_id, pid) == 0) {
                        inUse = true; break;
                    }
                }
                msg = inUse ? "Profile is currently assigned to a slave. Remove slave first." : "Profile not found";
            } else {
                msg = "Profile deleted";
            }
        } else if (section == "slave") {
            uint8_t sid = data["slave_id"] | (uint8_t)0;
            ok = deleteSlaveAssignment(sid);
            msg = ok ? "Slave deleted" : "Slave not found";
        } else {
            sendCommandResponse("{\"status\":\"error\",\"cmd\":\"DELETE\",\"message\":\"Unknown section\"}\n", source);
            return;
        }

        StaticJsonDocument<256> resp;
        resp["status"] = ok ? "success" : "error";
        resp["cmd"] = "DELETE";
        resp["section"] = section;
        resp["message"] = msg;
        String out;
        serializeJson(resp, out);
        sendCommandResponse(out + "\n", source);
    }

    // ---- TEST_READ ----
    else if (cmd == "TEST_READ" && section == "modbus") {
        JsonObject data = doc["data"];
        uint8_t slaveId = data["slave_id"] | (uint8_t)0;
        const char* profileId = data["profile_id"] | "";

        DynamicJsonDocument resp(32768);
        modbus_test_read(slaveId, profileId, resp);
        String out;
        serializeJson(resp, out);
        sendCommandResponse(out + "\n", source);
    }

    // ---- LIVE_READ ----
    else if (cmd == "LIVE_READ" && section == "modbus") {
        sendCommandResponse("{\"status\":\"info\",\"cmd\":\"LIVE_READ\",\"message\":\"Reading all meters...\"}\n", source);
        modbus_read_all_meters();
        
        DynamicJsonDocument resp(8192);
        resp["status"] = "success";
        resp["cmd"] = "LIVE_READ";
        resp["section"] = "modbus";
        JsonObject dataObj = resp.createNestedObject("data");
        JsonArray results = dataObj.createNestedArray("results");
        modbus_get_all_slave_data(results);
        
        String out;
        serializeJson(resp, out);
        sendCommandResponse(out + "\n", source);
    }

    // ---- GET_STATUS ----
    else if (cmd == "GET_STATUS") {
        sendCommandResponse(getDeviceStatus(), source);
    }

    // ---- GET_TIME ----
    else if (cmd == "GET_TIME") {
        String dtStr = rtc_get_datetime_string();
        unsigned long ts = rtc_get_timestamp();
        bool valid = rtc_is_valid();
        Serial.printf("[CMD] GET_TIME: datetime=%s timestamp=%lu valid=%d\n",
            dtStr.c_str(), ts, valid);

        StaticJsonDocument<256> resp;
        resp["status"] = "success";
        resp["cmd"] = "GET_TIME";
        JsonObject data = resp.createNestedObject("data");
        data["datetime"]  = dtStr;
        data["timestamp"] = ts;
        data["rtc_valid"] = valid;
        String out;
        serializeJson(resp, out);
        sendCommandResponse(out + "\n", source);
    }

    // ---- SET_TIME ----
    else if (cmd == "SET_TIME") {
        JsonObject data = doc["data"];
        int year   = data["year"]   | 2024;
        int month  = data["month"]  | 1;
        int day    = data["day"]    | 1;
        int hour   = data["hour"]   | 0;
        int minute = data["minute"] | 0;
        int second = data["second"] | 0;

        bool ok = rtc_set_time(year, month, day, hour, minute, second);
        sendCommandResponse(
            ok ? "{\"status\":\"success\",\"cmd\":\"SET_TIME\",\"message\":\"Time set\"}\n"
               : "{\"status\":\"error\",\"cmd\":\"SET_TIME\",\"message\":\"RTC not available\"}\n",
            source);
    }

    // ---- GET_VERSION ----
    else if (cmd == "GET_VERSION") {
        StaticJsonDocument<256> resp;
        resp["status"] = "success";
        resp["cmd"] = "GET_VERSION";
        JsonObject data = resp.createNestedObject("data");
        data["firmware_version"] = FW_VERSION;
        data["build_date"]       = OTAManager::getBuildDate();
        data["partition_info"]   = OTAManager::getPartitionInfo();
        data["free_heap"]        = ESP.getFreeHeap();
        data["flash_size"]       = ESP.getFlashChipSize();
        data["uptime"]           = millis() / 1000;
        String out;
        serializeJson(resp, out);
        sendCommandResponse(out + "\n", source);
    }

    // ---- LOG STREAMING ----
    else if (cmd == "START_LOG_STREAM") {
        BLELogger::getInstance().setStreaming(true);
        sendCommandResponse("{\"status\":\"success\",\"cmd\":\"START_LOG_STREAM\",\"data\":{\"streaming\":true}}\n", source);
    }
    else if (cmd == "STOP_LOG_STREAM") {
        BLELogger::getInstance().setStreaming(false);
        sendCommandResponse("{\"status\":\"success\",\"cmd\":\"STOP_LOG_STREAM\",\"data\":{\"streaming\":false}}\n", source);
    }
    else if (cmd == "GET_LOG_STATUS") {
        String streaming = BLELogger::getInstance().isStreaming() ? "true" : "false";
        String usage = String(BLELogger::getInstance().getBufferUsage());
        sendCommandResponse("{\"status\":\"success\",\"cmd\":\"GET_LOG_STATUS\",\"data\":{\"streaming\":" + streaming + ",\"buffer_usage\":" + usage + "}}\n", source);
    }



    // ---- REBOOT ----
    else if (cmd == "REBOOT") {
        sendCommandResponse("{\"status\":\"success\",\"cmd\":\"REBOOT\",\"message\":\"Rebooting in 2 seconds\"}\n", source);
        delay(2000);
        ESP.restart();
    }

    // ---- RESET (factory) ----
    else if (cmd == "RESET") {
        config_factory_reset();
        sendCommandResponse("{\"status\":\"success\",\"cmd\":\"RESET\",\"message\":\"Factory reset complete, rebooting\"}\n", source);
        delay(2000);
        ESP.restart();
    }

    // ---- START_OTA_AP (SoftAP local OTA) ----
    else if (cmd == "START_OTA_AP") {
        JsonObject data = doc["data"];
        String ssid;
        if (data.containsKey("ssid")) {
            ssid = data["ssid"].as<const char*>();
        } else {
            String imei = modem_get_imei();
            ssid = "4G_MOTOR_OTA_" + imei.substring(imei.length() - 4);
        }
        String password;
        if (data.containsKey("password")) {
            password = data["password"].as<const char*>();
        } else {
            password = "paramount123";
        }
        uint32_t timeout_sec = data["timeout_sec"] | 300;

        if (password.length() < 8) {
            sendCommandResponse("{\"status\":\"error\",\"cmd\":\"START_OTA_AP\",\"message\":\"Password must be at least 8 characters\"}\n", source);
        } else if (otaManager.startAPMode(ssid, password, timeout_sec * 1000)) {
            StaticJsonDocument<256> resp;
            resp["status"] = "success";
            resp["cmd"]    = "START_OTA_AP";
            JsonObject rdata = resp.createNestedObject("data");
            rdata["ssid"]        = ssid;
            rdata["ip"]          = otaManager.getAPIP();
            rdata["url"]         = "http://" + String(otaManager.getAPIP()) + "/";
            rdata["timeout_sec"] = timeout_sec;
            String output;
            serializeJson(resp, output);
            sendCommandResponse(output + "\n", source);
        } else {
            sendCommandResponse("{\"status\":\"error\",\"cmd\":\"START_OTA_AP\",\"message\":\"Failed to start OTA AP\"}\n", source);
        }
    }

    // ---- OTA_UPDATE (Cloud OTA via 4G modem) ----
    else if (cmd == "OTA_UPDATE") {
        JsonObject data = doc["data"];
        const char* url = data["url"] | "";
        const char* md5 = data["md5"] | "";

        if (strlen(url) == 0) {
            sendCommandResponse("{\"status\":\"error\",\"cmd\":\"OTA_UPDATE\",\"message\":\"Missing 'url' parameter\"}\n", source);
        } else if (!modem_is_connected()) {
            sendCommandResponse("{\"status\":\"error\",\"cmd\":\"OTA_UPDATE\",\"message\":\"No network connection (4G modem not connected)\"}\n", source);
        } else if (otaManager.startCloudOTA(String(url), String(md5))) {
            sendCommandResponse("{\"status\":\"success\",\"cmd\":\"OTA_UPDATE\",\"message\":\"Cloud OTA download started\"}\n", source);
        } else {
            StaticJsonDocument<256> resp;
            resp["status"]  = "error";
            resp["cmd"]     = "OTA_UPDATE";
            resp["message"] = otaManager.getProgress().message;
            String output;
            serializeJson(resp, output);
            sendCommandResponse(output + "\n", source);
        }
    }

    // ---- STOP_OTA ----
    else if (cmd == "STOP_OTA") {
        otaManager.cancel();
        sendCommandResponse("{\"status\":\"success\",\"cmd\":\"STOP_OTA\",\"message\":\"OTA cancelled\"}\n", source);
    }

    // ---- ROLLBACK ----
    else if (cmd == "ROLLBACK") {
        sendCommandResponse("{\"status\":\"success\",\"cmd\":\"ROLLBACK\",\"message\":\"Rolling back to previous firmware...\"}\n", source);
        delay(1000);
        OTAManager::rollbackToPrevious();
        // If we get here, rollback failed
        sendCommandResponse("{\"status\":\"error\",\"cmd\":\"ROLLBACK\",\"message\":\"Rollback failed - no previous firmware available\"}\n", source);
    }

    // ---- Unknown command ----
    else {
        String errMsg = "{\"status\":\"error\",\"message\":\"Unknown command: " + cmd + "\"}\n";
        sendCommandResponse(errMsg, source);
    }
}
