import { FC, useState } from 'react';
import {
  IconCloudDownload,
  IconWifi,
  IconRefresh,
  IconUpload,
  IconCheck,
  IconAlertTriangle,
  IconCpu,
  IconArrowBack,
} from '@tabler/icons-react';
import {
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  PasswordInput,
  NumberInput,
  Badge,
  Progress,
  Alert,
  Code,
  CopyButton,
  ActionIcon,
  Tooltip,
  Divider,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import ConfigCard from '@/components/Configuration/Common/ConfigCard';
import useConfiguration from '@/hooks/useConfiguration';

interface FirmwareInfo {
  firmware_version: string;
  build_date: string;
  partition_info: string;
  free_heap: number;
  flash_size: number;
}

interface OTAProgress {
  state: number;
  progress: number;
  bytes_written: number;
  total_bytes: number;
  message: string;
  error_code?: number;
}

const SystemPage: FC = () => {
  const config = useConfiguration();

  // Firmware info state
  const [firmwareInfo, setFirmwareInfo] = useState<FirmwareInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);

  // Local OTA state
  const [apSSID, setApSSID] = useState('BT_GW_OTA');
  const [apPassword, setApPassword] = useState('paramount123');
  const [apTimeout, setApTimeout] = useState(300);
  const [apActive, setApActive] = useState(false);
  const [apInfo, setApInfo] = useState<{ ssid: string; ip: string; url: string } | null>(null);
  const [isStartingAP, setIsStartingAP] = useState(false);

  // Cloud OTA state
  const [firmwareURL, setFirmwareURL] = useState('');
  const [md5Hash, setMd5Hash] = useState('');
  const [otaProgress, setOtaProgress] = useState<OTAProgress | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadFirmwareInfo = async () => {
    if (!config.api) return;

    setIsLoadingInfo(true);
    try {
      const response = await config.api.sendCommand({
        cmd: 'GET_VERSION',
        section: 'system',
        data: {},
      });

      if (response.status === 'success' && response.data) {
        setFirmwareInfo(response.data as FirmwareInfo);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      notifications.show({
        message: `Failed to load firmware info: ${message}`,
        color: 'red',
      });
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const startLocalOTA = async () => {
    if (!config.api) return;

    if (apPassword.length < 8) {
      notifications.show({
        message: 'Password must be at least 8 characters',
        color: 'red',
      });
      return;
    }

    setIsStartingAP(true);
    try {
      const response = await config.api.sendCommand({
        cmd: 'START_OTA_AP',
        section: 'system',
        data: {
          ssid: apSSID,
          password: apPassword,
          timeout_sec: apTimeout,
        },
      });

      if (response.status === 'success' && response.data) {
        setApActive(true);
        setApInfo({
          ssid: response.data.ssid,
          ip: response.data.ip,
          url: response.data.url,
        });

        notifications.show({
          message: 'OTA Access Point started! Connect to the WiFi network.',
          color: 'green',
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      notifications.show({
        message: `Failed to start OTA AP: ${message}`,
        color: 'red',
      });
    } finally {
      setIsStartingAP(false);
    }
  };

  const stopOTA = async () => {
    if (!config.api) return;

    try {
      await config.api.sendCommand({
        cmd: 'STOP_OTA',
        section: 'system',
        data: {},
      });

      setApActive(false);
      setApInfo(null);
      setIsUpdating(false);
      setOtaProgress(null);

      notifications.show({
        message: 'OTA cancelled',
        color: 'blue',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      notifications.show({
        message: `Failed to stop OTA: ${message}`,
        color: 'red',
      });
    }
  };

  const startCloudOTA = async () => {
    if (!config.api) return;

    if (!firmwareURL.startsWith('http://') && !firmwareURL.startsWith('https://')) {
      notifications.show({
        message: 'Please enter a valid HTTP/HTTPS URL',
        color: 'red',
      });
      return;
    }

    setIsUpdating(true);
    setOtaProgress({ state: 0, progress: 0, bytes_written: 0, total_bytes: 0, message: 'Starting download...' });

    try {
      const response = await config.api.sendCommand(
        {
          cmd: 'OTA_UPDATE',
          section: 'system',
          data: {
            url: firmwareURL,
            md5: md5Hash || undefined,
          },
        },
        120000
      ); // 2 minute timeout for OTA

      if (response.status === 'error') {
        throw new Error(response.message || 'OTA failed');
      }

      // OTA started - device will send progress updates and eventually reboot
      notifications.show({
        message: 'Firmware download started. Device will reboot when complete.',
        color: 'blue',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      notifications.show({
        message: `OTA failed: ${message}`,
        color: 'red',
      });
      setIsUpdating(false);
      setOtaProgress(null);
    }
  };

  const triggerRollback = async () => {
    if (!config.api) return;

    const confirmed = window.confirm(
      'Are you sure you want to rollback to the previous firmware version? The device will reboot.'
    );

    if (!confirmed) return;

    try {
      await config.api.sendCommand({
        cmd: 'ROLLBACK',
        section: 'system',
        data: {},
      });

      notifications.show({
        message: 'Rolling back to previous firmware...',
        color: 'blue',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      notifications.show({
        message: `Rollback failed: ${message}`,
        color: 'red',
      });
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="xl" fw={700}>
          System & Firmware
        </Text>
        <Button
          variant="light"
          leftSection={<IconRefresh size={16} />}
          onClick={loadFirmwareInfo}
          loading={isLoadingInfo}
          disabled={!config.api}
        >
          Refresh
        </Button>
      </Group>

      {/* Current Firmware Info */}
      <ConfigCard title="Firmware Information" icon={<IconCpu size={20} />}>
        {firmwareInfo ? (
          <Stack gap="sm">
            <Group>
              <Text fw={500}>Version:</Text>
              <Badge size="lg" variant="filled" color="blue">
                {firmwareInfo.firmware_version}
              </Badge>
            </Group>
            <Group>
              <Text fw={500}>Build Date:</Text>
              <Text c="dimmed">{firmwareInfo.build_date}</Text>
            </Group>
            <Divider my="xs" />
            <Group>
              <Text fw={500}>Free Heap:</Text>
              <Text c="dimmed">{(firmwareInfo.free_heap / 1024).toFixed(1)} KB</Text>
            </Group>
            <Group>
              <Text fw={500}>Flash Size:</Text>
              <Text c="dimmed">{(firmwareInfo.flash_size / 1024 / 1024).toFixed(1)} MB</Text>
            </Group>
          </Stack>
        ) : (
          <Text c="dimmed">Click Refresh to load firmware information</Text>
        )}
      </ConfigCard>

      {/* Local OTA via SoftAP */}
      <ConfigCard title="Local OTA Update (WiFi AP Mode)" icon={<IconWifi size={20} />}>
        <Stack gap="md">
          <Alert icon={<IconAlertTriangle size={16} />} color="yellow">
            This will temporarily disconnect the gateway from the network and create a WiFi hotspot for firmware
            upload. BLE connection may be lost during the update.
          </Alert>

          {!apActive ? (
            <>
              <TextInput
                label="AP Network Name (SSID)"
                value={apSSID}
                onChange={(e) => setApSSID(e.currentTarget.value)}
                placeholder="BT_GW_OTA"
              />
              <PasswordInput
                label="AP Password"
                value={apPassword}
                onChange={(e) => setApPassword(e.currentTarget.value)}
                description="Minimum 8 characters"
              />
              <NumberInput
                label="Timeout (seconds)"
                value={apTimeout}
                onChange={(val) => setApTimeout(val as number)}
                min={60}
                max={600}
                step={30}
                description="AP will auto-disable after this time if no update occurs"
              />
              <Button leftSection={<IconUpload size={16} />} onClick={startLocalOTA} loading={isStartingAP} disabled={!config.api}>
                Start OTA Access Point
              </Button>
            </>
          ) : (
            <>
              <Alert icon={<IconWifi size={16} />} color="green" title="OTA Access Point Active">
                <Stack gap="xs">
                  <Text size="sm">
                    <strong>1.</strong> Disconnect from this BLE connection
                  </Text>
                  <Text size="sm">
                    <strong>2.</strong> Connect your device to WiFi network:{' '}
                    <Code fw={700}>{apInfo?.ssid}</Code>
                  </Text>
                  <Text size="sm">
                    <strong>3.</strong> Open browser and go to:
                  </Text>
                  <Group gap="xs" wrap="wrap" mt="xs">
                    <Code fw={700}>{apInfo?.url}</Code>
                    <CopyButton value={apInfo?.url || ''}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Copied!' : 'Copy URL'}>
                          <ActionIcon size="sm" variant="subtle" onClick={copy} color={copied ? 'green' : 'gray'}>
                            {copied ? <IconCheck size={14} /> : <IconUpload size={14} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                  </Group>
                  <Text size="sm">
                    <strong>4.</strong> Upload the .bin firmware file
                  </Text>
                </Stack>
              </Alert>
              <Button color="red" variant="outline" onClick={stopOTA}>
                Cancel OTA Mode
              </Button>
            </>
          )}
        </Stack>
      </ConfigCard>

      {/* Cloud OTA */}
      <ConfigCard title="Cloud OTA Update (URL Download)" icon={<IconCloudDownload size={20} />}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Download firmware directly from a URL.
          </Text>

          <TextInput
            label="Firmware URL"
            placeholder="https://bridgethings.com/user/repo/releases/download/v1.0/firmware.bin"
            value={firmwareURL}
            onChange={(e) => setFirmwareURL(e.currentTarget.value)}
            description="URL to firmware binary file (.bin)"
          />
          <TextInput
            label="MD5 Hash (Optional)"
            placeholder="e.g., d41d8cd98f00b204e9800998ecf8427e"
            value={md5Hash}
            onChange={(e) => setMd5Hash(e.currentTarget.value)}
            description="32-character MD5 hash for integrity verification"
          />

          {otaProgress && (
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" fw={500}>
                  {otaProgress.message}
                </Text>
                <Badge>{otaProgress.progress}%</Badge>
              </Group>
              <Progress value={otaProgress.progress} animated={isUpdating} size="lg" />
              {otaProgress.total_bytes > 0 && (
                <Text size="xs" c="dimmed" ta="center">
                  {(otaProgress.bytes_written / 1024).toFixed(0)} / {(otaProgress.total_bytes / 1024).toFixed(0)} KB
                </Text>
              )}
            </Stack>
          )}

          <Group>
            <Button
              leftSection={<IconCloudDownload size={16} />}
              onClick={startCloudOTA}
              loading={isUpdating}
              disabled={!firmwareURL || isUpdating || !config.api}
            >
              Download & Update
            </Button>
            {isUpdating && (
              <Button color="red" variant="outline" onClick={stopOTA}>
                Cancel
              </Button>
            )}
          </Group>
        </Stack>
      </ConfigCard>

      {/* Rollback Section */}
      <ConfigCard title="Firmware Rollback" icon={<IconArrowBack size={20} />}>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            If the current firmware has issues, you can rollback to the previous version.
          </Text>
          <Button color="orange" variant="outline" leftSection={<IconArrowBack size={16} />} onClick={triggerRollback} disabled={!config.api}>
            Rollback to Previous Version
          </Button>
        </Stack>
      </ConfigCard>
    </Stack>
  );
};

export default SystemPage;
