import { FC, useEffect, useState } from 'react';
import {
  IconNetwork,
  IconRefresh,
  IconDeviceMobile,
  IconCellSignal4,
  IconCircle,
  IconAntenna,
} from '@tabler/icons-react';
import {
  Badge,
  Button,
  Grid,
  Group,
  Loader,
  Paper,
  Progress,
  Stack,
  Text,
  TextInput,
  PasswordInput,
  Alert,
  Title,
  Divider,
  Box,
  SimpleGrid,
  Card,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import ConfigCard from '@/components/Configuration/Common/ConfigCard';
import useConfiguration from '@/hooks/useConfiguration';

function signalPercent(signal: number | undefined): number {
  if (signal === undefined || signal === null) return 0;
  return Math.max(0, Math.min(100, Math.round((signal / 31) * 100)));
}

function signalColor(pct: number): string {
  if (pct >= 66) return 'green';
  if (pct >= 33) return 'yellow';
  return 'red';
}

const NetworkConfigPage: FC = () => {
  const config = useConfiguration();

  // Network status (from GET network)
  const [networkStatus, setNetworkStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // APN form state (initialised from status once loaded)
  const [apn, setApn] = useState('');
  const [apnUser, setApnUser] = useState('');
  const [apnPass, setApnPass] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const loadNetworkStatus = async () => {
    setIsLoading(true);
    try {
      const data = await config.getNetworkStatus();
      setNetworkStatus(data);
      // Pre-fill form with current APN
      if (data?.apn && !apn) setApn(data.apn);
    } catch (err) {
      notifications.show({
        message: `Failed to load network status: ${err instanceof Error ? err.message : 'Unknown error'}`,
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNetworkStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveAPN = async () => {
    if (!apn.trim()) {
      notifications.show({ message: 'APN cannot be empty', color: 'orange' });
      return;
    }
    setIsSaving(true);
    setSaveMessage('');
    try {
      const resp = await config.setNetworkConfig({
        apn: apn.trim(),
        apn_username: apnUser.trim(),
        apn_password: apnPass,
      });
      const msg = resp?.message || 'Network config saved';
      setSaveMessage(msg);
      notifications.show({ message: msg, color: 'green' });
    } catch (err) {
      notifications.show({
        message: `Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        color: 'red',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const signalPct = signalPercent(networkStatus?.signal);
  const connected: boolean = networkStatus?.connected ?? false;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>Network & Modem Configuration</Title>
        <Button
          size="sm"
          variant="outline"
          leftSection={isLoading ? <Loader size={14} /> : <IconRefresh size={14} />}
          disabled={isLoading}
          onClick={loadNetworkStatus}
        >
          Refresh Status
        </Button>
      </Group>

      {/* Connection Status Cards */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <IconDeviceMobile size={20} />
                <Text fw={700}>Modem Status</Text>
              </Group>
              <Badge 
                color={connected ? 'green' : 'red'}
                variant="filled"
              >
                {connected ? 'CONNECTED' : 'DISCONNECTED'}
              </Badge>
            </Group>

            <Divider />

            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm">Operator:</Text>
                <Text fw={600}>{networkStatus?.operator || '—'}</Text>
              </Group>
              
              <Box mt="sm">
                <Group justify="space-between" mb={4}>
                  <Text size="xs" c="dimmed">Signal Strength</Text>
                  <Text size="xs" fw={700}>{signalPct}%</Text>
                </Group>
                <Progress 
                  value={signalPct} 
                  color={signalColor(signalPct)} 
                  size="sm" 
                  radius="xl"
                />
              </Box>
            </Stack>
          </Stack>
        </Card>

        <Card withBorder>
          <Stack gap="md">
            <Group gap="xs">
              <IconNetwork size={20} />
              <Text fw={700}>Modem Identification</Text>
            </Group>

            <Divider />

            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">IP Address:</Text>
                <Text ff="monospace" size="sm" fw={600} c="blue">{networkStatus?.ip || '—'}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">IMEI:</Text>
                <Text ff="monospace" size="xs" fw={600}>{networkStatus?.imei || '—'}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">Module:</Text>
                <Text size="xs">{networkStatus?.module || '—'}</Text>
              </Group>
            </Stack>
          </Stack>
        </Card>
      </SimpleGrid>

      {/* APN Form */}
      <ConfigCard title="Modem APN Configuration" icon={<IconAntenna size={20} />}>
        <Stack gap="md">
          <Alert color="blue" variant="light">
            Updates to APN settings require a device reboot to take effect.
          </Alert>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="APN Name"
              placeholder="e.g. internet"
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
          </SimpleGrid>

          <Group justify="flex-end" mt="md">
            <Button
              onClick={handleSaveAPN}
              loading={isSaving}
              leftSection={<IconRefresh size={16} />}
              disabled={!apn.trim()}
            >
              Update APN Settings
            </Button>
          </Group>

          {saveMessage && (
            <Alert color="orange" variant="outline" mt="md">
              {saveMessage}
            </Alert>
          )}
        </Stack>
      </ConfigCard>
    </Stack>
  );
};

export default NetworkConfigPage;
