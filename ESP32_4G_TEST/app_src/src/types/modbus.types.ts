// Modbus configuration types — Device Profile Architecture
// Hierarchy: Profile → Blocks → Parameters
// Slaves reference a profile_id (no duplicated config data)

// ============================================================
// FIRMWARE LIMITS — Must match ModbusConfig.h
// ============================================================
export const MAX_PROFILES = 10;
export const MAX_SLAVES = 20;
export const MAX_BLOCKS_PER_PROFILE = 4;
export const MAX_PARAMS_PER_BLOCK = 10;
export const MAX_BLOCK_LENGTH = 125; // Modbus protocol limit

// String length limits (for UI validation)
export const ID_LEN = 24;
export const NAME_LEN = 32;
export const TYPE_LEN = 12;
export const UNIT_LEN = 12;

// ============================================================
// BASIC TYPES
// ============================================================

export type ParityType = 'none' | 'even' | 'odd';
export type DataBits = 7 | 8;
export type StopBits = 1 | 2;
export type FunctionCode = 1 | 2 | 3 | 4;
export type DataType =
  | 'int16'
  | 'uint16'
  | 'int32'
  | 'uint32'
  | 'float32'
  | 'int64'
  | 'uint64'
  | 'float64'
  | 'string'
  | 'bool';

export interface UARTConfig {
  baud_rate: number;
  data_bits: DataBits;
  parity: ParityType;
  stop_bits: StopBits;
  timeout_ms: number;
}

// ============================================================
// DEVICE PROFILE — Reusable meter template
// ============================================================

/** A single parameter (register) within a block */
export interface ProfileParameter {
  parameter_name: string; // "Voltage R-N", "Frequency"
  offset_address: number; // Offset from block start_address (in 16-bit registers)
  absolute_address: number; // Absolute Modbus address
  data_type: DataType;
  multiplier: number; // Scale factor (1.0 = no scaling)
  unit: string; // "V", "A", "Hz", "kWh"
}

/** A block — contiguous range of registers read in a single Modbus call */
export interface ProfileBlock {
  block_name: string; // "Real-time Electricals"
  start_address: number; // Starting Modbus register address
  registers_count: number; // Total 16-bit registers to read (1-125)
  function_code: FunctionCode; // 3=Holding, 4=Input, 1=Coils, 2=Discrete
  parameters: ProfileParameter[];
}

/** Device metadata (make, model, byte order) */
export interface DeviceInfo {
  device_type: string; // "Energy Meter"
  make: string; // "Elmeasure"
  model: string; // "LG5110"
  byte_swap: boolean; // Swap bytes within 16-bit word
  word_swap: boolean; // Swap 16-bit words in 32-bit value
}

/** Complete device profile — reusable template for similar meters */
export interface DeviceProfile {
  profile_id: string; // Unique key: "elmeasure_lg5110"
  device: DeviceInfo;
  blocks: ProfileBlock[];
}

/** Summary returned by GET profiles list (lighter than full profile) */
export interface ProfileSummary {
  profile_id: string;
  device_type: string;
  make: string;
  model: string;
  byte_swap: boolean;
  word_swap: boolean;
  block_count: number;
  parameter_count: number;
}

// ============================================================
// SLAVE ASSIGNMENT — Lightweight reference to a profile
// ============================================================

export interface SlaveAssignment {
  slave_id: number; // Modbus address 1-247
  profile_id: string; // Reference to DeviceProfile.profile_id
  name: string; // User alias: "Main Panel Meter"
  enabled: boolean;
  // Populated by GET /slaves for convenience
  profile?: {
    device_type: string;
    make: string;
    model: string;
  };
}

// ============================================================
// COMPLETE MODBUS CONFIG
// ============================================================

export interface ModbusConfig {
  uart_config: UARTConfig;
  retry_count: number;
  read_paused: boolean;
}

// ============================================================
// TEST READ RESPONSE
// ============================================================

/** All possible interpretations of a register pair, across endianness and data types */
export interface TestReadInterpretations {
  // 16-bit (single register, no endianness)
  uint16: number;
  int16: number;
  // Float32 — all 4 byte-order combinations
  float32_ABCD: number; // Big Endian (no swap)
  float32_DCBA: number; // Little Endian (byte+word swap)
  float32_BADC: number; // Mid-Big (byte swap only)
  float32_CDAB: number; // Mid-Little (word swap only)
  // UInt32
  uint32_ABCD: number;
  uint32_DCBA: number;
  uint32_BADC: number;
  uint32_CDAB: number;
  // Int32
  int32_ABCD: number;
  int32_DCBA: number;
  int32_BADC: number;
  int32_CDAB: number;
}

export interface TestReadParameter {
  name: string;
  unit: string;
  offset: number;
  absolute_address: number;
  raw_value: number | null;
  scaled_value: number | null;
  raw_hex: string;       // "1234 5678" — two 16-bit regs in HEX
  raw_bytes: string;     // "12 34 56 78" — individual bytes A B C D
  reg0: number;          // Raw register 0 (decimal)
  reg1: number;          // Raw register 1 (decimal)
  interpretations: TestReadInterpretations | null;
}

export interface TestReadBlock {
  block_name: string;
  status: 'ok' | 'error';
  raw_hex?: string;      // Full block hex dump
  parameters: TestReadParameter[];
}

export interface TestReadResult {
  slave_id: number;
  profile_id: string;
  blocks: TestReadBlock[];
  total_parameters: number;
  successful: number;
  failed: number;
}

// ============================================================
// DEFAULT VALUES
// ============================================================

export const DEFAULT_PARAMETER: Omit<ProfileParameter, 'parameter_name'> = {
  offset_address: 0,
  absolute_address: 0,
  data_type: 'float32',
  multiplier: 1.0,
  unit: '',
};

export const DEFAULT_BLOCK: Omit<ProfileBlock, 'block_name'> = {
  start_address: 0,
  registers_count: 10,
  function_code: 3,
  parameters: [],
};

export const DEFAULT_DEVICE_INFO: DeviceInfo = {
  device_type: 'Energy Meter',
  make: '',
  model: '',
  byte_swap: false,
  word_swap: false,
};

export const DEFAULT_PROFILE: Omit<DeviceProfile, 'profile_id'> = {
  device: { ...DEFAULT_DEVICE_INFO },
  blocks: [],
};
