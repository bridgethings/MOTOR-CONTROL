import { FC } from 'react';
import { IconBluetoothOff, IconPlugConnected } from '@tabler/icons-react';
import { Box, Card, Group, Loader, Text } from '@mantine/core';
import useConnection from '@/hooks/useConnection';

const Disconnected: FC<{}> = () => {
  const connection = useConnection();
  const isWsMode = connection.mode === 'websocket';

  if (isWsMode) {
    return (
      <Card
        shadow="sm"
        padding="xl"
        style={{ zIndex: 7, margin: 15, maxWidth: '600px' }}
      >
        <Group justify="center" gap={20}>
          {connection.isConnecting ? (
            <Loader size={40} />
          ) : (
            <IconPlugConnected color="orange" size={50} stroke={1} />
          )}
          <Box>
            <Text fw={500} size="lg">
              {connection.isConnecting ? 'Connecting to device...' : 'Device not connected'}
            </Text>
            <Text mt="xs" c="dimmed" size="sm">
              {connection.isConnecting
                ? 'Establishing WebSocket connection to the device.'
                : 'WebSocket connection lost. Attempting to reconnect automatically...'}
            </Text>
          </Box>
        </Group>
      </Card>
    );
  }

  return (
    <Card
      shadow="sm"
      padding="xl"
      component="a"
      style={{ zIndex: 7, margin: 15, maxWidth: '600px' }}
    >
      <Group justify="center" gap={20}>
        <IconBluetoothOff color="red" size={50} stroke={1} />
        <Box>
          <Text fw={500} size="lg">
            Device is not connected
          </Text>
          <Text mt="xs" c="dimmed" size="sm">
            Please click on the CONNECT button to select and pair a Bluetooth device.
          </Text>
        </Box>
      </Group>
    </Card>
  );
};

export default Disconnected;
