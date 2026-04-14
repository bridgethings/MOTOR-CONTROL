import { Anchor, Divider, Group, Image, Text } from '@mantine/core';
import GithubLogo from '@/assets/github-mark.svg';
import { FC } from 'react';

const Footer: FC<{}> = () => {
  const version = __APP_VERSION__;
  const github = __APP_GIT_REPO_PATH__;

  return (
    <Group justify="space-between" h="100%" px="md">
      <Text size="xs" c="dimmed">© {new Date().getFullYear()} BridgeThings. All rights reserved.</Text>
      <Group gap="sm">
        <Text size="xs" c="dimmed">v{version}</Text>
        <Anchor
          target="_blank"
          underline="hover"
          size="xs"
          href="https://bridgethings.com"
        >
          bridgethings.com
        </Anchor>
      </Group>
    </Group>
  );
};

export default Footer;
