import { useCallback, useEffect, useRef, useState } from 'react';
import useBluetooth from './useBluetooth';

const LOG_PREFIX = '[BLE-Service]';

interface UseBluetoothCharacteristicProps {
  uuid: string;
  onValueChanged?: (value: DataView | undefined) => void;
}

interface UseBluetoothServiceProps {
  uuid: string;
}

const useBluetoothService = (props: UseBluetoothServiceProps) => {
  const bluetooth = useBluetooth();
  const [serviceData, setServiceData] = useState<UseBluetoothServiceProps>(props);
  const [loading, setLoading] = useState<boolean>(true);
  const [service, setService] = useState<BluetoothRemoteGATTService | null>(null);
  const fetchingService = useRef(false);

  useEffect(() => {
    console.log(LOG_PREFIX, 'bluetooth.isConnected changed to:', bluetooth.isConnected);
    if (bluetooth.isConnected) {
      // Guard: check GATT is actually connected and not already fetching
      if (bluetooth.device?.gatt?.connected && !fetchingService.current) {
        console.log(LOG_PREFIX, 'Connected -> fetching service', serviceData.uuid);
        getService();
      } else {
        console.log(LOG_PREFIX, 'Skipping service fetch (already fetching or GATT not ready)',
          'fetching:', fetchingService.current,
          'gatt:', bluetooth.device?.gatt?.connected);
      }
    } else {
      console.log(LOG_PREFIX, 'Disconnected -> clearing service');
      fetchingService.current = false;
      setService(null);
    }
  }, [bluetooth.isConnected]);

  const getService = async () => {
    if (fetchingService.current) {
      console.log(LOG_PREFIX, 'getService() skipped - already in progress');
      return;
    }
    fetchingService.current = true;
    setLoading(true);
    try {
      // Double-check GATT is still connected before async call
      if (!bluetooth.device?.gatt?.connected) {
        console.warn(LOG_PREFIX, 'GATT disconnected before getPrimaryService()');
        setService(null);
        return;
      }
      console.log(LOG_PREFIX, 'getPrimaryService() for', serviceData.uuid);
      const ser = await bluetooth.device?.gatt?.getPrimaryService(serviceData.uuid);
      if (ser) {
        console.log(LOG_PREFIX, 'Service obtained:', ser.uuid);
        setService(ser);
      } else {
        console.warn(LOG_PREFIX, 'getPrimaryService returned null/undefined');
        setService(null);
      }
    } catch (error) {
      console.error(LOG_PREFIX, 'getPrimaryService FAILED:', error);
      setService(null);
    } finally {
      fetchingService.current = false;
      setLoading(false);
    }
  };

  const reloadService = (value: UseBluetoothServiceProps) => setServiceData(value);

  const useBluetoothCharacteristic = (props: UseBluetoothCharacteristicProps) => {
    const [characteristic, setCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(
      null
    );
    const characteristicRef = useRef(characteristic);
    const fetchingChar = useRef(false);

    useEffect(() => {
      return () => removeCharacteristic();
    }, []);

    useEffect(() => {
      if (service) {
        if (!fetchingChar.current) {
          console.log(LOG_PREFIX, 'Service available -> adding characteristic', props.uuid);
          addCharacteristic();
        } else {
          console.log(LOG_PREFIX, 'Characteristic fetch already in progress, skipping');
        }
      } else {
        // Clear stale characteristic on disconnect to prevent
        // "Characteristic is no longer valid" errors on reconnect
        console.log(LOG_PREFIX, 'Service null -> clearing characteristic');
        fetchingChar.current = false;
        setCharacteristic(null);
      }
    }, [service]);

    useEffect(() => {
      console.log(LOG_PREFIX, 'Characteristic changed:',
        characteristic ? characteristic.uuid : 'null',
        'GATT connected:', characteristic?.service?.device?.gatt?.connected ?? 'N/A');
      characteristicRef.current = characteristic;
    }, [characteristic]);

    const addCharacteristic = async () => {
      if (fetchingChar.current) return;
      fetchingChar.current = true;
      try {
        console.log(LOG_PREFIX, 'getCharacteristic() for', props.uuid);
        const char = await service?.getCharacteristic(props.uuid);
        if (char) {
          console.log(LOG_PREFIX, 'Characteristic obtained:', char.uuid);
          try {
            await char.startNotifications();
            console.log(LOG_PREFIX, 'Notifications started for', char.uuid);
            if (props.onValueChanged) {
              char.addEventListener('characteristicvaluechanged', onCharacteristicValueChanged);
            }
          } catch (e) {
            console.error(LOG_PREFIX, 'startNotifications FAILED:', e);
          }
          setCharacteristic(char);
        } else {
          console.warn(LOG_PREFIX, 'getCharacteristic returned null/undefined');
        }
      } catch (err) {
        console.error(LOG_PREFIX, 'addCharacteristic FAILED:', err);
      } finally {
        fetchingChar.current = false;
      }
    };

    const removeCharacteristic = () => {
      console.log(LOG_PREFIX, 'removeCharacteristic called');
      if (props.onValueChanged && characteristicRef.current && bluetooth.isConnected) {
        try {
          characteristicRef.current
            .stopNotifications()
            .then((_) => {
              console.log(LOG_PREFIX, 'Notifications stopped');
              characteristicRef.current!.removeEventListener(
                'characteristicvaluechanged',
                onCharacteristicValueChanged
              );
            })
            .catch((e) => {
              console.warn(LOG_PREFIX, 'stopNotifications error:', e);
            });
        } catch (err) {
          console.warn(LOG_PREFIX, 'removeCharacteristic error:', err);
        }
      }
    };

    const onCharacteristicValueChanged = useCallback((ev: Event) => {
      if (props.onValueChanged) {
        props.onValueChanged((ev?.target as BluetoothRemoteGATTCharacteristic).value);
      }
    }, []);

    return { characteristic } as const;
  };

  return { loading, reloadService, service, useBluetoothCharacteristic } as const;
};

export default useBluetoothService;
