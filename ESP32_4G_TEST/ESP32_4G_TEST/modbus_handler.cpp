/*
 * modbus_handler.cpp - RS485 Modbus RTU Master Implementation
 *
 * Based on reference Modbus reading patterns.
 * Uses ModbusMaster library on UART1 via MAX485 transceiver.
 */

#include "modbus_handler.h"
#include "config.h"
#include "config_manager.h"
#include "mqtt_handler.h"
#include "rtc_handler.h"

#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#include <ModbusMaster.h>
#pragma GCC diagnostic pop
#include <HardwareSerial.h>

// RS485 serial
#define RS485Serial Serial1

// ModbusMaster instance
static ModbusMaster modbusNode;

// Mutex for RS485 UART access
static SemaphoreHandle_t modbusMutex = NULL;

// Pause flag
bool modbusReadPaused = false;

// Cached last values per slave (for volume tracking and status queries)
static String lastSlaveValues[MAX_SLAVES];
static unsigned long lastSlaveReadTime[MAX_SLAVES];

// ============================================================
//  DE/RE PIN CONTROL
// ============================================================

static void preTransmission() {
    digitalWrite(RS485_DE_RE_PIN, HIGH);
}

static void postTransmission() {
    digitalWrite(RS485_DE_RE_PIN, LOW);
}

// ============================================================
//  INIT
// ============================================================

void modbus_init() {
    pinMode(RS485_DE_RE_PIN, OUTPUT);
    digitalWrite(RS485_DE_RE_PIN, LOW);  // Receive mode

    RS485Serial.begin(modbusUARTConfig.baud_rate, SERIAL_8N1, RS485_RO_PIN, RS485_DI_PIN);

    modbusNode.preTransmission(preTransmission);
    modbusNode.postTransmission(postTransmission);

    if (modbusMutex == NULL) {
        modbusMutex = xSemaphoreCreateMutex();
    }

    memset(lastSlaveValues, 0, sizeof(lastSlaveValues));
    memset(lastSlaveReadTime, 0, sizeof(lastSlaveReadTime));

    Serial.printf("[MODBUS] Initialized - Baud: %d, TX: %d, RX: %d, DE/RE: %d\n",
        modbusUARTConfig.baud_rate, RS485_DI_PIN, RS485_RO_PIN, RS485_DE_RE_PIN);
}

void modbus_reinit(uint32_t baudRate) {
    RS485Serial.end();
    delay(50);
    RS485Serial.begin(baudRate, SERIAL_8N1, RS485_RO_PIN, RS485_DI_PIN);
    delay(50);
    Serial.printf("[MODBUS] Re-initialized at %d baud\n", baudRate);
}

// ============================================================
//  ENDIANNESS HELPERS
// ============================================================

const char* getEndianness(bool byte_swap, bool word_swap) {
    if (!byte_swap && !word_swap) return "big";       // ABCD
    if (!byte_swap && word_swap)  return "mid_little"; // CDAB
    if (byte_swap && !word_swap)  return "mid_big";    // BADC
    return "little";                                    // DCBA
}

uint32_t convertRegistersToUint32(uint16_t reg0, uint16_t reg1, String endianness) {
    uint8_t bytes[4];
    bytes[0] = (reg0 >> 8) & 0xFF;  // A
    bytes[1] = reg0 & 0xFF;         // B
    bytes[2] = (reg1 >> 8) & 0xFF;  // C
    bytes[3] = reg1 & 0xFF;         // D

    uint32_t result;

    if (endianness == "little" || endianness == "dcba") {
        result = ((uint32_t)bytes[3] << 24) | ((uint32_t)bytes[2] << 16) |
                 ((uint32_t)bytes[1] << 8) | bytes[0];
    } else if (endianness == "mid_big" || endianness == "badc") {
        result = ((uint32_t)bytes[1] << 24) | ((uint32_t)bytes[0] << 16) |
                 ((uint32_t)bytes[3] << 8) | bytes[2];
    } else if (endianness == "mid_little" || endianness == "cdab") {
        result = ((uint32_t)bytes[2] << 24) | ((uint32_t)bytes[3] << 16) |
                 ((uint32_t)bytes[0] << 8) | bytes[1];
    } else {
        // Default: Big Endian (ABCD)
        result = ((uint32_t)bytes[0] << 24) | ((uint32_t)bytes[1] << 16) |
                 ((uint32_t)bytes[2] << 8) | bytes[3];
    }

    return result;
}

