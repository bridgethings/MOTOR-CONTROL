// Configuration API service — transport-agnostic (works with BLE or WebSocket)

import type {
  ModbusConfig,
  DeviceProfile,
  ProfileSummary,
  SlaveAssignment,
  TestReadResult,
} from '@/types/modbus.types';
import type { MotorConfig, MotorStatus } from '@/types/motor.types';
import type { ConfigCommand, ConfigResponse } from '@/types/responses.types';
import type { ITransport } from './transport';

export class ConfigurationAPI {
  private transport: ITransport;

  constructor(transport: ITransport) {
    this.transport = transport;
  }

  async sendCommand(command: ConfigCommand, timeout: number = 30000): Promise<ConfigResponse> {
    return this.transport.sendCommand(command, timeout);
  }

  // ============================================================
  // MOTOR CONFIGURATION
  // ============================================================

  async getMotorConfig(): Promise<MotorConfig> {
    const response = await this.sendCommand({
      cmd: 'GET',
      section: 'motor',
      data: {},
    });
    return response.data as MotorConfig;
  }

  async setMotorConfig(data: Partial<MotorConfig>): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'SET',
      section: 'motor',
      data,
    });
  }

  async setMotorState(state: boolean): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'SET_MOTOR',
      section: 'motor',
      data: { state },
    });
  }

  // ============================================================
  // NETWORK STATUS & CONFIG (4G modem)
  // ============================================================

  async getNetworkStatus(): Promise<any> {
    const response = await this.sendCommand({
      cmd: 'GET',
      section: 'network',
      data: {},
    });
    return response.data;
  }

  async setNetworkConfig(data: { apn?: string; apn_username?: string; apn_password?: string }): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'SET',
      section: 'network',
      data,
    });
  }

  // ============================================================
  // MODBUS UART CONFIGURATION
  // ============================================================

  async getModbusConfig(): Promise<ModbusConfig> {
    const response = await this.sendCommand({
      cmd: 'GET',
      section: 'modbus',
      data: {},
    });
    return response.data as ModbusConfig;
  }

  async setModbusUART(uart: Partial<ModbusConfig['uart_config']>): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'SET',
      section: 'modbus',
      data: { uart_config: uart },
    });
  }

  async pauseModbusRead(paused: boolean): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'SET_MODBUS_PAUSE',
      section: 'modbus',
      data: { paused },
    });
  }

  // ============================================================
  // DEVICE PROFILE MANAGEMENT
  // ============================================================

  async getProfiles(): Promise<ProfileSummary[]> {
    const response = await this.sendCommand({
      cmd: 'GET',
      section: 'profiles',
      data: {},
    });
    return (response.data || []) as ProfileSummary[];
  }

  async getProfile(profileId: string): Promise<DeviceProfile> {
    const response = await this.sendCommand({
      cmd: 'GET',
      section: 'profile',
      data: { profile_id: profileId },
    });
    return response.data as DeviceProfile;
  }

  async addProfile(profile: DeviceProfile): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'ADD',
      section: 'profile',
      data: profile,
    });
  }

  async updateProfile(profileId: string, data: Partial<DeviceProfile>): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'UPDATE',
      section: 'profile',
      data: { profile_id: profileId, ...data },
    });
  }

  async deleteProfile(profileId: string): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'DELETE',
      section: 'profile',
      data: { profile_id: profileId },
    });
  }

  // ============================================================
  // SLAVE ASSIGNMENT MANAGEMENT
  // ============================================================

  async getSlaves(): Promise<SlaveAssignment[]> {
    const response = await this.sendCommand({
      cmd: 'GET',
      section: 'slaves',
      data: {},
    });
    return (response.data || []) as SlaveAssignment[];
  }

  async addSlave(assignment: SlaveAssignment): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'ADD',
      section: 'slave',
      data: assignment,
    });
  }

  async updateSlave(slaveId: number, data: Partial<SlaveAssignment>): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'UPDATE',
      section: 'slave',
      data: { slave_id: slaveId, ...data },
    });
  }

  async deleteSlave(slaveId: number): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'DELETE',
      section: 'slave',
      data: { slave_id: slaveId },
    });
  }

  // ============================================================
  // TEST READ
  // ============================================================

  async testRead(slaveId: number, profileId: string, baudRate?: number): Promise<TestReadResult> {
    const data: Record<string, unknown> = { slave_id: slaveId, profile_id: profileId };
    if (baudRate) data.baud_rate = baudRate;
    const response = await this.sendCommand(
      { cmd: 'TEST_READ', section: 'modbus', data },
      30000
    );
    return response.data as TestReadResult;
  }

  // ============================================================
  // SYSTEM COMMANDS
  // ============================================================

  async reboot(): Promise<ConfigResponse> {
    // Use a very short timeout — the device reboots immediately and will never send a response.
    // The BLE disconnect is expected and should not be treated as an error.
    return await this.sendCommand({
      cmd: 'REBOOT',
      section: 'system',
      data: {},
    }, 3000);
  }

  async factoryReset(confirm: boolean = true): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'RESET',
      section: 'all',
      data: { confirm },
    });
  }

  // ============================================================
  // TIME/RTC COMMANDS
  // ============================================================

  async getDeviceTime(): Promise<DeviceTimeResponse> {
    const response = await this.sendCommand({
      cmd: 'GET_TIME',
      section: 'system',
      data: {},
    });
    // Firmware returns: { status, cmd, data: { datetime, timestamp, rtc_valid } }
    const d = response.data || {};
    const datetimeStr: string = d.datetime || '';
    // datetime format: "2026-02-17 14:30:00"
    const [datePart, timePart] = datetimeStr.split(' ');
    return {
      status: response.status,
      cmd: response.cmd || 'GET_TIME',
      datetime: datetimeStr,
      date: datePart || '',
      time: timePart || '',
      timestamp: d.timestamp,
      timezone_offset: d.timezone_offset || 'N/A',
      time_valid: d.rtc_valid ?? false,
      message: response.message,
    };
  }

  async syncDeviceTimeFromPhone(timezone_offset?: string): Promise<ConfigResponse> {
    const now = new Date();
    return await this.sendCommand({
      cmd: 'SET_TIME',
      section: 'system',
      data: {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds(),
        timezone_offset: timezone_offset || '+05:30',
      },
    });
  }

  // ============================================================
  // STATUS DASHBOARD COMMANDS
  // ============================================================

  async getDeviceStatus(): Promise<ConfigResponse> {
    // Use a longer timeout: response is large (includes modbus data) and device may be
    // busy with Modbus polling when the request arrives.
    return await this.sendCommand({
      cmd: 'GET_STATUS',
      section: 'status',
      data: {},
    }, 20000);
  }

  async liveReadModbus(): Promise<ConfigResponse> {
    return await this.sendCommand(
      { cmd: 'LIVE_READ', section: 'modbus', data: {} },
      30000
    );
  }

  async getSystemSettings(): Promise<any> {
    const response = await this.sendCommand({
      cmd: 'GET',
      section: 'system_settings',
      data: {},
    });
    return response.data;
  }

  // ============================================================
  // OTA COMMANDS
  // ============================================================

  async getVersion(): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'GET_VERSION',
      section: 'system',
      data: {},
    });
  }

  async startOTA(ssid: string, password: string): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'START_OTA_AP',
      section: 'system',
      data: { ssid, password },
    });
  }

  async stopOTA(): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'STOP_OTA',
      section: 'system',
      data: {},
    });
  }

  async rollback(): Promise<ConfigResponse> {
    return await this.sendCommand({
      cmd: 'ROLLBACK',
      section: 'system',
      data: {},
    });
  }
}

export interface DeviceTimeResponse {
  status: string;
  cmd: string;
  date?: string;
  time?: string;
  datetime?: string;
  timezone_offset?: string;
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  day_of_week?: number;
  rtc_initialized?: boolean;
  time_valid?: boolean;
  timestamp?: number;
  message?: string;
}
