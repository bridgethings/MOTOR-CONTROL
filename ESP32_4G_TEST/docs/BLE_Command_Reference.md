# ESP32-S3 4G Motor Controller — BLE Command Reference

**Firmware Version:** 2.1.0
**Transport:** Bluetooth Low Energy (BLE) characteristic write/notify
**Format:** All commands and responses are JSON strings terminated with `\n`

---

## Command Structure

Every command sent to the device follows this structure:

```json
{
  "cmd": "<COMMAND_NAME>",
  "section": "<section>",
  "data": { }
}
```

Every response follows this structure:

```json
{
  "status": "success" | "error" | "info",
  "cmd": "<COMMAND_NAME>",
  "section": "<section>",
  "data": { },
  "message": "<optional human-readable message>"
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 1000 | Invalid JSON |
| 1001 | Empty command |
| 1002 | Missing `cmd` field |
| 1003 | Unknown section |

---

## GET Commands — Read Configuration / Status

### GET network — Modem & APN Status

```json
{ "cmd": "GET", "section": "network", "data": {} }
```

**Response:**
```json
{
  "status": "success",
  "cmd": "GET",
  "section": "network",
  "data": {
    "type": "4G_MODEM",
    "apn": "airtelgprs.com",
    "connected": true,
    "signal": 18,
    "ip": "10.x.x.x",
    "imei": "860xxxxxxxxxx",
    "operator": "Airtel"
  }
}
```

---

### GET modbus — Modbus UART Configuration

```json
{ "cmd": "GET", "section": "modbus", "data": {} }
```

**Response:**
```json
{
  "status": "success",
  "cmd": "GET",
  "section": "modbus",
  "data": {
    "uart_config": {
      "baud_rate": 9600,
      "data_bits": 8,
      "parity": "N",
      "stop_bits": 1,
      "timeout_ms": 500
    },
    "retry_count": 3
  }
}
```

---

### GET motor — Motor Configuration

```json
{ "cmd": "GET", "section": "motor", "data": {} }
```

**Response:**
```json
{
  "status": "success",
  "cmd": "GET",
  "section": "motor",
  "data": {
    "remote_control_enabled": true,
    "auto_turn_on": false,
    "day_start_hour": 6,
    "level_low_threshold": 10.0,
    "level_high_threshold": 80.0,
    "level_slave_id": 1,
    "level_param_name": "tank_level",
    "relay_pulse_ms": 2000,
    "motor_running": false
  }
}
```

---

### GET system_settings — Poll / Telemetry Intervals

```json
{ "cmd": "GET", "section": "system_settings", "data": {} }
```

**Response:**
```json
{
  "status": "success",
  "cmd": "GET",
  "section": "system_settings",
  "data": {
    "modbus_poll_interval_ms": 120000,
    "telemetry_interval_ms": 120000,
    "relay_pulse_ms": 2000
  }
}
```

---

### GET profiles — List All Device Profiles

```json
{ "cmd": "GET", "section": "profiles", "data": {} }
```

**Response:**
```json
{
  "status": "success",
  "cmd": "GET",
  "section": "profiles",
  "data": [
    {
      "profile_id": "EMI_001",
      "device_type": "Energy Meter",
      "make": "Schneider",
      "model": "PM3200",
      "block_count": 2,
      "parameter_count": 12
    }
  ]
}
```

---

### GET profile — Single Profile Detail

```json
{
  "cmd": "GET",
  "section": "profile",
  "data": { "profile_id": "EMI_001" }
}
```

**Response:** Full profile with all blocks and parameters.

---

### GET slaves — List Slave Assignments

```json
{ "cmd": "GET", "section": "slaves", "data": {} }
```

**Response:**
```json
{
  "status": "success",
  "cmd": "GET",
  "section": "slaves",
  "data": [
    {
      "slave_id": 1,
      "profile_id": "EMI_001",
      "name": "Main Meter",
      "enabled": true
    }
  ]
}
```

---

## GET_STATUS — Full Device Status Snapshot

```json
{ "cmd": "GET_STATUS" }
```

**Response:**
```json
{
  "status": "success",
  "cmd": "GET_STATUS",
  "section": "status",
  "data": {
    "motor": {
      "running": false,
      "busy": false,
      "remote_control_enabled": true,
      "level": {
        "current_level": 45.5
      }
    },
    "network": {
      "sim_ready": true,
      "connected": true,
      "signal": 18,
      "type": "4G_MODEM",
      "ip": "10.x.x.x"
    },
    "mqtt": {
      "connected": true
    },
    "time": {
      "datetime": "2026-02-20 14:30:00",
      "timestamp": 1740054600,
      "rtc_valid": true
    },
    "system": {
      "firmware": "2.1.0",
      "free_heap": 180000,
      "uptime": 3600
    },
    "modbus": {
      "slave_count": 2,
      "profile_count": 5
    }
  }
}
```

---

## GET_VERSION — Firmware & System Info

```json
{ "cmd": "GET_VERSION" }
```

**Response:**
```json
{
  "status": "success",
  "cmd": "GET_VERSION",
  "data": {
    "firmware_version": "2.1.0",
    "free_heap": 180000,
    "flash_size": 4194304,
    "uptime": 3600
  }
}
```

---

## RTC Time Commands

### GET_TIME — Read Current Device Time

```json
{ "cmd": "GET_TIME" }
```

**Response:**
```json
{
  "status": "success",
  "cmd": "GET_TIME",
  "data": {
    "datetime": "2026-02-20 14:30:00",
    "timestamp": 1740054600,
    "rtc_valid": true
  }
}
```

> `rtc_valid: false` means the RTC has not been set since last power loss.

---

### SET_TIME — Set Device RTC Time

```json
{
  "cmd": "SET_TIME",
  "data": {
    "year": 2026,
    "month": 2,
    "day": 20,
    "hour": 14,
    "minute": 30,
    "second": 0
  }
}
```

**Response:**
```json
{ "status": "success", "cmd": "SET_TIME", "message": "Time set" }
```

> The BLE web app syncs time from the phone's clock using this command with timezone offset IST (+05:30) applied automatically.

---

## SET Commands — Write Configuration

### SET network — Change APN

```json
{
  "cmd": "SET",
  "section": "network",
  "data": {
    "apn": "airtelgprs.com",
    "apn_username": "",
    "apn_password": ""
  }
}
```

**Response:**
```json
{
  "status": "success",
  "cmd": "SET",
  "section": "network",
  "message": "Network config saved. Reboot required for APN change to take effect."
}
```

> Saved to `/network.json` on LittleFS. Defaults fall back to compile-time `GSM_APN` if file not present.

---

### SET modbus — Change UART Settings

```json
{
  "cmd": "SET",
  "section": "modbus",
  "data": {
    "uart_config": {
      "baud_rate": 9600,
      "data_bits": 8,
      "parity": "N",
      "stop_bits": 1,
      "timeout_ms": 500
    },
    "retry_count": 3
  }
}
```

**Parity values:** `"N"` = None, `"E"` = Even, `"O"` = Odd

---

### SET motor — Update Motor Config

```json
{
  "cmd": "SET",
  "section": "motor",
  "data": {
    "remote_control_enabled": true,
    "auto_turn_on": false,
    "day_start_hour": 6,
    "level_low_threshold": 10.0,
    "level_high_threshold": 80.0,
    "level_slave_id": 1,
    "level_param_name": "tank_level",
    "relay_pulse_ms": 2000
  }
}
```

> All fields are optional — only included fields are updated.

---

### SET system_settings — Update Poll / Telemetry Intervals

```json
{
  "cmd": "SET",
  "section": "system_settings",
  "data": {
    "modbus_poll_interval_ms": 120000,
    "telemetry_interval_ms": 120000,
    "relay_pulse_ms": 2000
  }
}
```

---

## Motor Control

### SET_MOTOR — Turn Motor On / Off

```json
{
  "cmd": "SET_MOTOR",
  "data": { "state": true }
}
```

`state: true` = Start motor, `state: false` = Stop motor

**Response:**
```json
{
  "status": "success",
  "cmd": "SET_MOTOR",
  "data": {
    "motor_running": true,
    "message": "Motor starting"
  }
}
```

> Requires `remote_control_enabled: true` in motor config, otherwise returns error.

---

## Profile Management

### ADD profile — Create New Device Profile

```json
{
  "cmd": "ADD",
  "section": "profile",
  "data": {
    "profile_id": "EMI_001",
    "device_type": "Energy Meter",
    "make": "Schneider",
    "model": "PM3200",
    "byte_swap": false,
    "word_swap": false,
    "blocks": [
      {
        "block_name": "Measurements",
        "start_address": 3000,
        "registers_count": 10,
        "function_code": 3,
        "parameters": [
          {
            "parameter_name": "voltage",
            "offset_address": 0,
            "data_type": "float32",
            "multiplier": 1.0,
            "unit": "V"
          }
        ]
      }
    ]
  }
}
```

---

### UPDATE profile — Modify Existing Profile

```json
{
  "cmd": "UPDATE",
  "section": "profile",
  "data": { "profile_id": "EMI_001", "..." : "..." }
}
```

---

### DELETE profile — Remove Profile

> Cannot delete a profile that is in use by a slave.

```json
{
  "cmd": "DELETE",
  "section": "profile",
  "data": { "profile_id": "EMI_001" }
}
```

---

## Slave Assignment Management

### ADD slave — Assign Slave ID to Profile

```json
{
  "cmd": "ADD",
  "section": "slave",
  "data": {
    "slave_id": 1,
    "profile_id": "EMI_001",
    "name": "Main Meter",
    "enabled": true
  }
}
```

---

### UPDATE slave — Change Slave Assignment

```json
{
  "cmd": "UPDATE",
  "section": "slave",
  "data": {
    "slave_id": 1,
    "name": "Updated Name",
    "enabled": false
  }
}
```

---

### DELETE slave — Remove Slave Assignment

```json
{
  "cmd": "DELETE",
  "section": "slave",
  "data": { "slave_id": 1 }
}
```

---

## Modbus Read Operations

### TEST_READ — Test Read Single Slave with Profile

```json
{
  "cmd": "TEST_READ",
  "section": "modbus",
  "data": {
    "slave_id": 1,
    "profile_id": "EMI_001"
  }
}
```

Returns raw register values read using the specified profile.

---

### LIVE_READ — Live Read All Configured Slaves

```json
{ "cmd": "LIVE_READ", "section": "modbus" }
```

First sends an `info` response, then after reading all slaves sends `success` with all data.

---



## Log Streaming

### START_LOG_STREAM — Stream Serial Logs over BLE

```json
{ "cmd": "START_LOG_STREAM" }
```

After this command, firmware debug logs are pushed as BLE notifications.

---

### STOP_LOG_STREAM — Stop Log Streaming

```json
{ "cmd": "STOP_LOG_STREAM" }
```

---

### GET_LOG_STATUS — Check Log Stream State

```json
{ "cmd": "GET_LOG_STATUS" }
```

**Response:**
```json
{
  "status": "success",
  "cmd": "GET_LOG_STATUS",
  "data": {
    "streaming": false,
    "buffer_usage": 42
  }
}
```

---

## OTA Firmware Update

### START_OTA_AP — Start Local OTA via WiFi AP

Puts device into SoftAP mode. Connect PC/phone to the created WiFi network and upload firmware via browser.

```json
{
  "cmd": "START_OTA_AP",
  "data": {
    "ssid": "4G_MOTOR_OTA_1234",
    "password": "paramount123",
    "timeout_sec": 300
  }
}
```

> `ssid` and `password` are optional. Default SSID uses last 4 digits of IMEI. Password must be ≥ 8 characters.

**Response:**
```json
{
  "status": "success",
  "cmd": "START_OTA_AP",
  "data": {
    "ssid": "4G_MOTOR_OTA_1234",
    "ip": "192.168.4.1",
    "url": "http://192.168.4.1/",
    "timeout_sec": 300
  }
}
```

---

### OTA_UPDATE — Cloud OTA via 4G Modem

Downloads and flashes firmware from a URL over the 4G connection.

```json
{
  "cmd": "OTA_UPDATE",
  "data": {
    "url": "http://your-server.com/firmware.bin",
    "md5": "abc123..."
  }
}
```

> Requires active 4G connection. `md5` is optional but recommended for integrity check.

---

### STOP_OTA — Cancel OTA Update

```json
{ "cmd": "STOP_OTA" }
```

---

### ROLLBACK — Revert to Previous Firmware

```json
{ "cmd": "ROLLBACK" }
```

Reverts to the previously flashed firmware partition. Fails if no previous firmware exists.

---

## System Commands

### REBOOT — Restart Device

```json
{ "cmd": "REBOOT" }
```

Device restarts after 2 seconds.

---

### RESET — Factory Reset

```json
{ "cmd": "RESET" }
```

> **Warning:** Clears all profiles, slave assignments, motor config, system settings, and APN config from LittleFS. Device reboots after reset.

---

## MQTT — ThingsBoard Integration

The device connects to a ThingsBoard MQTT server. All BLE commands above are also available via MQTT RPC. The device additionally **publishes** data automatically.

**Server:** `dashboard.bridgethings.com:1883`
**Authentication:** Device Access Token (configured in `config.h`)

### MQTT Topics

| Direction | Topic | Purpose |
|-----------|-------|---------|
| Publish | `v1/devices/me/telemetry` | Periodic sensor data (every `telemetry_interval_ms`) |
| Publish | `v1/devices/me/attributes` | Device attributes (firmware version, uptime, etc.) |
| Subscribe | `v1/devices/me/rpc/request/+` | Receive RPC commands from ThingsBoard dashboard |
| Publish | `v1/devices/me/rpc/response/{id}` | Send RPC command responses |
| Subscribe | `v1/devices/me/attributes/response/+` | Receive requested shared attributes |

---

### Telemetry Payload (auto-published)

Published every `telemetry_interval_ms` (default 120 seconds):

```json
{
  "motor_running": false,
  "signal": 18,
  "connected": true,
  "slave1_voltage": 231.5,
  "slave1_current": 4.2,
  "current_level": 45.5
}
```

---

### MQTT RPC — Send Command from ThingsBoard

From the ThingsBoard dashboard, send an RPC to the device in this format:

```json
{
  "method": "SET_MOTOR",
  "params": {
    "cmd": "SET_MOTOR",
    "data": { "state": true }
  }
}
```

The device responds on `v1/devices/me/rpc/response/{id}` with the same JSON response format as BLE.

> All BLE commands (GET, SET, SET_MOTOR, REBOOT, etc.) work identically over MQTT RPC.

---

## Quick Reference Table

| Command | Section | Description |
|---------|---------|-------------|
| `GET` | `network` | Read modem status and APN |
| `GET` | `modbus` | Read Modbus UART settings |
| `GET` | `motor` | Read motor configuration |
| `GET` | `system_settings` | Read poll/telemetry intervals |
| `GET` | `profiles` | List all device profiles |
| `GET` | `profile` | Get single profile detail |
| `GET` | `slaves` | List slave assignments |
| `GET_STATUS` | — | Full device status snapshot |
| `GET_VERSION` | — | Firmware version and heap info |
| `GET_TIME` | — | Read RTC date/time |
| `SET_TIME` | — | Set RTC date/time |
| `SET` | `network` | Save APN (reboot required) |
| `SET` | `modbus` | Save Modbus UART config |
| `SET` | `motor` | Save motor config |
| `SET` | `system_settings` | Save intervals |
| `SET_MOTOR` | — | Start / stop motor |
| `ADD` | `profile` | Create new device profile |
| `ADD` | `slave` | Assign slave to profile |
| `UPDATE` | `profile` | Modify existing profile |
| `UPDATE` | `slave` | Modify slave assignment |
| `DELETE` | `profile` | Remove profile (not if in use) |
| `DELETE` | `slave` | Remove slave assignment |
| `TEST_READ` | `modbus` | One-off read of a slave/profile |
| `LIVE_READ` | `modbus` | Live read all configured slaves |
| `GET_VOLUME_LOG` | `system` | Download monthly volume CSV |
| `START_LOG_STREAM` | — | Stream debug logs over BLE |
| `STOP_LOG_STREAM` | — | Stop log streaming |
| `GET_LOG_STATUS` | — | Check log stream state |
| `START_OTA_AP` | — | Start local WiFi OTA AP |
| `OTA_UPDATE` | — | Cloud OTA via 4G |
| `STOP_OTA` | — | Cancel OTA update |
| `ROLLBACK` | — | Revert to previous firmware |
| `REBOOT` | — | Restart device |
| `RESET` | — | Factory reset + reboot |