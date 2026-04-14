import { createContext } from 'react';
import type { ITransport, TransportMode } from '@/services/transport';

export interface ConnectionContextType {
  mode: TransportMode;
  isConnected: boolean;
  isConnecting: boolean;
  isSupported: boolean;
  transport: ITransport | null;
  connect: () => void;
  disconnect: () => void;
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(undefined);

export default ConnectionContext;
