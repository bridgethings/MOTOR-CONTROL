import { FC } from 'react';
import { Grid, PasswordInput, Select, Stack, Switch, TextInput } from '@mantine/core';
import type { ModemConfig as ModemConfigType } from '@/types/network.types';

interface ModemConfigProps {
  config: ModemConfigType;
  onChange: (config: ModemConfigType) => void;
}

const ModemConfig: FC<ModemConfigProps> = ({ config, onChange }) => {
  const updateConfig = (updates: Partial<ModemConfigType>) => {
    onChange({ ...config, ...updates });
  };

  return (
    <Stack gap="md">
      <Switch
        label="Enable 4G Modem"
        checked={config.enabled}
        onChange={(e) => updateConfig({ enabled: e.currentTarget.checked })}
      />

      <Grid>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            label="APN"
            placeholder="internet"
            value={config.apn}
            onChange={(e) => updateConfig({ apn: e.currentTarget.value })}
            description="Access Point Name from your carrier"
            required
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            label="Username"
            placeholder="Optional"
            value={config.username || ''}
            onChange={(e) => updateConfig({ username: e.currentTarget.value })}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <PasswordInput
            label="Password"
            placeholder="Optional"
            value={config.password || ''}
            onChange={(e) => updateConfig({ password: e.currentTarget.value })}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Network Mode"
            value={config.network_mode}
            onChange={(value) => updateConfig({ network_mode: (value as any) || 'auto' })}
            data={[
              { value: 'auto', label: 'Auto (LTE/3G/2G)' },
              { value: 'lte_only', label: 'LTE Only' },
              { value: '3g_only', label: '3G Only' },
              { value: '2g_only', label: '2G Only' },
            ]}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="IP Version"
            value={config.ip_version}
            onChange={(value) => updateConfig({ ip_version: (value as any) || 'ipv4' })}
            data={[
              { value: 'ipv4', label: 'IPv4' },
              { value: 'ipv6', label: 'IPv6' },
              { value: 'ipv4v6', label: 'IPv4/IPv6 (Dual Stack)' },
            ]}
          />
        </Grid.Col>
      </Grid>
    </Stack>
  );
};

export default ModemConfig;
