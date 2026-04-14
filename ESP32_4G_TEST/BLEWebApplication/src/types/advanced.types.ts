// Advanced configuration types for 4G Motor Controller

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type QoS = 0 | 1 | 2;

export interface DeviceInfo {
  telemetry_id: string;
  location?: string;
  description?: string;
}

export interface MQTTTopics {
  telemetry: string;
  status: string;
  command: string;
}

export interface MQTTConfig {
  enabled: boolean;
  broker_url: string;
  port: number;
  client_id?: string;
  username?: string;
  password?: string;
  use_tls?: boolean;
  qos?: QoS;
  retain?: boolean;
  keepalive_sec?: number;
  topics: MQTTTopics;
}

export interface RTCConfig {
  ntp_enabled: boolean;
  ntp_server: string;
  timezone_offset: string;
}

export interface WatchdogConfig {
  enabled: boolean;
  timeout_sec: number;
  reset_on_timeout: boolean;
}

export interface LoggingConfig {
  level: LogLevel;
}

export interface AdvancedConfig {
  device_info: DeviceInfo;
  mqtt: MQTTConfig;
  rtc: RTCConfig;
  watchdog: WatchdogConfig;
  logging: LoggingConfig;
}
