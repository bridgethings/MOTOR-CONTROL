import { FC } from 'react';
import {
  IconEdit,
  IconTrash,
  IconCopy,
  IconFileExport,
} from '@tabler/icons-react';
import {
  ActionIcon,
  Badge,
  Card,
  Grid,
  Group,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import type { ProfileSummary } from '@/types/modbus.types';

interface ProfileListProps {
  profiles: ProfileSummary[];
  onEdit: (profileId: string) => void;
  onDelete: (profileId: string) => void;
  onDuplicate: (profileId: string) => void;
  onExport: (profileId: string) => void;
}

const ProfileList: FC<ProfileListProps> = ({
  profiles = [],
  onEdit,
  onDelete,
  onDuplicate,
  onExport,
}) => {
  if (!profiles || profiles.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        No device profiles defined. Click "Add Profile" to create one.
      </Text>
    );
  }

  return (
    <Grid>
      {profiles.map((p) => (
        <Grid.Col key={p.profile_id} span={{ base: 12, sm: 6, md: 4 }}>
          <Card withBorder padding="sm" radius="md">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600} size="sm" truncate>
                  {p.profile_id}
                </Text>
                <Group gap={4} wrap="nowrap">
                  <Tooltip label="Edit">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={() => onEdit(p.profile_id)}
                    >
                      <IconEdit size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Duplicate">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      color="teal"
                      onClick={() => onDuplicate(p.profile_id)}
                    >
                      <IconCopy size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Export">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      color="blue"
                      onClick={() => onExport(p.profile_id)}
                    >
                      <IconFileExport size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      color="red"
                      onClick={() => onDelete(p.profile_id)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  {p.make} {p.model}
                </Text>
              </Group>

              <Group gap="xs">
                <Badge size="xs" variant="light">
                  {p.device_type}
                </Badge>
                <Badge size="xs" variant="light" color="blue">
                  {p.block_count} blocks
                </Badge>
                <Badge size="xs" variant="light" color="teal">
                  {p.parameter_count} params
                </Badge>
              </Group>

              <Group gap="xs">
                {p.byte_swap && (
                  <Badge size="xs" variant="outline" color="orange">
                    Byte Swap
                  </Badge>
                )}
                {p.word_swap && (
                  <Badge size="xs" variant="outline" color="orange">
                    Word Swap
                  </Badge>
                )}
              </Group>
            </Stack>
          </Card>
        </Grid.Col>
      ))}
    </Grid>
  );
};

export default ProfileList;
