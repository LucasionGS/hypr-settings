import { invoke } from "@tauri-apps/api/core";
import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';

export interface Monitor {
  id: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  refreshRate: number;
  disabled: boolean;
  scale: number;
  availableModes: string[];
}

export interface DisplaySettings {
  resolutions: string[];
  refreshRates: number[];
}

interface HyprlandContextType {
  monitors: Monitor[];
  isLoading: boolean;
  error: string | null;
  selectedMonitor: Monitor | null;
  
  // Actions
  loadMonitors: () => Promise<void>;
  selectMonitor: (monitor: Monitor) => void;
  updateMonitor: (monitor: Monitor) => void;
  saveConfiguration: (monitorsToSave?: Monitor[]) => Promise<void>;
  getDisplaySettings: (monitor: Monitor) => DisplaySettings;
}

const HyprlandContext = createContext<HyprlandContextType | undefined>(undefined);

interface HyprlandProviderProps {
  children: ReactNode;
}

export function HyprlandProvider({ children }: HyprlandProviderProps) {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const monitorsRef = useRef<Monitor[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonitor, setSelectedMonitor] = useState<Monitor | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    console.log('Updating monitorsRef with new state:', monitors);
    monitorsRef.current = monitors;
  }, [monitors]);

  const loadMonitors = useCallback(async () => {
    console.log('=== LOAD MONITORS CALLED ===');
    setIsLoading(true);
    setError(null);
    
    try {
      const monitorData = await invoke<Monitor[]>("get_monitors");
      console.log('Loaded monitor data from backend:', monitorData);
      setMonitors(monitorData);
      
      // Only select first monitor if no monitor is currently selected
      if (monitorData.length > 0 && !selectedMonitor) {
        console.log('No selected monitor, selecting first one');
        setSelectedMonitor(monitorData[0]);
      } else if (selectedMonitor) {
        // If we have a selected monitor, find the updated version from the new data
        const updatedSelectedMonitor = monitorData.find(m => m.id === selectedMonitor.id);
        if (updatedSelectedMonitor) {
          console.log('Updating selected monitor from loaded data');
          setSelectedMonitor(updatedSelectedMonitor);
        }
      }
      console.log('=== END LOAD MONITORS ===');
    } catch (err: any) {
      console.error("Error loading monitors:", err);
      setError(err.message || "Failed to load monitors");
    } finally {
      setIsLoading(false);
    }
  }, []); // Remove selectedMonitor from dependencies to prevent reloading

  const selectMonitor = useCallback((monitor: Monitor) => {
    console.log('=== SELECT MONITOR CALLED ===');
    console.log('Selecting monitor:', monitor);
    // Always get the most up-to-date version of the monitor from current state
    setMonitors(currentMonitors => {
      const upToDateMonitor = currentMonitors.find(m => m.id === monitor.id) || monitor;
      console.log('Up-to-date monitor from state:', upToDateMonitor);
      setSelectedMonitor(upToDateMonitor);
      console.log('=== END SELECT MONITOR ===');
      return currentMonitors; // Return same state, don't modify
    });
  }, []);

  const updateMonitor = useCallback((updatedMonitor: Monitor) => {
    console.log('=== UPDATE MONITOR CALLED ===');
    console.log('Updating monitor in state:', updatedMonitor);
    setMonitors(prev => {
      const newMonitors = prev.map(m => m.id === updatedMonitor.id ? updatedMonitor : m);
      console.log('Previous monitors state:', prev);
      console.log('New monitors state:', newMonitors);
      console.log('Updated monitor details:', newMonitors.find(m => m.id === updatedMonitor.id));
      console.log('=== END UPDATE MONITOR ===');
      return newMonitors;
    });
    setSelectedMonitor(updatedMonitor);
    console.log('Set selected monitor to:', updatedMonitor);
  }, []);

  const saveConfiguration = useCallback(async (monitorsToSave?: Monitor[]) => {
    try {
      const currentMonitors = monitorsToSave || monitorsRef.current;
      console.log('Saving configuration with monitors from ref:', currentMonitors);
      console.log('Current monitors state:', monitors);
      console.log('Ref vs state match:', JSON.stringify(currentMonitors) === JSON.stringify(monitors));
      await invoke("save_monitor_config", { monitors: currentMonitors });
      console.log('Configuration saved successfully');
    } catch (err: any) {
      console.error("Error saving configuration:", err);
      throw new Error(err.message || "Failed to save configuration");
    }
  }, [monitors]);

  const getDisplaySettings = useCallback((monitor: Monitor): DisplaySettings => {
    const resolutions = new Set<string>();
    const refreshRates = new Set<number>();
    
    if (!monitor.availableModes || monitor.availableModes.length === 0) {
      return {
        resolutions: ["1920x1080"],
        refreshRates: [60]
      };
    }
    
    monitor.availableModes.forEach(mode => {
      const match = mode.match(/(\d+)x(\d+)@(\d+)Hz/);
      if (match) {
        const width = parseInt(match[1]);
        const height = parseInt(match[2]);
        const rate = parseInt(match[3]);
        
        resolutions.add(`${width}x${height}`);
        refreshRates.add(rate);
      }
    });
    
    if (resolutions.size === 0) resolutions.add("1920x1080");
    if (refreshRates.size === 0) refreshRates.add(60);
    
    return {
      resolutions: Array.from(resolutions).sort((a, b) => {
        const [aWidth, aHeight] = a.split("x").map(Number);
        const [bWidth, bHeight] = b.split("x").map(Number);
        return (bWidth * bHeight) - (aWidth * aHeight);
      }),
      refreshRates: Array.from(refreshRates).sort((a, b) => a - b)
    };
  }, []);

  // Load monitors on mount
  useEffect(() => {
    loadMonitors();
  }, [loadMonitors]);

  const value: HyprlandContextType = {
    monitors,
    isLoading,
    error,
    selectedMonitor,
    loadMonitors,
    selectMonitor,
    updateMonitor,
    saveConfiguration,
    getDisplaySettings
  };

  return (
    <HyprlandContext.Provider value={value}>
      {children}
    </HyprlandContext.Provider>
  );
}

export function useHyprland() {
  const context = useContext(HyprlandContext);
  if (context === undefined) {
    throw new Error('useHyprland must be used within a HyprlandProvider');
  }
  return context;
}
