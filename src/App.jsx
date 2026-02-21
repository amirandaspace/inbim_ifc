import { useState, useCallback, useRef } from 'react';
import { useModelLoader } from './hooks/useModelLoader';
import { useSelection } from './contexts/SelectionContext.jsx';
import FileUpload from './components/FileUpload';
import IfcViewer from './components/IfcViewer';
import Header from './components/Header';
import PropertyPanel from './components/PropertyPanel';
import LoadingOverlay from './components/LoadingOverlay';
import Toolbar from './components/Toolbar';
import './App.css';

export default function App() {
  const { 
    hasModel, 
    modelCount, 
    fileName, 
    loading, 
    error, 
    setError,
    handleFileLoad, 
    handleReset 
  } = useModelLoader();
  
  const [engineReady, setEngineReady] = useState(false);
  const [isClippingActive, setIsClippingActive] = useState(false);
  const [showProperties, setShowProperties] = useState(true);
  const viewerRef = useRef(null);

  const handleEngineReady = useCallback(() => {
    console.log('[APP] Engine ready, setting engineReady to true');
    setEngineReady(true);
  }, []);

  const handleEngineError = useCallback((err) => {
    console.error('[APP] Engine error:', err);
    setError(err?.message || 'Failed to initialise 3D engine');
  }, []);

  const handleFileProcess = useCallback((files) => {
    if (!engineReady || !viewerRef.current) {
        console.warn('[APP] Engine not ready, cannot load files');
        return;
    }
    
    handleFileLoad(files, async (fileArray) => {
        await viewerRef.current.loadFiles(fileArray);
    });
  }, [engineReady, handleFileLoad]);

  /* ─── Selection Logic ─── */

  /* ─── Render ─── */
  // Viewer is always mounted so that the engine initialises once
  const { selectedElement, handleSelect, clearSelection } = useSelection();
  const showUpload = !hasModel && !loading;

  return (
    <div className="app">
      <Header
        hasModel={hasModel}
        modelCount={modelCount}
        fileName={fileName}
        loading={loading}
        onAddClick={handleFileProcess}
        onReset={handleReset}
      />

      {/* Main */}
      <div className="main-content">
        <IfcViewer
          ref={viewerRef}
          onReady={handleEngineReady}
          onError={handleEngineError}
          onSelect={handleSelect}
        />

        {/* Properties Panel (Right Sidebar) */}
        {showProperties && selectedElement && (
            <PropertyPanel 
              selectedElement={selectedElement} 
              onClose={clearSelection} 
            />
        )}

        {/* Floating Toolbar */}
        {hasModel && engineReady && (
            <Toolbar 
              onFitModel={() => viewerRef.current?.fitModel()}
              onToggleProjection={() => viewerRef.current?.toggleProjection()}
              onToggleGrid={() => viewerRef.current?.toggleGrid()}
              onToggleClipping={() => setIsClippingActive(viewerRef.current?.toggleClipping())}
              onHideSelection={() => viewerRef.current?.hideSelection()}
              onShowAll={() => viewerRef.current?.showAll()}
              onToggleProperties={() => setShowProperties(!showProperties)}
              isClippingActive={isClippingActive}
              isPropertiesActive={showProperties}
            />
        )}

        {/* Upload overlay */}
        {showUpload && (
          <div className="upload-overlay">
            <FileUpload onFileLoad={handleFileProcess} disabled={!engineReady} />
          </div>
        )}

        <LoadingOverlay loading={loading} fileName={fileName} />
      </div>

      {/* Error Toast */}
      {error && (
        <div className="error-toast">
          ⚠ {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
