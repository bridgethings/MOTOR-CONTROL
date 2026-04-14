// Validation functions for configuration forms

import { VALIDATION_LIMITS } from '@/constants/configOptions';

/**
 * Validate IPv4 address
 */
export const validateIPAddress = (ip: string): boolean => {
  if (!ip) return false;

  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255 && part === num.toString();
  });
};

/**
 * Validate subnet mask
 */
export const validateSubnetMask = (mask: string): boolean => {
  if (!validateIPAddress(mask)) return false;

  // Convert to binary and check if it's a valid subnet mask
  const parts = mask.split('.').map((p) => parseInt(p, 10));
  const binary = parts.map((p) => p.toString(2).padStart(8, '0')).join('');

  // Valid subnet mask should have continuous 1s followed by continuous 0s
  const match = binary.match(/^(1+)(0+)$/);
  return match !== null;
};

/**
 * Validate port number
 */
export const validatePort = (port: number): boolean => {
  return port >= VALIDATION_LIMITS.PORT_MIN && port <= VALIDATION_LIMITS.PORT_MAX;
};

/**
 * Validate WiFi SSID
 */
export const validateSSID = (ssid: string): boolean => {
  const length = ssid.length;
  return length >= VALIDATION_LIMITS.SSID_MIN_LENGTH && length <= VALIDATION_LIMITS.SSID_MAX_LENGTH;
};

/**
 * Validate WiFi password
 */
export const validateWiFiPassword = (password: string): boolean => {
  if (!password) return true; // Allow empty for open networks
  const length = password.length;
  return (
    length >= VALIDATION_LIMITS.PASSWORD_MIN_LENGTH &&
    length <= VALIDATION_LIMITS.PASSWORD_MAX_LENGTH
  );
};

/**
 * Validate MAC address
 */
export const validateMACAddress = (mac: string): boolean => {
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macRegex.test(mac);
};

/**
 * Validate Modbus slave ID
 */
export const validateSlaveId = (id: number): boolean => {
  return id >= VALIDATION_LIMITS.SLAVE_ID_MIN && id <= VALIDATION_LIMITS.SLAVE_ID_MAX;
};

/**
 * Validate Modbus register address
 */
export const validateModbusAddress = (address: number): boolean => {
  return (
    address >= VALIDATION_LIMITS.REGISTER_ADDRESS_MIN &&
    address <= VALIDATION_LIMITS.REGISTER_ADDRESS_MAX
  );
};

/**
 * Validate Modbus register length
 */
export const validateRegisterLength = (length: number): boolean => {
  return (
    length >= VALIDATION_LIMITS.REGISTER_LENGTH_MIN &&
    length <= VALIDATION_LIMITS.REGISTER_LENGTH_MAX
  );
};

/**
 * Validate timeout value (milliseconds)
 */
export const validateTimeout = (timeout: number): boolean => {
  return (
    timeout >= VALIDATION_LIMITS.TIMEOUT_MIN && timeout <= VALIDATION_LIMITS.TIMEOUT_MAX
  );
};



/**
 * Validate retry count
 */
export const validateRetryCount = (count: number): boolean => {
  return (
    count >= VALIDATION_LIMITS.RETRY_COUNT_MIN && count <= VALIDATION_LIMITS.RETRY_COUNT_MAX
  );
};

/**
 * Validate telemetry ID (alphanumeric + underscore)
 */
export const validateTelemetryId = (id: string): boolean => {
  if (!id) return false;

  const length = id.length;
  if (
    length < VALIDATION_LIMITS.TELEMETRY_ID_MIN_LENGTH ||
    length > VALIDATION_LIMITS.TELEMETRY_ID_MAX_LENGTH
  ) {
    return false;
  }

  // Only allow alphanumeric and underscore
  const regex = /^[a-zA-Z0-9_]+$/;
  return regex.test(id);
};

/**
 * Validate data collection interval (minutes)
 */
export const validateInterval = (minutes: number): boolean => {
  return (
    minutes >= VALIDATION_LIMITS.DATA_INTERVAL_MIN &&
    minutes <= VALIDATION_LIMITS.DATA_INTERVAL_MAX
  );
};

/**
 * Validate batch size
 */
export const validateBatchSize = (size: number): boolean => {
  return (
    size >= VALIDATION_LIMITS.BATCH_SIZE_MIN && size <= VALIDATION_LIMITS.BATCH_SIZE_MAX
  );
};

/**
 * Validate max offline records
 */
export const validateMaxOfflineRecords = (records: number): boolean => {
  return (
    records >= VALIDATION_LIMITS.MAX_OFFLINE_RECORDS_MIN &&
    records <= VALIDATION_LIMITS.MAX_OFFLINE_RECORDS_MAX
  );
};

/**
 * Validate debounce time (milliseconds)
 */
export const validateDebounce = (ms: number): boolean => {
  return ms >= VALIDATION_LIMITS.DEBOUNCE_MIN && ms <= VALIDATION_LIMITS.DEBOUNCE_MAX;
};

