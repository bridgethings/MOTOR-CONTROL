import React, { FC, lazy, Suspense, Component } from 'react';
import {
  IconActivity,
  IconBolt,
  IconCpu,
  IconDevices,
  IconPlug,
  IconSettings,
  IconTerminal2,
} from '@tabler/icons-react';
import { LoadingOverlay, Loader, ScrollArea, Stack, Tabs, useMatches } from '@mantine/core';
import BrowserNotSupported from '@/components/Overlays/BrowserNotSupported';
import Disconnected from '@/components/Overlays/Disconnected';
import Terminal from '@/components/Terminal/Terminal';
import useBluetooth from '@/hooks/useBluetooth';
import useConnection from '@/hooks/useConnection';
import useLoader from '@/hooks/useLoader';
import useNavigation from '@/hooks/useNavigation';

// Lazy load configuration pages
const MotorControlPage = lazy(() => import('./MotorControl.page'));
const DeviceProfilesPage = lazy(() => import('./DeviceProfiles.page'));
const SlaveConfigPage = lazy(() => import('./SlaveConfig.page'));
const AdvancedConfigPage = lazy(() => import('./AdvancedConfig.page'));
const SystemPage = lazy(() => import('./System.page'));
const StatusDashboardPage = lazy(() => import('./StatusDashboard.page'));

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: 'red', padding: '16px', fontFamily: 'monospace', fontSize: '14px' }}>
          <strong>Error loading page:</strong> {this.state.error?.message}
        </div>
      );
    }
    return this.props.children;
  }
}

const HomePage: FC<{}> = () => {
  const bluetooth = useBluetooth();
  const connection = useConnection();
  const loader = useLoader();
  const navigation = useNavigation();

  // In WebSocket mode, use connection context; in BLE mode, use bluetooth context
  const isWsMode = connection.mode === 'websocket';
  const isConnected = isWsMode ? connection.isConnected : bluetooth.isConnected;
  const isConnecting = isWsMode ? connection.isConnecting : bluetooth.isConnecting;
  const isBrowserSupported = isWsMode ? true : bluetooth.isSupported;
  const isDisconnected = !isConnected && !isConnecting && isBrowserSupported;
  const isLoader = isConnecting && isBrowserSupported;

  const scrollStyle = {
    height: 'calc(100vh - 120px)',
    marginTop: '15px',
  };

  // Show overlay ONLY when not supported or disconnected.
  if (!isBrowserSupported || isDisconnected) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyItems: 'center' }}>
        <LoadingOverlay
          visible={true}
          zIndex={5}
          overlayProps={{ radius: 'sm', blur: 5, backgroundOpacity: 0.1, color: 'white' }}
          loaderProps={{
            children: (
              <ScrollArea style={scrollStyle} type="auto">
                <Stack align="center" justify="center" gap="sm">
                  {!isBrowserSupported && <BrowserNotSupported />}
                  {isDisconnected && <Disconnected />}
                </Stack>
              </ScrollArea>
            ),
          }}
        />
      </div>
    );
  }

  // Show tabs when connected
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <LoadingOverlay 
        visible={isLoader || loader.isLoading} 
        zIndex={100} 
        overlayProps={{ radius: 'sm', blur: 2, backgroundOpacity: 0.1, color: 'white' }}
        loaderProps={{ color: 'blue', type: 'bars' }}
      />
    <Tabs value={navigation.currentPage} onChange={(value: string | null) => value && navigation.navigateTo(value as any)}>
      <Tabs.List>
        <Tabs.Tab value="terminal" leftSection={<IconTerminal2 size={16} />}>
          Terminal
        </Tabs.Tab>
        <Tabs.Tab value="motor" leftSection={<IconBolt size={16} />}>
          Motor
        </Tabs.Tab>
        <Tabs.Tab value="profiles" leftSection={<IconDevices size={16} />}>
          Profiles
        </Tabs.Tab>
        <Tabs.Tab value="slaves" leftSection={<IconPlug size={16} />}>
          Slaves
        </Tabs.Tab>
        <Tabs.Tab value="advanced" leftSection={<IconSettings size={16} />}>
          Advanced
        </Tabs.Tab>
        <Tabs.Tab value="system" leftSection={<IconCpu size={16} />}>
          System
        </Tabs.Tab>
        <Tabs.Tab value="status" leftSection={<IconActivity size={16} />}>
          Status
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="terminal" pt="md">
        <ErrorBoundary>
          <Terminal />
        </ErrorBoundary>
      </Tabs.Panel>

      <Tabs.Panel value="motor" pt="md">
        <ErrorBoundary>
          <Suspense fallback={<Loader />}>
            <MotorControlPage />
          </Suspense>
        </ErrorBoundary>
      </Tabs.Panel>

      <Tabs.Panel value="profiles" pt="md">
        <ErrorBoundary>
          <Suspense fallback={<Loader />}>
            <DeviceProfilesPage />
          </Suspense>
        </ErrorBoundary>
      </Tabs.Panel>

      <Tabs.Panel value="slaves" pt="md">
        <ErrorBoundary>
          <Suspense fallback={<Loader />}>
            <SlaveConfigPage />
          </Suspense>
        </ErrorBoundary>
      </Tabs.Panel>

      <Tabs.Panel value="advanced" pt="md">
        <ErrorBoundary>
          <Suspense fallback={<Loader />}>
            <AdvancedConfigPage />
          </Suspense>
        </ErrorBoundary>
      </Tabs.Panel>

      <Tabs.Panel value="system" pt="md">
        <ErrorBoundary>
          <Suspense fallback={<Loader />}>
            <SystemPage />
          </Suspense>
        </ErrorBoundary>
      </Tabs.Panel>

      <Tabs.Panel value="status" pt="md">
        <ErrorBoundary>
          <Suspense fallback={<Loader />}>
            <StatusDashboardPage />
          </Suspense>
        </ErrorBoundary>
      </Tabs.Panel>
    </Tabs>
    </div>
  );
};

export default HomePage;
