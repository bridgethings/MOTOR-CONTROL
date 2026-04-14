import { FC, useState, useRef } from 'react';
import {
  IconClock,
  IconNetwork,
  IconRefresh,
  IconDeviceMobile,
  IconCircle,
} from '@tabler/icons-react';
import {
  Badge,
  Button,
  Grid,
  Group,
  Paper,
  Progress,
  Stack,
  Table,
  Text,
  Accordion,
  Title,
  Divider,
  Box,
  SimpleGrid,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import ConfigCard from '@/components/Configuration/Common/ConfigCard';
import useConfiguration from '@/hooks/useConfiguration';

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeRegisters(slave: any): { name: string; value: any; unit: string }[] {
  const values = slave?.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) return [];
  const units = slave?.units || {};
  return Object.keys(values).map((key) => ({
    name: key,
    value: values[key],
    unit: units[key] || '',
  }));
}

function formatValue(val: number | string | undefined): string {
  if (val === undefined || val === null) return '—';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? val.toString() : val.toFixed(3);
  }
  return String(val);
}

function formatTimestamp(epoch: number | undefined): string {
  if (!epoch) return 'Never';
  return new Date(epoch * 1000).toLocaleString();
}

function signalPercent(netType: string, strength: number | undefined): number {
  if (strength === undefined) return 0;
  if (netType === 'wifi') return Math.max(0, Math.min(100, Math.round(((strength + 100) / 70) * 100)));
  if (netType === '4G_MODEM') return Math.max(0, Math.min(100, Math.round((strength / 31) * 100)));
  return strength;
}

