// Response types for Configuration API

export interface ConfigResponse {
  status: 'success' | 'error';
  cmd: string;
  section: string;
  message?: string;
  error_code?: number;
  timestamp?: string;
  data?: any;
}

export interface ConfigCommand {
  cmd:
    | 'GET'
    | 'SET'
    | 'ADD'
    | 'UPDATE'
    | 'DELETE'
    | 'SET_MOTOR'
    | 'REBOOT'
    | 'RESET'
    | 'GET_VERSION'
    | 'START_OTA_AP'
    | 'OTA_UPDATE'
    | 'STOP_OTA'
    | 'ROLLBACK'
    | 'TEST_READ'
    | 'GET_TIME'
    | 'SET_TIME'
    | 'SET_MODBUS_PAUSE'
    | 'GET_STATUS'
    | 'LIVE_READ'
    | 'START_LOG_STREAM'
    | 'STOP_LOG_STREAM'
    | 'GET_LOG_STATUS'
    | 'GET_VOLUME_LOG';
  section:
    | 'motor'
    | 'modbus'
    | 'network'
    | 'system'
    | 'all'
    | 'status'
    | 'profile'
    | 'profiles'
    | 'slave'
    | 'slaves'
    | 'system_settings';
  data?: any;
}

export enum ErrorCode {
  INVALID_JSON = 1000,
  INVALID_PARAMETER = 1001,
  MISSING_FIELD = 1002,
  SECTION_NOT_FOUND = 1003,
  SLAVE_NOT_FOUND = 1004,
  PROFILE_NOT_FOUND = 1005,
  MAX_SLAVES_EXCEEDED = 1006,
  MAX_PROFILES_EXCEEDED = 1007,
  DUPLICATE_SLAVE_ID = 1008,
  DUPLICATE_PROFILE_ID = 1009,
  CONFIG_SAVE_FAILED = 1010,
  COMMAND_NOT_SUPPORTED = 1011,
  PROFILE_IN_USE = 1012,
  NETWORK_CONFIG_ERROR = 2000,
  MODBUS_CONFIG_ERROR = 3000,
  MOTOR_CONFIG_ERROR = 5000,
}
