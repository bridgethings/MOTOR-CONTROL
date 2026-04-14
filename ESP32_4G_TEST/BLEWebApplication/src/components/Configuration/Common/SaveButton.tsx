import { FC, useState } from 'react';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';

interface SaveButtonProps {
  onSave: () => Promise<void>;
  label?: string;
  disabled?: boolean;
}

export const SaveButton: FC<SaveButtonProps> = ({
  onSave,
  label = 'Save Configuration',
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave();
      // Success notification is handled by the ConfigurationProvider
    } catch (error) {
      // Error notification is handled by the ConfigurationProvider
      console.error('Save failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSave}
      loading={loading}
      disabled={disabled}
      leftSection={<IconDeviceFloppy size={18} />}
      variant="filled"
    >
      {label}
    </Button>
  );
};

export default SaveButton;
