import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './WifiManager.scss';
import { 
  IconWifi, 
  IconLock, 
  IconLockOpen, 
  IconRefresh, 
  IconDeviceFloppy,
  IconWifi0,
  IconWifi1,
  IconWifi2,
  IconCircleCheck,
  IconCircleX
} from "@tabler/icons-react";

interface WifiNetwork {
  ssid: string;
  signal_strength: number;
  security: string;
  connected: boolean;
  saved: boolean;
  in_use: boolean;
}

interface WifiStatus {
  enabled: boolean;
  connected_ssid: string | null;
  interface: string;
}

export const WifiManager: React.FC = () => {
  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState<string | null>(null);
  const [password, setPassword] = useState('');

  const fetchWifiStatus = async () => {
    try {
      const status = await invoke<WifiStatus>('get_wifi_status');
      setWifiStatus(status);
    } catch (err) {
      console.error('Failed to get WiFi status:', err);
      setError(err as string);
    }
  };

  const fetchNetworks = async () => {
    try {
      const networkList = await invoke<WifiNetwork[]>('get_wifi_networks');
      // Sort to ensure saved networks are at the top, then by signal strength
      const sortedNetworks = networkList.sort((a, b) => {
        if (a.saved && !b.saved) return -1;
        if (!a.saved && b.saved) return 1;
        return b.signal_strength - a.signal_strength;
      });
      setNetworks(sortedNetworks);
    } catch (err) {
      console.error('Failed to get WiFi networks:', err);
      setError(err as string);
    }
  };

  const refreshNetworks = async () => {
    setLoading(true);
    try {
      // Trigger a manual rescan with authentication
      await invoke('refresh_wifi_networks');
      // Wait a moment for the scan to complete, then fetch networks
      setTimeout(async () => {
        await fetchNetworks();
        setLoading(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to refresh WiFi networks:', err);
      setError(err as string);
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Run both operations in parallel for faster loading
      await Promise.all([fetchWifiStatus(), fetchNetworks()]);
    } catch (err) {
      // Error handling is done in individual functions
      console.error('Error during data refresh:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initialize data loading asynchronously - don't block the component mount
    const initializeComponent = async () => {
      try {
        await refreshData();
      } catch (err) {
        console.error('Failed to initialize Wi-Fi data:', err);
      }
    };
    
    // Start the async initialization
    initializeComponent();
    
    // Set up periodic refresh every 10 seconds
    const interval = setInterval(() => {
      refreshData().catch(err => {
        console.error('Failed to refresh Wi-Fi data:', err);
      });
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const handleToggleWifi = async () => {
    if (!wifiStatus) return;
    
    try {
      await invoke('toggle_wifi', { enable: !wifiStatus.enabled });
      await refreshData();
    } catch (err) {
      setError(err as string);
    }
  };

  const handleConnect = async (ssid: string, needsPassword: boolean) => {
    if (needsPassword && !networks.find(n => n.ssid === ssid)?.saved) {
      setShowPasswordDialog(ssid);
      return;
    }

    setConnectingTo(ssid);
    try {
      await invoke('connect_wifi', { ssid, password: null });
      await refreshData();
    } catch (err) {
      setError(err as string);
    } finally {
      setConnectingTo(null);
    }
  };

  const handleConnectWithPassword = async () => {
    if (!showPasswordDialog) return;

    setConnectingTo(showPasswordDialog);
    try {
      await invoke('connect_wifi', { 
        ssid: showPasswordDialog, 
        password: password || null 
      });
      await refreshData();
      setShowPasswordDialog(null);
      setPassword('');
    } catch (err) {
      setError(err as string);
    } finally {
      setConnectingTo(null);
    }
  };

  const handleDisconnect = async (ssid: string) => {
    try {
      await invoke('disconnect_wifi', { ssid });
      await refreshData();
    } catch (err) {
      setError(err as string);
    }
  };

  const handleForget = async (ssid: string) => {
    try {
      await invoke('forget_wifi', { ssid });
      await refreshData();
    } catch (err) {
      setError(err as string);
    }
  };

  const getSignalIcon = (strength: number) => {
    if (strength >= 75) return <IconWifi size={16} />;
    if (strength >= 50) return <IconWifi2 size={16} />;
    if (strength >= 25) return <IconWifi1 size={16} />;
    return <IconWifi0 size={16} />;
  };

  const getSecurityIcon = (security: string) => {
    return security && security !== '--' ? <IconLock size={16} /> : <IconLockOpen size={16} />;
  };

  if (loading) {
    return (
      <div className="wifi-manager">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading Wi-Fi networks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wifi-manager">
        <div className="error">
          <h3>Error</h3>
          <p>{error}</p>
          <button className="retry-button" onClick={refreshData}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wifi-manager">
      <div className="wifi-header">
        <div className="wifi-status">
          <h2>Wi-Fi Networks</h2>
          <div className="status-info">
            <span className={`status-indicator ${wifiStatus?.enabled ? 'enabled' : 'disabled'}`}>
              {wifiStatus?.enabled ? <IconCircleCheck size={16} /> : <IconCircleX size={16} />}
            </span>
            <span>{wifiStatus?.enabled ? 'Enabled' : 'Disabled'}</span>
            {wifiStatus?.connected_ssid && (
              <span className="connected-network">
                Connected to: {wifiStatus.connected_ssid}
              </span>
            )}
          </div>
        </div>
        <div className="wifi-controls">
          <button
            className={`toggle-wifi ${wifiStatus?.enabled ? 'enabled' : 'disabled'}`}
            onClick={handleToggleWifi}
          >
            {wifiStatus?.enabled ? 'Disable Wi-Fi' : 'Enable Wi-Fi'}
          </button>
          <button className="refresh-button" onClick={refreshNetworks}>
            <IconRefresh size={16} /> Refresh
          </button>
        </div>
      </div>

      {wifiStatus?.enabled && (
        <div className="networks-list">
          {networks.length === 0 ? (
            <div className="no-networks">
              <p>No networks found</p>
            </div>
          ) : (
            networks.map((network) => (
              <div key={network.ssid} className={`network-item ${network.connected ? 'connected' : ''}`}>
                <div className="network-info">
                  <div className="network-name">
                    <span className="ssid">{network.ssid}</span>
                    <div className="network-badges">
                      <span className="security">{getSecurityIcon(network.security)}</span>
                      <span className="signal">{getSignalIcon(network.signal_strength)}</span>
                      <span className="signal-text">{network.signal_strength}%</span>
                      {network.saved && <span className="saved-badge"><IconDeviceFloppy size={16} /></span>}
                    </div>
                  </div>
                  <div className="network-details">
                    <span className="security-text">{network.security || 'Open'}</span>
                    {network.connected && <span className="connected-text">Connected</span>}
                  </div>
                </div>
                <div className="network-actions">
                  {network.connected ? (
                    <button
                      className="disconnect-button"
                      onClick={() => handleDisconnect(network.ssid)}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      className="connect-button"
                      onClick={() => handleConnect(network.ssid, !!network.security && network.security !== '--')}
                      disabled={connectingTo === network.ssid}
                    >
                      {connectingTo === network.ssid ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                  {network.saved && (
                    <button
                      className="forget-button"
                      onClick={() => handleForget(network.ssid)}
                    >
                      Forget
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showPasswordDialog && (
        <div className="password-dialog-overlay">
          <div className="password-dialog">
            <h3>Connect to {showPasswordDialog}</h3>
            <p>Enter the network password:</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              onKeyPress={(e) => e.key === 'Enter' && handleConnectWithPassword()}
              autoFocus
            />
            <div className="dialog-actions">
              <button
                className="cancel-button"
                onClick={() => {
                  setShowPasswordDialog(null);
                  setPassword('');
                }}
              >
                Cancel
              </button>
              <button
                className="connect-button"
                onClick={handleConnectWithPassword}
                disabled={connectingTo === showPasswordDialog}
              >
                {connectingTo === showPasswordDialog ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
