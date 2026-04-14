import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import ConnectionContext from '@/contexts/ConnectionContext';
import { detectTransportMode, type TransportMode } from '@/services/transport';
import { WSTransport } from '@/services/wsTransport';

const ConnectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [mode] = useState<TransportMode>(() => detectTransportMode());
  const [wsConnected, setWsConnected] = useState(false);
  const [wsConnecting, setWsConnecting] = useState(false);
  const wsTransportRef = useRef<WSTransport | null>(null);

  // Auto-connect WebSocket when in WS mode
  useEffect(() => {
    if (mode !== 'websocket') return;

    const wsUrl = `ws://${window.location.host}/ws`;
    const transport = new WSTransport(wsUrl);
    transport.onConnectionChange = (connected) => {
      setWsConnected(connected);
      if (connected) {
        notifications.show({ message: 'Connected to device via WebSocket', color: 'green' });
      } else {
        notifications.show({ message: 'WebSocket disconnected. Reconnecting...', color: 'orange' });
      }
    };
    wsTransportRef.current = transport;

    setWsConnecting(true);
    transport.connect()
      .then(() => setWsConnecting(false))
      .catch(() => setWsConnecting(false));

    return () => {
      transport.disconnect();
      wsTransportRef.current = null;
    };
  }, [mode]);

  const value = useMemo(() => {
    if (mode === 'websocket') {
      return {
        mode,
        isConnected: wsConnected,
        isConnecting: wsConnecting,
        isSupported: true, // WebSocket is always supported
        transport: wsConnected ? wsTransportRef.current : null,
        connect: () => {
          if (wsTransportRef.current && !wsConnected) {
            setWsConnecting(true);
            wsTransportRef.current.connect()
              .then(() => setWsConnecting(false))
              .catch(() => setWsConnecting(false));
          }
        },
        disconnect: () => {
          wsTransportRef.current?.disconnect();
        },
      };
    }

    // BLE mode: ConnectionProvider provides mode info only.
    // Actual BLE transport is created in ConfigurationProvider from BluetoothProvider.
    return {
      mode,
      isConnected: false, // Overridden by BluetoothProvider in BLE mode
      isConnecting: false,
      isSupported: !!navigator.bluetooth,
      transport: null, // Set by ConfigurationProvider in BLE mode
      connect: () => {},
      disconnect: () => {},
    };
  }, [mode, wsConnected, wsConnecting]);

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
};

export default ConnectionProvider;
