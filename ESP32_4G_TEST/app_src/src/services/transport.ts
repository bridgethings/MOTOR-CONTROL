// Transport abstraction — allows BLE or WebSocket for device communication

import type { ConfigCommand, ConfigResponse } from '@/types/responses.types';

export interface ITransport {
  sendCommand(command: ConfigCommand, timeout?: number): Promise<ConfigResponse>;
  readonly isConnected: boolean;
  disconnect(): void;
}

export type TransportMode = 'ble' | 'websocket';

/**
 * Auto-detect transport mode based on how the page was loaded:
 * - Served from ESP32 IP (not localhost/dev) → WebSocket
 * - Served from dev server (localhost, 127.0.0.1) → BLE
 */
export function detectTransportMode(): TransportMode {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '' || host.includes(':') || host.endsWith('.github.io')) {
    return 'ble';
  }
  return 'websocket';
}