function signalColor(pct: number): string {
  if (pct >= 66) return 'green';
  if (pct >= 33) return 'yellow';
  return 'red';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Component ──────────────────────────────────────────────────────────────

const StatusDashboardPage: FC = () => {
  const config = useConfiguration();
  const [status, setStatus] = useState<any>(null);
  const [modbusLiveData, setModbusLiveData] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReadingModbus, setIsReadingModbus] = useState(false);

  const busyRef = useRef(false);

  const handleGetStatus = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsRefreshing(true);
    try {
      const data = await config.getDeviceStatus();
      setStatus(data);
      setModbusLiveData(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const isTimeout = msg.toLowerCase().includes('timeout');
      notifications.show({
        title: isTimeout ? 'Device Busy' : 'Refresh Failed',
        message: isTimeout
          ? 'Device did not respond in time — it may be busy with Modbus polling. Please try again in a moment.'
          : `Get status failed: ${msg}`,
        color: isTimeout ? 'yellow' : 'red',
        autoClose: isTimeout ? 5000 : 8000,
      });
    } finally {
      setIsRefreshing(false);
      busyRef.current = false;
    }
  };

  const handleLiveReadModbus = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsReadingModbus(true);
    try {
      const data = await config.liveReadModbus();
      setModbusLiveData(data);
      notifications.show({ message: 'Live Modbus read complete', color: 'green' });
    } catch (err) {
      notifications.show({
        message: `Live read failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        color: 'red',
      });
    } finally {
      setIsReadingModbus(false);
      busyRef.current = false;
    }
  };

  const network = status?.network;
  const netType: string = network?.type || 'none';
  const netIP: string = network?.ip || '—';
  const netSignalPct = signalPercent(netType, network?.signal);
  const netSignalLabel = (network?.signal !== undefined) ? `${network.signal} ${netType === '4G_MODEM' ? '' : 'dBm'}` : '—';
  
  const anyBusy = isRefreshing || isReadingModbus;
  const modbusSource = modbusLiveData ? 'live' : 'cached';
  const modbusSlavesRaw = modbusLiveData?.results || status?.results || status?.modbus?.slaves || [];
  const modbusSlaves = Array.isArray(modbusSlavesRaw) ? modbusSlavesRaw : [];

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>System Status Dashboard</Title>
        <Button
          size="sm"
          variant="outline"
          leftSection={<IconRefresh size={16} />}
          loading={isRefreshing}
          disabled={anyBusy}
          onClick={handleGetStatus}
        >
          Refresh Status
        </Button>
      </Group>

      {status && (
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper p="md" radius="md" withBorder>
              <Text size="sm" c="dimmed">SIM Status</Text>
              <Group justify="space-between" mt="xs">
                <Badge color={status.network?.sim_ready ? 'green' : 'red'}>
                  {status.network?.sim_ready ? 'Ready' : 'Not Detected'}
                </Badge>
                <IconNetwork size={18} />
              </Group>
            </Paper>
          </Grid.Col>

          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper p="md" radius="md" withBorder>
              <Text size="sm" c="dimmed">Device Connectivity</Text>
              <Group justify="space-between" mt="xs">
                <Badge color={status.network?.connected ? 'green' : 'red'}>
                  {status.network?.connected ? 'Connected' : 'Disconnected'}
                </Badge>
                <IconDeviceMobile size={18} />
              </Group>
            </Paper>
          </Grid.Col>

          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper p="md" radius="md" withBorder>
              <Text size="sm" c="dimmed">Cloud Status (MQTT)</Text>
              <Group justify="space-between" mt="xs">
                <Badge color={status.mqtt?.connected ? 'green' : 'red'}>
                  {status.mqtt?.connected ? 'Online' : 'Offline'}
                </Badge>
                <IconCircle size={18} />
              </Group>
            </Paper>
          </Grid.Col>

          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Paper p="md" radius="md" withBorder>
              <Text size="sm" c="dimmed">RTC Health</Text>
              <Group justify="space-between" mt="xs">
                <Badge color={status.time?.rtc_valid ? 'green' : 'red'}>
                  {status.time?.rtc_valid ? 'Clock Valid' : 'Clock Unset'}
                </Badge>
                <IconClock size={18} />
              </Group>
            </Paper>
          </Grid.Col>
        </Grid>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ConfigCard title="Network Information" icon={<IconNetwork size={20} />}>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" fw={500}>Connection Type</Text>
              <Badge variant="light">{capitalize(netType)}</Badge>
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>IP Address</Text>
              <Text size="sm" ff="monospace" c="blue">{netIP}</Text>
            </Group>
            {status?.system?.mac_token && (
              <Group justify="space-between">
                <Text size="sm" fw={500}>ThingsBoard Token</Text>
                <Text size="sm" ff="monospace" c="cyan" style={{ wordBreak: 'break-all', textAlign: 'right' }}>
                  {status.system.mac_token}
                </Text>
              </Group>
            )}
            <Divider />
            <Box>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={500}>Signal Quality</Text>
                <Text size="xs" c={signalColor(netSignalPct)}>{netSignalLabel}</Text>
              </Group>
              <Progress 
                value={netSignalPct} 
                color={signalColor(netSignalPct)} 
                size="sm" 
                radius="xl"
              />
            </Box>
          </Stack>
        </ConfigCard>

        <ConfigCard title="Device Time" icon={<IconClock size={20} />}>
          <Stack align="center" justify="center" h="100%" py="md">
            <Text size="32px" fw={700} ff="monospace">
              {status?.time?.rtc_valid ? (status.time.datetime?.split(' ')[1] || '—') : '—'}
            </Text>
            <Text c="dimmed" size="sm">
              {status?.time?.rtc_valid ? (status.time.datetime?.split(' ')[0] || '—') : 'RTC Unsynchronized'}
            </Text>
          </Stack>
        </ConfigCard>
      </SimpleGrid>

      <ConfigCard title="Modbus Register Readings" icon={<IconRefresh size={20} />}>
        <Group justify="space-between" mb="md">
          <Badge color="blue" variant="light">
            Source: {modbusSource.toUpperCase()}
          </Badge>
          <Button
            size="sm"
            leftSection={<IconRefresh size={16} />}
            loading={isReadingModbus}
            disabled={anyBusy}
            onClick={handleLiveReadModbus}
          >
            Live Read All
          </Button>
        </Group>

        {modbusSlaves.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl" fs="italic">
            No slaves configured or detected.
          </Text>
        ) : (
          <Accordion variant="contained" radius="md">
            {modbusSlaves.map((slave: any, idx: number) => {
              const slaveId = slave.slave_id ?? idx + 1;
              const slaveName = slave.name || `Slave ${slaveId}`;
              const registers = normalizeRegisters(slave);
              const slaveStatus = slave.status || 'unknown';

              return (
                <Accordion.Item key={slaveId} value={String(slaveId)}>
                  <Accordion.Control>
                    <Group justify="space-between">
                      <Group gap="sm">
                        <Text fw={600}>{slaveName}</Text>
                        <Badge 
                          size="xs" 
                          color={slaveStatus === 'ok' ? 'green' : slaveStatus === 'pending' ? 'yellow' : 'red'}
                          variant="outline"
                        >
                          {slaveStatus}
                        </Badge>
                      </Group>
                      {slave.last_read_time && (
                        <Text size="xs" c="dimmed">Last Read: {formatTimestamp(slave.last_read_time)}</Text>
                      )}
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    {registers.length === 0 ? (
                      <Text size="sm" c="dimmed" ta="center" py="md" fs="italic">
                        No data records available.
                      </Text>
                    ) : (
                      <Table.ScrollContainer minWidth={400}>
                        <Table variant="simple" verticalSpacing="xs">
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Parameter</Table.Th>
                              <Table.Th>Value</Table.Th>
                              <Table.Th>Unit</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {registers.map((reg, rIdx) => (
                              <Table.Tr key={reg.name || rIdx}>
                                <Table.Td>
                                  <Text size="sm">{reg.name}</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="sm" fw={500} ff="monospace">
                                    {formatValue(reg.value)}
                                  </Text>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="sm" c="dimmed">{reg.unit || '—'}</Text>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                    )}
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
        )}
      </ConfigCard>
    </Stack>
  );
};

export default StatusDashboardPage;