float convertRegistersToFloat32(uint16_t reg0, uint16_t reg1, String endianness) {
    uint32_t rawBits = convertRegistersToUint32(reg0, reg1, endianness);
    float value;
    memcpy(&value, &rawBits, sizeof(float));
    return value;
}

int32_t convertRegistersToInt32(uint16_t reg0, uint16_t reg1, String endianness) {
    uint32_t rawBits = convertRegistersToUint32(reg0, reg1, endianness);
    return (int32_t)rawBits;
}

// ============================================================
//  64-BIT REGISTER CONVERSION (4 registers = 8 bytes)
// ============================================================
// Registers arrive as: r0(AB) r1(CD) r2(EF) r3(GH) -> bytes A B C D E F G H
// Endianness controls byte reordering of the 8-byte value.

uint64_t convertRegistersToUint64(uint16_t r0, uint16_t r1, uint16_t r2, uint16_t r3, String endianness) {
    uint8_t bytes[8];
    bytes[0] = (r0 >> 8) & 0xFF;  // A
    bytes[1] = r0 & 0xFF;         // B
    bytes[2] = (r1 >> 8) & 0xFF;  // C
    bytes[3] = r1 & 0xFF;         // D
    bytes[4] = (r2 >> 8) & 0xFF;  // E
    bytes[5] = r2 & 0xFF;         // F
    bytes[6] = (r3 >> 8) & 0xFF;  // G
    bytes[7] = r3 & 0xFF;         // H

    uint64_t result;

    if (endianness == "little" || endianness == "dcba") {
        // Reverse all bytes: HGFEDCBA
        result = ((uint64_t)bytes[7] << 56) | ((uint64_t)bytes[6] << 48) |
                 ((uint64_t)bytes[5] << 40) | ((uint64_t)bytes[4] << 32) |
                 ((uint64_t)bytes[3] << 24) | ((uint64_t)bytes[2] << 16) |
                 ((uint64_t)bytes[1] << 8)  |  (uint64_t)bytes[0];
    } else if (endianness == "mid_big" || endianness == "badc") {
        // Swap bytes within each word: BADCFEHG
        result = ((uint64_t)bytes[1] << 56) | ((uint64_t)bytes[0] << 48) |
                 ((uint64_t)bytes[3] << 40) | ((uint64_t)bytes[2] << 32) |
                 ((uint64_t)bytes[5] << 24) | ((uint64_t)bytes[4] << 16) |
                 ((uint64_t)bytes[7] << 8)  |  (uint64_t)bytes[6];
    } else if (endianness == "mid_little" || endianness == "cdab") {
        // Swap words (pairs): GHEFCDAB
        result = ((uint64_t)bytes[6] << 56) | ((uint64_t)bytes[7] << 48) |
                 ((uint64_t)bytes[4] << 40) | ((uint64_t)bytes[5] << 32) |
                 ((uint64_t)bytes[2] << 24) | ((uint64_t)bytes[3] << 16) |
                 ((uint64_t)bytes[0] << 8)  |  (uint64_t)bytes[1];
    } else {
        // Default: Big Endian (ABCDEFGH)
        result = ((uint64_t)bytes[0] << 56) | ((uint64_t)bytes[1] << 48) |
                 ((uint64_t)bytes[2] << 40) | ((uint64_t)bytes[3] << 32) |
                 ((uint64_t)bytes[4] << 24) | ((uint64_t)bytes[5] << 16) |
                 ((uint64_t)bytes[6] << 8)  |  (uint64_t)bytes[7];
    }

    return result;
}

int64_t convertRegistersToInt64(uint16_t r0, uint16_t r1, uint16_t r2, uint16_t r3, String endianness) {
    uint64_t rawBits = convertRegistersToUint64(r0, r1, r2, r3, endianness);
    return (int64_t)rawBits;
}

