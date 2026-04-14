/*
 * config.h - Pin Definitions & Configuration Constants
 *
 * ESP32 4G Motor Controller with RS485
 * Hardware: ESP32 + SIMCOM A7677S + MAX485 + PCF85063 RTC
 */

#ifndef CONFIG_H
#define CONFIG_H

// =============================================================
//  PIN DEFINITIONS
// =============================================================

// --- SIMCOM A7677S 4G Modem (UART2) ---
#define MODEM_TX_PIN        17      // ESP32 TX -> Modem RX
#define MODEM_RX_PIN        18      // ESP32 RX <- Modem TX
#define MODEM_RESET_PIN     16      // Modem Reset (Active LOW pulse)
#define MODEM_POWER_PIN     15      // Modem Power Enable

// --- Relay Outputs ---
#define RELAY1_PIN          14      // Relay 1 - Motor Start
#define RELAY2_PIN          21      // Relay 2 - Motor Stop

// --- Status LED ---
#define STATUS_LED_PIN      19      // On-board status indicator

// --- Hardware Watchdog ---
#define WDT_FEED_PIN        5       // External watchdog feed (toggle)

// --- I2C Bus (RTC PCF85063) ---
#define I2C_SDA_PIN         6
#define I2C_SCL_PIN         7

// --- RS485 (MAX485) via UART1 ---
#define RS485_DI_PIN        9       // Data In  (ESP32 TX -> MAX485 DI)
#define RS485_RO_PIN        11      // Read Out (MAX485 RO -> ESP32 RX)
#define RS485_DE_RE_PIN     10      // Direction Enable / Receive Enable

// =============================================================
//  MODEM CONFIGURATION
// =============================================================
#define MODEM_BAUD          115200
#define GSM_APN             "airtelgprs.com"
#define GSM_USER            ""
#define GSM_PASS            ""

// =============================================================
//  THINGSBOARD MQTT CONFIGURATION
// =============================================================
#define TB_SERVER           "dashboard.bridgethings.com"
#define TB_PORT             1883
#define TB_DEVICE_TOKEN     "jXj1ruNhOKcCw8oFxzXm"

// --- ThingsBoard MQTT Topics ---
#define TOPIC_TELEMETRY         "v1/devices/me/telemetry"
#define TOPIC_ATTRIBUTES        "v1/devices/me/attributes"
#define TOPIC_ATTR_REQUEST      "v1/devices/me/attributes/request/"
#define TOPIC_ATTR_RESPONSE     "v1/devices/me/attributes/response/+"
#define TOPIC_RPC_REQUEST       "v1/devices/me/rpc/request/+"
#define TOPIC_RPC_RESPONSE      "v1/devices/me/rpc/response/"

// =============================================================
//  BLE CONFIGURATION
// =============================================================
#define BLE_DEVICE_NAME         "4G_MOTOR"
#define BLE_SERVICE_UUID        "4880c12c-fdcb-4077-8920-a450d7f9b907"
#define BLE_CHAR_UUID           "fec26ec4-6d71-4442-9f81-55bc21d658d6"
#define BLE_MTU_SIZE            517
#define BLE_CHUNK_SIZE          512
#define BLE_MAX_CMD_LEN         4096

// =============================================================
//  RS485 MODBUS DEFAULTS
// =============================================================
#define RS485_DEFAULT_BAUD      9600
#define RS485_DEFAULT_CONFIG    SERIAL_8N1
#define MODBUS_RESPONSE_TIMEOUT 1000    // ms to wait for slave response
#define MODBUS_POLL_INTERVAL    120000   // ms between full Modbus read cycles
#define MODBUS_INTER_FRAME_MS   50      // ms delay between Modbus frames

// =============================================================
//  RADAR SENSOR ERROR CODES
// =============================================================
#define RADAR_ERR_NO_DETECTION  0xFFFFFFFF  // 4294967295.0
#define RADAR_ERR_OVERFLOW      0xFFFFFFFE  // 4294967294.0
#define RADAR_ERR_OUT_OF_RANGE  0xFFFFFFFD  // 4294967293.0
#define RADAR_RETRY_COUNT       3

// =============================================================
//  TIMING CONFIGURATION (milliseconds)
// =============================================================
#define TELEMETRY_INTERVAL      120000   // Send telemetry every 30s
#define MQTT_RECONNECT_DELAY    5000    // Delay between MQTT reconnect attempts
#define MODEM_CHECK_INTERVAL    60000   // Check modem connection every 60s
#define WDT_FEED_INTERVAL       500     // Feed external watchdog every 500ms
#define RELAY_PULSE_DURATION    2000    // Relay pulse duration for start/stop (2 seconds)

// =============================================================
//  RELAY ACTIVE STATE
// =============================================================
#define RELAY_ACTIVE_HIGH       true    // true = relay ON when pin HIGH

// =============================================================
//  DEBUG
// =============================================================
#define ENABLE_MODEM_DEBUG      true    // Print modem AT commands to Serial

// =============================================================
//  FIRMWARE
// =============================================================
#define FW_VERSION              "2.1.1"

// =============================================================
//  MQTT BUFFER SIZE
// =============================================================
#define MQTT_BUFFER_SIZE        8192    // Max MQTT packet size (bytes)

// =============================================================
//  TIMEZONE
// =============================================================
// RTC stores local time. mktime() on ESP32 treats struct tm as UTC
// (no TZ env var configured), so rtc_get_timestamp() must subtract
// the local UTC offset to return a correct UTC Unix timestamp for
// ThingsBoard. Change this if deployed outside IST (UTC+5:30).
#define TIMEZONE_OFFSET_SEC     19800   // IST = UTC+5:30 = 5*3600+30*60

#endif // CONFIG_H
