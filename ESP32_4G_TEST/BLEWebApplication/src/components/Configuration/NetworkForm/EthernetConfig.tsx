import { FC } from 'react';
import { Grid, Radio, Stack, Switch, TextInput } from '@mantine/core';
import type { EthernetConfig as EthernetConfigType } from '@/types/network.types';

interface EthernetConfigProps {
  config: EthernetConfigType;
  onChange: (config: EthernetConfigType) => void;
}

const EthernetConfig: FC<EthernetConfigProps> = ({ config, onChange }) => {
  const updateConfig = (updates: Partial<EthernetConfigType>) => {
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
        label="Enable Ethernet"
        checked={config.enabled}
        onChange={(e) => updateConfig({ enabled: e.currentTarget.checked })}
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
                placeholder="192.168.1.100"
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

export default EthernetConfig;
