import { FC, useState } from 'react';
import {
  IconDownload,
  IconUpload,
  IconPlus,
  IconDevices,
  IconPlayerPlay,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { Button, FileButton, Group, Modal, Stack, Text, Title, SimpleGrid, Paper, Badge, Alert } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import ConfigCard from '@/components/Configuration/Common/ConfigCard';
import TestReadPanel from '@/components/Configuration/Common/TestReadPanel';
import ProfileFormModal from '@/components/Configuration/ProfileForm/ProfileFormModal';
import ProfileList from '@/components/Configuration/ProfileForm/ProfileList';
import useConfiguration from '@/hooks/useConfiguration';
import type { DeviceProfile } from '@/types/modbus.types';

const DeviceProfilesPage: FC = () => {
  const config = useConfiguration();
  const [modalOpened, setModalOpened] = useState(false);
  const [editingProfile, setEditingProfile] = useState<DeviceProfile | null>(null);
  const [testProfileId, setTestProfileId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLoadProfiles = () => config.loadProfiles();

  const handleAdd = () => {
    setEditingProfile(null);
    setModalOpened(true);
  };

  const handleEdit = async (profileId: string) => {
    try {
      const full = await config.getProfile(profileId);
      setEditingProfile(full);
      setModalOpened(true);
    } catch {
      // Error handled by provider
    }
  };

  const handleDelete = (profileId: string) => {
    setDeleteConfirmId(profileId);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await config.deleteProfile(deleteConfirmId);
    } catch {
      // Error handled by provider
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const handleDuplicate = async (profileId: string) => {
    try {
      const full = await config.getProfile(profileId);
      const copyId = `${profileId}_copy`;
      const newProfile: DeviceProfile = {
        ...full,
        profile_id: copyId,
      };
      setEditingProfile(newProfile);
      setModalOpened(true);
    } catch {
      // Error handled
    }
  };

  const handleExport = async (profileId: string) => {
    try {
      const full = await config.getProfile(profileId);
      config.exportProfile(full);
    } catch {
      // Error handled
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Accept format: { device: {...}, blocks: [...] } or { profile_id, device, blocks }
      if (!data.device && !data.blocks) {
        notifications.show({
          message: 'Invalid profile file: missing "device" or "blocks"',
          color: 'red',
        });
        return;
      }

      // If no profile_id, generate one from make+model
      const profileId =
        data.profile_id ||
        `${(data.device?.make || 'unknown').toLowerCase()}_${(data.device?.model || 'unknown').toLowerCase()}`.replace(/\s+/g, '_');

      const profile: DeviceProfile = {
        profile_id: profileId,
        device: data.device || {
          device_type: '',
          make: '',
          model: '',
          byte_swap: false,
          word_swap: false,
        },
        blocks: data.blocks || [],
      };

      await config.importProfile(profile);
    } catch (error) {
      notifications.show({
        message: `Import failed: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
        color: 'red',
      });
    }
  };

  const handleSaveProfile = async (profile: DeviceProfile) => {
    const existingIds = (config.profiles || []).map((p) => p.profile_id);
    if (editingProfile && existingIds.includes(editingProfile.profile_id)) {
      await config.updateProfile(editingProfile.profile_id, profile);
    } else {
      await config.addProfile(profile);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Device Profiles & Templates</Title>
        <Group gap="sm">
          <Button
            size="sm"
            variant="outline"
            leftSection={<IconDownload size={16} />}
            onClick={handleLoadProfiles}
            loading={config.isLoading}
          >
            Load Profiles
          </Button>
          <FileButton onChange={handleImportFile} accept="application/json,.json">
            {(props) => (
              <Button
                size="sm"
                variant="outline"
                color="orange"
                leftSection={<IconUpload size={16} />}
                loading={config.isLoading}
                {...props}
              >
                Import
              </Button>
            )}
          </FileButton>
          <Button
            size="sm"
            leftSection={<IconPlus size={16} />}
            onClick={handleAdd}
          >
            New Profile
          </Button>
        </Group>
      </Group>

      {(config.profiles || []).length === 0 && !config.isLoading && (
        <Paper withBorder p="xl" radius="md" ta="center" bg="gray.0">
          <Stack align="center" gap="xs">
            <IconDevices size={40} color="gray" />
            <Text c="dimmed">No device profiles found.</Text>
            <Button variant="subtle" size="xs" onClick={handleLoadProfiles}>Sync from Device</Button>
          </Stack>
        </Paper>
      )}

      {(config.profiles || []).length > 0 && (
        <ConfigCard title="Active Device Profiles" icon={<IconDevices size={20} />}>
          <ProfileList
            profiles={config.profiles || []}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onExport={handleExport}
          />
        </ConfigCard>
      )}

      {(config.profiles || []).length > 0 && (
        <ConfigCard title="Diagnostic Test Read" icon={<IconPlayerPlay size={20} />}>
          <Stack gap="md">
            <Text size="sm" c="dimmed">Select a profile below to perform a test read from a slave device.</Text>
            
            {testProfileId ? (
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={700}>Testing Profile: {testProfileId}</Text>
                  <Button variant="subtle" size="xs" onClick={() => setTestProfileId(null)}>
                    Select Different Profile
                  </Button>
                </Group>
                <TestReadPanel profileId={testProfileId} />
              </Stack>
            ) : (
              <Group gap="sm">
                {(config.profiles || []).map((p) => (
                  <Button
                    key={p.profile_id}
                    variant="light"
                    size="xs"
                    onClick={() => setTestProfileId(p.profile_id)}
                  >
                    {p.profile_id}
                  </Button>
                ))}
              </Group>
            )}
          </Stack>
        </ConfigCard>
      )}

      <ProfileFormModal
        opened={modalOpened}
        onClose={() => {
          setModalOpened(false);
          setEditingProfile(null);
        }}
        onSave={handleSaveProfile}
        profile={editingProfile}
        existingProfileIds={(config.profiles || []).map((p) => p.profile_id)}
      />

      <Modal
        opened={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Confirm Deletion"
        centered
      >
        <Stack gap="md">
          <Group gap="sm">
            <IconAlertTriangle size={24} color="red" />
            <Text>Are you sure you want to delete profile <b>{deleteConfirmId}</b>?</Text>
          </Group>
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button color="red" loading={isDeleting} onClick={handleConfirmDelete}>Delete Profile</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default DeviceProfilesPage;
