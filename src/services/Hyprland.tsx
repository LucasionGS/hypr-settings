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
  resolutionModes: Record<string, number[]>; // Maps resolution to available refresh rates
  allModes: Array<{ resolution: string; refreshRate: number; mode: string }>; // All available modes
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
    const resolutionModes: Record<string, number[]> = {};
    const allModes: Array<{ resolution: string; refreshRate: number; mode: string }> = [];
    
    console.log('=== PROCESSING MONITOR DISPLAY SETTINGS ===');
    console.log('Monitor:', monitor.name);
    console.log('Available modes count:', monitor.availableModes?.length || 0);
    console.log('Available modes:', monitor.availableModes);
    
    if (!monitor.availableModes || monitor.availableModes.length === 0) {
      console.log('No available modes, using defaults');
      const defaultRes = "1920x1080";
      const defaultRate = 60;
      return {
        resolutions: [defaultRes],
        refreshRates: [defaultRate],
        resolutionModes: { [defaultRes]: [defaultRate] },
        allModes: [{ resolution: defaultRes, refreshRate: defaultRate, mode: `${defaultRes}@${defaultRate}Hz` }]
      };
    }
    
    monitor.availableModes.forEach((mode, index) => {
      console.log(`Processing mode ${index + 1}/${monitor.availableModes.length}:`, mode);
      console.log('Mode type:', typeof mode);
      console.log('Mode length:', mode.length);
      
      // Try multiple regex patterns to handle different formats
      let match = mode.match(/(\d+)x(\d+)@(\d+(?:\.\d+)?)Hz/);
      if (!match) {
        // Try alternative patterns
        match = mode.match(/(\d+)x(\d+)@(\d+(?:\.\d+)?)/);
      }
      if (!match) {
        match = mode.match(/(\d+)x(\d+)_(\d+(?:\.\d+)?)Hz/);
      }
      if (!match) {
        match = mode.match(/(\d+)x(\d+) (\d+(?:\.\d+)?)Hz/);
      }
      
      if (match) {
        const width = parseInt(match[1]);
        const height = parseInt(match[2]);
        const rate = parseFloat(match[3]);
        const resolution = `${width}x${height}`;
        
        console.log('Successfully parsed:', { resolution, rate, width, height });
        
        resolutions.add(resolution);
        refreshRates.add(rate);
        
        // Group refresh rates by resolution
        if (!resolutionModes[resolution]) {
          resolutionModes[resolution] = [];
        }
        resolutionModes[resolution].push(rate);
        
        // Add to all modes list
        allModes.push({
          resolution,
          refreshRate: rate,
          mode
        });
      } else {
        console.log('Failed to parse mode:', mode);
        console.log('Mode as hex:', Array.from(mode).map(c => c.charCodeAt(0).toString(16)).join(' '));
      }
    });
    
    // Sort refresh rates for each resolution and remove duplicates
    Object.keys(resolutionModes).forEach(resolution => {
      resolutionModes[resolution] = [...new Set(resolutionModes[resolution])].sort((a, b) => b - a); // Sort descending (highest first)
    });
    
    if (resolutions.size === 0) {
      console.log('No resolutions found, using defaults');
      const defaultRes = "1920x1080";
      const defaultRate = 60;
      resolutions.add(defaultRes);
      refreshRates.add(defaultRate);
      resolutionModes[defaultRes] = [defaultRate];
      allModes.push({ resolution: defaultRes, refreshRate: defaultRate, mode: `${defaultRes}@${defaultRate}Hz` });
    }
    
    const result = {
      resolutions: Array.from(resolutions).sort((a, b) => {
        const [aWidth, aHeight] = a.split("x").map(Number);
        const [bWidth, bHeight] = b.split("x").map(Number);
        return (bWidth * bHeight) - (aWidth * aHeight);
      }),
      refreshRates: Array.from(refreshRates).sort((a, b) => b - a), // Sort descending
      resolutionModes,
      allModes: allModes.sort((a, b) => {
        // Sort by resolution (area) first, then by refresh rate
        const [aWidth, aHeight] = a.resolution.split("x").map(Number);
        const [bWidth, bHeight] = b.resolution.split("x").map(Number);
        const areaDiff = (bWidth * bHeight) - (aWidth * aHeight);
        if (areaDiff !== 0) return areaDiff;
        return b.refreshRate - a.refreshRate;
      })
    };
    
    console.log('Final display settings:');
    console.log('- Resolutions:', result.resolutions);
    console.log('- All refresh rates:', result.refreshRates);
    console.log('- Resolution modes:', result.resolutionModes);
    console.log('- All modes count:', result.allModes.length);
    console.log('=== END PROCESSING MONITOR DISPLAY SETTINGS ===');
    
    return result;
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
