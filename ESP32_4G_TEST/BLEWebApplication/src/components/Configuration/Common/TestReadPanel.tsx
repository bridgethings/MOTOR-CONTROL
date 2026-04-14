import { FC, Fragment, useState } from 'react';
import { IconPlayerPlay, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import {
  Accordion,
  Badge,
  Box,
  Button,
  Code,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { BAUD_RATES } from '@/constants/configOptions';
import useConfiguration from '@/hooks/useConfiguration';
import type { TestReadResult, TestReadParameter, TestReadInterpretations } from '@/types/modbus.types';

interface TestReadPanelProps {
  profileId: string;
  defaultSlaveId?: number;
}

/** Labels for endianness columns */
const ENDIAN_LABELS: { key: string; label: string; desc: string }[] = [
  { key: 'ABCD', label: 'Big (ABCD)', desc: 'No swap' },
  { key: 'CDAB', label: 'Mid-Little (CDAB)', desc: 'Word swap' },
  { key: 'BADC', label: 'Mid-Big (BADC)', desc: 'Byte swap' },
  { key: 'DCBA', label: 'Little (DCBA)', desc: 'Both swap' },
];

/** Format a number for display — show 4 decimal places for floats */
const fmtNum = (val: number | null | undefined): string => {
  if (val === null || val === undefined) return '—';
  if (typeof val !== 'number') return String(val);
  if (!isFinite(val)) return String(val);
  if (Number.isInteger(val)) return String(val);
  return val.toFixed(4);
};

/** Renders all interpretations for a single parameter in a dedicated table */
const InterpretationTable: FC<{ param: TestReadParameter }> = ({ param }) => {
  const interp = param.interpretations;

  return (
    <Box bg="gray.0" p="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
      {/* Raw register info */}
      <Group gap="xs" mb="xs" wrap="wrap">
        <Text size="xs" fw={600}>Raw HEX:</Text>
        <Code ff="monospace">{param.raw_hex || '—'}</Code>
        <Text size="xs" fw={600} ml="xs">Bytes (ABCD):</Text>
        <Code ff="monospace">{param.raw_bytes || '—'}</Code>
        <Text size="xs" fw={600} ml="xs">Reg0:</Text>
        <Code ff="monospace">{param.reg0 ?? '—'}</Code>
        <Text size="xs" fw={600} ml="xs">Reg1:</Text>
        <Code ff="monospace">{param.reg1 ?? '—'}</Code>
      </Group>

      {interp ? (
        <Table withTableBorder striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ minWidth: 80 }}>Type</Table.Th>
              {ENDIAN_LABELS.map((e) => (
                <Table.Th key={e.key}>
                  <Text size="xs" fw={600}>{e.label}</Text>
                  <Text size="xs" c="dimmed">{e.desc}</Text>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {/* 16-bit rows (no endianness variation) */}
            <Table.Tr>
              <Table.Td><Text size="xs" fw={500}>UInt16</Text></Table.Td>
              <Table.Td colSpan={4}>
                <Text size="xs" ff="monospace">{interp.uint16 ?? '—'}</Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td><Text size="xs" fw={500}>Int16</Text></Table.Td>
              <Table.Td colSpan={4}>
                <Text size="xs" ff="monospace">{interp.int16 ?? '—'}</Text>
              </Table.Td>
            </Table.Tr>
            {/* Float32 — all 4 endianness */}
            <Table.Tr>
              <Table.Td><Text size="xs" fw={500}>Float32</Text></Table.Td>
              {ENDIAN_LABELS.map((e) => {
                const key = `float32_${e.key}` as keyof TestReadInterpretations;
                const val = interp[key] as number;
                return (
                  <Table.Td key={e.key}>
                    <Text size="xs" ff="monospace">{fmtNum(val)}</Text>
                  </Table.Td>
                );
              })}
            </Table.Tr>
            {/* UInt32 — all 4 endianness */}
            <Table.Tr>
              <Table.Td><Text size="xs" fw={500}>UInt32</Text></Table.Td>
              {ENDIAN_LABELS.map((e) => {
                const key = `uint32_${e.key}` as keyof TestReadInterpretations;
                return (
                  <Table.Td key={e.key}>
                    <Text size="xs" ff="monospace">{interp[key] ?? '—'}</Text>
                  </Table.Td>
                );
              })}
            </Table.Tr>
            {/* Int32 — all 4 endianness */}
            <Table.Tr>
              <Table.Td><Text size="xs" fw={500}>Int32</Text></Table.Td>
              {ENDIAN_LABELS.map((e) => {
                const key = `int32_${e.key}` as keyof TestReadInterpretations;
                return (
                  <Table.Td key={e.key}>
                    <Text size="xs" ff="monospace">{interp[key] ?? '—'}</Text>
                  </Table.Td>
                );
              })}
            </Table.Tr>
          </Table.Tbody>
        </Table>
      ) : (
        <Text size="xs" c="dimmed" fs="italic">
          No interpretation data received. Please re-flash firmware with the latest version.
        </Text>
      )}
    </Box>
  );
};

const TestReadPanel: FC<TestReadPanelProps> = ({ profileId, defaultSlaveId }) => {
  const config = useConfiguration();
  const [slaveId, setSlaveId] = useState<number>(defaultSlaveId ?? 1);
  const [baudRate, setBaudRate] = useState<string>(''); // empty = use current device baud
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedParams, setExpandedParams] = useState<Set<string>>(new Set());

  const toggleParam = (key: string) => {
    setExpandedParams((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleTestRead = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setExpandedParams(new Set());

    try {
      const baud = baudRate ? Number(baudRate) : undefined;
      const res = await config.testRead(slaveId, profileId, baud);
      console.log('TEST_READ response:', JSON.stringify(res, null, 2));
      setResult(res);
      // Auto-expand all params so interpretations are visible
      const allKeys = new Set<string>();
      res.blocks.forEach((block, bi) => {
        block.parameters.forEach((_, pi) => {
          allKeys.add(`${bi}-${pi}`);
        });
      });
      setExpandedParams(allKeys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test read failed');
    } finally {
      setLoading(false);
    }
  };

  const baudOptions = [
    { value: '', label: 'Current (no change)' },
    ...BAUD_RATES.map((r) => ({ value: String(r), label: String(r) })),
  ];

  return (
    <Stack gap="sm">
      <Group align="flex-end" wrap="wrap">
        <NumberInput
          label="Slave ID"
          value={slaveId}
          onChange={(v) => setSlaveId(Number(v))}
          min={1}
          max={247}
          w={100}
        />
        <Select
          label="Baud Rate"
          data={baudOptions}
          value={baudRate}
          onChange={(v) => setBaudRate(v || '')}
          w={180}
        />
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          onClick={handleTestRead}
          loading={loading}
        >
          Test Read
        </Button>
      </Group>

      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}

      {result && (
        <Stack gap="xs">
          <Group gap="xs">
            <Badge color="green" variant="light">
              {result.successful} OK
            </Badge>
            {result.failed > 0 && (
              <Badge color="red" variant="light">
                {result.failed} Failed
              </Badge>
            )}
            <Text size="xs" c="dimmed">
              Total: {result.total_parameters} parameters
            </Text>
          </Group>

          <Accordion
            variant="separated"
            defaultValue={result.blocks.length === 1 ? 'block-0' : undefined}
          >
            {result.blocks.map((block, bi) => (
              <Accordion.Item key={bi} value={`block-${bi}`}>
                <Accordion.Control>
                  <Group gap="xs">
                    <Text fw={500} size="sm">
                      {block.block_name}
                    </Text>
                    <Badge
                      size="xs"
                      color={block.status === 'ok' ? 'green' : 'red'}
                      variant="light"
                    >
                      {block.status}
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  {block.status === 'ok' ? (
                    <Stack gap="xs">
                      {/* Block-level raw hex dump */}
                      {block.raw_hex && (
                        <Group gap="xs">
                          <Text size="xs" fw={600}>Block Raw HEX:</Text>
                          <Code style={{ wordBreak: 'break-all', fontSize: 11 }}>
                            {block.raw_hex}
                          </Code>
                        </Group>
                      )}

                      {/* Parameters with interpretations */}
                      <Table withTableBorder striped>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th w={30}></Table.Th>
                            <Table.Th>Parameter</Table.Th>
                            <Table.Th>Addr</Table.Th>
                            <Table.Th>HEX</Table.Th>
                            <Table.Th>Decoded</Table.Th>
                            <Table.Th>Scaled</Table.Th>
                            <Table.Th>Unit</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {block.parameters.map((p, pi) => {
                            const paramKey = `${bi}-${pi}`;
                            const isExpanded = expandedParams.has(paramKey);
                            return (
                              <Fragment key={paramKey}>
                                <Table.Tr
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => toggleParam(paramKey)}
                                >
                                  <Table.Td>
                                    {isExpanded ? (
                                      <IconChevronDown size={14} />
                                    ) : (
                                      <IconChevronRight size={14} />
                                    )}
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="sm">{p.name}</Text>
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="xs" ff="monospace" c="dimmed">
                                      {p.absolute_address ?? '—'}
                                    </Text>
                                  </Table.Td>
                                  <Table.Td>
                                    <Code>{p.raw_hex || '—'}</Code>
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="sm" ff="monospace">
                                      {fmtNum(p.raw_value)}
                                    </Text>
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="sm" ff="monospace" fw={600}>
                                      {fmtNum(p.scaled_value)}
                                    </Text>
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="sm" c="dimmed">
                                      {p.unit}
                                    </Text>
                                  </Table.Td>
                                </Table.Tr>
                                {/* Expanded: all interpretations */}
                                {isExpanded && (
                                  <Table.Tr>
                                    <Table.Td colSpan={7} style={{ padding: 0 }}>
                                      <InterpretationTable param={p} />
                                    </Table.Td>
                                  </Table.Tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </Table.Tbody>
                      </Table>
                    </Stack>
                  ) : (
                    <Text size="sm" c="red">
                      Block read failed
                    </Text>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Stack>
      )}
    </Stack>
  );
};

export default TestReadPanel;
