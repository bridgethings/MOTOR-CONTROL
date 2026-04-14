// Motor controller types for 4G Motor Controller

export interface MotorConfig {
  remote_control_enabled: boolean;
  auto_turn_on: boolean;
  day_start_hour: number;
  level_low_threshold: number;
  level_high_threshold: number;
  level_slave_id: number;
  level_param_name: string;
  relay_pulse_ms: number;
}

export interface LevelStatus {
  current_level: number;
}

export interface MotorStatus {
  motor_running: boolean;
  motor_busy: boolean;
  config: MotorConfig;
  level?: LevelStatus;
}
