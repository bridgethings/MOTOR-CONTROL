import { FC, useState } from 'react';
import {
  IconClock,
  IconRefresh,
  IconDeviceMobile,
  IconSettings,
  IconDeviceFloppy,
  IconDownload,
  IconAntenna,
} from '@tabler/icons-react';
import {
  Button,
  Group,
  Stack,
  Text,
  Code,
  Loader,
  Badge,
  Paper,
  Card,
  Title,
  NumberInput,
  Divider,
  Select,
  TextInput,
  PasswordInput,
  Alert,
  SimpleGrid,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import useConfiguration from '@/hooks/useConfiguration';
import { DeviceTimeResponse } from '@/services/configApi';

interface SystemSettingsData {
  modbus_poll_interval_ms: number;
  telemetry_interval_ms: number;
  relay_pulse_ms: number;
}

const AdvancedConfigPage: FC = () => {
  const config = useConfiguration();
  const [deviceTime, setDeviceTime] = useState<DeviceTimeResponse | null>(null);
  const [isLoadingTime, setIsLoadingTime] = useState(false);
  const [isSyncingTime, setIsSyncingTime] = useState(false);

  // System settings state
  const [settings, setSettings] = useState<SystemSettingsData | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // APN config state
  const [apn, setApn] = useState('');
  const [apnUser, setApnUser] = useState('');
  const [apnPass, setApnPass] = useState('');
  const [isLoadingApn, setIsLoadingApn] = useState(false);
  const [isSavingApn, setIsSavingApn] = useState(false);
  const [apnSaveMessage, setApnSaveMessage] = useState('');



  const handleGetDeviceTime = async () => {
    if (!config.api) {
      notifications.show({ message: 'Not connected to device', color: 'red' });
      return;
    }

    setIsLoadingTime(true);
    try {
      const response = await config.api.getDeviceTime();
      setDeviceTime(response);
      if (response.status === 'success') {
        notifications.show({ message: 'Device time retrieved successfully', color: 'green' });
      }
    } catch (error: any) {
      notifications.show({
        message: `Failed to get device time: ${error.message || error}`,
        color: 'red',
      });
    } finally {
      setIsLoadingTime(false);
    }
  };

  const handleSyncFromPhone = async () => {
    if (!config.api) {
      notifications.show({ message: 'Not connected to device', color: 'red' });
      return;
    }

    setIsSyncingTime(true);
    try {
      const response = await config.api.syncDeviceTimeFromPhone('+05:30');
      if (response.status === 'success') {
        notifications.show({ message: 'Device time synced from phone successfully', color: 'green' });
        await handleGetDeviceTime();
      } else {
        throw new Error(response.message || 'Sync failed');
      }
    } catch (error: any) {
      notifications.show({
        message: `Failed to sync time: ${error.message || error}`,
        color: 'red',
      });
    } finally {
      setIsSyncingTime(false);
    }
  };

  const handleLoadSettings = async () => {
    if (!config.api) {
      notifications.show({ message: 'Not connected to device', color: 'red' });
      return;
    }

    setIsLoadingSettings(true);
    try {
      const response = await config.api.sendCommand({
        cmd: 'GET',
        section: 'system_settings',
        data: {},
      });
      if (response.status === 'success' && response.data) {
        setSettings({
          modbus_poll_interval_ms: response.data.modbus_poll_interval_ms ?? 120000,
          telemetry_interval_ms: response.data.telemetry_interval_ms ?? 120000,
          relay_pulse_ms: response.data.relay_pulse_ms ?? 2000,
        });
        notifications.show({ message: 'System settings loaded', color: 'green' });
      } else {
        throw new Error(response.message || 'Failed to load settings');
      }
    } catch (error: any) {
      notifications.show({
        message: `Failed to load settings: ${error.message || error}`,
        color: 'red',
      });
    } finally {
      setIsLoadingSettings(false);
    }
  };



  const handleSaveSettings = async () => {
    if (!config.api || !settings) {
      notifications.show({ message: 'Not connected or no settings to save', color: 'red' });
      return;
    }

    setIsSavingSettings(true);
    try {
      const response = await config.api.sendCommand({
        cmd: 'SET',
        section: 'system_settings',
        data: settings,
      });
      if (response.status === 'success') {
        notifications.show({ message: 'System settings saved successfully', color: 'green' });
      } else {
        throw new Error(response.message || 'Failed to save settings');
      }
    } catch (error: any) {
      notifications.show({
        message: `Failed to save settings: ${error.message || error}`,
        color: 'red',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleLoadApn = async () => {
    if (!config.api) {
      notifications.show({ message: 'Not connected to device', color: 'red' });
      return;
    }
    setIsLoadingApn(true);
    try {
      const data = await config.getNetworkStatus();
      if (data?.apn) setApn(data.apn);
      if (data?.apn_username) setApnUser(data.apn_username);
      notifications.show({ message: 'APN loaded from device', color: 'green' });
    } catch (error: any) {
      notifications.show({ message: `Failed to load APN: ${error.message || error}`, color: 'red' });
    } finally {
      setIsLoadingApn(false);
    }
  };

  const handleSaveApn = async () => {
    if (!apn.trim()) {
      notifications.show({ message: 'APN cannot be empty', color: 'orange' });
      return;
    }
    setIsSavingApn(true);
    setApnSaveMessage('');
    try {
      const resp = await config.setNetworkConfig({
        apn: apn.trim(),
        apn_username: apnUser.trim(),
        apn_password: apnPass,
      });
      const msg = resp?.message || 'Network config saved';
      setApnSaveMessage(msg);
      notifications.show({ message: msg, color: 'green' });
    } catch (error: any) {
      notifications.show({ message: `Save failed: ${error.message || error}`, color: 'red' });
    } finally {
      setIsSavingApn(false);
    }
  };

  return (
    <Stack gap="md">
      <Title order={3}>Advanced Configuration</Title>

      {/* RTC & Time Settings */}
      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <IconClock size={20} />
              <Text fw={700}>System Time & RTC</Text>
            </Group>
            <Group gap="xs">
              <Button
                size="xs"
                variant="outline"
                leftSection={isLoadingTime ? <Loader size={14} /> : <IconRefresh size={14} />}
                onClick={handleGetDeviceTime}
                disabled={isLoadingTime || !config.api}
              >
                Get Device Time
              </Button>
              <Button
                size="xs"
                variant="light"
                leftSection={isSyncingTime ? <Loader size={14} /> : <IconDeviceMobile size={14} />}
                onClick={handleSyncFromPhone}
                disabled={isSyncingTime || !config.api}
              >
                Sync with Phone
              </Button>
            </Group>
          </Group>

          <Divider />

          {!config.api && (
            <Text size="sm" c="dimmed" ta="center">Connect via Bluetooth to manage device time.</Text>
          )}

          {deviceTime && deviceTime.status === 'success' && (
            <Stack gap="md">
              <Paper withBorder p="md" radius="sm" bg="gray.0">
                <Stack gap="xs" align="center">
                  <Text size="xl" fw={700} ff="monospace">{deviceTime.time}</Text>
                  <Text size="sm">{deviceTime.date}</Text>
                </Stack>
              </Paper>

              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Group gap="xs">
                  <Text size="xs" c="dimmed">Timezone:</Text>
                  <Text size="sm" fw={600}>{deviceTime.timezone_offset}</Text>
                </Group>
                <Group gap="xs">
                  <Text size="xs" c="dimmed">Status:</Text>
                  <Badge color={deviceTime.time_valid ? 'green' : 'red'} size="sm">
                    {deviceTime.time_valid ? 'Valid' : 'Invalid'}
                  </Badge>
                </Group>
                <Group gap="xs">
                  <Text size="xs" c="dimmed">Unix:</Text>
                  <Text size="xs" ff="monospace">{deviceTime.timestamp}</Text>
                </Group>
              </SimpleGrid>
            </Stack>
          )}
        </Stack>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* System Settings */}
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <IconSettings size={20} />
                <Text fw={700}>Interval Settings</Text>
              </Group>
              <Group gap="xs">
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={handleLoadSettings}
                  loading={isLoadingSettings}
                  disabled={!config.api}
                >
                  Load
                </Button>
                <Button
                  size="xs"
                  onClick={handleSaveSettings}
                  loading={isSavingSettings}
                  disabled={!settings || !config.api}
                >
                  Save
                </Button>
              </Group>
            </Group>

            <Divider />

            {settings ? (
              <Stack gap="sm">
                <NumberInput
                  label="Modbus Poll Interval (ms)"
                  value={settings.modbus_poll_interval_ms}
                  onChange={(val) =>
                    setSettings({ ...settings, modbus_poll_interval_ms: Number(val) || 120000 })
                  }
                  min={1000}
                />
                <NumberInput
                  label="Telemetry Interval (ms)"
                  value={settings.telemetry_interval_ms}
                  onChange={(val) =>
                    setSettings({ ...settings, telemetry_interval_ms: Number(val) || 120000 })
                  }
                  min={1000}
                />
                <NumberInput
                  label="Relay Pulse (ms)"
                  value={settings.relay_pulse_ms}
                  onChange={(val) =>
                    setSettings({ ...settings, relay_pulse_ms: Number(val) || 2000 })
                  }
                />
              </Stack>
            ) : (
              <Text c="dimmed" size="sm" ta="center">Load settings to view intervals.</Text>
            )}
          </Stack>
        </Card>

        {/* APN Configuration */}
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <IconRefresh size={20} />
                <Text fw={700}>APN Configuration</Text>
              </Group>
              <Button
                variant="subtle"
                size="xs"
                onClick={handleLoadApn}
                loading={isLoadingApn}
                disabled={!config.api}
              >
                Load Current
              </Button>
            </Group>

            <Divider />

            <Stack gap="xs">
              <TextInput
                label="APN"
                placeholder="internet"
                value={apn}
                onChange={(e) => setApn(e.currentTarget.value)}
              />
              <TextInput
                label="APN Username"
                placeholder="optional"
                value={apnUser}
                onChange={(e) => setApnUser(e.currentTarget.value)}
              />
              <PasswordInput
                label="APN Password"
                placeholder="optional"
                value={apnPass}
                onChange={(e) => setApnPass(e.currentTarget.value)}
              />
              <Button
                mt="sm"
                onClick={handleSaveApn}
                loading={isSavingApn}
                disabled={!apn.trim()}
                leftSection={<IconDeviceFloppy size={16} />}
              >
                Save APN Config
              </Button>

              {apnSaveMessage && (
                <Alert color="blue" variant="light" icon={<IconAntenna size={16} />} py="xs">
                  {apnSaveMessage}
                </Alert>
              )}
            </Stack>
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );
};

export default AdvancedConfigPage;
