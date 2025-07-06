import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './AppearanceManager.scss';
import { 
  IconPalette,
  IconEye,
  IconTypography,
  IconBrush,
  IconRefresh,
  IconCheck,
  IconX,
  IconSun,
  IconMoon,
  IconDeviceDesktop
} from "@tabler/icons-react";

interface ThemeSettings {
  gtk_theme: string;
  icon_theme: string;
  font_name: string;
  font_size: number;
  color_scheme: string;
}

interface AvailableThemes {
  gtk_themes: string[];
  icon_themes: string[];
  fonts: string[];
}

export const AppearanceManager: React.FC = () => {
  const [themeSettings, setThemeSettings] = useState<ThemeSettings | null>(null);
  const [availableThemes, setAvailableThemes] = useState<AvailableThemes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Partial<ThemeSettings>>({});

  const fetchThemeSettings = async () => {
    try {
      const settings = await invoke<ThemeSettings>('get_theme_settings');
      console.log('Theme settings:', settings); // Debug log
      setThemeSettings(settings);
    } catch (err) {
      console.error('Failed to get theme settings:', err);
      setError(err as string);
    }
  };

  const fetchAvailableThemes = async () => {
    try {
      const themes = await invoke<AvailableThemes>('get_available_themes');
      console.log('Available themes:', themes); // Debug log
      setAvailableThemes(themes);
    } catch (err) {
      console.error('Failed to get available themes:', err);
      setError(err as string);
    }
  };

  const refreshData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchThemeSettings(), fetchAvailableThemes()]);
    } catch (err) {
      console.error('Error during data refresh:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initializeComponent = async () => {
      try {
        await refreshData();
      } catch (err) {
        console.error('Failed to initialize appearance data:', err);
      }
    };
    
    initializeComponent();
  }, []);

  const handleSettingChange = (key: keyof ThemeSettings, value: string | number) => {
    setPendingChanges(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const applyChanges = async () => {
    if (!themeSettings || Object.keys(pendingChanges).length === 0) return;

    setSaving(true);
    try {
      const newSettings = { ...themeSettings, ...pendingChanges };
      await invoke('save_theme_settings', { settings: newSettings });
      setThemeSettings(newSettings);
      setPendingChanges({});
    } catch (err) {
      setError(err as string);
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setPendingChanges({});
  };

  const getCurrentValue = (key: keyof ThemeSettings): string | number => {
    if (key in pendingChanges) {
      return pendingChanges[key] as string | number;
    }
    return themeSettings?.[key] || '';
  };

  const getColorSchemeIcon = (scheme: string) => {
    switch (scheme) {
      case 'prefer-dark':
        return <IconMoon size={16} />;
      case 'prefer-light':
        return <IconSun size={16} />;
      default:
        return <IconDeviceDesktop size={16} />;
    }
  };

  const getColorSchemeLabel = (scheme: string) => {
    switch (scheme) {
      case 'prefer-dark':
        return 'Dark';
      case 'prefer-light':
        return 'Light';
      default:
        return 'System';
    }
  };

  if (loading) {
    return (
      <div className="appearance-manager">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading appearance settings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="appearance-manager">
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
    <div className="appearance-manager">
      <div className="appearance-header">
        <div className="header-content">
          <h2>Appearance & Theming</h2>
          <p>Customize the look and feel of your desktop</p>
        </div>
        <div className="header-controls">
          {Object.keys(pendingChanges).length > 0 && (
            <>
              <button className="reset-button" onClick={resetChanges}>
                <IconX size={16} /> Reset
              </button>
              <button 
                className="apply-button" 
                onClick={applyChanges}
                disabled={saving}
              >
                <IconCheck size={16} /> {saving ? 'Applying...' : 'Apply'}
              </button>
            </>
          )}
          <button className="refresh-button" onClick={refreshData}>
            <IconRefresh size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="settings-grid">
        {/* Color Scheme */}
        <div className="setting-section">
          <div className="section-header">
            <IconPalette size={20} />
            <h3>Color Scheme</h3>
          </div>
          <div className="color-scheme-options">
            {['default', 'prefer-light', 'prefer-dark'].map((scheme) => (
              <button
                key={scheme}
                className={`color-scheme-option ${getCurrentValue('color_scheme') === scheme ? 'active' : ''}`}
                onClick={() => handleSettingChange('color_scheme', scheme)}
              >
                {getColorSchemeIcon(scheme)}
                <span>{getColorSchemeLabel(scheme)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* GTK Theme */}
        <div className="setting-section">
          <div className="section-header">
            <IconBrush size={20} />
            <h3>Application Theme</h3>
          </div>
          <select
            value={getCurrentValue('gtk_theme') as string}
            onChange={(e) => handleSettingChange('gtk_theme', e.target.value)}
            className="theme-select"
          >
            {availableThemes?.gtk_themes.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
        </div>

        {/* Icon Theme */}
        <div className="setting-section">
          <div className="section-header">
            <IconEye size={20} />
            <h3>Icon Theme</h3>
          </div>
          <select
            value={getCurrentValue('icon_theme') as string}
            onChange={(e) => handleSettingChange('icon_theme', e.target.value)}
            className="theme-select"
          >
            {availableThemes?.icon_themes.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
        </div>

        {/* Font Settings */}
        <div className="setting-section">
          <div className="section-header">
            <IconTypography size={20} />
            <h3>Font Settings</h3>
          </div>
          <select
            value={getCurrentValue('font_name') as string}
            onChange={(e) => handleSettingChange('font_name', e.target.value)}
            className="theme-select"
          >
            {!availableThemes?.fonts || availableThemes.fonts.length === 0 ? (
              <option value="">No fonts available</option>
            ) : (
              availableThemes.fonts.map((font) => {
                // Extract just the font family name, clean it up
                const fontName = font
                  .split(',')[0]           // Take first part if comma-separated
                  .replace(/^[^:]*:/, '')  // Remove anything before colon (path info)
                  .trim();
                return (
                  <option key={font} value={font}>
                    {fontName}
                  </option>
                );
              })
            )}
          </select>
          <div className="font-size-control">
            <label>Font Size:</label>
            <input
              type="range"
              min="8"
              max="24"
              step="1"
              value={getCurrentValue('font_size') as number}
              onChange={(e) => handleSettingChange('font_size', parseInt(e.target.value))}
              className="font-size-slider"
            />
            <span className="font-size-value">{getCurrentValue('font_size')}pt</span>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div className="preview-section">
        <h3>Preview</h3>
        <div className="preview-area">
          <div className="preview-window">
            <div className="preview-titlebar">
              <div className="preview-buttons">
                <div className="preview-button close"></div>
                <div className="preview-button minimize"></div>
                <div className="preview-button maximize"></div>
              </div>
              <span className="preview-title">Sample Application</span>
            </div>
            <div className="preview-content">
              <p style={{ 
                fontFamily: `"${getCurrentValue('font_name')}", sans-serif`, 
                fontSize: `${getCurrentValue('font_size')}pt` 
              }}>
                This is how your text will look with the selected font: {
                  (getCurrentValue('font_name') as string)
                    .split(',')[0]
                    .replace(/^[^:]*:/, '')
                    .trim()
                } at {getCurrentValue('font_size')}pt
              </p>
              <div className="preview-elements">
                <button className="preview-button-element">Button</button>
                <input type="text" placeholder="Text input" className="preview-input" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