/**
 * Validate watchdog timeout (seconds)
 */
export const validateWatchdogTimeout = (seconds: number): boolean => {
  return (
    seconds >= VALIDATION_LIMITS.WATCHDOG_TIMEOUT_MIN &&
    seconds <= VALIDATION_LIMITS.WATCHDOG_TIMEOUT_MAX
  );
};

/**
 * Validate MQTT keepalive (seconds)
 */
export const validateKeepalive = (seconds: number): boolean => {
  return (
    seconds >= VALIDATION_LIMITS.KEEPALIVE_MIN && seconds <= VALIDATION_LIMITS.KEEPALIVE_MAX
  );
};

/**
 * Validate max log size (megabytes)
 */
export const validateMaxLogSize = (mb: number): boolean => {
  return mb >= VALIDATION_LIMITS.MAX_LOG_SIZE_MIN && mb <= VALIDATION_LIMITS.MAX_LOG_SIZE_MAX;
};

/**
 * Validate URL format
 */
export const validateURL = (url: string): boolean => {
  if (!url) return false;

  try {
    // Allow both http/https and mqtt/mqtts protocols
    const protocols = ['http:', 'https:', 'mqtt:', 'mqtts:', 'ws:', 'wss:'];
    const urlObj = new URL(url.includes('://') ? url : `mqtt://${url}`);
    return protocols.includes(urlObj.protocol) || !url.includes('://'); // Allow hostname only
  } catch {
    // If URL parsing fails, check if it's a valid hostname
    const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9-._]*[a-zA-Z0-9]$/;
    return hostnameRegex.test(url);
  }
};

/**
 * Validate timezone offset format (+HH:MM or -HH:MM)
 */
export const validateTimezoneOffset = (offset: string): boolean => {
  const regex = /^[+-]\d{2}:\d{2}$/;
  if (!regex.test(offset)) return false;

  const [sign, hours, minutes] = offset.match(/([+-])(\d{2}):(\d{2})/)!.slice(1);
  const h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);

  return h >= 0 && h <= 14 && m >= 0 && m < 60;
};

/**
 * Validate register ID format (alphanumeric + underscore, no spaces)
 */
export const validateRegisterId = (id: string): boolean => {
  if (!id) return false;
  const regex = /^[a-zA-Z0-9_]+$/;
  return regex.test(id) && id.length >= 1 && id.length <= 32;
};

/**
 * Validate hostname or IP address
 */
export const validateHostnameOrIP = (host: string): boolean => {
  // Check if it's a valid IP address
  if (validateIPAddress(host)) return true;

  // Check if it's a valid hostname
  const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9-._]*[a-zA-Z0-9]$/;
  return hostnameRegex.test(host) && host.length <= 253;
};

/**
 * Get validation error message for IP address
 */
export const getIPValidationError = (ip: string): string | null => {
  if (!ip) return 'IP address is required';
  if (!validateIPAddress(ip)) return 'Invalid IP address format (e.g., 192.168.1.100)';
  return null;
};

/**
 * Get validation error message for port
 */
export const getPortValidationError = (port: number): string | null => {
  if (!port) return 'Port is required';
  if (!validatePort(port))
    return `Port must be between ${VALIDATION_LIMITS.PORT_MIN} and ${VALIDATION_LIMITS.PORT_MAX}`;
  return null;
};

/**
 * Get validation error message for SSID
 */
export const getSSIDValidationError = (ssid: string): string | null => {
  if (!ssid) return 'SSID is required';
  if (!validateSSID(ssid))
    return `SSID must be between ${VALIDATION_LIMITS.SSID_MIN_LENGTH} and ${VALIDATION_LIMITS.SSID_MAX_LENGTH} characters`;
  return null;
};

/**
 * Get validation error message for slave ID
 */
export const getSlaveIdValidationError = (id: number): string | null => {
  if (!id) return 'Slave ID is required';
  if (!validateSlaveId(id))
    return `Slave ID must be between ${VALIDATION_LIMITS.SLAVE_ID_MIN} and ${VALIDATION_LIMITS.SLAVE_ID_MAX}`;
  return null;
};

/**
 * Get validation error message for register address
 */
export const getRegisterAddressValidationError = (address: number): string | null => {
  if (address === undefined || address === null) return 'Register address is required';
  if (!validateModbusAddress(address))
    return `Register address must be between ${VALIDATION_LIMITS.REGISTER_ADDRESS_MIN} and ${VALIDATION_LIMITS.REGISTER_ADDRESS_MAX}`;
  return null;
};

/**
 * Get validation error message for telemetry ID
 */
export const getTelemetryIdValidationError = (id: string): string | null => {
  if (!id) return 'Telemetry ID is required';
  if (!validateTelemetryId(id))
    return `Telemetry ID must be ${VALIDATION_LIMITS.TELEMETRY_ID_MIN_LENGTH}-${VALIDATION_LIMITS.TELEMETRY_ID_MAX_LENGTH} alphanumeric characters or underscore`;
  return null;
};
