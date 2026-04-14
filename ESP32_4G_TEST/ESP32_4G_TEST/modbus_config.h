#pragma once

// ============================================================
// MODBUS CONFIGURATION - Device Profile Architecture
// ============================================================
// Profiles define meter templates (blocks + parameters).
// Slaves reference a profile_id - no duplicate config data.
//
// Memory budget:
//   10 profiles x ~3155 bytes  = ~31.5 KB
//   20 slaves   x ~58 bytes    = ~1.2 KB
//   Total: ~33 KB (leaves 100+ KB free heap)

#define MAX_PROFILES            10    // Max unique device profiles
#define MAX_SLAVES              20    // Max slave devices (assignments)
#define MAX_BLOCKS_PER_PROFILE  4     // Max blocks per profile
#define MAX_PARAMS_PER_BLOCK    10    // Max parameters per block
#define MAX_BLOCK_LENGTH        125   // Modbus protocol limit per single read

// String length limits (including null terminator)
#define ID_LEN    24    // For profile_id
#define NAME_LEN  32    // For names, make, model, device_type, block_name, parameter_name
#define TYPE_LEN  12    // For data_type
#define UNIT_LEN  12    // For engineering units

// LittleFS file paths
#define PROFILES_JSON_PATH  "/profiles.json"
#define SLAVES_JSON_PATH    "/slaves.json"
#define MOTOR_CONFIG_PATH   "/motor.json"
#define MODBUS_UART_PATH    "/modbus_uart.json"
#define SYSTEM_SETTINGS_PATH "/system_settings.json"

/**
 * A single parameter (register) within a block.
 * Address is stored both as offset (relative to block start)
 * and absolute (for reference).
 * Size: ~72 bytes
 */
struct ProfileParameter {
    char     name[NAME_LEN];           // "Voltage R-N", "Frequency"
    uint16_t offset_address;           // Offset from block start_address (in 16-bit registers)
    uint16_t absolute_address;         // Absolute Modbus address (= start_address + offset)
    char     data_type[TYPE_LEN];      // "float32","uint16","int16","uint32","int32"
    float    multiplier;               // Multiply raw value by this (1.0 = no scaling)
    char     unit[UNIT_LEN];           // "V","A","Hz","kWh","%"
};

/**
 * A block - a contiguous range of registers read in a single Modbus call.
 * Parameters are extracted from the block's read buffer using offset_address.
 * Size: ~757 bytes (with 10 parameters)
 */
struct ProfileBlock {
    char     block_name[NAME_LEN];     // "Real-time Electricals"
    uint16_t start_address;            // Starting Modbus register address
    uint8_t  registers_count;          // Total 16-bit registers to read (1-125)
    uint8_t  function_code;            // 1=Coils, 2=Discrete, 3=Holding, 4=Input
    uint8_t  parameter_count;          // Number of parameters defined in this block
    ProfileParameter parameters[MAX_PARAMS_PER_BLOCK];
};

/**
 * Device Profile - reusable meter template.
 * Defines the make/model, byte order, and all blocks+parameters.
 * Multiple slaves can reference the same profile.
 * Size: ~3155 bytes (with 4 blocks)
 */
struct DeviceProfile {
    char     profile_id[ID_LEN];       // Unique key: "elmeasure_lg5110"
    char     device_type[NAME_LEN];    // "Energy Meter", "Water Meter"
    char     make[NAME_LEN];           // "Elmeasure", "Schneider"
    char     model[NAME_LEN];          // "LG5110", "PM2100"
    bool     byte_swap;                // Swap bytes within 16-bit word
    bool     word_swap;                // Swap 16-bit words in 32-bit value
    uint8_t  block_count;              // Number of blocks (0..MAX_BLOCKS_PER_PROFILE)
    ProfileBlock blocks[MAX_BLOCKS_PER_PROFILE];
};
// Endianness mapping:
//   byte_swap=false, word_swap=false -> big (ABCD)
//   byte_swap=false, word_swap=true  -> mid_little (CDAB)
//   byte_swap=true,  word_swap=false -> mid_big (BADC)
//   byte_swap=true,  word_swap=true  -> little (DCBA)

/**
 * Slave Assignment - lightweight reference to a device profile.
 * Only stores the slave address, profile reference, and user alias.
 * Size: ~58 bytes
 */
struct SlaveAssignment {
    uint8_t  slave_id;                 // Modbus address 1-247
    char     profile_id[ID_LEN];       // Reference to DeviceProfile.profile_id
    char     name[NAME_LEN];           // User alias: "Main Panel Meter"
    bool     enabled;                  // Whether to poll this slave
};

// Motor controller configuration (persisted to LittleFS)
struct MotorConfig {
    bool     remote_control_enabled;   // Allow remote motor control
    bool     auto_turn_on;             // Auto-start motor at day start
    int      day_start_hour;           // Hour to consider new day (0-23)
    float    level_low_threshold;      // Low level threshold (turn on)
    float    level_high_threshold;     // High level threshold (turn off)
    uint8_t  level_slave_id;           // Modbus slave ID of level sensor
    char     level_param_name[NAME_LEN]; // Parameter name for level reading
    uint16_t relay_pulse_ms;           // Relay hold duration in ms
};

// Modbus UART configuration (persisted to LittleFS)
struct ModbusUARTConfig {
    uint32_t baud_rate;
    uint8_t  data_bits;               // 7 or 8
    char     parity;                   // 'N', 'E', 'O'
    uint8_t  stop_bits;               // 1 or 2
    uint16_t timeout_ms;              // Response timeout
    uint8_t  retry_count;             // Retries on failure
};

// System settings (persisted to LittleFS)
struct SystemSettings {
    uint32_t modbus_poll_interval_ms;   // ms between Modbus read cycles
    uint32_t telemetry_interval_ms;     // ms between telemetry sends
    uint16_t relay_pulse_ms;            // Relay hold duration in ms
};

// Network (modem) configuration (persisted to LittleFS)
// Overrides the compile-time GSM_APN / GSM_USER / GSM_PASS defaults.
#define NETWORK_CONFIG_PATH "/network.json"
struct NetworkConfig {
    char apn[64];
    char apn_username[32];
    char apn_password[32];
};