double convertRegistersToFloat64(uint16_t r0, uint16_t r1, uint16_t r2, uint16_t r3, String endianness) {
    uint64_t rawBits = convertRegistersToUint64(r0, r1, r2, r3, endianness);
    double value;
    memcpy(&value, &rawBits, sizeof(double));
    return value;
}

// ============================================================
//  BLOCK READING
// ============================================================

static bool readModbusBlock(uint8_t slaveId, uint16_t startAddr, uint8_t length,
                            uint8_t funcCode, uint16_t* buffer) {
    if (xSemaphoreTake(modbusMutex, pdMS_TO_TICKS(2000)) != pdTRUE) {
        Serial.println("[MODBUS] Failed to acquire UART mutex");
        return false;
    }

    modbusNode.begin(slaveId, RS485Serial);
    uint8_t result = 0;

    switch (funcCode) {
        case 1:  result = modbusNode.readCoils(startAddr, length); break;
        case 2:  result = modbusNode.readDiscreteInputs(startAddr, length); break;
        case 3:  result = modbusNode.readHoldingRegisters(startAddr, length); break;
        case 4:  result = modbusNode.readInputRegisters(startAddr, length); break;
        default: 
            xSemaphoreGive(modbusMutex);
            return false;
    }

    if (result != modbusNode.ku8MBSuccess) {
        Serial.printf("[MODBUS] Read FAILED: Slave %d, Addr %d, Len %d, Func %d, Error: 0x%02X\n",
                      slaveId, startAddr, length, funcCode, result);
        xSemaphoreGive(modbusMutex);
        return false;
    }

    for (int i = 0; i < length; i++) {
        buffer[i] = modbusNode.getResponseBuffer(i);
    }
    
    xSemaphoreGive(modbusMutex);
    return true;
}

// Helper for test read with retries
static bool readModbusBlockWithRetry(uint8_t slaveId, uint16_t startAddr, uint8_t length,
                                   uint8_t funcCode, uint16_t* buffer, int retries = 2) {
    for (int i = 0; i <= retries; i++) {
        if (readModbusBlock(slaveId, startAddr, length, funcCode, buffer)) return true;
        if (i < retries) {
            Serial.printf("[MODBUS] Read failed (slave %d), retry %d/%d...\n", slaveId, i + 1, retries);
            delay(200);
        }
    }
    return false;
}

// ============================================================
//  PARAMETER EXTRACTION
// ============================================================

static bool extractParameterFromBlock(const uint16_t* blockBuffer, uint16_t blockStart,
                                      const ProfileParameter& param, bool byte_swap, bool word_swap,
                                      uint16_t blockRegCount, double& outValue) {
    int offset = param.offset_address;
    if (offset < 0) return false;

    uint16_t w0 = blockBuffer[offset];
    uint16_t w1 = (offset + 1 < blockRegCount) ? blockBuffer[offset + 1] : 0;

    String dataType = String(param.data_type);
    String endianness = String(getEndianness(byte_swap, word_swap));

    double rawValue = 0;

    if (dataType == "float64" || dataType == "uint64" || dataType == "int64") {
        // 64-bit types need 4 registers
        uint16_t w2 = (offset + 2 < blockRegCount) ? blockBuffer[offset + 2] : 0;
        uint16_t w3 = (offset + 3 < blockRegCount) ? blockBuffer[offset + 3] : 0;
        if (offset + 3 < blockRegCount) {
            if (dataType == "float64")
                rawValue = convertRegistersToFloat64(w0, w1, w2, w3, endianness);
            else if (dataType == "uint64")
                rawValue = (double)convertRegistersToUint64(w0, w1, w2, w3, endianness);
            else
                rawValue = (double)convertRegistersToInt64(w0, w1, w2, w3, endianness);
        } else {
             rawValue = (double)w0; // Fallback missing len
        }
    } else if (dataType == "float32" && offset + 1 < blockRegCount) {
        rawValue = (double)convertRegistersToFloat32(w0, w1, endianness);
    } else if (dataType == "uint32" && offset + 1 < blockRegCount) {
        rawValue = (double)convertRegistersToUint32(w0, w1, endianness);
    } else if (dataType == "int32" && offset + 1 < blockRegCount) {
        rawValue = (double)convertRegistersToInt32(w0, w1, endianness);
    } else if (dataType == "int16") {
        rawValue = (double)(int16_t)w0;
    } else {
        rawValue = (double)w0;  // uint16 default
    }

    outValue = rawValue * param.multiplier;
    return true;
}

