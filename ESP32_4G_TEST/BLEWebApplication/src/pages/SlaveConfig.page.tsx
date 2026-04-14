import { FC, useState, useEffect } from 'react';
import {
  IconDownload,
  IconPlug,
  IconDevices,
  IconPlayerPause,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { Badge, Button, Grid, Group, NumberInput, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import ConfigCard from '@/components/Configuration/Common/ConfigCard';
import UARTConfig from '@/components/Configuration/ModbusForm/UARTConfig';
import SlaveAssignmentTable from '@/components/Configuration/SlaveConfig/SlaveAssignmentTable';
import useConfiguration from '@/hooks/useConfiguration';
import type { ModbusConfig } from '@/types/modbus.types';

const SlaveConfigPage: FC = () => {
  const config = useConfiguration();
  const [formData, setFormData] = useState<ModbusConfig | null>(null);
  const [readPaused, setReadPaused] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  useEffect(() => {
    if (config.modbusConfig) {
      setFormData(config.modbusConfig);
      if (config.modbusConfig.read_paused !== undefined) {
        setReadPaused(config.modbusConfig.read_paused);
      }
    }
  }, [config.modbusConfig]);

  const handleLoad = async () => {
    // Sequential: BLE only supports one command in-flight at a time
    await config.loadModbusConfig();
    await config.loadSlaves();
    await config.loadProfiles();
  };

  const handleSaveUART = async () => {
    if (!formData) return;
    try {
      await config.saveModbusUART({
        uart_config: formData.uart_config,
        retry_count: formData.retry_count,
      });
    } catch {
      // Error handled by provider
    }
  };

  const handleTogglePause = async (paused: boolean) => {
    setPauseLoading(true);
    try {
      await config.pauseModbusRead(paused);
      setReadPaused(paused);
      notifications.show({
        message: paused ? 'Modbus reading paused' : 'Modbus reading resumed',
        color: paused ? 'orange' : 'green',
      });
    } catch {
      // handled
    } finally {
      setPauseLoading(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Text size="xl" fw={700}>
          Slave Configuration
        </Text>
        <Button
          variant="light"
          leftSection={<IconDownload size={16} />}
          onClick={handleLoad}
          loading={config.isLoading}
        >
          Load Config
        </Button>
      </Group>

      {!formData && !config.isLoading && (
        <Text c="dimmed" ta="center" py="xl">
          Click "Load Config" to load current configuration
        </Text>
      )}

      {formData && (
        <>
          <ConfigCard
            title="Modbus Polling Control"
            icon={
              readPaused ? (
                <IconPlayerPause size={20} color="var(--mantine-color-orange-6)" />
              ) : (
                <IconPlayerPlay size={20} color="var(--mantine-color-green-6)" />
              )
            }
          >
            <Group align="center" gap="md">
              <Switch
                size="lg"
                color={readPaused ? 'orange' : 'green'}
                checked={readPaused}
                onChange={(e) => handleTogglePause(e.currentTarget.checked)}
                disabled={pauseLoading}
                label="Pause Modbus Read"
                description="Temporarily stops polling so BLE commands respond faster"
              />
              <Badge color={readPaused ? 'orange' : 'green'} size="lg" variant="light">
                {readPaused ? 'Polling Paused' : 'Polling Active'}
              </Badge>
            </Group>
          </ConfigCard>

          <ConfigCard title="UART Configuration" icon={<IconPlug size={20} />}>
            <UARTConfig
              config={formData.uart_config}
              onChange={(uart_config) => setFormData({ ...formData, uart_config })}
            />
            <Grid mt="md">
              <Grid.Col span={12}>
                <NumberInput
                  label="Retry Count"
                  value={formData.retry_count}
                  onChange={(value) => setFormData({ ...formData, retry_count: Number(value) })}
                  min={1}
                  max={10}
                  description="Number of retries on communication failure"
                />
              </Grid.Col>
            </Grid>
            <Group justify="flex-end" mt="md">
              <Button onClick={handleSaveUART} loading={config.isLoading}>
                Save UART Config
              </Button>
            </Group>
          </ConfigCard>

          <ConfigCard title="Slave Assignments" icon={<IconDevices size={20} />}>
            <SlaveAssignmentTable
              slaves={config.slaves}
              profiles={config.profiles}
              onAdd={config.addSlave}
              onUpdate={config.updateSlave}
              onDelete={config.deleteSlave}
            />
          </ConfigCard>
        </>
      )}
    </Stack>
  );
};

export default SlaveConfigPage;
