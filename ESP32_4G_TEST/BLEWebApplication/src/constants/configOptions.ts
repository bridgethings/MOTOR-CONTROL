// Configuration dropdown options and constants

import type {
  DataBits,
  DataType,
  FunctionCode,
  ParityType,
  StopBits,
} from '@/types/modbus.types';
import type {
  IPVersion,
  ModemNetworkMode,
  NetworkMode,
  NetworkType,
} from '@/types/network.types';
import type { LogLevel, QoS } from '@/types/advanced.types';

// Network options
export const NETWORK_TYPES: NetworkType[] = ['ethernet', 'wifi', 'modem'];

export const NETWORK_MODES: { value: NetworkMode; label: string }[] = [
  { value: 'dhcp', label: 'DHCP (Automatic)' },
  { value: 'static', label: 'Static IP' },
];

export const MODEM_NETWORK_MODES: { value: ModemNetworkMode; label: string }[] = [
  { value: 'auto', label: 'Auto (Automatic)' },
  { value: '2g', label: '2G' },
  { value: '3g', label: '3G' },
  { value: '4g', label: '4G / LTE' },
];

export const IP_VERSIONS: { value: IPVersion; label: string }[] = [
  { value: 'ipv4', label: 'IPv4' },
  { value: 'ipv6', label: 'IPv6' },
  { value: 'ipv4v6', label: 'IPv4 + IPv6' },
];

// Modbus options
export const BAUD_RATES: number[] = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

export const DATA_BITS_OPTIONS: { value: DataBits; label: string }[] = [
  { value: 7, label: '7 bits' },
  { value: 8, label: '8 bits' },
];

export const PARITY_OPTIONS: { value: ParityType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'even', label: 'Even' },
  { value: 'odd', label: 'Odd' },
];

export const STOP_BITS_OPTIONS: { value: StopBits; label: string }[] = [
  { value: 1, label: '1 bit' },
  { value: 2, label: '2 bits' },
];

export const FUNCTION_CODES: { value: FunctionCode; label: string }[] = [
  { value: 1, label: '1 - Read Coils' },
  { value: 2, label: '2 - Read Discrete Inputs' },
  { value: 3, label: '3 - Read Holding Registers' },
  { value: 4, label: '4 - Read Input Registers' },
];

export const DATA_TYPES: { value: DataType; label: string; registers: number }[] = [
  { value: 'bool', label: 'Boolean / Coil', registers: 1 },
  { value: 'int16', label: 'Int16 (signed 16-bit)', registers: 1 },
  { value: 'uint16', label: 'UInt16 (unsigned 16-bit)', registers: 1 },
  { value: 'int32', label: 'Int32 (signed 32-bit)', registers: 2 },
  { value: 'uint32', label: 'UInt32 (unsigned 32-bit)', registers: 2 },
  { value: 'float32', label: 'Float32 (32-bit float)', registers: 2 },
  { value: 'int64', label: 'Int64 (signed 64-bit)', registers: 4 },
  { value: 'uint64', label: 'UInt64 (unsigned 64-bit)', registers: 4 },
  { value: 'float64', label: 'Float64 (64-bit double)', registers: 4 },
  { value: 'string', label: 'String (ASCII)', registers: 1 },
];

// Advanced configuration options
export const LOG_LEVELS: { value: LogLevel; label: string; description: string }[] = [
  { value: 'debug', label: 'Debug', description: 'Detailed debug information' },
  { value: 'info', label: 'Info', description: 'Informational messages' },
  { value: 'warn', label: 'Warning', description: 'Warning messages only' },
  { value: 'error', label: 'Error', description: 'Error messages only' },
];

export const QOS_LEVELS: { value: QoS; label: string; description: string }[] = [
  { value: 0, label: '0 - At most once', description: 'Fire and forget, no acknowledgment' },
  { value: 1, label: '1 - At least once', description: 'Message delivered at least once' },
  { value: 2, label: '2 - Exactly once', description: 'Message delivered exactly once' },
];