// ============================================================
//  READ AND PUBLISH SINGLE METER
// ============================================================

static bool readAndPublishMeter(int slaveIdx, int profileIdx) {
    if (slaveIdx < 0 || slaveIdx >= slaveCount) return false;
    if (profileIdx < 0 || profileIdx >= profileCount) return false;

    SlaveAssignment& sa = slaveAssignments[slaveIdx];
    DeviceProfile& prof = deviceProfiles[profileIdx];

    Serial.printf("[MODBUS] Reading slave %d (%s) profile '%s' (%d blocks)\n",
        sa.slave_id, sa.name, prof.profile_id, prof.block_count);

    if (prof.block_count == 0) return true;

    // Build telemetry JSON (ThingsBoard format: {"ts": ms, "values": {...}})
    DynamicJsonDocument doc(4096);
    // ts must be in milliseconds for ThingsBoard
    doc["ts"] = (unsigned long long)rtc_get_timestamp() * 1000ULL;

    JsonObject values = doc.createNestedObject("values");

    int paramsRead = 0, paramsFailed = 0;
    int blocksRead = 0, blocksFailed = 0;

    uint16_t blockBuffer[MAX_BLOCK_LENGTH];

    for (int bi = 0; bi < prof.block_count; bi++) {
        ProfileBlock& blk = prof.blocks[bi];

        Serial.printf("[MODBUS]   Block '%s': FC%d addr %d len %d (%d params)\n",
            blk.block_name, blk.function_code, blk.start_address,
            blk.registers_count, blk.parameter_count);

        memset(blockBuffer, 0, sizeof(blockBuffer));
        bool blockSuccess = readModbusBlock(sa.slave_id, blk.start_address,
                                            blk.registers_count, blk.function_code, blockBuffer);

        if (blockSuccess) {
            blocksRead++;
            for (int pi = 0; pi < blk.parameter_count; pi++) {
                ProfileParameter& param = blk.parameters[pi];

                String paramKey = String(param.name);
                if (paramKey.isEmpty()) paramKey = "addr_" + String(param.absolute_address);
                paramKey.toLowerCase();
                paramKey.replace(" ", "_");

                if (param.offset_address >= blk.registers_count) {
                    paramsFailed++;
                    continue;  // skip — don't send null to ThingsBoard
                }

                double value;
                if (extractParameterFromBlock(blockBuffer, blk.start_address, param,
                                              prof.byte_swap, prof.word_swap, blk.registers_count, value)) {
                    String dataType = String(param.data_type);
                    if (param.multiplier != 1.0) {
                        // If there is ANY scaling applied, we must export as float to keep decimals!
                        values[paramKey] = (float)value;
                    } else {
                        if (dataType == "float64")       values[paramKey] = value;
                        else if (dataType == "float32")  values[paramKey] = (float)value;
                        else if (dataType == "uint64")   values[paramKey] = (uint64_t)value;
                        else if (dataType == "int64")    values[paramKey] = (int64_t)value;
                        else if (dataType == "uint32")   values[paramKey] = (uint32_t)value;
                        else if (dataType == "int32")    values[paramKey] = (int32_t)value;
                        else if (dataType == "int16")    values[paramKey] = (int16_t)value;
                        else                             values[paramKey] = (uint16_t)value;
                    }
                    paramsRead++;
                } else {
                    paramsFailed++;  // skip — don't send null to ThingsBoard
                }
            }
        } else {
            blocksFailed++;
            paramsFailed += blk.parameter_count;
            Serial.printf("[MODBUS]   Block '%s': read FAILED\n", blk.block_name);
        }
        delay(MODBUS_INTER_FRAME_MS);
    }

    bool allFailed = (paramsRead == 0 && blocksRead == 0);
    Serial.printf("[MODBUS] Slave %d (%s): %d params OK, %d failed, %s\n",
        sa.slave_id, sa.name, paramsRead, paramsFailed,
        allFailed ? "ALL FAILED" : (paramsFailed > 0 ? "partial" : "ok"));

    // Cache values for status queries and volume tracking
    if (paramsRead > 0) {
        String valuesStr;
        serializeJson(values, valuesStr);
        lastSlaveValues[slaveIdx] = valuesStr;
        lastSlaveReadTime[slaveIdx] = millis();
    }

    // Publish to ThingsBoard
    if (mqtt_is_connected()) {
        String output;

        if (paramsRead > 0) {
            // Normal telemetry: actual meter values
            serializeJson(doc, output);
        } else {
            // All reads failed: send error marker so the dashboard shows the fault
            DynamicJsonDocument errDoc(128);
            errDoc["ts"] = (unsigned long long)rtc_get_timestamp() * 1000ULL;
            errDoc["values"]["read_status"] = "MRF";  // Modbus Read Fail
            serializeJson(errDoc, output);
        }

        Serial.printf("[MODBUS] Slave %d (%s) @ %s | %s (%u bytes)\n",
                      sa.slave_id, sa.name,
                      rtc_get_datetime_string().c_str(),
                      output.c_str(), (unsigned)output.length());

        if (mqtt_send_telemetry(output.c_str())) {
            Serial.printf("[MODBUS] Slave %d telemetry sent OK\n", sa.slave_id);
        } else {
            Serial.printf("[MODBUS] Slave %d telemetry send FAILED\n", sa.slave_id);
        }
    } else {
        Serial.println("[MODBUS] MQTT not connected, skipping publish");
    }

    return !allFailed;
}

