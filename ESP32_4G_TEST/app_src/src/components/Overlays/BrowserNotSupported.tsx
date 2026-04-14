import { FC } from 'react';
import { IconWorldOff } from '@tabler/icons-react';
import { Anchor, Box, Card, Group, Text } from '@mantine/core';

const BrowserNotSupported: FC<{}> = () => {
  return (
    <Card shadow="sm" padding="xl" component="div" style={{ zIndex: 7, margin: 15 }}>
      <Group justify="center" gap={20}>
        <IconWorldOff color="red" size={50} stroke={1} />
        <Box>
          <Text fw={500} size="lg">
            Your browser can't use Web Bluetooth
          </Text>

          <Text mt="xs" c="dimmed" size="sm">
            Your web browser does not support Web Bluetooth API, please open this page in another{' '}
            <Anchor
              href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility"
              target="_blank"
            >
              browser
            </Anchor>{' '}
            that supports Web Bluetooth.
          </Text>
        </Box>
      </Group>
    </Card>
  );
};

export default BrowserNotSupported;
