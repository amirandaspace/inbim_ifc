import React from 'react';
import { 
  Maximize, 
  Box, 
  Grid3x3,
  Scissors, 
  EyeOff, 
  Eye, 
  Info
} from 'lucide-react';

export default function Toolbar({ 
  onFitModel, 
  onToggleProjection, 
  onToggleGrid, 
  onToggleClipping, 
  onHideSelection, 
  onShowAll, 
  onToggleProperties,
  isClippingActive,
  isPropertiesActive
}) {
  return (
    <div className="viewer-toolbar">
      <button className="toolbar-btn" onClick={onFitModel} title="Fit to Model">
        <Maximize size={18} />
      </button>
      <div className="toolbar-divider" />
      <button className="toolbar-btn" onClick={onToggleProjection} title="Toggle Perspective / Orthographic">
        <Box size={18} />
      </button>
      <button className="toolbar-btn" onClick={onToggleGrid} title="Toggle Grid">
        <Grid3x3 size={18} />
      </button>
      <div className="toolbar-divider" />
      <button className={`toolbar-btn ${isClippingActive ? 'active' : ''}`} onClick={onToggleClipping} title="Toggle Clipping Planes (dbl-click to place)">
        <Scissors size={18} />
      </button>
      <div className="toolbar-divider" />
      <button className="toolbar-btn" onClick={onHideSelection} title="Hide Selection">
        <EyeOff size={18} />
      </button>
      <button className="toolbar-btn" onClick={onShowAll} title="Show All">
        <Eye size={18} />
      </button>
      <div className="toolbar-divider" />
      <button className={`toolbar-btn ${isPropertiesActive ? 'active' : ''}`} onClick={onToggleProperties} title="Toggle Properties">
        <Info size={18} />
      </button>
    </div>
  );
}
