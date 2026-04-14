import { FC, JSX, useEffect, useRef, useState } from 'react';
import { IconPlayerPlay, IconPlayerStop, IconTrashX } from '@tabler/icons-react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Input,
  rem,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  Tooltip,
  useMantineColorScheme,
  useMatches,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import useBluetooth from '@/hooks/useBluetooth';
import useBluetoothService from '@/hooks/useBluetoothService';
import useLoader from '@/hooks/useLoader';
import dataviewToString from '@/utils/dataviewToString';
import sliceStringIntoChunks from '@/utils/sliceStringIntoChunks';
import stringToUint8Array from '@/utils/stringToUint8Array';
import classes from './Terminal.module.css';

interface TerminalProps {}

interface LogMessage {
  type: 'log';
  data: string;
}

const Terminal: FC<TerminalProps> = () => {
  const serviceUUID = __APP_SPP_BLE_SERVICE__;
  const characteristicUUID = __APP_SPP_BLE_CHARACTERISTIC__;

  const loader = useLoader();

  const bluetooth = useBluetooth();
  const { colorScheme } = useMantineColorScheme();

  if (!serviceUUID || !characteristicUUID) {
    return (
      <Box p="xl">
        <Text c="red" fw={700}>Configuration Error</Text>
        <Text size="sm">BLE Service or Characteristic UUID is missing. Please check your build configuration.</Text>
      </Box>
    );
  }

  const viewportRef = useRef<HTMLDivElement>(null);
  const viewportSize = useMatches({
    base: 'calc(100vh - var(--app-shell-header-height) - var(--app-shell-footer-height) - 32vh)',
    md: 'calc(100vh - var(--app-shell-header-height) - var(--app-shell-footer-height) - 17vh)',
  });

  const [command, setCommand] = useState<string>('');
  const [echoing, setEchoing] = useState<boolean>(true);
  const [content, setContent] = useState<(string | JSX.Element)[]>([]);
  const [lineTerminator, setLineTerminator] = useState<string | null>('CR-LF');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [responseBuffer, setResponseBuffer] = useState<string>('');

  const clear = () => setContent([]);

  const append = (content: string | JSX.Element) => setContent((prev) => [...prev, content]);

  const appendLog = (logText: string) => {
    const lines = logText.split('\n').filter((l) => l.trim());
    lines.forEach((line, index) => {
      // Color-code based on content — adjusted for light background
      let color = 'dark.4';
      if (line.includes('[ERROR]') || line.includes('fail') || line.includes('Failed')) color = 'red.8';
      else if (line.includes('[MODBUS]')) color = 'cyan.8';
      else if (line.includes('[TELEM]') || line.includes('[MQTT]')) color = 'teal.8';
      else if (line.includes('[BLE]')) color = 'indigo.7';
      else if (line.includes('OK') || line.includes('success')) color = 'green.8';

      setContent((prev) => [
        ...prev,
        <Group key={`log-${Date.now()}-${index}`} gap={4} wrap="nowrap" align="flex-start">
          <Text size="xs" c="gray.6" ff="monospace" style={{ flexShrink: 0 }}>
            {new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })} »
          </Text>
          <Text
            size="xs"
            c={color}
            ff="monospace"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
          >
            {line}
          </Text>
        </Group>,
      ]);
    });
  };

  const service = useBluetoothService({ uuid: serviceUUID });

  const characteristic = service.useBluetoothCharacteristic({
    uuid: characteristicUUID,
    onValueChanged: (value: DataView | undefined) => {
      if (value) {
        const receivedContent = dataviewToString(value);

        // Buffer data and process complete JSON lines
        const fullData = responseBuffer + receivedContent;

        // Split by newlines to find complete messages
        const parts = fullData.split('\n');

        // Last part might be incomplete, keep it in buffer
        const incompletePart = parts.pop() || '';
        setResponseBuffer(incompletePart);

        // Process complete lines
        parts.forEach((line) => {
          if (!line.trim()) return;

          try {
            const json = JSON.parse(line.trim());
            if (json.type === 'log') {
              // Log message - display with distinct styling
              appendLog(json.data);
            } else {
              // Command response or other JSON - display formatted
              append(
                <Text
                  key={`resp-${Date.now()}`}
                  size="sm"
                  ff="monospace"
                  c={json.status === 'error' ? 'red' : 'green'}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {JSON.stringify(json, null, 2)}
                </Text>
              );
            }
          } catch {
            // Plain text - display as-is
            append(line);
          }
        });
      }
    },
  });

  const send = async () => {
    const chunks = prepareData();

    try {
      for (let i = 0; i < chunks.length; i++) {
        await characteristic.characteristic?.writeValueWithoutResponse(
          stringToUint8Array(chunks[i])
        );
      }
      setCommand('');
    } catch (error) {
      notifications.show({ message: 'Failed to send data to the connected device.', color: 'red' });
    }
  };

  const sendCommand = async (cmd: object) => {
    const jsonCommand = JSON.stringify(cmd) + '\n';
    const chunks = sliceStringIntoChunks(jsonCommand, 512);

    try {
      for (const chunk of chunks) {
        await characteristic.characteristic?.writeValueWithoutResponse(stringToUint8Array(chunk));
      }
    } catch (error) {
      notifications.show({ message: 'Failed to send command.', color: 'red' });
    }
  };

  const toggleLogStream = async () => {
    if (isStreaming) {
      // Stop streaming
      await sendCommand({ cmd: 'STOP_LOG_STREAM', section: 'system', data: {} });
      setIsStreaming(false);
      notifications.show({ message: 'Log streaming stopped', color: 'blue' });
    } else {
      // Start streaming
      await sendCommand({ cmd: 'START_LOG_STREAM', section: 'system', data: {} });
      setIsStreaming(true);
      notifications.show({ message: 'Log streaming started', color: 'green' });
    }
  };

  const prepareData = (): string[] => {
    const ltMap: Record<string, string> = {
      None: '',
      'CR-LF': '\r\n',
      CR: '\r',
      LF: '\n',
    };

    let data = command;
    if (lineTerminator !== null && lineTerminator !== 'None') {
      data += ltMap[lineTerminator];
    }

    if (echoing) {
      append(
        <span key={content.length} style={{ color: '#0080FF' }}>
          {data}
        </span>
      );
    }
    return sliceStringIntoChunks(data);
  };

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [content]);

  useEffect(() => {
    // Safety: ensure loader is cleared when terminal is active and we are connected
    if (bluetooth.isConnected) {
      loader.setLoading(false);
    }
  }, [bluetooth.isConnected, loader]);

  useEffect(() => {
    if (characteristic.characteristic) {
      loader.setLoading(false);
    }
  }, [characteristic.characteristic]);

  // Stop streaming when component unmounts
  useEffect(() => {
    return () => {
      if (isStreaming && characteristic.characteristic) {
        sendCommand({ cmd: 'STOP_LOG_STREAM', section: 'system', data: {} });
      }
    };
  }, [isStreaming]);

  return (
    <>
      <Box
        style={{
          marginBottom: 15,
          marginTop: 5,
          overflow: 'hidden',
          maxHeight:
            'calc(100vh - var(--app-shell-header-height) - var(--app-shell-footer-height))',
        }}
        flex={1}
        display="flex"
      >
        <Stack align="stretch" justify="space-between" flex={1}>
          <Box
            style={(theme) => ({
              position: 'relative',
              background: '#ffffff',
              borderRadius: theme.radius.lg,
              boxShadow: theme.shadows.sm,
              border: `1px solid ${theme.colors.gray[3]}`,
              maxHeight: viewportSize,
              minHeight: viewportSize,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            })}
          >
            {/* Terminal Header */}
            <Group justify="space-between" px="md" py="xs" style={(theme) => ({ background: theme.colors.gray[1], borderBottom: `1px solid ${theme.colors.gray[3]}` })}>
              <Group gap={6}>
                <Box style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
                <Box style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
                <Box style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
                <Text size="xs" c="gray.7" ml="xs" fw={600} ff="monospace">SYSTEM CONSOLE</Text>
              </Group>
              <Badge size="xs" color={isStreaming ? 'teal' : 'gray'} variant="dot">
                {isStreaming ? 'LIVE' : 'OFFLINE'}
              </Badge>
            </Group>

            <ScrollArea
              bg="transparent"
              style={{
                flex: 1,
                padding: '10px 15px',
              }}
              viewportRef={viewportRef}
              component="div"
              className={classes.viewportPre}
            >
              <Stack gap={2}>
                {content.length === 0 && (
                  <Text c="gray.5" size="xs" ff="monospace">Ready for connection...</Text>
                )}
                {content}
              </Stack>
            </ScrollArea>
            
            {/* Floating Actions */}
            <Group
              style={{ position: 'absolute', bottom: 15, right: 15, zIndex: 4 }}
              gap="xs"
            >
              <Tooltip label={isStreaming ? 'Stop Live Logs' : 'Start Live Logs'}>
                <ActionIcon
                  variant="filled"
                  radius="md"
                  color={isStreaming ? 'teal.6' : 'gray.5'}
                  onClick={toggleLogStream}
                >
                  {isStreaming ? (
                    <IconPlayerStop size={18} stroke={2} />
                  ) : (
                    <IconPlayerPlay size={18} stroke={2} />
                  )}
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Clear Console">
                <ActionIcon
                  variant="filled"
                  radius="md"
                  color="red.6"
                  onClick={clear}
                >
                  <IconTrashX size={18} stroke={2} />
                </ActionIcon>
              </Tooltip>
            </Group>
            
            <Switch
              radius="md"
              size="xs"
              label="Echo"
              labelPosition="left"
              color="teal"
              styles={{ label: { color: '#555', fontSize: '10px', fontWeight: 700 } }}
              checked={echoing}
              style={{ position: 'absolute', bottom: 15, left: 15, zIndex: 4 }}
              onChange={(e) => setEchoing(e.currentTarget.checked)}
            />
          </Box>
          <Grid justify="space-between" align="flex-end">
            <Grid.Col span={{ xs: 12, md: 'auto' }}>
              <Input
                placeholder="Type a command or JSON"
                value={command}
                onKeyDown={(e) => {
                  if (e.code === 'Enter') {
                    send();
                  }
                }}
                onChange={(event) => {
                  setCommand(event.currentTarget.value);
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ xs: 6, md: 1 }}>
              <Select
                label="Line terminator"
                value={lineTerminator}
                data={['None', 'CR-LF', 'CR', 'LF']}
                allowDeselect={false}
                onChange={setLineTerminator}
              />
            </Grid.Col>
            <Grid.Col span={{ xs: 12, md: 'content' }}>
              <Button variant="outline" onClick={send}>
                Send
              </Button>
            </Grid.Col>
          </Grid>
        </Stack>
      </Box>
    </>
  );
};

export default Terminal;
