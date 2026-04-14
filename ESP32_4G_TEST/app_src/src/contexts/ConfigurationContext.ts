import { createContext } from 'react';
import type {
  ModbusConfig,
  DeviceProfile,
  ProfileSummary,
  SlaveAssignment,
  TestReadResult,
} from '@/types/modbus.types';
import type { ConfigurationAPI } from '@/services/configApi';
import type { MotorConfig } from '@/types/motor.types';
import type { ConfigResponse } from '@/types/responses.types';

export interface ConfigurationContextType {
  // Raw API access (for pages that need direct commands)
  api: ConfigurationAPI | null;

  // State
  modbusConfig: ModbusConfig | null;
  motorConfig: MotorConfig | null;
  profiles: ProfileSummary[];
  slaves: SlaveAssignment[];
  isLoading: boolean;
  error: string | null;

  // Modbus UART actions
  loadModbusConfig: () => Promise<void>;
  saveModbusUART: (data: Partial<ModbusConfig>) => Promise<void>;

  // Automation actions
  loadMotorConfig: () => Promise<MotorConfig>;
  updateMotorConfig: (data: Partial<MotorConfig>) => Promise<ConfigResponse>;

  // Profile CRUD
  loadProfiles: () => Promise<void>;
  getProfile: (profileId: string) => Promise<DeviceProfile>;
  addProfile: (profile: DeviceProfile) => Promise<void>;
  updateProfile: (profileId: string, data: Partial<DeviceProfile>) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;

  // Slave assignment CRUD
  loadSlaves: () => Promise<void>;
  addSlave: (assignment: SlaveAssignment) => Promise<void>;
  updateSlave: (slaveId: number, data: Partial<SlaveAssignment>) => Promise<void>;
  deleteSlave: (slaveId: number) => Promise<void>;

  // Test read
  testRead: (slaveId: number, profileId: string, baudRate?: number) => Promise<TestReadResult>;

  // Modbus polling control
  pauseModbusRead: (paused: boolean) => Promise<void>;

  // Profile import/export
  exportProfile: (profile: DeviceProfile) => void;
  importProfile: (profile: DeviceProfile) => Promise<void>;

  // Status dashboard
  getDeviceStatus: () => Promise<any>;
  liveReadModbus: () => Promise<any>;

  // Network config
  getNetworkStatus: () => Promise<any>;
  setNetworkConfig: (data: { apn?: string; apn_username?: string; apn_password?: string }) => Promise<any>;

  // Utility actions
  refresh: () => Promise<void>;
  clearError: () => void;
  reboot: () => Promise<void>;
  factoryReset: () => Promise<void>;
}

const ConfigurationContext = createContext<ConfigurationContextType | undefined>(undefined);

export default ConfigurationContext;
