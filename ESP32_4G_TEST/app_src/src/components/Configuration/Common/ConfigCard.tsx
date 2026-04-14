import { FC, ReactNode, useState } from 'react';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { ActionIcon, Card, Collapse, Group, Text } from '@mantine/core';

interface ConfigCardProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export const ConfigCard: FC<ConfigCardProps> = ({
  title,
  icon,
  children,
  collapsible = false,
  defaultOpen = true,
}) => {
  const [opened, setOpened] = useState(defaultOpen);

  return (
    <Card mb="md" className="glass-card">
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          {icon}
          <Text fw={500} size="lg">
            {title}
          </Text>
        </Group>
        {collapsible && (
          <ActionIcon
            variant="subtle"
            onClick={() => setOpened(!opened)}
            aria-label={opened ? 'Collapse' : 'Expand'}
          >
            {opened ? <IconChevronUp size={20} /> : <IconChevronDown size={20} />}
          </ActionIcon>
        )}
      </Group>
      <Collapse in={!collapsible || opened}>{children}</Collapse>
    </Card>
  );
};

export default ConfigCard;
