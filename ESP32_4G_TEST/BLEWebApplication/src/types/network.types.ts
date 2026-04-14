// Network configuration types

export type NetworkType = 'ethernet' | 'wifi' | 'modem';
export type NetworkMode = 'dhcp' | 'static';
export type ModemNetworkMode = '2g' | '3g' | '4g' | 'auto';
export type IPVersion = 'ipv4' | 'ipv6' | 'ipv4v6';

export interface StaticIPConfig {
  ip: string;
  subnet: string;
  gateway: string;
  dns1?: string;
  dns2?: string;
}

export interface EthernetConfig {
  enabled: boolean;
  mode: NetworkMode;
  static_config?: StaticIPConfig;
}

export interface WiFiConfig {
  enabled: boolean;
  ssid: string;
  password: string;
  mode: NetworkMode;
  static_config?: StaticIPConfig;
}

export interface ModemConfig {
  enabled: boolean;
  apn: string;
  username?: string;
  password?: string;
  network_mode: ModemNetworkMode;
  ip_version: IPVersion;
}

export interface NetworkConfig {
  priority: NetworkType[];
  failover_enabled: boolean;
  ethernet: EthernetConfig;
  wifi: WiFiConfig;
  modem: ModemConfig;
}

export interface ModemStatus {
  initialized: boolean;
  connected: boolean;
  connecting: boolean;
  imei?: string;
  operator?: string;
  signal_quality?: number;
  signal_description?: string;
  gprs_connected?: boolean;
  network_registered?: boolean;
  ip_address?: string;
  configured_apn?: string;
  modem_enabled?: boolean;
}
