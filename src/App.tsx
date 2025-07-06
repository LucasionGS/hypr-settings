import { useState } from 'react';
import { Navigation, Panel } from './components/Navigation';
import DisplayManager from './components/DisplayManager';
import { WifiManager } from './components/WifiManager';
import { HyprlandProvider } from './services/Hyprland';
import "./App.scss";

const panels: Panel[] = [
  { id: 'display', name: 'Display', icon: '🖥️' },
  { id: 'wifi', name: 'Wi-Fi', icon: '📶' },
];

function App() {
  const [activePanel, setActivePanel] = useState('display');

  const renderPanel = () => {
    switch (activePanel) {
      case 'display':
        return (
          <HyprlandProvider>
            <DisplayManager />
          </HyprlandProvider>
        );
      case 'wifi':
        return <WifiManager />;
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

