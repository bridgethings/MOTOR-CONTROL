import { createContext } from 'react';

export interface BluetoothContextType {
  isConnected: boolean;
  device: BluetoothDevice | null;
  connect: (services: string[]) => void;
  disconnect: () => void;
  isSupported: boolean;
  isFailed: boolean;
  isConnecting: boolean;
}

const BluetoothContext = createContext<BluetoothContextType | undefined>(undefined);

export default BluetoothContext;
