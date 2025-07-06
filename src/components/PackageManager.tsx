import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './PackageManager.scss';
import { 
  IconPackage,
  IconDownload,
  IconTrash,
  IconSearch,
  IconX,
  IconLoader,
  IconArrowUp
} from "@tabler/icons-react";

interface PackageInfo {
  name: string;
  version: string;
  description: string;
  installed: boolean;
  size?: string;
  repo?: string;
  updatable?: boolean;
  new_version?: string;
}

interface PackageOperation {
  operation: 'install' | 'remove' | 'update' | 'search';
  package_name?: string;
  progress: number;
  status: string;
  output: string[];
  running: boolean;
}

export const PackageManager: React.FC = () => {
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'installed' | 'search' | 'updates'>('installed');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<PackageOperation | null>(null);
  const [aurHelper, setAurHelper] = useState<'yay' | 'paru' | 'pacman'>('pacman');

  // Detect available AUR helper
  useEffect(() => {
    const detectAurHelper = async () => {
      try {
        const helper = await invoke<string>('detect_aur_helper');
        setAurHelper(helper as 'yay' | 'paru' | 'pacman');
      } catch (err) {
        console.warn('Failed to detect AUR helper:', err);
      }
    };
    detectAurHelper();
  }, []);

  // Listen for package operation progress
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<PackageOperation>('package-progress', (event) => {
        setOperation(event.payload);
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Handle operation completion
  useEffect(() => {
    if (operation && !operation.running) {
      // Check if the operation completed successfully (no error in status)
      const isSuccess = !operation.status.toLowerCase().includes('error') && 
                       !operation.status.toLowerCase().includes('failed');
      
      if (isSuccess) {
        switch (operation.operation) {
          case 'update':
            if (operation.package_name) {
              // Single package update - remove from updates list
              if (activeTab === 'updates') {
                setPackages(prevPackages => 
                  prevPackages.filter(pkg => pkg.name !== operation.package_name)
                );
              }
              // Also refresh installed packages if that tab is active
              if (activeTab === 'installed') {
                loadPackages('installed');
              }
            } else {
              // System update - refresh current tab
              if (activeTab === 'updates') {
                loadPackages('updates');
              } else if (activeTab === 'installed') {
                loadPackages('installed');
              }
            }
            break;
          
          case 'install':
            if (operation.package_name) {
              // Refresh installed packages and update search results
              if (activeTab === 'installed') {
                loadPackages('installed');
              } else if (activeTab === 'search') {
                // Update the package in search results to show as installed
                setPackages(prevPackages => 
                  prevPackages.map(pkg => 
                    pkg.name === operation.package_name 
                      ? { ...pkg, installed: true }
                      : pkg
                  )
                );
              }
            }
            break;
          
          case 'remove':
            if (operation.package_name) {
              // Remove from installed packages and update search results
              if (activeTab === 'installed') {
                setPackages(prevPackages => 
                  prevPackages.filter(pkg => pkg.name !== operation.package_name)
                );
              } else if (activeTab === 'search') {
                // Update the package in search results to show as not installed
                setPackages(prevPackages => 
                  prevPackages.map(pkg => 
                    pkg.name === operation.package_name 
                      ? { ...pkg, installed: false }
                      : pkg
                  )
                );
              }
            }
            break;
        }
      }
    }
  }, [operation, activeTab]);

  const loadPackages = async (type: 'installed' | 'search' | 'updates', query?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      let result: PackageInfo[];
      
      switch (type) {
        case 'installed':
          result = await invoke<PackageInfo[]>('get_installed_packages');
          break;
        case 'search':
          if (!query) {
            result = [];
          } else {
            result = await invoke<PackageInfo[]>('search_packages', { 
              query, 
              helper: aurHelper 
            });
          }
          break;
        case 'updates':
          result = await invoke<PackageInfo[]>('get_package_updates', { 
            helper: aurHelper 
          });
          break;
      }
      
      setPackages(result);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleInstallPackage = async (packageName: string) => {
    try {
      await invoke('install_package', { 
        packageName: packageName, 
        helper: aurHelper 
      });
      // Operation completion will be handled by the progress listener
    } catch (err) {
      setError(err as string);
    }
  };

  const handleRemovePackage = async (packageName: string) => {
    try {
      await invoke('remove_package', { 
        packageName: packageName 
      });
      // Operation completion will be handled by the progress listener
    } catch (err) {
      setError(err as string);
    }
  };

  const handleUpdatePackage = async (packageName: string) => {
    try {
      await invoke('update_package', { 
        packageName: packageName, 
        helper: aurHelper 
      });
      // Operation completion will be handled by the progress listener
    } catch (err) {
      setError(err as string);
    }
  };

  const handleSystemUpdate = async () => {
    try {
      await invoke('system_update', { 
        helper: aurHelper 
      });
      // Operation completion will be handled by the progress listener
      // For system updates, we'll refresh the current tab when complete
    } catch (err) {
      setError(err as string);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.trim()) {
      setActiveTab('search');
      await loadPackages('search', searchQuery);
    }
  };

  // Load packages when tab changes
  useEffect(() => {
    if (activeTab === 'installed') {
      loadPackages('installed');
    } else if (activeTab === 'updates') {
      loadPackages('updates');
    }
  }, [activeTab, aurHelper]);

  const filteredPackages = packages.filter(pkg => 
    pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pkg.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="package-manager">
      <div className="header">
        <div className="header-content">
          <h2>Package Manager</h2>
          <p>Manage system packages with {aurHelper === 'pacman' ? 'pacman' : `${aurHelper} (AUR)`}</p>
        </div>
        <div className="header-controls">
          <div className="aur-helper-selector">
            <label>Package Manager:</label>
            <select value={aurHelper} onChange={(e) => setAurHelper(e.target.value as any)}>
              <option value="pacman">pacman (official)</option>
              <option value="yay">yay (AUR)</option>
              <option value="paru">paru (AUR)</option>
            </select>
          </div>
          <button 
            className="system-update-button" 
            onClick={handleSystemUpdate}
            disabled={operation?.running}
          >
            <IconArrowUp size={16} />
            {operation?.running ? 'Updating...' : 'System Update'}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-section">
        <div className="search-bar">
          <IconSearch size={20} />
          <input
            type="text"
            placeholder="Search packages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} disabled={!searchQuery.trim()}>
            Search
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'installed' ? 'active' : ''}`}
          onClick={() => setActiveTab('installed')}
        >
          <IconPackage size={16} />
          Installed ({packages.length})
        </button>
        <button 
          className={`tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <IconSearch size={16} />
          Search Results
        </button>
        <button 
          className={`tab ${activeTab === 'updates' ? 'active' : ''}`}
          onClick={() => setActiveTab('updates')}
        >
          <IconArrowUp size={16} />
          Updates Available
        </button>
      </div>

      {/* Operation Progress */}
      {operation?.running && (
        <div className="operation-progress">
          <div className="progress-header">
            <div className="progress-info">
              <IconLoader size={16} className="spinning" />
              <span>{operation.status}</span>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${operation.progress}%` }}
              />
            </div>
          </div>
          <div className="terminal-output">
            {operation.output.slice(-10).map((line, index) => (
              <div key={index} className="terminal-line">{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Package List */}
      <div className="package-list">
        {loading ? (
          <div className="loading">
            <IconLoader size={32} className="spinning" />
            <p>Loading packages...</p>
          </div>
        ) : error ? (
          <div className="error">
            <IconX size={32} />
            <h3>Error</h3>
            <p>{error}</p>
            <button onClick={() => loadPackages(activeTab, searchQuery)}>
              Retry
            </button>
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="empty">
            <IconPackage size={32} />
            <p>
              {activeTab === 'search' ? 'No packages found' : 
               activeTab === 'updates' ? 'All packages are up to date' :
               'No packages installed'}
            </p>
          </div>
        ) : (
          <div className="packages">
            {filteredPackages.map((pkg) => (
              <div key={pkg.name} className="package-card">
                <div className="package-info">
                  <div className="package-header">
                    <h3>{pkg.name}</h3>
                    <div className="package-meta">
                      <span className="version">{pkg.version}</span>
                      {pkg.new_version && (
                        <span className="new-version">→ {pkg.new_version}</span>
                      )}
                      {pkg.repo && <span className="repo">{pkg.repo}</span>}
                      {pkg.size && <span className="size">{pkg.size}</span>}
                    </div>
                  </div>
                  <p className="description">{pkg.description}</p>
                </div>
                <div className="package-actions">
                  {pkg.installed ? (
                    <>
                      {pkg.updatable && (
                        <button 
                          className="update-button"
                          onClick={() => handleUpdatePackage(pkg.name)}
                          disabled={operation?.running}
                        >
                          <IconArrowUp size={16} />
                          Update
                        </button>
                      )}
                      <button 
                        className="remove-button"
                        onClick={() => handleRemovePackage(pkg.name)}
                        disabled={operation?.running}
                      >
                        <IconTrash size={16} />
                        Remove
                      </button>
                    </>
                  ) : (
                    <button 
                      className="install-button"
                      onClick={() => handleInstallPackage(pkg.name)}
                      disabled={operation?.running}
                    >
                      <IconDownload size={16} />
                      Install
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
