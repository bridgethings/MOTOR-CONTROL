import { FC } from 'react';
import { Grid, PasswordInput, Radio, Stack, Switch, TextInput } from '@mantine/core';
import type { WiFiConfig as WiFiConfigType } from '@/types/network.types';

interface WiFiConfigProps {
  config: WiFiConfigType;
  onChange: (config: WiFiConfigType) => void;
}

const WiFiConfig: FC<WiFiConfigProps> = ({ config, onChange }) => {
  const updateConfig = (updates: Partial<WiFiConfigType>) => {
    onChange({ ...config, ...updates });
  };

  const updateStaticConfig = (field: string, value: string) => {
    const defaultStaticConfig = {
      ip: '',
      subnet: '',
      gateway: '',
      dns1: '8.8.8.8',
      dns2: '8.8.4.4',
    };
    onChange({
      ...config,
      static_config: {
        ...(config.static_config || defaultStaticConfig),
        [field]: value,
      },
    });
  };

  return (
    <Stack gap="md">
      <Switch
        label="Enable WiFi"
        checked={config.enabled}
        onChange={(e) => updateConfig({ enabled: e.currentTarget.checked })}
      />

      <TextInput
        label="SSID (Network Name)"
        placeholder="MyWiFiNetwork"
        value={config.ssid}
        onChange={(e) => updateConfig({ ssid: e.currentTarget.value })}
        required
      />

      <PasswordInput
        label="WiFi Password"
        placeholder="Enter WiFi password"
        value={config.password || ''}
        onChange={(e) => updateConfig({ password: e.currentTarget.value })}
      />

      <Radio.Group
        label="IP Configuration Mode"
        value={config.mode}
        onChange={(value) => updateConfig({ mode: value as 'dhcp' | 'static' })}
      >
        <Stack gap="xs" mt="xs">
          <Radio value="dhcp" label="DHCP (Automatic)" />
          <Radio value="static" label="Static IP" />
        </Stack>
      </Radio.Group>

      {config.mode === 'static' && (
        <Stack gap="sm">
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="IP Address"
                placeholder="192.168.1.101"
                value={config.static_config?.ip || ''}
                onChange={(e) => updateStaticConfig('ip', e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Subnet Mask"
                placeholder="255.255.255.0"
                value={config.static_config?.subnet || ''}
                onChange={(e) => updateStaticConfig('subnet', e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Gateway"
                placeholder="192.168.1.1"
                value={config.static_config?.gateway || ''}
                onChange={(e) => updateStaticConfig('gateway', e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Primary DNS"
                placeholder="8.8.8.8"
                value={config.static_config?.dns1 || ''}
                onChange={(e) => updateStaticConfig('dns1', e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Secondary DNS"
                placeholder="8.8.4.4"
                value={config.static_config?.dns2 || ''}
                onChange={(e) => updateStaticConfig('dns2', e.currentTarget.value)}
              />
            </Grid.Col>
          </Grid>
        </Stack>
      )}
    </Stack>
  );
};

export default WiFiConfig;
