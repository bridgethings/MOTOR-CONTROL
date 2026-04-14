// BLE Transport — wraps Web Bluetooth GATT characteristic for command/response

import type { ConfigCommand, ConfigResponse } from '@/types/responses.types';
import type { ITransport } from './transport';
import sliceStringIntoChunks from '@/utils/sliceStringIntoChunks';
import stringToUint8Array from '@/utils/stringToUint8Array';

const LOG_PREFIX = '[BLE-Transport]';

export class BLETransport implements ITransport {
  private characteristic: BluetoothRemoteGATTCharacteristic;
  private responseListeners: ((response: ConfigResponse) => void)[] = [];
  private responseBuffer: string = '';
  // Store bound listener so it can be removed in destroy()
  private readonly boundNotificationHandler: (event: Event) => void;
  private destroyed = false;

  constructor(characteristic: BluetoothRemoteGATTCharacteristic) {
    console.log(LOG_PREFIX, 'Created with characteristic:', characteristic.uuid,
      'GATT connected:', characteristic.service?.device?.gatt?.connected);
    this.characteristic = characteristic;
    this.boundNotificationHandler = this.handleNotificationEvent.bind(this);
    this.characteristic.addEventListener('characteristicvaluechanged', this.boundNotificationHandler);
    console.log(LOG_PREFIX, 'Notification listener registered');
  }

  /** Remove the event listener and reject all pending command listeners */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.characteristic.removeEventListener('characteristicvaluechanged', this.boundNotificationHandler);
    console.log(LOG_PREFIX, 'Destroyed — listener removed, rejecting', this.responseListeners.length, 'pending listener(s)');
    // Reject any commands still waiting for a response
    const pending = this.responseListeners.splice(0);
    pending.forEach((listener) => listener({ status: 'error', message: 'BLE transport destroyed' } as ConfigResponse));
    this.responseBuffer = '';
  }

  get isConnected(): boolean {
    if (this.destroyed) return false;
    try {
      return this.characteristic.service?.device?.gatt?.connected ?? false;
    } catch {
      return false;
    }
  }

  private handleNotificationEvent(event: Event) {
    if (this.destroyed) return;
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (target.value) {
      this.handleIncomingData(target.value);
    }
  }

  private handleIncomingData(dataView: DataView) {
    const chunk = new TextDecoder('utf-8').decode(dataView);
    this.responseBuffer += chunk;

    if (!this.responseBuffer.includes('\n')) return;

    const lines = this.responseBuffer.split('\n');
    this.responseBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line) as ConfigResponse;
        // Skip the firmware welcome/handshake message — it has a 'device' field,
        // command responses (including errors) do not.
        if ((response as any).device !== undefined) {
          console.log(LOG_PREFIX, 'RX welcome message — ignoring (status:', response.status, ')');
          continue;
        }
        console.log(LOG_PREFIX, 'RX response:', response.status, response.cmd ?? '(no cmd)',
          `(${line.length} bytes, ${this.responseListeners.length} listener(s) queued)`);
        this.notifyResponseListeners(response);
      } catch (error) {
        console.error(LOG_PREFIX, 'Failed to parse BLE response:', error, line.substring(0, 200));
      }
    }
  }

  private notifyResponseListeners(response: ConfigResponse) {
    // FIFO: one response resolves the oldest pending command listener
    const listener = this.responseListeners.shift();
    if (listener) {
      console.log(LOG_PREFIX, 'Dispatching to listener (remaining in queue:', this.responseListeners.length, ')');
      listener(response);
    } else {
      console.warn(LOG_PREFIX, 'Response received but no listener in queue — discarding');
    }
  }

  async sendCommand(command: ConfigCommand, timeout: number = 10000): Promise<ConfigResponse> {
    return new Promise((resolve, reject) => {
      if (this.destroyed) {
        reject(new Error('BLE transport destroyed'));
        return;
      }
      if (!this.isConnected) {
        reject(new Error('BLE not connected'));
        return;
      }

      console.log(LOG_PREFIX, 'sendCommand:', command.cmd, command.section,
        '| pending listeners:', this.responseListeners.length);

      let settled = false;

      const responseListener = (response: ConfigResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.log(LOG_PREFIX, 'Got response for', command.cmd, ':', response.status);
        if (response.status === 'error') {
          reject(new Error(response.message || 'Command failed'));
        } else {
          resolve(response);
        }
      };

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        const idx = this.responseListeners.indexOf(responseListener);
        if (idx !== -1) this.responseListeners.splice(idx, 1);
        console.error(LOG_PREFIX, 'TIMEOUT waiting for response to', command.cmd,
          '| remaining in queue:', this.responseListeners.length);
        reject(new Error('Command timeout - no response received'));
      }, timeout);

      this.responseListeners.push(responseListener);

      const jsonCommand = JSON.stringify(command) + '\n';
      console.log(LOG_PREFIX, 'TX:', command.cmd, command.section, `(${jsonCommand.length} bytes)`);
      const chunks = sliceStringIntoChunks(jsonCommand, 512);

      (async () => {
        try {
          for (let i = 0; i < chunks.length; i++) {
            if (this.destroyed || !this.isConnected) {
              throw new Error('BLE disconnected during send');
            }
            await this.characteristic.writeValueWithoutResponse(stringToUint8Array(chunks[i]));
          }
          console.log(LOG_PREFIX, 'All chunks sent for', command.cmd);
        } catch (error) {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            const idx = this.responseListeners.indexOf(responseListener);
            if (idx !== -1) this.responseListeners.splice(idx, 1);
            console.error(LOG_PREFIX, 'Write FAILED:', error);
            reject(error);
          }
        }
      })();
    });
  }

  disconnect(): void {
    // BLE physical disconnect is handled by BluetoothProvider
    this.destroy();
  }
}