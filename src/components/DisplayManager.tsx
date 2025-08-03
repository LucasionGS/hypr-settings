import React, { useState, useRef, useCallback } from 'react';
import { useHyprland } from '../services/Hyprland';
import './DisplayManager.scss';

interface DisplayManagerProps {}

interface DragState {
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  dragMonitor: number | null;
}

const DisplayManager: React.FC<DisplayManagerProps> = () => {
  const {
    monitors,
    isLoading,
    error,
    selectedMonitor,
    loadMonitors,
    selectMonitor,
    updateMonitor,
    saveConfiguration,
    getDisplaySettings
  } = useHyprland();

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragOffset: { x: 0, y: 0 },
    dragMonitor: null
  });

  const [snapPreview, setSnapPreview] = useState<{ x: number; y: number } | null>(null);
  const [layoutDimensions, setLayoutDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 600 });

  const layoutRef = useRef<HTMLDivElement>(null);

  // Calculate the bounding box of all monitors and center the view
  const centerView = useCallback(() => {
    if (monitors.length === 0) return;

    // Find the bounding box of all monitors
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    monitors.forEach(monitor => {
      if (monitor.disabled) return;
      
      minX = Math.min(minX, monitor.x);
      minY = Math.min(minY, monitor.y);
      maxX = Math.max(maxX, monitor.x + monitor.width);
      maxY = Math.max(maxY, monitor.y + monitor.height);
    });

    // Calculate the center of the bounding box
    const boundingWidth = maxX - minX;
    const boundingHeight = maxY - minY;
    const centerX = minX + boundingWidth / 2;
    const centerY = minY + boundingHeight / 2;

    return { centerX, centerY, boundingWidth, boundingHeight };
  }, [monitors]);

  // Convert monitor coordinates to layout coordinates (scaled down)
  const getLayoutPosition = useCallback((monitor: any) => {
    const scale = 0.15; // Scale down for display
    
    if (monitors.length === 0) {
      return { x: 50, y: 50 };
    }

    // Calculate dynamic center based on all monitors
    const viewInfo = centerView();
    if (!viewInfo) {
      return { x: 50, y: 50 };
    }

    // Get actual layout container dimensions
    const layoutWidth = layoutRef.current?.clientWidth || layoutDimensions.width;
    const layoutHeight = layoutRef.current?.clientHeight || layoutDimensions.height;
    const layoutCenterX = layoutWidth / 2;
    const layoutCenterY = layoutHeight / 2;

    // Calculate offset to center the monitors in the view
    const offsetX = layoutCenterX - (viewInfo.centerX * scale);
    const offsetY = layoutCenterY - (viewInfo.centerY * scale);

    return {
      x: monitor.x * scale + offsetX,
      y: monitor.y * scale + offsetY
    };
  }, [monitors, centerView, layoutDimensions]);

  // Convert layout coordinates back to monitor coordinates
  const getMonitorPosition = useCallback((layoutX: number, layoutY: number) => {
    const scale = 0.15;
    
    if (monitors.length === 0) {
      return { x: 0, y: 0 };
    }

    // Calculate dynamic center based on all monitors
    const viewInfo = centerView();
    if (!viewInfo) {
      return { x: 0, y: 0 };
    }

    // Get actual layout container dimensions
    const layoutWidth = layoutRef.current?.clientWidth || layoutDimensions.width;
    const layoutHeight = layoutRef.current?.clientHeight || layoutDimensions.height;
    const layoutCenterX = layoutWidth / 2;
    const layoutCenterY = layoutHeight / 2;

    // Calculate offset to center the monitors in the view
    const offsetX = layoutCenterX - (viewInfo.centerX * scale);
    const offsetY = layoutCenterY - (viewInfo.centerY * scale);

    // Convert back to monitor coordinates
    return {
      x: Math.round((layoutX - offsetX) / scale),
      y: Math.round((layoutY - offsetY) / scale)
    };
  }, [monitors, centerView, layoutDimensions]);

  // Snap monitor to nearest edges of other monitors
  const snapToNearestEdge = useCallback((monitor: any, newX: number, newY: number) => {
    const SNAP_THRESHOLD = 200; // pixels threshold for snapping - increased for better UX
    let snappedX = newX;
    let snappedY = newY;

    // Get all other monitors
    const otherMonitors = monitors.filter(m => m.id !== monitor.id && !m.disabled);

    // Snap to origin (0,0)
    if (Math.abs(newX) <= SNAP_THRESHOLD) {
      snappedX = 0;
    }
    if (Math.abs(newY) <= SNAP_THRESHOLD) {
      snappedY = 0;
    }

    // Snap to other monitor edges
    otherMonitors.forEach(otherMonitor => {
      const otherRight = otherMonitor.x + otherMonitor.width;
      const otherBottom = otherMonitor.y + otherMonitor.height;
      const currentRight = newX + monitor.width;
      const currentBottom = newY + monitor.height;

      // Horizontal snapping
      // Snap left edge to right edge of other monitor
      if (Math.abs(newX - otherRight) <= SNAP_THRESHOLD) {
        snappedX = otherRight;
      }
      // Snap right edge to left edge of other monitor
      if (Math.abs(currentRight - otherMonitor.x) <= SNAP_THRESHOLD) {
        snappedX = otherMonitor.x - monitor.width;
      }
      // Snap left edge to left edge of other monitor (alignment)
      if (Math.abs(newX - otherMonitor.x) <= SNAP_THRESHOLD) {
        snappedX = otherMonitor.x;
      }
      // Snap right edge to right edge of other monitor (alignment)
      if (Math.abs(currentRight - otherRight) <= SNAP_THRESHOLD) {
        snappedX = otherRight - monitor.width;
      }

      // Vertical snapping
      // Snap top edge to bottom edge of other monitor
      if (Math.abs(newY - otherBottom) <= SNAP_THRESHOLD) {
        snappedY = otherBottom;
      }
      // Snap bottom edge to top edge of other monitor
      if (Math.abs(currentBottom - otherMonitor.y) <= SNAP_THRESHOLD) {
        snappedY = otherMonitor.y - monitor.height;
      }
      // Snap top edge to top edge of other monitor (alignment)
      if (Math.abs(newY - otherMonitor.y) <= SNAP_THRESHOLD) {
        snappedY = otherMonitor.y;
      }
      // Snap bottom edge to bottom edge of other monitor (alignment)
      if (Math.abs(currentBottom - otherBottom) <= SNAP_THRESHOLD) {
        snappedY = otherBottom - monitor.height;
      }
    });

    const result = {
      x: snappedX, // Allow negative coordinates
      y: snappedY  // Allow negative coordinates
    };
    
    return result;
  }, [monitors]);

  // Get monitor dimensions for layout
  const getMonitorDimensions = useCallback((monitor: any) => {
    const scale = 0.15;
    return {
      width: Math.max(120, monitor.width * scale),
      height: Math.max(80, monitor.height * scale)
    };
  }, []);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent, monitorId: number) => {
    e.preventDefault();
    const monitor = monitors.find(m => m.id === monitorId);
    if (!monitor) return;

    const rect = e.currentTarget.getBoundingClientRect();
    
    setDragState({
      isDragging: true,
      dragOffset: {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      },
      dragMonitor: monitorId
    });

    selectMonitor(monitor);
  }, [monitors, selectMonitor]);

  // Handle drag move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging || !dragState.dragMonitor || !layoutRef.current) return;

    const layoutRect = layoutRef.current.getBoundingClientRect();
    const newLayoutX = e.clientX - layoutRect.left - dragState.dragOffset.x;
    const newLayoutY = e.clientY - layoutRect.top - dragState.dragOffset.y;

    const newPosition = getMonitorPosition(newLayoutX, newLayoutY);
    const monitor = monitors.find(m => m.id === dragState.dragMonitor);
    
    if (monitor) {
      // Allow negative coordinates - no constraints on position
      const unconstrainedPosition = {
        x: newPosition.x,
        y: newPosition.y
      };

      // Check for snap preview - create a monitor object with the new position for snapping calculation
      const tempMonitor = { ...monitor, x: unconstrainedPosition.x, y: unconstrainedPosition.y };
      const snappedPosition = snapToNearestEdge(tempMonitor, unconstrainedPosition.x, unconstrainedPosition.y);
      const willSnap = snappedPosition.x !== unconstrainedPosition.x || snappedPosition.y !== unconstrainedPosition.y;
      
      if (willSnap) {
        setSnapPreview(snappedPosition);
      } else {
        setSnapPreview(null);
      }

      // Update monitor with the current dragged position (not snapped yet)
      const updatedMonitor = {
        ...monitor,
        x: unconstrainedPosition.x,
        y: unconstrainedPosition.y
      };
      updateMonitor(updatedMonitor);
    }
  }, [dragState, getMonitorPosition, monitors, updateMonitor, snapToNearestEdge]);

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    // Apply snapping if we were dragging a monitor
    if (dragState.isDragging && dragState.dragMonitor) {
      const monitor = monitors.find(m => m.id === dragState.dragMonitor);
      if (monitor) {
        // If we have a snap preview, use that position, otherwise use current position
        const finalPosition = snapPreview || { x: monitor.x, y: monitor.y };
        
        // Only update if position actually changed
        if (finalPosition.x !== monitor.x || finalPosition.y !== monitor.y) {
          const updatedMonitor = {
            ...monitor,
            x: finalPosition.x,
            y: finalPosition.y
          };
          updateMonitor(updatedMonitor);
        }
      }
    }

    setDragState({
      isDragging: false,
      dragOffset: { x: 0, y: 0 },
      dragMonitor: null
    });

    // Clear snap preview
    setSnapPreview(null);

    // Force re-render to trigger auto-centering with updated monitor positions
    // This happens automatically because the layout functions depend on monitors array
  }, [dragState.isDragging, dragState.dragMonitor, monitors, snapPreview, updateMonitor]);

  // Set up global mouse events for dragging
  React.useEffect(() => {
    if (dragState.isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState.isDragging, handleMouseMove, handleMouseUp]);

  // Force re-render when layout container resizes to ensure proper centering
  React.useLayoutEffect(() => {
    const handleResize = () => {
      if (layoutRef.current) {
        const newWidth = layoutRef.current.clientWidth;
        const newHeight = layoutRef.current.clientHeight;
        
        // Update layout dimensions to trigger re-render
        setLayoutDimensions(prev => {
          if (prev.width !== newWidth || prev.height !== newHeight) {
            return { width: newWidth, height: newHeight };
          }
          return prev;
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (layoutRef.current) {
      resizeObserver.observe(layoutRef.current);
      // Initialize dimensions on first render
      handleResize();
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [monitors]);

  // Force proper centering on initial load and when monitors change
  React.useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is fully rendered
    const timer = requestAnimationFrame(() => {
      if (layoutRef.current && monitors.length > 0) {
        // Force a re-render by triggering the layout calculation
        // This ensures centering works properly on initial load
        layoutRef.current.style.transform = 'translateZ(0)'; // Trigger a repaint
      }
    });

    return () => {
      cancelAnimationFrame(timer);
    };
  }, [monitors]);

  // Direct update functions
  const handleResolutionChange = (resolution: string) => {
    if (!selectedMonitor) return;
    
    const [width, height] = resolution.split('x').map(Number);
    const displaySettings = getDisplaySettings(selectedMonitor);
    
    // Get available refresh rates for this resolution
    const availableRates = displaySettings.resolutionModes[resolution] || [];
    
    // Choose the best refresh rate:
    // 1. Keep current rate if available for this resolution
    // 2. Otherwise, pick the highest available rate
    let newRefreshRate = selectedMonitor.refreshRate;
    if (!availableRates.includes(newRefreshRate)) {
      newRefreshRate = availableRates[0] || 60; // Highest rate (sorted descending)
    }
    
    const updatedMonitor = {
      ...selectedMonitor,
      width,
      height,
      refreshRate: newRefreshRate
    };
    
    updateMonitor(updatedMonitor);
  };

  const handleRefreshRateChange = (rate: number) => {
    if (!selectedMonitor) return;
    
    const updatedMonitor = {
      ...selectedMonitor,
      refreshRate: rate
    };
    
    updateMonitor(updatedMonitor);
  };

  const handlePositionChange = (axis: 'x' | 'y', value: number) => {
    if (!selectedMonitor) return;
    
    const updatedMonitor = {
      ...selectedMonitor,
      [axis]: value
    };
    
    updateMonitor(updatedMonitor);
  };

  const handleEnabledChange = (enabled: boolean) => {
    if (!selectedMonitor) return;
    
    const updatedMonitor = {
      ...selectedMonitor,
      disabled: !enabled
    };
    
    updateMonitor(updatedMonitor);
  };

  const handleScaleChange = (scale: number) => {
    if (!selectedMonitor) return;
    
    // Clamp scale between reasonable values (0.25x to 3.0x)
    const clampedScale = Math.max(0.25, Math.min(3.0, scale));
    
    // Round to 2 decimal places to avoid floating point precision issues
    const roundedScale = Math.round(clampedScale * 100) / 100;
    
    const updatedMonitor = {
      ...selectedMonitor,
      scale: roundedScale
    };
    
    updateMonitor(updatedMonitor);
  };

  const handleSave = async () => {
    try {
      await saveConfiguration();
      // Could add a toast notification here
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="display-manager">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading displays...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="display-manager">
        <div className="error">
          <h3>Error</h3>
          <p>{error}</p>
          <button onClick={loadMonitors} className="retry-button">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const displaySettings = selectedMonitor ? getDisplaySettings(selectedMonitor) : null;

  return (
    <div className="display-manager">
      <header className="header">
        <h1>Display</h1>
        <p>Drag displays to rearrange them</p>
      </header>

      <div className="content">
        {/* Left Panel - Monitor List */}
        <div className="monitor-list">
          <h2>Select a display</h2>
          <div className="monitors">
            {monitors.map((monitor) => (
              <div
                key={monitor.id}
                className={`monitor-card ${selectedMonitor?.id === monitor.id ? 'selected' : ''} ${monitor.disabled ? 'disabled' : ''}`}
                onClick={() => selectMonitor(monitor)}
              >
                <div className="monitor-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 2H3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h7l-2 2v1h8v-1l-2-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 11H3V4h18v9z"/>
                  </svg>
                </div>
                <div className="monitor-info">
                  <h3>{monitor.name}</h3>
                  <p>{monitor.width}x{monitor.height}@{monitor.refreshRate}Hz</p>
                  <p>Position: {monitor.x}, {monitor.y}</p>
                  <p>{monitor.disabled ? 'Disabled' : 'Enabled'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center Panel - Visual Layout */}
        <div className="monitor-layout">
          <h2>Rearrange your displays</h2>
          <div className="layout-container" ref={layoutRef}>
            {monitors.map((monitor) => {
              const position = getLayoutPosition(monitor);
              const dimensions = getMonitorDimensions(monitor);
              
              return (
                <div
                  key={monitor.id}
                  className={`draggable-monitor ${selectedMonitor?.id === monitor.id ? 'selected' : ''} ${monitor.disabled ? 'disabled' : ''} ${dragState.dragMonitor === monitor.id ? 'dragging' : ''}`}
                  style={{
                    left: position.x,
                    top: position.y,
                    width: dimensions.width,
                    height: dimensions.height,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, monitor.id)}
                >
                  <div className="monitor-label">
                    <span className="monitor-name">{monitor.name}</span>
                    <span className="monitor-res">{monitor.width}x{monitor.height}</span>
                  </div>
                </div>
              );
            })}

            {/* Snap preview indicator */}
            {snapPreview && dragState.dragMonitor && (
              <div
                className="snap-preview"
                style={{
                  left: getLayoutPosition({ x: snapPreview.x, y: snapPreview.y }).x,
                  top: getLayoutPosition({ x: snapPreview.x, y: snapPreview.y }).y,
                  width: 120, // Fixed width for preview
                  height: 80, // Fixed height for preview
                  position: 'absolute',
                  border: '2px dashed #ff6900',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 105, 0, 0.1)',
                  pointerEvents: 'none',
                  zIndex: 999
                }}
              />
            )}

            {/* Center point indicator */}
            {(() => {
              const viewInfo = centerView();
              if (!viewInfo) return null;
              
              const scale = 0.15;
              const layoutWidth = layoutRef.current?.clientWidth || layoutDimensions.width;
              const layoutHeight = layoutRef.current?.clientHeight || layoutDimensions.height;
              const layoutCenterX = layoutWidth / 2;
              const layoutCenterY = layoutHeight / 2;
              const offsetX = layoutCenterX - (viewInfo.centerX * scale);
              const offsetY = layoutCenterY - (viewInfo.centerY * scale);
              
              return (
                <div
                  className="center-indicator"
                  style={{
                    position: 'absolute',
                    left: viewInfo.centerX * scale + offsetX,
                    top: viewInfo.centerY * scale + offsetY,
                    width: 8,
                    height: 8,
                    backgroundColor: '#0078d4',
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    zIndex: 1,
                    border: '2px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}
                />
              );
            })()}
          </div>
        </div>

        {/* Right Panel - Settings */}
        <div className="monitor-settings">
          {selectedMonitor ? (
            <>
              <h2>{selectedMonitor.name}</h2>
              
              <div className="settings-section">
                <div className="setting-row">
                  <label>Resolution</label>
                  <select 
                    value={`${selectedMonitor.width}x${selectedMonitor.height}`}
                    onChange={(e) => handleResolutionChange(e.target.value)}
                  >
                    {displaySettings?.resolutions.map(res => (
                      <option key={res} value={res}>{res}</option>
                    ))}
                  </select>
                </div>

                <div className="setting-row">
                  <label>Refresh rate</label>
                  <select 
                    value={selectedMonitor.refreshRate}
                    onChange={(e) => handleRefreshRateChange(Number(e.target.value))}
                  >
                    {(() => {
                      const currentResolution = `${selectedMonitor.width}x${selectedMonitor.height}`;
                      const availableRates = displaySettings?.resolutionModes[currentResolution] || [];
                      return availableRates.map(rate => (
                        <option key={rate} value={rate}>{rate}Hz</option>
                      ));
                    })()}
                  </select>
                </div>

                <div className="setting-row">
                  <label>Position</label>
                  <div className="position-inputs">
                    <div>
                      <label>X</label>
                      <input 
                        type="number" 
                        value={selectedMonitor.x}
                        onChange={(e) => handlePositionChange('x', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label>Y</label>
                      <input 
                        type="number" 
                        value={selectedMonitor.y}
                        onChange={(e) => handlePositionChange('y', Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                <div className="setting-row">
                  <label>Enable this display</label>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={!selectedMonitor.disabled}
                      onChange={(e) => handleEnabledChange(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="setting-row">
                  <label>Scale</label>
                  <select 
                    value={selectedMonitor.scale}
                    onChange={(e) => handleScaleChange(Number(e.target.value))}
                  >
                    <option value="0.25">0.25×</option>
                    <option value="0.5">0.5×</option>
                    <option value="0.75">0.75×</option>
                    <option value="1">1.0×</option>
                    <option value="1.25">1.25×</option>
                    <option value="1.5">1.5×</option>
                    <option value="1.75">1.75×</option>
                    <option value="2">2.0×</option>
                    <option value="2.25">2.25×</option>
                    <option value="2.5">2.5×</option>
                    <option value="2.75">2.75×</option>
                    <option value="3">3.0×</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <div className="no-selection">
              <p>Select a display to view its settings</p>
            </div>
          )}
        </div>
      </div>

      <div className="actions">
        <div className="status-text">
          Changes will apply immediately
        </div>
        <div className="action-buttons">
          <button onClick={loadMonitors} className="secondary">
            Detect displays
          </button>
          <button onClick={handleSave} className="primary">
            Keep changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default DisplayManager;