bool modbus_read_slave(uint8_t slaveId) {
    if (modbusReadPaused) return false;
    
    int slaveIdx = findSlaveIndex(slaveId);
    if (slaveIdx < 0) {
        Serial.printf("[MODBUS] Slave ID %d not found in assignments\n", slaveId);
        return false;
    }
    
    if (!slaveAssignments[slaveIdx].enabled) return false;
    
    int profileIdx = findProfileIndex(slaveAssignments[slaveIdx].profile_id);
    if (profileIdx < 0) {
        Serial.printf("[MODBUS] Profile %s not found for slave %d\n", 
                      slaveAssignments[slaveIdx].profile_id, slaveId);
        return false;
    }
    
    return readAndPublishMeter(slaveIdx, profileIdx);
}

// ============================================================
//  READ ALL METERS
// ============================================================

void modbus_read_all_meters() {
    if (modbusReadPaused) return;

    int processed = 0, success = 0, failed = 0, skipped = 0;

    for (int i = 0; i < slaveCount; i++) {
        if (!slaveAssignments[i].enabled) continue;
        if (modbusReadPaused) break;

        // Exponential backoff for dead slaves
        if (slaveNextRetryTime[i] > 0 && millis() < slaveNextRetryTime[i]) {
            skipped++;
            continue;
        }

        int profileIdx = findProfileIndex(slaveAssignments[i].profile_id);
        if (profileIdx < 0) {
            Serial.printf("[MODBUS] Slave %d: profile '%s' not found\n",
                slaveAssignments[i].slave_id, slaveAssignments[i].profile_id);
            continue;
        }

        processed++;
        if (readAndPublishMeter(i, profileIdx)) {
            slaveConsecutiveFails[i] = 0;
            slaveNextRetryTime[i] = 0;
            success++;
        } else {
            slaveConsecutiveFails[i]++;
            uint8_t failCount = slaveConsecutiveFails[i];

            unsigned long backoffMs;
            if (failCount <= 1) backoffMs = 5000;
            else if (failCount == 2) backoffMs = 10000;
            else if (failCount == 3) backoffMs = 20000;
            else if (failCount == 4) backoffMs = 40000;
            else backoffMs = 60000;

            slaveNextRetryTime[i] = millis() + backoffMs;
            failed++;
            Serial.printf("[MODBUS] Slave %d: fail #%d, backoff %lums\n",
                slaveAssignments[i].slave_id, failCount, backoffMs);
        }

        delay(MODBUS_INTER_FRAME_MS);
        yield();
    }

    Serial.printf("[MODBUS] Cycle: %d processed, %d ok, %d fail, %d skipped\n",
        processed, success, failed, skipped);
}

// ============================================================
//  TEST READ
// ============================================================

