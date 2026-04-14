import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';
import ConfigurationContext from '@/contexts/ConfigurationContext';
import useConnection from '@/hooks/useConnection';
import useBluetooth from '@/hooks/useBluetooth';
import { ConfigurationAPI } from '@/services/configApi';
import { BLETransport } from '@/services/bleTransport';
import type {
  ModbusConfig,
  DeviceProfile,
  ProfileSummary,
  SlaveAssignment,
  TestReadResult,
} from '@/types/modbus.types';
import type { MotorConfig } from '@/types/motor.types';

const ConfigurationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const connection = useConnection();
  const bluetooth = useBluetooth();

  const [api, setApi] = useState<ConfigurationAPI | null>(null);
  const [modbusConfig, setModbusConfig] = useState<ModbusConfig | null>(null);
  const [motorConfig, setMotorConfig] = useState<MotorConfig | null>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [slaves, setSlaves] = useState<SlaveAssignment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // ── BLE GATT Initialization ──────────────────────────────────────────────
  //
  // The full GATT chain (getPrimaryService → getCharacteristic →
  // startNotifications → BLETransport → ConfigurationAPI) is done in ONE
  // async function so there are no intermediate React renders adding latency.
  //
  // The 'cancelled' flag + transport.destroy() in the cleanup correctly
  // handle React StrictMode double-invocation, mid-init disconnects, and
  // component unmounts.
  //
  useEffect(() => {
    // ── WebSocket mode ────────────────────────────────────────────────────
    if (connection.mode === 'websocket') {
      if (connection.transport) {
        console.log('[ConfigProvider] WebSocket transport ready');
        setApi(new ConfigurationAPI(connection.transport));
      } else {
        setApi(null);
      }
      return;
    }

    // ── BLE mode ──────────────────────────────────────────────────────────
    if (!bluetooth.isConnected || !bluetooth.device?.gatt?.connected) {
      setApi(null);
      return;
    }

    let cancelled = false;
    let transport: BLETransport | null = null;

    const initGATT = async () => {
      try {
        const gatt = bluetooth.device!.gatt!;

        console.log('[ConfigProvider] Getting primary service...');
        const service = await gatt.getPrimaryService(__APP_SPP_BLE_SERVICE__);
        if (cancelled) return;

        console.log('[ConfigProvider] Getting characteristic...');
        const char = await service.getCharacteristic(__APP_SPP_BLE_CHARACTERISTIC__);
        if (cancelled) return;

        console.log('[ConfigProvider] Starting notifications...');
        await char.startNotifications();
        if (cancelled) return;

        transport = new BLETransport(char);
        setApi(new ConfigurationAPI(transport));
        console.log('[ConfigProvider] BLE API ready');

      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[ConfigProvider] GATT init failed:', msg);
        notifications.show({
          message: `BLE setup failed: ${msg}. Try disconnecting and reconnecting.`,
          color: 'red',
          autoClose: 5000,
        });
        setApi(null);
      }
    };

    initGATT();

    return () => {
      cancelled = true;
      if (transport) {
        transport.destroy();
        transport = null;
      }
      setApi(null);
    };
  }, [bluetooth.isConnected, connection.mode, connection.transport]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-load data after API becomes ready ───────────────────────────────
  // Runs whenever api changes from null → a live instance so the user sees
  // profiles / slaves immediately after connecting without pressing "Load".
  // NOTE: BLE is strictly one command in-flight. Sequential with small gaps
  //       prevents the BLE stack from being overwhelmed (which causes drops).
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    
    const autoLoad = async () => {
      try {
        console.log('[ConfigProvider] Starting auto-load sequence...');
        
        // 1. Profiles
        const profileList = await api.getProfiles();
        if (cancelled) return;
        setProfiles(Array.isArray(profileList) ? profileList : []);

        await new Promise((r) => setTimeout(r, 1000));
        if (cancelled) return;

        // 2. Slaves
        const slaveList = await api.getSlaves();
        if (cancelled) return;
        setSlaves(Array.isArray(slaveList) ? slaveList : []);

        await new Promise((r) => setTimeout(r, 1000));
        if (cancelled) return;

        // 3. Modbus UART Config
        const mbConfig = await api.getModbusConfig();
        if (cancelled) return;
        setModbusConfig(mbConfig);

        await new Promise((r) => setTimeout(r, 1000));
        if (cancelled) return;

        // 4. Motor Config
        const mc = await api.getMotorConfig();
        if (cancelled) return;
        setMotorConfig(mc);
        
        console.log('[ConfigProvider] Auto-load sequence complete');
      } catch (err) {
        console.error('[ConfigProvider] Auto-load failed:', err);
        // Silently ignore — user can press Load manually or refresh
      }
    };

    autoLoad();
    return () => { cancelled = true; };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset cached state on disconnect ────────────────────────────────────
  useEffect(() => {
    const connected = connection.mode === 'websocket'
      ? connection.isConnected
      : bluetooth.isConnected;

    if (!connected) {
      console.log('[ConfigProvider] Disconnected — clearing cached state');
      setModbusConfig(null);
      setMotorConfig(null);
      setProfiles([]);
      setSlaves([]);
      setError(null);
    }
  }, [connection.mode, connection.isConnected, bluetooth.isConnected]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const notReadyNotification = () => {
    console.warn('[ConfigProvider] API not ready — BLE still initializing');
    notifications.show({
      message: 'Not connected yet — please wait a moment and try again',
      color: 'orange',
      autoClose: 3000,
    });
  };

  const handleError = (error: unknown, operation: string) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${operation} failed:`, error);
    setError(message);
    notifications.show({
      message: `${operation} failed: ${message}`,
      color: 'red',
    });
    throw error;
  };

  // ============================================================
  // MODBUS UART CONFIGURATION
  // ============================================================

  const loadModbusConfig = useCallback(async () => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      const config = await api.getModbusConfig();
      setModbusConfig(config);
    } catch (error) {
      handleError(error, 'Load Modbus configuration');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const saveModbusUART = useCallback(async (data: Partial<ModbusConfig>) => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      if (data.uart_config) {
        await api.setModbusUART(data.uart_config);
      }
      notifications.show({
        message: 'Modbus UART configuration saved',
        color: 'green',
      });
      await loadModbusConfig();
    } catch (error) {
      handleError(error, 'Save Modbus UART configuration');
    } finally {
      setIsLoading(false);
    }
  }, [api, loadModbusConfig]);

  // ============================================================
  // AUTOMATION CONFIGURATION
  // ============================================================

  const loadMotorConfig = useCallback(async () => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      const mc = await api.getMotorConfig();
      setMotorConfig(mc);
      return mc;
    } catch (error) {
      handleError(error, 'Load automation configuration');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const updateMotorConfig = useCallback(async (data: Partial<MotorConfig>) => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      const resp = await api.setMotorConfig(data);
      if (resp.status === 'success') {
        const mc = await api.getMotorConfig();
        setMotorConfig(mc);
      }
      return resp;
    } catch (error) {
      handleError(error, 'Update automation configuration');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  // ============================================================
  // DEVICE PROFILES
  // ============================================================

  const loadProfiles = useCallback(async () => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      const list = await api.getProfiles();
      setProfiles(Array.isArray(list) ? list : []);
    } catch (error) {
      handleError(error, 'Load profiles');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const getProfile = useCallback(async (profileId: string): Promise<DeviceProfile> => {
    if (!api) { notReadyNotification(); return null as any; }
    return await api.getProfile(profileId);
  }, [api]);

  const addProfile = useCallback(async (profile: DeviceProfile) => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      await api.addProfile(profile);
      notifications.show({
        message: `Profile "${profile.profile_id}" added successfully`,
        color: 'green',
      });
      await loadProfiles();
    } catch (error) {
      handleError(error, 'Add profile');
    } finally {
      setIsLoading(false);
    }
  }, [api, loadProfiles]);

  const updateProfile = useCallback(async (profileId: string, data: Partial<DeviceProfile>) => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      await api.updateProfile(profileId, data);
      notifications.show({
        message: `Profile "${profileId}" updated successfully`,
        color: 'green',
      });
      await loadProfiles();
    } catch (error) {
      handleError(error, 'Update profile');
    } finally {
      setIsLoading(false);
    }
  }, [api, loadProfiles]);

  const deleteProfile = useCallback(async (profileId: string) => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      const resp = await api.sendCommand({ cmd: 'DELETE', section: 'profile', data: { profile_id: profileId } });
      if (resp.status === 'success') {
        notifications.show({
          message: `Profile "${profileId}" deleted successfully`,
          color: 'green',
        });
        // Optimistically remove from local list for instant UI feedback
        setProfiles((prev) => prev.filter((p) => p.profile_id !== profileId));
        await loadProfiles();
      } else {
        // Profile in use by a slave, or other soft error
        const msg = resp.message || 'Delete failed';
        const isInUse = msg.toLowerCase().includes('use') || msg.toLowerCase().includes('fail');
        notifications.show({
          title: 'Cannot delete profile',
          message: isInUse
            ? `Profile "${profileId}" is assigned to a slave. Remove the slave assignment first, then delete the profile.`
            : msg,
          color: 'orange',
          autoClose: 6000,
        });
      }
    } catch (error) {
      handleError(error, 'Delete profile');
    } finally {
      setIsLoading(false);
    }
  }, [api, loadProfiles]);

  // ============================================================
  // SLAVE ASSIGNMENTS
  // ============================================================

  const loadSlaves = useCallback(async () => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      const list = await api.getSlaves();
      setSlaves(Array.isArray(list) ? list : []);
    } catch (error) {
      handleError(error, 'Load slaves');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const addSlave = useCallback(async (assignment: SlaveAssignment) => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      await api.addSlave(assignment);
      notifications.show({
        message: `Slave ${assignment.slave_id} added successfully`,
        color: 'green',
      });
      await loadSlaves();
    } catch (error) {
      handleError(error, 'Add slave');
    } finally {
      setIsLoading(false);
    }
  }, [api, loadSlaves]);

  const updateSlave = useCallback(async (slaveId: number, data: Partial<SlaveAssignment>) => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      await api.updateSlave(slaveId, data);
      notifications.show({
        message: `Slave ${slaveId} updated successfully`,
        color: 'green',
      });
      await loadSlaves();
    } catch (error) {
      handleError(error, 'Update slave');
    } finally {
      setIsLoading(false);
    }
  }, [api, loadSlaves]);

  const deleteSlave = useCallback(async (slaveId: number) => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      await api.deleteSlave(slaveId);
      notifications.show({
        message: `Slave ${slaveId} deleted successfully`,
        color: 'green',
      });
      await loadSlaves();
    } catch (error) {
      handleError(error, 'Delete slave');
    } finally {
      setIsLoading(false);
    }
  }, [api, loadSlaves]);

  // ============================================================
  // TEST READ & MODBUS POLLING
  // ============================================================

  const testRead = useCallback(async (slaveId: number, profileId: string, baudRate?: number): Promise<TestReadResult> => {
    if (!api) { notReadyNotification(); return null as any; }
    return await api.testRead(slaveId, profileId, baudRate);
  }, [api]);

  const pauseModbusRead = useCallback(async (paused: boolean) => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      await api.pauseModbusRead(paused);
    } catch (error) {
      handleError(error, paused ? 'Pause Modbus read' : 'Resume Modbus read');
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  // ============================================================
  // PROFILE IMPORT / EXPORT
  // ============================================================

  const exportProfile = useCallback((profile: DeviceProfile) => {
    try {
      const exportData = { device: profile.device, blocks: profile.blocks };
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `profile_${profile.profile_id}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      notifications.show({ message: `Profile "${profile.profile_id}" exported`, color: 'green' });
    } catch (error) {
      handleError(error, 'Export profile');
    }
  }, []);

  const importProfile = useCallback(async (profile: DeviceProfile) => {
    if (!api) { notReadyNotification(); return null as any; }
    setIsLoading(true);
    setError(null);
    try {
      await api.addProfile(profile);
      notifications.show({ message: `Profile "${profile.profile_id}" imported`, color: 'green' });
      await loadProfiles();
    } catch (error) {
      handleError(error, 'Import profile');
    } finally {
      setIsLoading(false);
    }
  }, [api, loadProfiles]);

  // ============================================================
  // UTILITY
  // ============================================================

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loadModbusConfig();
      await loadProfiles();
      await loadSlaves();
      await loadMotorConfig();
    } catch (error) {
      // Errors handled in individual load functions
    } finally {
      setIsLoading(false);
    }
  }, [loadModbusConfig, loadProfiles, loadSlaves]);

  const clearError = useCallback(() => { setError(null); }, []);

  const reboot = useCallback(async () => {
    if (!api) { notReadyNotification(); return null as any; }
    // Show success immediately — device reboots and drops BLE, so we never get a response.
    notifications.show({ 
      title: 'Rebooting...', 
      message: 'Device is restarting. BLE will disconnect shortly. Reconnect after ~15 seconds.', 
      color: 'blue',
      autoClose: 8000,
    });
    try {
      // Fire with short 3s timeout — we don't expect a response after reboot
      await api.reboot();
    } catch (error: any) {
      // Silence expected timeout/disconnect errors after reboot
      const msg = error?.message?.toLowerCase() || '';
      if (!msg.includes('timeout') && !msg.includes('disconnect') && !msg.includes('timed')) {
        console.warn('[Reboot] Unexpected error:', error);
      }
    }
  }, [api]);

  const factoryReset = useCallback(async () => {
    if (!api) { notReadyNotification(); return null as any; }
    notifications.show({ 
      title: 'Factory Reset', 
      message: 'Resetting device... BLE will disconnect shortly. Reconnect after ~15 seconds.', 
      color: 'orange',
      autoClose: 8000,
    });
    try {
      await api.factoryReset(true);
    } catch (error: any) {
      const msg = error?.message?.toLowerCase() || '';
      if (!msg.includes('timeout') && !msg.includes('disconnect') && !msg.includes('timed')) {
        console.warn('[FactoryReset] Unexpected error:', error);
      }
    }
  }, [api]);

  const getDeviceStatus = useCallback(async () => {
    if (!api) { notReadyNotification(); return null as any; }
    const response = await api.getDeviceStatus();
    return response.data;
  }, [api]);

  const liveReadModbus = useCallback(async () => {
    if (!api) { notReadyNotification(); return null as any; }
    const response = await api.liveReadModbus();
    return response.data;
  }, [api]);

  const getNetworkStatus = useCallback(async () => {
    if (!api) { notReadyNotification(); return null as any; }
    return await api.getNetworkStatus();
  }, [api]);

  const setNetworkConfig = useCallback(async (data: { apn?: string; apn_username?: string; apn_password?: string }) => {
    if (!api) { notReadyNotification(); return null as any; }
    return await api.setNetworkConfig(data);
  }, [api]);

  return (
    <ConfigurationContext.Provider
      value={{
        api,
        modbusConfig,
        motorConfig,
        profiles,
        slaves,
        isLoading,
        error,
        loadModbusConfig,
        loadMotorConfig,
        saveModbusUART,
        updateMotorConfig,
        loadProfiles,
        getProfile,
        addProfile,
        updateProfile,
        deleteProfile,
        loadSlaves,
        addSlave,
        updateSlave,
        deleteSlave,
        testRead,
        pauseModbusRead,
        exportProfile,
        importProfile,
        getDeviceStatus,
        liveReadModbus,
        getNetworkStatus,
        setNetworkConfig,
        refresh,
        clearError,
        reboot,
        factoryReset,
      }}
    >
      {children}
    </ConfigurationContext.Provider>
  );
};

export default ConfigurationProvider;