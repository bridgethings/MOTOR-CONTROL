import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './App.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import Layout from './components/Layout/Layout';
import ConnectionProvider from './providers/ConnectionProvider';
import BluetoothProvider from './providers/BluetoothProvider';
import ConfigurationProvider from './providers/ConfigurationProvider';
import LoaderProvider from './providers/LoaderProvider';
import NavigationProvider from './providers/NavigationProvider';
import { theme } from './theme';
import React, { Component, ReactNode } from 'react';

class GlobalErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', fontFamily: 'monospace', backgroundColor: '#fff5f5' }}>
          <h1>Something went wrong.</h1>
          <p>The application crashed. Please report the error below:</p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.stack}</pre>
          <button onClick={() => window.location.reload()}>Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <ConnectionProvider>
        <BluetoothProvider>
          <MantineProvider theme={theme}>
            <NavigationProvider>
              <ConfigurationProvider>
                <LoaderProvider>
                  <Layout />
                </LoaderProvider>
              </ConfigurationProvider>
            </NavigationProvider>
            <Notifications />
          </MantineProvider>
        </BluetoothProvider>
      </ConnectionProvider>
    </GlobalErrorBoundary>
  );
}
