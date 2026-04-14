import { FC } from 'react';
import { Grid, NumberInput, Select, Stack } from '@mantine/core';
import { BAUD_RATES, DATA_BITS_OPTIONS, PARITY_OPTIONS, STOP_BITS_OPTIONS } from '@/constants/configOptions';
import type { UARTConfig as UARTConfigType } from '@/types/modbus.types';

interface UARTConfigProps {
  config: UARTConfigType;
  onChange: (config: UARTConfigType) => void;
}

const UARTConfig: FC<UARTConfigProps> = ({ config, onChange }) => {
  const updateConfig = (updates: Partial<UARTConfigType>) => {
    onChange({ ...config, ...updates });
  };

  return (
    <Stack gap="md">
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Baud Rate"
            value={String(config.baud_rate)}
            onChange={(value) => updateConfig({ baud_rate: Number(value) })}
            data={BAUD_RATES.map((rate) => ({ value: String(rate), label: String(rate) }))}
            required
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Data Bits"
            value={String(config.data_bits)}
            onChange={(value) => updateConfig({ data_bits: Number(value) as 7 | 8 })}
            data={DATA_BITS_OPTIONS.map((bits) => ({ value: String(bits.value), label: bits.label }))}
            required
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Parity"
            value={config.parity}
            onChange={(value) => updateConfig({ parity: value as 'none' | 'even' | 'odd' })}
            data={PARITY_OPTIONS.map((p) => ({
              value: p.value,
              label: p.label,
            }))}
            required
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Stop Bits"
            value={String(config.stop_bits)}
            onChange={(value) => updateConfig({ stop_bits: Number(value) as 1 | 2 })}
            data={STOP_BITS_OPTIONS.map((bits) => ({ value: String(bits.value), label: bits.label }))}
            required
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <NumberInput
            label="Timeout (ms)"
            value={config.timeout_ms}
            onChange={(value) => updateConfig({ timeout_ms: Number(value) })}
            min={100}
            max={5000}
            step={100}
            required
          />
        </Grid.Col>
      </Grid>
    </Stack>
  );
};

export default UARTConfig;
