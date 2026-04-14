import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import BluetoothContext from '@/contexts/BluetoothContext';

const LOG_PREFIX = '[BLE-Provider]';

const BluetoothProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const firstUpdate = useRef(true);
  const [isFailed, setIsFailed] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const manualDisconnect = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectedRef = useRef(false);

  // Helper to set connected state only if it actually changed
  const setConnected = useCallback((connected: boolean, dev?: BluetoothDevice | null) => {
    if (isConnectedRef.current === connected) {
      console.log(LOG_PREFIX, 'setConnected() no-op, already', connected);
      return;
    }
    console.log(LOG_PREFIX, 'setConnected():', connected);
    isConnectedRef.current = connected;
    setIsConnected(connected);
    if (dev !== undefined) {
      setDevice(dev);
    }
  }, []);

  useEffect(() => {
    console.log(LOG_PREFIX, 'Provider mounted');
    if (!navigator.bluetooth) {
      console.warn(LOG_PREFIX, 'Web Bluetooth NOT supported');
      setIsSupported(false);
    }
    return () => {
      console.log(LOG_PREFIX, 'Provider unmounting - cleaning up');
      manualDisconnect.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (deviceRef.current && deviceRef.current.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (!firstUpdate.current) {
      if (isConnected) {
        notifications.show({
          message: `Device is connected: ${device?.name ?? 'unknown'}`,
          color: 'green',
        });
      } else {
        notifications.show({ message: `Device is disconnected.`, color: 'blue' });
      }
    } else {
      firstUpdate.current = false;
    }
  }, [isConnected]);

  useEffect(() => {
    if (isFailed) {
      console.error(LOG_PREFIX, 'Connection FAILED');
      notifications.show({
        message: `Failed to connect to the selected device.`,
        color: 'red',
      });
    }
  }, [isFailed]);

  const onDisconnected = useCallback(() => {
    console.warn(LOG_PREFIX, 'onDisconnected event fired! manualDisconnect:', manualDisconnect.current,
      'deviceRef:', deviceRef.current?.name);
    setConnected(false, null);

    // Auto-reconnect if not a manual disconnect
    if (!manualDisconnect.current && deviceRef.current) {
      const dev = deviceRef.current;
      console.log(LOG_PREFIX, 'Scheduling auto-reconnect in 1.5s for', dev.name);
      reconnectTimer.current = setTimeout(() => attemptReconnect(dev), 1500);
    } else {
      console.log(LOG_PREFIX, 'No auto-reconnect (manual disconnect or no device ref)');
      deviceRef.current = null;
    }
  }, []);

  // Auto-reconnect to the same device after unexpected disconnect
  const attemptReconnect = useCallback(async (dev: BluetoothDevice) => {
    console.log(LOG_PREFIX, 'attemptReconnect called, manualDisconnect:', manualDisconnect.current);
    if (manualDisconnect.current) return;
    if (!dev.gatt) return;

    setIsConnecting(true);
    console.log(LOG_PREFIX, 'Reconnect attempt #1 to', dev.name);
    try {
      const server = await dev.gatt.connect();
      if (server) {
        console.log(LOG_PREFIX, 'Reconnect #1 SUCCESS');
        deviceRef.current = dev;
        setConnected(true, dev);
        notifications.show({
          message: `Reconnected to ${dev.name ?? 'device'}`,
          color: 'green',
        });
      }
    } catch (err) {
      console.warn(LOG_PREFIX, 'Reconnect #1 FAILED:', err);
      // Retry once more after 3 seconds
      reconnectTimer.current = setTimeout(async () => {
        if (!manualDisconnect.current && dev.gatt && !dev.gatt.connected) {
          console.log(LOG_PREFIX, 'Reconnect attempt #2 to', dev.name);
          try {
            const server = await dev.gatt.connect();
            if (server) {
              console.log(LOG_PREFIX, 'Reconnect #2 SUCCESS');
              deviceRef.current = dev;
              setConnected(true, dev);
              notifications.show({
                message: `Reconnected to ${dev.name ?? 'device'}`,
                color: 'green',
              });
            }
          } catch (err2) {
            console.error(LOG_PREFIX, 'Reconnect #2 FAILED - giving up:', err2);
          }
        }
        setIsConnecting(false);
      }, 3000);
    } finally {
      setIsConnecting(false);
    }
  }, [setConnected]);

  const connect = async (services: string[]) => {
    console.log(LOG_PREFIX, 'connect() called with services:', services);
    setIsFailed(false);
    setIsConnecting(true);
    manualDisconnect.current = false;

    try {
      console.log(LOG_PREFIX, 'Requesting BLE device...');
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: false,
        filters: [{ services: services as BluetoothServiceUUID[] }],
      });
      console.log(LOG_PREFIX, 'Device selected:', dev.name, 'id:', dev.id);

      console.log(LOG_PREFIX, 'Connecting to GATT server...');
      const server = await dev.gatt?.connect();
      if (server) {
        console.log(LOG_PREFIX, 'GATT connected successfully');
        dev.addEventListener('gattserverdisconnected', onDisconnected);
        deviceRef.current = dev;
        setConnected(true, dev);
      } else {
        console.warn(LOG_PREFIX, 'GATT connect returned no server');
      }
    } catch (error) {
      console.error(LOG_PREFIX, 'connect() error:', error);
      if (error instanceof DOMException) {
        if (error.name === 'SecurityError') {
          notifications.show({
            message: 'Operation is not permitted in this context due to security concerns.',
            color: 'red',
          });
          setIsFailed(true);
        }
      } else {
        setIsFailed(true);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    console.log(LOG_PREFIX, 'disconnect() called (manual)');
    manualDisconnect.current = true;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (device && device.gatt?.connected) {
      device.gatt.disconnect();
    }
    setConnected(false, null);
    deviceRef.current = null;
  };

  return (
    <BluetoothContext.Provider
      value={{ isConnected, device, connect, disconnect, isSupported, isFailed, isConnecting }}
    >
      {children}
    </BluetoothContext.Provider>
  );
};

export default BluetoothProvider;
