import { FC, useState } from 'react';
import {
  IconPlus,
  IconTrash,
  IconPlayerPlay,
  IconEdit,
  IconCheck,
  IconX,
  IconAlertTriangle,
} from '@tabler/icons-react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import TestReadPanel from '@/components/Configuration/Common/TestReadPanel';
import type { SlaveAssignment, ProfileSummary } from '@/types/modbus.types';

interface SlaveAssignmentTableProps {
  slaves: SlaveAssignment[];
  profiles: ProfileSummary[];
  onAdd: (assignment: SlaveAssignment) => Promise<void>;
  onUpdate: (slaveId: number, data: Partial<SlaveAssignment>) => Promise<void>;
  onDelete: (slaveId: number) => Promise<void>;
}

const SlaveAssignmentTable: FC<SlaveAssignmentTableProps> = ({
  profiles = [],
  slaves = [],
  onAdd,
  onUpdate,
  onDelete,
}) => {
  const profileMap = (profiles || []).reduce((acc, p) => {
    acc[p.profile_id] = p;
    return acc;
  }, {} as Record<string, any>);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [testSlaveId, setTestSlaveId] = useState<number | null>(null);
  const [testProfileId, setTestProfileId] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New slave form state
  const [newSlaveId, setNewSlaveId] = useState<number>(1);
  const [newName, setNewName] = useState('');
  const [newProfileId, setNewProfileId] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editProfileId, setEditProfileId] = useState('');

  const profileOptions = (profiles || []).map((p) => ({
    value: p.profile_id,
    label: `${p.profile_id} (${p.make} ${p.model})`,
  }));

  const existingSlaveIds = (slaves || []).map((s) => s.slave_id);

  const handleStartAdd = () => {
    setAdding(true);
    // Find first available slave ID
    let nextId = 1;
    while (existingSlaveIds.includes(nextId) && nextId <= 247) nextId++;
    setNewSlaveId(nextId);
    setNewName('');
    setNewProfileId(profiles.length > 0 ? profiles[0].profile_id : '');
    setNewEnabled(true);
  };

  const handleConfirmAdd = async () => {
    if (!newProfileId) return;
    await onAdd({
      slave_id: newSlaveId,
      profile_id: newProfileId,
      name: newName || `Slave ${newSlaveId}`,
      enabled: newEnabled,
    });
    setAdding(false);
  };

  const handleStartEdit = (slave: SlaveAssignment) => {
    setEditing(slave.slave_id);
    setEditName(slave.name);
    setEditProfileId(slave.profile_id);
  };

  const handleConfirmEdit = async (slaveId: number) => {
    await onUpdate(slaveId, {
      name: editName,
      profile_id: editProfileId,
    });
    setEditing(null);
  };

  const handleDelete = (slaveId: number) => {
    setDeleteConfirmId(slaveId);
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmId === null) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteConfirmId);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const handleTestRead = (slaveId: number, profileId: string) => {
    setTestSlaveId(slaveId);
    setTestProfileId(profileId);
  };

  return (
    <>
      <Stack gap="sm">
        <Table withTableBorder striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Profile</Table.Th>
              <Table.Th>Enabled</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(slaves || []).map((slave) => (
              <Table.Tr key={slave.slave_id}>
                <Table.Td>
                  <Text size="sm" ff="monospace" fw={600}>
                    {slave.slave_id}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {editing === slave.slave_id ? (
                    <TextInput
                      value={editName}
                      onChange={(e) => setEditName(e.currentTarget.value)}
                      size="xs"
                      maxLength={31}
                    />
                  ) : (
                    <Text size="sm">{slave.name}</Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {editing === slave.slave_id ? (
                    <Select
                      data={profileOptions}
                      value={editProfileId}
                      onChange={(v) => setEditProfileId(v || '')}
                      size="xs"
                    />
                  ) : (
                    <Group gap="xs">
                      <Text size="sm">{slave.profile_id}</Text>
                      {slave.profile && (
                        <Text size="xs" c="dimmed">
                          ({slave.profile.make} {slave.profile.model})
                        </Text>
                      )}
                    </Group>
                  )}
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={slave.enabled}
                    onChange={(e) =>
                      onUpdate(slave.slave_id, {
                        enabled: e.currentTarget.checked,
                      })
                    }
                    size="xs"
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    {editing === slave.slave_id ? (
                      <>
                        <ActionIcon
                          variant="subtle"
                          color="green"
                          size="sm"
                          onClick={() => handleConfirmEdit(slave.slave_id)}
                        >
                          <IconCheck size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          onClick={() => setEditing(null)}
                        >
                          <IconX size={14} />
                        </ActionIcon>
                      </>
                    ) : (
                      <>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          onClick={() => handleStartEdit(slave)}
                        >
                          <IconEdit size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          color="blue"
                          onClick={() =>
                            handleTestRead(slave.slave_id, slave.profile_id)
                          }
                        >
                          <IconPlayerPlay size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          color="red"
                          onClick={() => handleDelete(slave.slave_id)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}

            {/* Add row */}
            {adding && (
              <Table.Tr>
                <Table.Td>
                  <NumberInput
                    value={newSlaveId}
                    onChange={(v) => setNewSlaveId(Number(v))}
                    min={1}
                    max={247}
                    size="xs"
                    w={70}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    value={newName}
                    onChange={(e) => setNewName(e.currentTarget.value)}
                    placeholder="Slave name"
                    size="xs"
                    maxLength={31}
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    data={profileOptions}
                    value={newProfileId}
                    onChange={(v) => setNewProfileId(v || '')}
                    size="xs"
                    placeholder="Select profile"
                  />
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={newEnabled}
                    onChange={(e) => setNewEnabled(e.currentTarget.checked)}
                    size="xs"
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <ActionIcon
                      variant="subtle"
                      color="green"
                      size="sm"
                      onClick={handleConfirmAdd}
                      disabled={!newProfileId}
                    >
                      <IconCheck size={14} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={() => setAdding(false)}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>

        {(slaves || []).length === 0 && !adding && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No slave devices configured.
          </Text>
        )}

        {!adding && (
          <Group justify="flex-start">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={handleStartAdd}
              disabled={profiles?.length === 0}
            >
              Add Slave
            </Button>
            {profiles.length === 0 && (
              <Text size="xs" c="dimmed">
                Create a device profile first
              </Text>
            )}
          </Group>
        )}
      </Stack>

      {/* Test Read Modal */}
      <Modal
        opened={testSlaveId !== null}
        onClose={() => setTestSlaveId(null)}
        title={`Test Read — Slave ${testSlaveId}`}
        size="lg"
      >
        {testSlaveId !== null && testProfileId && (
          <TestReadPanel
            profileId={testProfileId}
            defaultSlaveId={testSlaveId}
          />
        )}
      </Modal>

      {/* Delete confirmation Modal */}
      <Modal
        opened={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title={
          <Group gap="xs">
            <IconAlertTriangle size={20} color="orange" />
            <Text fw={600}>Delete Slave</Text>
          </Group>
        }
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to delete{' '}
            <Text span fw={700}>Slave {deleteConfirmId}</Text>?
            This will remove it from the polling schedule.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button color="red" loading={isDeleting} onClick={handleConfirmDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};

export default SlaveAssignmentTable;
