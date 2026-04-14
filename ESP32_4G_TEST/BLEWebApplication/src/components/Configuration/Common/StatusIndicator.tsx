import { FC } from 'react';
import { Badge, Group, Loader, Text } from '@mantine/core';
import useBluetooth from '@/hooks/useBluetooth';
import useConfiguration from '@/hooks/useConfiguration';

export const StatusIndicator: FC = () => {
  const bluetooth = useBluetooth();
  const config = useConfiguration();

  return (
    <Group gap="sm">
      <Badge color={bluetooth.isConnected ? 'green' : 'red'} variant="dot" size="lg">
        {bluetooth.isConnected ? 'Connected' : 'Disconnected'}
      </Badge>

      {bluetooth.isConnected && bluetooth.device && (
        <Text size="sm" c="dimmed">
          {bluetooth.device.name}
        </Text>
      )}

      {config.isLoading && (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            Loading...
          </Text>
        </Group>
      )}
    </Group>
  );
};

export default StatusIndicator;
