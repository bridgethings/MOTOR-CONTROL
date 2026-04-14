import { FC, useState, useCallback, useEffect } from 'react';
import {
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  TextInput,
  Stack,
  Switch,
  Text,
  Title,
  Badge,
  Progress,
  Divider,
  SimpleGrid,
  ActionIcon,
  Tooltip,
  Alert,
  Loader,
  Paper,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBolt,
  IconBoltOff,
  IconRefresh,
  IconDeviceFloppy,
  IconDroplet,
  IconCalendar,
  IconClock,
} from '@tabler/icons-react';
import useConfiguration from '@/hooks/useConfiguration';
import type { MotorConfig } from '@/types/motor.types';

const MotorControlPage: FC = () => {
  const config = useConfiguration();
  const [loading, setLoading] = useState(false);
  const [motorRunning, setMotorRunning] = useState(false);
  const [motorBusy, setMotorBusy] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [startingMotor, setStartingMotor] = useState(false);
  const [stoppingMotor, setStoppingMotor] = useState(false);

  // Auto-polling state
  const [autoPoll, setAutoPoll] = useState(true);
  const [pollInterval, setPollInterval] = useState(10000); // Default 10s

  // Local form state
  const [formData, setFormData] = useState<Partial<MotorConfig>>({});

  // Sync with global config when it loads
  useEffect(() => {
    if (config.motorConfig) {
      setFormData(config.motorConfig);
    }
  }, [config.motorConfig]);
  const [slaves, setSlaves] = useState<{ value: string; label: string }[]>([]);

  const loadMotorData = useCallback(async () => {
    if (!config.api) return;
    setLoading(true);
    try {
      // Load device status for motor state and volume
      const statusResp = await config.getDeviceStatus();
      if (statusResp && statusResp.motor) {
        setMotorRunning(statusResp.motor.motor_running ?? false);
        setMotorBusy(statusResp.motor.motor_busy ?? false);
        setCurrentLevel(statusResp.motor.level?.current_level ?? 0);
        
        // If the device reported thresholds, update our form if they differ
        if (statusResp.motor.config) {
          const cfg = statusResp.motor.config;
          setFormData(prev => ({
            ...prev,
            level_low_threshold: cfg.level_low_threshold ?? prev.level_low_threshold,
            level_high_threshold: cfg.level_high_threshold ?? prev.level_high_threshold,
            auto_turn_on: cfg.auto_turn_on ?? prev.auto_turn_on,
            remote_control_enabled: cfg.remote_control_enabled ?? prev.remote_control_enabled
          }));
        }
      }

      // Load slaves for volume source selector
      const slaveList = await config.api.getSlaves();
      setSlaves(
        (slaveList || []).map((s: any) => ({
          value: String(s.slave_id),
          label: `Slave ${s.slave_id} - ${s.name}`,
        }))
      );
    } catch (err: any) {
      notifications.show({
        title: 'Load Error',
        message: err.message || 'Failed to load motor configuration',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, [config.api]);

  // Sync polling interval with device settings
  useEffect(() => {
    const fetchSettings = async () => {
      if (!config.api) return;
      try {
        const settings = await config.api.getSystemSettings();
        if (settings?.modbus_poll_interval_ms) {
          // Use device poll interval as basis, min 2s to avoid overload
          setPollInterval(Math.max(2000, settings.modbus_poll_interval_ms));
        }
      } catch (e) {
        console.warn('Failed to fetch system settings for poll interval', e);
      }
    };
    fetchSettings();
  }, [config.api]);

  // Handle auto-polling
  useEffect(() => {
    let timer: any;
    if (autoPoll && !loading) {
      timer = setInterval(() => {
        loadMotorData();
      }, pollInterval);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [autoPoll, pollInterval, loadMotorData, loading]);

  const handleMotorControl = async (turnOn: boolean) => {
    if (!config.api) return;
    if (turnOn) setStartingMotor(true);
    else setStoppingMotor(true);
    try {
      const resp = await config.api.setMotorState(turnOn);
      if (resp.status === 'success') {
        setMotorRunning(resp.data?.motor_running ?? turnOn);
        notifications.show({
          title: 'Motor Control',
          message: `Motor ${turnOn ? 'started' : 'stopped'} successfully`,
          color: turnOn ? 'green' : 'orange',
        });
      } else {
        notifications.show({
          title: 'Motor Control Error',
          message: resp.message || 'Failed to change motor state',
          color: 'red',
        });
      }
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to control motor',
        color: 'red',
      });
    } finally {
      setStartingMotor(false);
      setStoppingMotor(false);
      // Refresh status after control action
      setTimeout(loadMotorData, 1000);
    }
  };

  const handleSave = async () => {
    try {
      await config.updateMotorConfig(formData);
      notifications.show({
        title: 'Saved',
        message: 'Automation configuration saved successfully',
        color: 'green',
      });
    } catch (err: any) {
      // Error handled by provider
    }
  };

  const lowLevelLimit = formData.level_low_threshold || 0;
  const highLevelLimit = formData.level_high_threshold || 0;
  const currentPercent = highLevelLimit > 0 ? Math.min((currentLevel / highLevelLimit) * 100, 100) : 0;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>Motor Control & Monitoring</Title>
        <Group gap="xs">
          <Switch
            label="Auto-Polling"
            checked={autoPoll}
            onChange={(e) => setAutoPoll(e.currentTarget.checked)}
          />
          <Button
            size="sm"
            variant="outline"
            leftSection={<IconRefresh size={16} />}
            onClick={loadMotorData}
            loading={loading}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* State Card */}
        <Card>
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={700}>Current Status</Text>
              <Badge
                size="lg"
                color={motorRunning ? 'green' : 'gray'}
                variant="filled"
              >
                {motorRunning ? 'MOTOR RUNNING' : 'MOTOR STANDBY'}
              </Badge>
            </Group>

            <Divider />

            <Group grow gap="md">
              <Button
                color="green"
                size="lg"
                leftSection={<IconBolt size={20} />}
                onClick={() => handleMotorControl(true)}
                loading={startingMotor}
                disabled={motorBusy || stoppingMotor || motorRunning}
              >
                START MOTOR
              </Button>
              <Button
                color="red"
                size="lg"
                leftSection={<IconBoltOff size={20} />}
                onClick={() => handleMotorControl(false)}
                loading={stoppingMotor}
                disabled={motorBusy || startingMotor || !motorRunning}
              >
                STOP MOTOR
              </Button>
            </Group>

            {motorBusy && (
              <Group justify="center" gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">Waiting for command acknowledgment...</Text>
              </Group>
            )}
          </Stack>
        </Card>

        {/* Level Card */}
        <Card>
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={700}>System Level Monitoring</Text>
              <IconDroplet size={20} color="var(--mantine-color-blue-filled)" />
            </Group>

            <Divider />

            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm">Current Level</Text>
                <Text fw={700} size="lg">{currentLevel.toFixed(1)} cm</Text>
              </Group>
              <Progress 
                value={currentPercent} 
                color={currentPercent > 90 ? 'red' : currentPercent > 70 ? 'yellow' : 'blue'}
                size="xl" 
                radius="xl"
                striped
                animated={motorRunning}
              />
              <Group justify="flex-end">
                <Text size="xs" c="dimmed">{currentPercent.toFixed(1)}% Capacity</Text>
              </Group>
            </Stack>

            <SimpleGrid cols={2} spacing="xs">
              <Paper withBorder p="xs" radius="sm">
                <Text size="xs" c="dimmed">Low Threshold</Text>
                <Text fw={700}>{lowLevelLimit} cm</Text>
              </Paper>
              <Paper withBorder p="xs" radius="sm">
                <Text size="xs" c="dimmed">High Threshold</Text>
                <Text fw={700}>{highLevelLimit} cm</Text>
              </Paper>
            </SimpleGrid>
          </Stack>
        </Card>
      </SimpleGrid>

      {/* Configuration Card */}
      <Card>
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <IconDeviceFloppy size={20} />
              <Text fw={700}>Automation Configuration</Text>
            </Group>
            <Button
              size="sm"
              onClick={handleSave}
              loading={config.isLoading}
              leftSection={<IconDeviceFloppy size={16} />}
            >
              Save Configuration
            </Button>
          </Group>

          <Divider />

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            <Stack gap="md">
              <Title order={5}>Operation Logic</Title>
              <Switch
                label="Enable Remote Control"
                description="Allow triggering system via Cloud/MQTT"
                checked={formData.remote_control_enabled ?? true}
                onChange={(e) =>
                  setFormData({ ...formData, remote_control_enabled: e.currentTarget.checked })
                }
              />
              <Switch
                label="Automatic Start"
                description="Automatically start when level hits low threshold"
                checked={formData.auto_turn_on ?? false}
                onChange={(e) =>
                  setFormData({ ...formData, auto_turn_on: e.currentTarget.checked })
                }
              />
            </Stack>

            <Stack gap="md">
              <Title order={5}>Level Thresholds (cm)</Title>
              <Group grow gap="xs">
                <NumberInput
                  label="Low Stop/Start"
                  min={0}
                  step={0.1}
                  decimalScale={2}
                  value={formData.level_low_threshold ?? 0}
                  onChange={(val) =>
                    setFormData({ ...formData, level_low_threshold: Number(val) || 0 })
                  }
                />
                <NumberInput
                  label="High Stop Safety"
                  min={0}
                  step={0.1}
                  decimalScale={2}
                  value={formData.level_high_threshold ?? 0}
                  onChange={(val) =>
                    setFormData({ ...formData, level_high_threshold: Number(val) || 0 })
                  }
                />
              </Group>
            </Stack>

            <Stack gap="md">
              <Title order={5}>Sensor Identification</Title>
              <Select
                label="Slave Device"
                placeholder="Choose Modbus Slave"
                data={[{ value: '0', label: 'No Sensor Assigned' }, ...slaves]}
                value={String(formData.level_slave_id ?? 0)}
                onChange={(val) =>
                  setFormData({ ...formData, level_slave_id: Number(val) || 0 })
                }
              />
            </Stack>

            <Stack gap="md">
              <Title order={5}>Advanced Mappings</Title>
              <TextInput
                label="Parameter Tag"
                placeholder="e.g. liquid_level"
                value={formData.level_param_name ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, level_param_name: e.currentTarget.value })
                }
              />
            </Stack>
          </SimpleGrid>
        </Stack>
      </Card>
    </Stack>
  );
};

export default MotorControlPage;
