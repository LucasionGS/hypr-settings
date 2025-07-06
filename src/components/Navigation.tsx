import React from 'react';
import './Navigation.scss';

export interface Panel {
  id: string;
  name: string;
  icon: string;
}

interface NavigationProps {
  panels: Panel[];
  activePanel: string;
  onPanelChange: (panelId: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  panels,
  activePanel,
  onPanelChange,
}) => {
  return (
    <nav className="navigation">
      <div className="nav-header">
        <h1>Archion Settings</h1>
      </div>
      <div className="nav-items">
        {panels.map((panel) => (
          <button
            key={panel.id}
            className={`nav-item ${activePanel === panel.id ? 'active' : ''}`}
            onClick={() => onPanelChange(panel.id)}
          >
            <span className="nav-icon">{panel.icon}</span>
            <span className="nav-text">{panel.name}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
