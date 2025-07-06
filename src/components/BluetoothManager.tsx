import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './BluetoothManager.scss';
import { 
  IconBluetooth,
  IconHeadphones,
  IconVolume,
  IconKeyboard,
  IconMouse,
  IconDeviceMobile,
  IconDeviceLaptop,
  IconRefresh,
  IconCircleCheck,
  IconUsers,
  IconLink,
  IconWifi0,
  IconWifi1,
  IconWifi2
} from "@tabler/icons-react";

interface BluetoothDevice {
  mac_address: string;
  name: string;
  device_type: string;
  connected: boolean;
  paired: boolean;
  trusted: boolean;
  rssi: number | null;
}

interface BluetoothStatus {
  enabled: boolean;
  discoverable: boolean;
  discovering: boolean;
  adapter_name: string;
}

export const BluetoothManager: React.FC = () => {
  const [bluetoothStatus, setBluetoothStatus] = useState<BluetoothStatus | null>(null);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [pairingTo, setPairingTo] = useState<string | null>(null);
  const [unpairingTo, setUnpairingTo] = useState<string | null>(null);
  const [trustingTo, setTrustingTo] = useState<string | null>(null);
  const [refreshingDevices, setRefreshingDevices] = useState(false);

  // Timeout helper function
  const createTimeoutPromise = (ms: number, operation: string) => {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operation} operation timed out after ${ms / 1000} seconds`));
      }, ms);
    });
  };

  const fetchBluetoothStatus = async () => {
    try {
      const status = await invoke<BluetoothStatus>('get_bluetooth_status');
      setBluetoothStatus(status);
    } catch (err) {
      console.error('Failed to get Bluetooth status:', err);
      setError(err as string);
    }
  };

  const fetchDevices = async () => {
    try {
      setRefreshingDevices(true);
      const deviceList = await invoke<BluetoothDevice[]>('get_bluetooth_devices');
      setDevices(deviceList);
    } catch (err) {
      console.error('Failed to get Bluetooth devices:', err);
      setError(err as string);
    } finally {
      setRefreshingDevices(false);
    }
  };

  const refreshDevicesOnly = async () => {
    setError(null);
    await fetchDevices();
  };

  const refreshAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Run both operations in parallel for faster loading
      await Promise.all([fetchBluetoothStatus(), fetchDevices()]);
    } catch (err) {
      // Error handling is done in individual functions
      console.error('Error during data refresh:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshSingleDevice = async (macAddress: string) => {
    try {
      const deviceInfo = await invoke<BluetoothDevice>('get_bluetooth_device_info', { macAddress });
      setDevices(prev => prev.map(device => 
        device.mac_address === macAddress ? deviceInfo : device
      ));
    } catch (err) {
      console.error('Failed to refresh device info:', err);
      // If single device refresh fails, refresh all devices
      await refreshDevicesOnly();
    }
  };

  useEffect(() => {
    // Initialize data loading asynchronously - don't block the component mount
    const initializeComponent = async () => {
      try {
        await refreshAll();
      } catch (err) {
        console.error('Failed to initialize Bluetooth data:', err);
      }
    };
    
    // Start the async initialization
    initializeComponent();
    
    // Refresh devices every 10 seconds (less frequent than before)
    const interval = setInterval(() => {
      // Only refresh if no operations are in progress
      if (!connectingTo && !pairingTo && !unpairingTo && !trustingTo) {
        refreshDevicesOnly().catch(err => {
          console.error('Failed to refresh Bluetooth devices:', err);
        });
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [connectingTo, pairingTo, unpairingTo, trustingTo]);

  // Auto-refresh devices when discovery is active (every 5 seconds)
  useEffect(() => {
    if (bluetoothStatus?.discovering) {
      const discoveryInterval = setInterval(() => {
        if (!connectingTo && !pairingTo && !unpairingTo && !trustingTo) {
          fetchDevices();
        }
      }, 5000);
      return () => clearInterval(discoveryInterval);
    }
  }, [bluetoothStatus?.discovering, connectingTo, pairingTo, unpairingTo, trustingTo]);

  const handleToggleBluetooth = async () => {
    if (!bluetoothStatus) return;
    
    try {
      await invoke('toggle_bluetooth', { enable: !bluetoothStatus.enabled });
      // Only refresh Bluetooth status, not all devices
      await fetchBluetoothStatus();
      if (!bluetoothStatus.enabled) {
        // If we're enabling Bluetooth, refresh devices after a short delay
        setTimeout(() => fetchDevices(), 1000);
      } else {
        // If we're disabling Bluetooth, clear the devices list
        setDevices([]);
      }
    } catch (err) {
      setError(err as string);
    }
  };

  const handleStartDiscovery = async () => {
    try {
      await invoke('start_bluetooth_discovery');
      // Only refresh Bluetooth status to show discovery state
      await fetchBluetoothStatus();
    } catch (err) {
      setError(err as string);
    }
  };

  const handleStopDiscovery = async () => {
    try {
      await invoke('stop_bluetooth_discovery');
      // Only refresh Bluetooth status to show discovery state
      await fetchBluetoothStatus();
    } catch (err) {
      setError(err as string);
    }
  };

  const handlePair = async (macAddress: string) => {
    setPairingTo(macAddress);
    try {
      const pairPromise = invoke('pair_bluetooth_device', { macAddress });
      const timeoutPromise = createTimeoutPromise(30000, 'Pair'); // 30 second timeout
      
      await Promise.race([pairPromise, timeoutPromise]);
      
      // Only refresh this specific device instead of all devices
      await refreshSingleDevice(macAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPairingTo(null);
    }
  };

  const handleUnpair = async (macAddress: string) => {
    setUnpairingTo(macAddress);
    try {
      const unpairPromise = invoke('unpair_bluetooth_device', { macAddress });
      const timeoutPromise = createTimeoutPromise(15000, 'Unpair'); // 15 second timeout
      
      await Promise.race([unpairPromise, timeoutPromise]);
      
      // Remove the device from the list instead of refreshing all
      setDevices(prev => prev.filter(device => device.mac_address !== macAddress));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUnpairingTo(null);
    }
  };

  const handleConnect = async (macAddress: string) => {
    setConnectingTo(macAddress);
    try {
      const connectPromise = invoke('connect_bluetooth_device', { macAddress });
      const timeoutPromise = createTimeoutPromise(20000, 'Connect'); // 20 second timeout
      
      await Promise.race([connectPromise, timeoutPromise]);
      
      // Only refresh this specific device instead of all devices
      await refreshSingleDevice(macAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectingTo(null);
    }
  };

  const handleDisconnect = async (macAddress: string) => {
    try {
      const disconnectPromise = invoke('disconnect_bluetooth_device', { macAddress });
      const timeoutPromise = createTimeoutPromise(10000, 'Disconnect'); // 10 second timeout
      
      await Promise.race([disconnectPromise, timeoutPromise]);
      
      // Only refresh this specific device instead of all devices
      await refreshSingleDevice(macAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTrust = async (macAddress: string, trust: boolean) => {
    setTrustingTo(macAddress);
    try {
      const trustPromise = invoke('trust_bluetooth_device', { macAddress, trust });
      const timeoutPromise = createTimeoutPromise(10000, trust ? 'Trust' : 'Untrust'); // 10 second timeout
      
      await Promise.race([trustPromise, timeoutPromise]);
      
      // Only refresh this specific device instead of all devices
      await refreshSingleDevice(macAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTrustingTo(null);
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'audio-headphones':
      case 'audio-headset':
        return <IconHeadphones size={20} />;
      case 'audio-card':
      case 'multimedia-player':
        return <IconVolume size={20} />;
      case 'input-keyboard':
        return <IconKeyboard size={20} />;
      case 'input-mouse':
        return <IconMouse size={20} />;
      case 'phone':
        return <IconDeviceMobile size={20} />;
      case 'computer':
        return <IconDeviceLaptop size={20} />;
      default:
        return <IconBluetooth size={20} />;
    }
  };

  const getSignalStrength = (rssi: number | null) => {
    if (!rssi) return null;
    if (rssi >= -50) return <IconWifi2 size={16} />;
    if (rssi >= -70) return <IconWifi1 size={16} />;
    if (rssi >= -90) return <IconWifi0 size={16} />;
    return <IconWifi0 size={16} />;
  };

  if (loading) {
    return (
      <div className="bluetooth-manager">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading Bluetooth devices...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bluetooth-manager">
        <div className="error">
          <h3>Error</h3>
          <p>{error}</p>
          <button className="retry-button" onClick={refreshAll}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bluetooth-manager">
      <div className="bluetooth-header">
        <div className="bluetooth-status">
          <h2>Bluetooth Devices</h2>
          <div className="status-info">
            <span className={`status-indicator ${bluetoothStatus?.enabled ? 'enabled' : 'disabled'}`}>
              {bluetoothStatus?.enabled ? '🟢' : '🔴'}
            </span>
            <span>{bluetoothStatus?.enabled ? 'Enabled' : 'Disabled'}</span>
            <span className="adapter-name">{bluetoothStatus?.adapter_name}</span>
            {bluetoothStatus?.discovering && (
              <span className="discovering">🔍 Discovering...</span>
            )}
            {refreshingDevices && (
              <span className="refreshing">🔄 Refreshing...</span>
            )}
          </div>
        </div>
        <div className="bluetooth-controls">
          <button
            className={`toggle-bluetooth ${bluetoothStatus?.enabled ? 'enabled' : 'disabled'}`}
            onClick={handleToggleBluetooth}
          >
            {bluetoothStatus?.enabled ? 'Disable Bluetooth' : 'Enable Bluetooth'}
          </button>
          {bluetoothStatus?.enabled && (
            <>
              {bluetoothStatus.discovering ? (
                <button className="discovery-button active" onClick={handleStopDiscovery}>
                  🔍 Stop Discovery
                </button>
              ) : (
                <button className="discovery-button" onClick={handleStartDiscovery}>
                  🔍 Start Discovery
                </button>
              )}
            </>
          )}
          <button className="refresh-button" onClick={refreshAll}>
            <IconRefresh size={16} /> Refresh
          </button>
        </div>
      </div>

      {bluetoothStatus?.enabled && (
        <div className="devices-list">
          {devices.length === 0 ? (
            <div className="no-devices">
              <p>No devices found</p>
              <p className="hint">Try starting discovery to find nearby devices</p>
            </div>
          ) : (
            devices.map((device) => (
              <div key={device.mac_address} className={`device-item ${device.connected ? 'connected' : ''} ${device.paired ? 'paired' : ''}`}>
                <div className="device-info">
                  <div className="device-name">
                    <span className="device-icon">{getDeviceIcon(device.device_type)}</span>
                    <div className="name-details">
                      <span className="name">{device.name}</span>
                      <span className="mac-address">{device.mac_address}</span>
                    </div>
                    <div className="device-badges">
                      {device.rssi && (
                        <span className="signal" title={`RSSI: ${device.rssi} dBm`}>
                          {getSignalStrength(device.rssi)}
                        </span>
                      )}
                      {device.paired && <span className="paired-badge" title="Paired"><IconUsers size={14} /></span>}
                      {device.trusted && <span className="trusted-badge" title="Trusted"><IconCircleCheck size={14} /></span>}
                      {device.connected && <span className="connected-badge" title="Connected"><IconLink size={14} /></span>}
                    </div>
                  </div>
                  <div className="device-details">
                    <span className="device-type">{device.device_type}</span>
                    {device.connected && <span className="connected-text">Connected</span>}
                    {device.paired && !device.connected && <span className="paired-text">Paired</span>}
                  </div>
                </div>
                <div className="device-actions">
                  {!device.paired ? (
                    <button
                      className="pair-button"
                      onClick={() => handlePair(device.mac_address)}
                      disabled={pairingTo === device.mac_address}
                    >
                      {pairingTo === device.mac_address ? 'Pairing...' : 'Pair'}
                    </button>
                  ) : (
                    <>
                      {device.connected ? (
                        <button
                          className="disconnect-button"
                          onClick={() => handleDisconnect(device.mac_address)}
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          className="connect-button"
                          onClick={() => handleConnect(device.mac_address)}
                          disabled={connectingTo === device.mac_address}
                        >
                          {connectingTo === device.mac_address ? 'Connecting...' : 'Connect'}
                        </button>
                      )}
                      <button
                        className={`trust-button ${device.trusted ? 'trusted' : ''}`}
                        onClick={() => handleTrust(device.mac_address, !device.trusted)}
                        disabled={trustingTo === device.mac_address}
                      >
                        {trustingTo === device.mac_address 
                          ? (device.trusted ? 'Untrusting...' : 'Trusting...') 
                          : (device.trusted ? 'Untrust' : 'Trust')
                        }
                      </button>
                      <button
                        className="unpair-button"
                        onClick={() => handleUnpair(device.mac_address)}
                        disabled={unpairingTo === device.mac_address}
                      >
                        {unpairingTo === device.mac_address ? 'Unpairing...' : 'Unpair'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
