import { FC, useEffect, useState } from 'react';
import {
  IconPlus,
  IconTrash,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Grid,
  Group,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import type {
  DeviceProfile,
  ProfileBlock,
  ProfileParameter,
  FunctionCode,
  DataType,
  DeviceInfo,
} from '@/types/modbus.types';
import {
  DEFAULT_PROFILE,
  DEFAULT_DEVICE_INFO,
  DEFAULT_BLOCK,
  DEFAULT_PARAMETER,
  MAX_BLOCKS_PER_PROFILE,
  MAX_PARAMS_PER_BLOCK,
  MAX_BLOCK_LENGTH,
} from '@/types/modbus.types';

interface ProfileFormModalProps {
  opened: boolean;
  onClose: () => void;
  onSave: (profile: DeviceProfile) => Promise<void>;
  profile: DeviceProfile | null; // null = add mode, non-null = edit mode
  existingProfileIds: string[];
}

const DATA_TYPE_OPTIONS: { value: DataType; label: string }[] = [
  { value: 'float32', label: 'Float32' },
  { value: 'uint16', label: 'UInt16' },
  { value: 'int16', label: 'Int16' },
  { value: 'uint32', label: 'UInt32' },
  { value: 'int32', label: 'Int32' },
  { value: 'float64', label: 'Float64' },
  { value: 'uint64', label: 'UInt64' },
  { value: 'int64', label: 'Int64' },
  { value: 'string', label: 'String' },
  { value: 'bool', label: 'Boolean' },
];

const FC_OPTIONS: { value: string; label: string }[] = [
  { value: '3', label: 'FC3 - Holding Registers' },
  { value: '4', label: 'FC4 - Input Registers' },
  { value: '1', label: 'FC1 - Coils' },
  { value: '2', label: 'FC2 - Discrete Inputs' },
];

const getRegisterSize = (dt: DataType): number => {
  if (['float32', 'uint32', 'int32'].includes(dt)) return 2;
  if (['float64', 'uint64', 'int64'].includes(dt)) return 4;
  return 1;
};

const ProfileFormModal: FC<ProfileFormModalProps> = ({
  opened,
  onClose,
  onSave,
  profile,
  existingProfileIds,
}) => {
  const isEdit = profile !== null && existingProfileIds.includes(profile.profile_id);

  const [profileId, setProfileId] = useState('');
  const [device, setDevice] = useState<DeviceInfo>({ ...DEFAULT_DEVICE_INFO });
  const [blocks, setBlocks] = useState<ProfileBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set());

  // Reset form when modal opens
  useEffect(() => {
    if (opened) {
      if (profile) {
        setProfileId(profile.profile_id);
        setDevice({ ...profile.device });
        setBlocks((profile.blocks || []).map((b) => ({
          ...b,
          parameters: (b.parameters || []).map((p) => ({ ...p })),
        })));
        // Expand all blocks in edit mode
        setExpandedBlocks(new Set((profile.blocks || []).map((_, i) => i)));
      } else {
        setProfileId('');
        setDevice({ ...DEFAULT_DEVICE_INFO });
        setBlocks([]);
        setExpandedBlocks(new Set());
      }
    }
  }, [opened, profile]);

  const toggleBlock = (index: number) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const addBlock = () => {
    if (blocks.length >= MAX_BLOCKS_PER_PROFILE) return;
    const newBlock: ProfileBlock = {
      block_name: `Block ${blocks.length + 1}`,
      ...DEFAULT_BLOCK,
      parameters: [],
    };
    setBlocks([...blocks, newBlock]);
    setExpandedBlocks((prev) => new Set([...prev, blocks.length]));
  };

  const removeBlock = (index: number) => {
    setBlocks(blocks.filter((_, i) => i !== index));
    setExpandedBlocks((prev) => {
      const next = new Set<number>();
      prev.forEach((v) => {
        if (v < index) next.add(v);
        else if (v > index) next.add(v - 1);
      });
      return next;
    });
  };

  const updateBlock = (index: number, updates: Partial<ProfileBlock>) => {
    setBlocks(blocks.map((b, i) => (i === index ? { ...b, ...updates } : b)));
  };

  const addParameter = (blockIndex: number) => {
    const block = blocks[blockIndex];
    if (block.parameters.length >= MAX_PARAMS_PER_BLOCK) return;
    const newParam: ProfileParameter = {
      parameter_name: '',
      ...DEFAULT_PARAMETER,
    };
    updateBlock(blockIndex, {
      parameters: [...block.parameters, newParam],
    });
  };

  const removeParameter = (blockIndex: number, paramIndex: number) => {
    const block = blocks[blockIndex];
    updateBlock(blockIndex, {
      parameters: block.parameters.filter((_, i) => i !== paramIndex),
    });
  };

  const updateParameter = (
    blockIndex: number,
    paramIndex: number,
    updates: Partial<ProfileParameter>
  ) => {
    const block = blocks[blockIndex];
    updateBlock(blockIndex, {
      parameters: block.parameters.map((p, i) =>
        i === paramIndex ? { ...p, ...updates } : p
      ),
    });
  };

  const handleSave = async () => {
    // Validation
    if (!profileId.trim()) return;
    if (!isEdit && existingProfileIds.includes(profileId.trim())) return;

    setSaving(true);
    try {
      const result: DeviceProfile = {
        profile_id: profileId.trim(),
        device,
        blocks: (blocks || []).map((b) => ({
          ...b,
          parameters: (b.parameters || []).filter((p) => p.parameter_name.trim() !== ''),
        })),
      };
      await onSave(result);
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  const idError =
    !isEdit && profileId.trim() && existingProfileIds.includes(profileId.trim())
      ? 'Profile ID already exists'
      : undefined;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? `Edit Profile: ${profile.profile_id}` : 'New Device Profile'}
      size="xl"
      closeOnClickOutside={false}
    >
      <ScrollArea.Autosize mah="70vh">
        <Stack gap="md" pr="xs">
          {/* Device Info */}
          <Text fw={600} size="sm">
            Device Information
          </Text>

          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Profile ID"
                placeholder="e.g. elmeasure_lg5110"
                value={profileId}
                onChange={(e) => setProfileId(e.currentTarget.value)}
                required
                disabled={isEdit}
                error={idError}
                maxLength={23}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Device Type"
                placeholder="e.g. Energy Meter"
                value={device.device_type}
                onChange={(e) =>
                  setDevice({ ...device, device_type: e.currentTarget.value })
                }
                maxLength={31}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Make"
                placeholder="e.g. Elmeasure"
                value={device.make}
                onChange={(e) =>
                  setDevice({ ...device, make: e.currentTarget.value })
                }
                maxLength={31}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                label="Model"
                placeholder="e.g. LG5110"
                value={device.model}
                onChange={(e) =>
                  setDevice({ ...device, model: e.currentTarget.value })
                }
                maxLength={31}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <Checkbox
                label="Byte Swap"
                description="Swap bytes within word"
                checked={device.byte_swap}
                onChange={(e) =>
                  setDevice({ ...device, byte_swap: e.currentTarget.checked })
                }
                mt="xs"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <Checkbox
                label="Word Swap"
                description="Swap words in 32-bit"
                checked={device.word_swap}
                onChange={(e) =>
                  setDevice({ ...device, word_swap: e.currentTarget.checked })
                }
                mt="xs"
              />
            </Grid.Col>
          </Grid>

          <Divider />

          {/* Blocks */}
          <Group justify="space-between">
            <Text fw={600} size="sm">
              Register Blocks ({blocks.length}/{MAX_BLOCKS_PER_PROFILE})
            </Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={addBlock}
              disabled={blocks.length >= MAX_BLOCKS_PER_PROFILE}
            >
              Add Block
            </Button>
          </Group>

          {blocks.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="md">
              No blocks defined. Click "Add Block" to start.
            </Text>
          )}

          {blocks.map((block, bi) => (
            <Stack
              key={bi}
              gap="xs"
              style={{
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-md)',
                padding: 'var(--mantine-spacing-sm)',
              }}
            >
              {/* Block header */}
              <Group
                justify="space-between"
                style={{ cursor: 'pointer' }}
                onClick={() => toggleBlock(bi)}
              >
                <Group gap="xs">
                  {expandedBlocks.has(bi) ? (
                    <IconChevronDown size={16} />
                  ) : (
                    <IconChevronRight size={16} />
                  )}
                  <Text fw={500} size="sm">
                    {block.block_name || `Block ${bi + 1}`}
                  </Text>
                  <Text size="xs" c="dimmed">
                    ({block.parameters.length} params)
                  </Text>
                </Group>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBlock(bi);
                  }}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>

              {/* Block details */}
              {expandedBlocks.has(bi) && (
                <Stack gap="xs" pl="md">
                  <Grid>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                      <TextInput
                        label="Block Name"
                        value={block.block_name}
                        onChange={(e) =>
                          updateBlock(bi, { block_name: e.currentTarget.value })
                        }
                        maxLength={31}
                        size="xs"
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, sm: 3 }}>
                      <NumberInput
                        label="Start Address"
                        value={block.start_address}
                        onChange={(v) =>
                          updateBlock(bi, { start_address: Number(v) })
                        }
                        min={0}
                        max={65535}
                        size="xs"
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, sm: 2 }}>
                      <NumberInput
                        label="Reg Count"
                        value={block.registers_count}
                        onChange={(v) =>
                          updateBlock(bi, { registers_count: Number(v) })
                        }
                        min={1}
                        max={MAX_BLOCK_LENGTH}
                        size="xs"
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 3 }}>
                      <Select
                        label="Function Code"
                        data={FC_OPTIONS}
                        value={String(block.function_code)}
                        onChange={(v) =>
                          updateBlock(bi, {
                            function_code: Number(v) as FunctionCode,
                          })
                        }
                        size="xs"
                      />
                    </Grid.Col>
                  </Grid>

                  {/* Parameters */}
                  <Group justify="space-between" mt="xs">
                    <Text size="xs" fw={500}>
                      Parameters ({block.parameters.length}/{MAX_PARAMS_PER_BLOCK})
                    </Text>
                    <Button
                      size="xs"
                      variant="subtle"
                      leftSection={<IconPlus size={12} />}
                      onClick={() => addParameter(bi)}
                      disabled={block.parameters.length >= MAX_PARAMS_PER_BLOCK}
                    >
                      Add Param
                    </Button>
                  </Group>

                  {block.parameters.map((param, pi) => (
                    <Grid key={pi} align="flex-end" gutter="xs">
                      <Grid.Col span={{ base: 12, sm: 3 }}>
                        <TextInput
                          label={pi === 0 ? 'Name' : undefined}
                          placeholder="Voltage R-N"
                          value={param.parameter_name}
                          onChange={(e) =>
                            updateParameter(bi, pi, {
                              parameter_name: e.currentTarget.value,
                            })
                          }
                          maxLength={31}
                          size="xs"
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 4, sm: 2 }}>
                        <NumberInput
                          label={pi === 0 ? 'Offset' : undefined}
                          value={param.offset_address}
                          onChange={(v) => {
                            const offset = Number(v);
                            updateParameter(bi, pi, {
                              offset_address: offset,
                              absolute_address: block.start_address + offset,
                            });
                          }}
                          min={0}
                          max={MAX_BLOCK_LENGTH - 1}
                          size="xs"
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 4, sm: 2 }}>
                        <Select
                          label={pi === 0 ? 'Type' : undefined}
                          data={DATA_TYPE_OPTIONS}
                          value={param.data_type}
                          onChange={(v) =>
                            updateParameter(bi, pi, {
                              data_type: (v as DataType) || 'float32',
                            })
                          }
                          size="xs"
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 4, sm: 2 }}>
                        <NumberInput
                          label={pi === 0 ? 'Multiplier' : undefined}
                          value={param.multiplier}
                          onChange={(v) =>
                            updateParameter(bi, pi, { multiplier: Number(v) })
                          }
                          decimalScale={4}
                          step={0.1}
                          size="xs"
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 4, sm: 2 }}>
                        <TextInput
                          label={pi === 0 ? 'Unit' : undefined}
                          placeholder="V"
                          value={param.unit}
                          onChange={(e) =>
                            updateParameter(bi, pi, {
                              unit: e.currentTarget.value,
                            })
                          }
                          maxLength={11}
                          size="xs"
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 2, sm: 1 }}>
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          size="sm"
                          onClick={() => removeParameter(bi, pi)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Grid.Col>
                    </Grid>
                  ))}
                </Stack>
              )}
            </Stack>
          ))}

          {/* Save */}
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!profileId.trim() || !!idError}
            >
              {isEdit ? 'Update Profile' : 'Create Profile'}
            </Button>
          </Group>
        </Stack>
      </ScrollArea.Autosize>
    </Modal>
  );
};

export default ProfileFormModal;