bool modbus_test_read(uint8_t slaveId, const char* profileId, DynamicJsonDocument& resp) {
    int pidx = findProfileIndex(profileId);
    if (pidx < 0 || slaveId == 0) {
        resp["status"] = "error";
        resp["cmd"] = "TEST_READ";
        resp["section"] = "modbus";
        resp["message"] = pidx < 0 ? "Profile not found" : "Invalid slave_id";
        return false;
    }

    DeviceProfile& profile = deviceProfiles[pidx];
    String endianness = String(getEndianness(profile.byte_swap, profile.word_swap));

    bool wasPaused = modbusReadPaused;
    modbusReadPaused = true;
    delay(100);

    resp["status"] = "success";
    resp["cmd"] = "TEST_READ";
    resp["section"] = "modbus";

    JsonObject respData = resp.createNestedObject("data");
    respData["slave_id"] = slaveId;
    respData["profile_id"] = profileId;

    JsonArray blocksArr = respData.createNestedArray("blocks");
    int totalParams = 0, successCount = 0, failCount = 0;

    for (int b = 0; b < profile.block_count; b++) {
        ProfileBlock& blk = profile.blocks[b];
        JsonObject bObj = blocksArr.createNestedObject();
        bObj["block_name"] = String(blk.block_name);

        uint16_t buffer[MAX_BLOCK_LENGTH];
        memset(buffer, 0, sizeof(buffer));

        bool blockOk = readModbusBlockWithRetry(slaveId, blk.start_address, blk.registers_count,
                                               blk.function_code, buffer);
        bObj["status"] = blockOk ? "ok" : "error";

        if (blockOk) {
            String rawHex = "";
            rawHex.reserve(blk.registers_count * 5);
            for (int i = 0; i < blk.registers_count; i++) {
                char hex[6];
                sprintf(hex, "%04X", buffer[i]);
                if (i > 0) rawHex += " ";
                rawHex += hex;
            }
            bObj["raw_hex"] = rawHex;
        }

        JsonArray paramsArr = bObj.createNestedArray("parameters");
        for (int p = 0; p < blk.parameter_count; p++) {
            ProfileParameter& param = blk.parameters[p];
            JsonObject pObj = paramsArr.createNestedObject();
            pObj["name"] = String(param.name);
            pObj["unit"] = String(param.unit);
            pObj["offset"] = param.offset_address;
            pObj["absolute_address"] = param.absolute_address;
            totalParams++;

            if (!blockOk) {
                pObj["raw_value"] = (char*)NULL;
                pObj["scaled_value"] = (char*)NULL;
                failCount++;
                continue;
            }

            uint16_t offset = param.offset_address;
            uint16_t w0 = buffer[offset];
            uint16_t w1 = (offset + 1 < blk.registers_count) ? buffer[offset + 1] : 0;

            String dtStr = String(param.data_type);
            bool is64bit = (dtStr == "float64" || dtStr == "uint64" || dtStr == "int64");

            // For 64-bit types, read 4 words
            uint16_t w2 = 0, w3 = 0;
            if (is64bit) {
                w2 = (offset + 2 < blk.registers_count) ? buffer[offset + 2] : 0;
                w3 = (offset + 3 < blk.registers_count) ? buffer[offset + 3] : 0;
            }

            if (is64bit) {
                char hexBuf[24];
                sprintf(hexBuf, "%04X %04X %04X %04X", w0, w1, w2, w3);
                pObj["raw_hex"] = String(hexBuf);
                pObj["reg0"] = w0;
                pObj["reg1"] = w1;
                pObj["reg2"] = w2;
                pObj["reg3"] = w3;

                uint8_t bytes[8];
                bytes[0] = (w0 >> 8) & 0xFF; bytes[1] = w0 & 0xFF;
                bytes[2] = (w1 >> 8) & 0xFF; bytes[3] = w1 & 0xFF;
                bytes[4] = (w2 >> 8) & 0xFF; bytes[5] = w2 & 0xFF;
                bytes[6] = (w3 >> 8) & 0xFF; bytes[7] = w3 & 0xFF;

                char bytesBuf[28];
                sprintf(bytesBuf, "%02X %02X %02X %02X %02X %02X %02X %02X",
                        bytes[0], bytes[1], bytes[2], bytes[3],
                        bytes[4], bytes[5], bytes[6], bytes[7]);
                pObj["raw_bytes"] = String(bytesBuf);

                // Decoded value using profile endianness
                double rawValue = 0;
                if (dtStr == "float64")
                    rawValue = convertRegistersToFloat64(w0, w1, w2, w3, endianness);
                else if (dtStr == "uint64")
                    rawValue = (double)convertRegistersToUint64(w0, w1, w2, w3, endianness);
                else
                    rawValue = (double)convertRegistersToInt64(w0, w1, w2, w3, endianness);

                pObj["raw_value"] = rawValue;
                pObj["scaled_value"] = rawValue * param.multiplier;

                // 64-bit endianness interpretations
                JsonObject interp = pObj.createNestedObject("interpretations");

                // Big Endian (ABCDEFGH)
                uint64_t be64 = convertRegistersToUint64(w0, w1, w2, w3, "big");
                double be64_f; memcpy(&be64_f, &be64, sizeof(double));
                interp["float64_ABCDEFGH"] = be64_f;

                // Little Endian (HGFEDCBA)
                uint64_t le64 = convertRegistersToUint64(w0, w1, w2, w3, "little");
                double le64_f; memcpy(&le64_f, &le64, sizeof(double));
                interp["float64_HGFEDCBA"] = le64_f;

                // Mid Big (BADC swap bytes within words)
                uint64_t mb64 = convertRegistersToUint64(w0, w1, w2, w3, "mid_big");
                double mb64_f; memcpy(&mb64_f, &mb64, sizeof(double));
                interp["float64_BADCFEHG"] = mb64_f;

                // Mid Little (CDAB swap words)
                uint64_t ml64 = convertRegistersToUint64(w0, w1, w2, w3, "mid_little");
                double ml64_f; memcpy(&ml64_f, &ml64, sizeof(double));
                interp["float64_GHEFCDAB"] = ml64_f;

            } else {
                // 16-bit / 32-bit types (existing logic)
                char hexBuf[12];
                sprintf(hexBuf, "%04X %04X", w0, w1);
                pObj["raw_hex"] = String(hexBuf);
                pObj["reg0"] = w0;
                pObj["reg1"] = w1;

                uint8_t bytes[4];
                bytes[0] = (w0 >> 8) & 0xFF;
                bytes[1] = w0 & 0xFF;
                bytes[2] = (w1 >> 8) & 0xFF;
                bytes[3] = w1 & 0xFF;

                char bytesBuf[16];
                sprintf(bytesBuf, "%02X %02X %02X %02X", bytes[0], bytes[1], bytes[2], bytes[3]);
                pObj["raw_bytes"] = String(bytesBuf);

                // Decoded value using profile endianness
                float rawValue = 0;
                if (dtStr == "float32" && offset + 1 < blk.registers_count)
                    rawValue = convertRegistersToFloat32(w0, w1, endianness);
                else if (dtStr == "uint32" && offset + 1 < blk.registers_count)
                    rawValue = (float)convertRegistersToUint32(w0, w1, endianness);
                else if (dtStr == "int32" && offset + 1 < blk.registers_count)
                    rawValue = (float)convertRegistersToInt32(w0, w1, endianness);
                else if (dtStr == "int16")
                    rawValue = (float)(int16_t)w0;
                else
                    rawValue = (float)w0;

                pObj["raw_value"] = rawValue;
                pObj["scaled_value"] = rawValue * param.multiplier;

                // All endianness interpretations
                JsonObject interp = pObj.createNestedObject("interpretations");
                interp["uint16"] = w0;
                interp["int16"] = (int16_t)w0;

                uint32_t be = ((uint32_t)bytes[0] << 24) | ((uint32_t)bytes[1] << 16) |
                              ((uint32_t)bytes[2] << 8) | bytes[3];
                uint32_t le = ((uint32_t)bytes[3] << 24) | ((uint32_t)bytes[2] << 16) |
                              ((uint32_t)bytes[1] << 8) | bytes[0];
                uint32_t mb = ((uint32_t)bytes[1] << 24) | ((uint32_t)bytes[0] << 16) |
                              ((uint32_t)bytes[3] << 8) | bytes[2];
                uint32_t ml = ((uint32_t)bytes[2] << 24) | ((uint32_t)bytes[3] << 16) |
                              ((uint32_t)bytes[0] << 8) | bytes[1];

                float be_f, le_f, mb_f, ml_f;
                memcpy(&be_f, &be, sizeof(float));
                memcpy(&le_f, &le, sizeof(float));
                memcpy(&mb_f, &mb, sizeof(float));
                memcpy(&ml_f, &ml, sizeof(float));

                interp["float32_ABCD"] = be_f;
                interp["float32_DCBA"] = le_f;
                interp["float32_BADC"] = mb_f;
                interp["float32_CDAB"] = ml_f;
                interp["uint32_ABCD"] = be;
                interp["uint32_DCBA"] = le;
                interp["uint32_BADC"] = mb;
                interp["uint32_CDAB"] = ml;
                interp["int32_ABCD"] = (int32_t)be;
                interp["int32_DCBA"] = (int32_t)le;
                interp["int32_BADC"] = (int32_t)mb;
                interp["int32_CDAB"] = (int32_t)ml;
            }

            successCount++;
        }
        delay(50);
    }

    respData["total_parameters"] = totalParams;
    respData["successful"] = successCount;
    respData["failed"] = failCount;

    modbusReadPaused = wasPaused;

    Serial.printf("[MODBUS] TEST_READ: %d params (%d ok, %d fail)\n",
        totalParams, successCount, failCount);
    return true;
}