// Validation limits
export const VALIDATION_LIMITS = {
  // Network
  SSID_MIN_LENGTH: 1,
  SSID_MAX_LENGTH: 32,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 64,
  PORT_MIN: 1,
  PORT_MAX: 65535,

  // Modbus
  SLAVE_ID_MIN: 1,
  SLAVE_ID_MAX: 247,
  REGISTER_ADDRESS_MIN: 0,
  REGISTER_ADDRESS_MAX: 65535,
  REGISTER_LENGTH_MIN: 1,
  REGISTER_LENGTH_MAX: 125,
  MAX_SLAVES: 20,
  MAX_REGISTERS_PER_SLAVE: 20,
  TIMEOUT_MIN: 100,
  TIMEOUT_MAX: 5000,

  RETRY_COUNT_MIN: 1,
  RETRY_COUNT_MAX: 10,

  // Advanced
  TELEMETRY_ID_MIN_LENGTH: 1,
  TELEMETRY_ID_MAX_LENGTH: 32,
  DATA_INTERVAL_MIN: 1,
  DATA_INTERVAL_MAX: 1440,
  MAX_OFFLINE_DAYS_MIN: 1,
  MAX_OFFLINE_DAYS_MAX: 365,
  MAX_OFFLINE_STORAGE_PERCENT_MIN: 10,
  MAX_OFFLINE_STORAGE_PERCENT_MAX: 90,
  DEBOUNCE_MIN: 10,
  DEBOUNCE_MAX: 1000,
  WATCHDOG_TIMEOUT_MIN: 60,
  WATCHDOG_TIMEOUT_MAX: 3600,
  KEEPALIVE_MIN: 15,
  KEEPALIVE_MAX: 300,
  MAX_LOG_SIZE_MIN: 10,
  MAX_LOG_SIZE_MAX: 1000,

  // Batch processing
  BATCH_SIZE_MIN: 1,
  BATCH_SIZE_MAX: 1000,

  // Offline storage
  MAX_OFFLINE_RECORDS_MIN: 100,
  MAX_OFFLINE_RECORDS_MAX: 100000,
} as const;

// Default values
export const DEFAULT_VALUES = {
  // Network
  ETHERNET: {
    enabled: true,
    mode: 'dhcp' as NetworkMode,
  },
  WIFI: {
    enabled: false,
    ssid: '',
    password: '',
    mode: 'dhcp' as NetworkMode,
  },
  MODEM: {
    enabled: false,
    apn: 'internet',
    username: '',
    password: '',
    network_mode: 'auto' as ModemNetworkMode,
    ip_version: 'ipv4' as IPVersion,
  },

  // Modbus
  UART: {
    baud_rate: 9600,
    data_bits: 8 as DataBits,
    parity: 'none' as ParityType,
    stop_bits: 1 as StopBits,
    timeout_ms: 1000,
  },
  MODBUS: {
    retry_count: 3,
  },

  // Advanced
  DEVICE_INFO: {
    telemetry_id: 'GATEWAY_001',
    location: '',
    description: '',
  },
  DATA_COLLECTION: {
    interval_minutes: 1,
    store_on_failure: true,
    max_offline_days: 30,
    max_offline_storage_percent: 70,
  },
  MQTT: {
    enabled: false,
    broker_url: '',
    port: 1883,
    client_id: '',
    username: '',
    password: '',
    use_tls: false,
    qos: 1 as QoS,
    retain: false,
    keepalive_sec: 60,
    topics: {
      telemetry: 'v1/devices/me/telemetry',
      status: 'v1/devices/me/status',
      command: 'v1/devices/me/command',
    },
  },
  RTC: {
    ntp_enabled: true,
    ntp_server: 'pool.ntp.org',
    timezone_offset: '+05:30',
  },
  WATCHDOG: {
    enabled: true,
    timeout_sec: 300,
    reset_on_timeout: true,
  },
  LOGGING: {
    level: 'info' as LogLevel,
    sd_logging: true,
    max_log_size_mb: 100,
  },
} as const;

// Common timezones for convenience
export const COMMON_TIMEZONES = [
  { value: '+00:00', label: 'UTC (GMT+0)' },
  { value: '+01:00', label: 'CET (GMT+1)' },
  { value: '+02:00', label: 'EET (GMT+2)' },
  { value: '+05:30', label: 'IST (GMT+5:30)' },
  { value: '+08:00', label: 'CST (GMT+8)' },
  { value: '-05:00', label: 'EST (GMT-5)' },
  { value: '-08:00', label: 'PST (GMT-8)' },
];
