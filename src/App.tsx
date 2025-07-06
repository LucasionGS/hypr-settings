import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Navigation, Panel } from './components/Navigation';
import DisplayManager from './components/DisplayManager';
import { WifiManager } from './components/WifiManager';
import { BluetoothManager } from './components/BluetoothManager';
import { AppearanceManager } from './components/AppearanceManager';
import { HyprlandProvider } from './services/Hyprland';
import "./App.scss";

const panels: Panel[] = [
  { id: 'display', name: 'Display', icon: '🖥️' },
  { id: 'appearance', name: 'Appearance', icon: '🎨' },
  { id: 'wifi', name: 'Wi-Fi', icon: '📶' },
  { id: 'bluetooth', name: 'Bluetooth', icon: '📘' },
];

function App() {
  const [activePanel, setActivePanel] = useState('display');

  // Function to get system theme from gsettings
  const getSystemTheme = async (): Promise<'dark' | 'light'> => {
    try {
      // First try to get the color scheme preference (more reliable)
      const colorScheme = await invoke('get_color_scheme') as string;
      console.log('Current color scheme on startup:', colorScheme);
      
      // Check color scheme first
      if (colorScheme === 'prefer-dark' || colorScheme.toLowerCase().includes('dark')) {
        return 'dark';
      } else if (colorScheme === 'prefer-light' || colorScheme.toLowerCase().includes('light')) {
        return 'light';
      }
      
      // Fallback to GTK theme if color scheme is 'default' or unknown
      const gtkTheme = await invoke('get_system_theme') as string;
      console.log('Fallback to GTK theme:', gtkTheme);
      
      // Check if the theme name suggests dark mode
      const isDark = gtkTheme.toLowerCase().includes('dark') || 
                     gtkTheme.toLowerCase().includes('adwaita-dark') ||
                     gtkTheme.toLowerCase().includes('breeze-dark');
      
      return isDark ? 'dark' : 'light';
    } catch (error) {
      console.warn('Failed to get system theme, falling back to dark:', error);
      return 'dark';
    }
  };

  // Function to watch for theme changes
  const watchSystemTheme = async () => {
    try {
      // Listen for theme change events from backend
      const unlistenTheme = await listen<string>('theme-changed', (event) => {
        console.log('Theme change event received:', event.payload);
        
        const isDark = event.payload.toLowerCase().includes('dark') || 
                       event.payload.toLowerCase().includes('adwaita-dark') ||
                       event.payload.toLowerCase().includes('breeze-dark') ||
                       event.payload === 'dark' ||
                       event.payload === 'prefer-dark';
        
        const newTheme = isDark ? 'dark' : 'light';
        console.log('Switching to theme (from theme-changed):', newTheme);
        
        document.documentElement.setAttribute('data-theme', newTheme);
      });

      // Listen for color scheme changes (more direct)
      const unlistenColorScheme = await listen<string>('color-scheme-changed', (event) => {
        console.log('Color scheme change event received:', event.payload);
        
        const isDark = event.payload === 'prefer-dark' || 
                       event.payload.toLowerCase().includes('dark');
        
        const newTheme = isDark ? 'dark' : 'light';
        console.log('Switching to theme (from color-scheme-changed):', newTheme);
        
        document.documentElement.setAttribute('data-theme', newTheme);
      });
      
      // Return cleanup function that unlists both events
      return () => {
        unlistenTheme();
        unlistenColorScheme();
      };
    } catch (error) {
      console.warn('Failed to watch system theme changes:', error);
    }
  };

  // Initialize theme and watch for changes
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const initTheme = async () => {
      console.log('Initializing theme on app startup...');
      const systemTheme = await getSystemTheme();
      console.log('Detected system theme on startup:', systemTheme);
      document.documentElement.setAttribute('data-theme', systemTheme);
      
      // Start watching for changes
      cleanup = await watchSystemTheme();
    };

    initTheme();

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  const renderPanel = () => {
    switch (activePanel) {
      case 'display':
        return (
          <HyprlandProvider>
            <DisplayManager />
          </HyprlandProvider>
        );
      case 'appearance':
        return <AppearanceManager />;
      case 'wifi':
        return <WifiManager />;
      case 'bluetooth':
        return <BluetoothManager />;
      default:
        return <div>Panel not found</div>;
    }
  };

  return (
    <div className="app">
      <Navigation
        panels={panels}
        activePanel={activePanel}
        onPanelChange={setActivePanel}
      />
      <main className="main-content">
        {renderPanel()}
      </main>
    </div>
  );
}

export default App;