// ============================================================
//  GET LAST VALUE (for volume tracking)
// ============================================================

float modbus_get_last_value(uint8_t slaveId, const char* paramName) {
    int slaveIdx = findSlaveIndex(slaveId);
    if (slaveIdx < 0 || lastSlaveValues[slaveIdx].length() == 0) return NAN;

    DynamicJsonDocument doc(2048);
    DeserializationError err = deserializeJson(doc, lastSlaveValues[slaveIdx]);
    if (err) return NAN;

    // Build the key (lowercase, spaces -> underscores)
    String key = String(paramName);
    key.toLowerCase();
    key.replace(" ", "_");

    if (doc.containsKey(key)) {
        return doc[key].as<float>();
    }
    return NAN;
}

void modbus_get_all_slave_data(JsonArray& arr) {
    for (int i = 0; i < slaveCount; i++) {
        JsonObject slaveObj = arr.createNestedObject();
        slaveObj["slave_id"] = slaveAssignments[i].slave_id;
        slaveObj["name"] = slaveAssignments[i].name;
        slaveObj["enabled"] = slaveAssignments[i].enabled;
        
        if (!slaveAssignments[i].enabled) {
            slaveObj["status"] = "disabled";
        } else if (slaveConsecutiveFails[i] > 0) {
            slaveObj["status"] = "error";
        } else if (lastSlaveReadTime[i] == 0) {
            slaveObj["status"] = "pending";
        } else {
            slaveObj["status"] = "ok";
        }
        
        if (lastSlaveReadTime[i] > 0) {
            // Using a rough calculation for last_read_time timestamp
            // Current RTC time - (time elapsed since last read in ms / 1000)
            unsigned long elapsedSec = (millis() - lastSlaveReadTime[i]) / 1000;
            slaveObj["last_read_time"] = rtc_get_timestamp() - elapsedSec;

            // Add cached values
            DynamicJsonDocument valuesDoc(2048);
            deserializeJson(valuesDoc, lastSlaveValues[i]);
            slaveObj["values"] = valuesDoc.as<JsonObject>();
            
            // Add units from profile
            int pidx = findProfileIndex(slaveAssignments[i].profile_id);
            if (pidx >= 0) {
                JsonObject unitsObj = slaveObj.createNestedObject("units");
                DeviceProfile& prof = deviceProfiles[pidx];
                for (int b = 0; b < prof.block_count; b++) {
                    for (int p = 0; p < prof.blocks[b].parameter_count; p++) {
                        ProfileParameter& param = prof.blocks[b].parameters[p];
                        String key = String(param.name);
                        key.toLowerCase();
                        key.replace(" ", "_");
                        unitsObj[key] = param.unit;
                    }
                }
            }
        }
    }
}
