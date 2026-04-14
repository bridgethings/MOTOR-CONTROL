// WebSocket Transport — connects to ESP32's /ws endpoint for command/response

import type { ConfigCommand, ConfigResponse } from '@/types/responses.types';
import type { ITransport } from './transport';

export class WSTransport implements ITransport {
  private ws: WebSocket | null = null;
  private responseListeners: ((response: ConfigResponse) => void)[] = [];
  private _isConnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  public onConnectionChange?: (connected: boolean) => void;

  constructor(url: string) {
    this.url = url;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch {
        reject(new Error('Failed to create WebSocket'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this._isConnected = true;
        console.log('WebSocket connected to', this.url);
        this.onConnectionChange?.(true);
        resolve();
      };

      this.ws.onclose = () => {
        this._isConnected = false;
        console.log('WebSocket disconnected');
        this.onConnectionChange?.(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (event) => {
        clearTimeout(timeout);
        console.error('WebSocket error:', event);
        if (!this._isConnected) {
          reject(new Error('WebSocket connection failed'));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data) as ConfigResponse;
          const listener = this.responseListeners.shift();
          if (listener) {
            listener(response);
          } else {
            console.warn('WebSocket message with no listener:', response);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket response:', error, event.data);
        }
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('WebSocket reconnecting...');
      this.connect().catch((err) => {
        console.error('WebSocket reconnect failed:', err);
      });
    }, 3000);
  }

  async sendCommand(command: ConfigCommand, timeout: number = 10000): Promise<ConfigResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Command timeout - no response received'));
      }, timeout);

      this.responseListeners.push((response) => {
        clearTimeout(timer);
        if (response.status === 'error') {
          reject(new Error(response.message || 'Command failed'));
        } else {
          resolve(response);
        }
      });

      const jsonCommand = JSON.stringify(command);
      console.log('WS sending:', jsonCommand);
      this.ws!.send(jsonCommand);
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect on intentional close
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
    this.onConnectionChange?.(false);
  }
}
