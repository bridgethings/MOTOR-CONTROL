import { FC } from 'react';
import { Group, Text, Title, Badge, Box } from '@mantine/core';
import BluetoothButton from './BluetoothButton';

const Header: FC<{}> = () => {
  return (
    <Group h="100%" px="md" justify="space-between">
      <Group>
        <Title order={3}>ESP32 4G Controller</Title>
      </Group>

      <Group>
        <BluetoothButton />
      </Group>
    </Group>
  );
};

export default Header;
