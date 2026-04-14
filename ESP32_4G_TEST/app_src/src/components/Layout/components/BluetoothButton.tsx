import { FC, useEffect } from 'react';
import { IconBluetooth, IconBluetoothConnected, IconBluetoothX, IconWifi } from '@tabler/icons-react';
import { ActionIcon, Affix, Badge, Button, Group, Text } from '@mantine/core';
import useBluetooth from '@/hooks/useBluetooth';
import useConnection from '@/hooks/useConnection';
import useLoader from '@/hooks/useLoader';

const BluetoothButton: FC<{}> = () => {
  const bluetooth = useBluetooth();
  const connection = useConnection();
  const loader = useLoader();

  // In WebSocket mode, show a connected badge instead of BLE button
  if (connection.mode === 'websocket') {
    return (
      <Group justify="flex-end" visibleFrom="sm">
        <Badge
          leftSection={<IconWifi size={14} />}
          variant="light"
          color={connection.isConnected ? 'green' : 'orange'}
          size="lg"
        >
          {connection.isConnected ? 'Connected (LAN)' : 'Connecting...'}
        </Badge>
      </Group>
    );
  }

  // Clear loading state when connection completes (success or failure)
  useEffect(() => {
    if (!bluetooth.isConnecting) {
      loader.setLoading(false);
    }
  }, [bluetooth.isConnecting, loader]);

  const handleButton = () => {
    if (bluetooth.isConnected) {
      bluetooth.disconnect();
    } else {
      loader.setLoading(true);

      // SPP service UUID
      bluetooth.connect([__APP_SPP_BLE_SERVICE__]);
    }
  };

  return (
    <>
      <Group justify="flex-end" visibleFrom="sm">
        {bluetooth.isConnected && (
          <Text style={{ fontWeight: 500, fontSize: 14 }}> {bluetooth.device!.name ?? ''}</Text>
        )}
        <Button
          loading={bluetooth.isConnecting}
          loaderProps={{ type: 'dots' }}
          leftSection={
            bluetooth.isSupported ? (
              bluetooth.isConnected ? (
                <IconBluetoothConnected size={14} />
              ) : (
                <IconBluetooth size={14} />
              )
            ) : (
              <IconBluetoothX size={14} />
            )
          }
          variant="light"
          radius="lg"
          color={bluetooth.isSupported ? (bluetooth.isConnected ? 'red' : 'blue') : 'red'}
          onClick={handleButton}
          disabled={!bluetooth.isSupported}
        >
          {bluetooth.isConnected ? 'DISCONNECT' : 'CONNECT'}
        </Button>
      </Group>

      <Affix position={{ bottom: 58, right: 20 }} hiddenFrom="sm">
        <ActionIcon
          variant="filled"
          size="xl"
          radius="xl"
          color={bluetooth.isSupported ? (bluetooth.isConnected ? 'red' : 'blue') : 'red'}
          aria-label="Bluetooth"
          disabled={!bluetooth.isSupported}
          loading={bluetooth.isConnecting}
          loaderProps={{ type: 'dots' }}
          onClick={handleButton}
        >
          {bluetooth.isSupported ? (
            bluetooth.isConnected ? (
              <IconBluetoothConnected style={{ width: '70%', height: '70%' }} stroke={1.5} />
            ) : (
              <IconBluetooth style={{ width: '70%', height: '70%' }} stroke={1.5} />
            )
          ) : (
            <IconBluetoothX style={{ width: '70%', height: '70%' }} stroke={1.5} />
          )}
        </ActionIcon>
      </Affix>
    </>
  );
};

export default BluetoothButton;
