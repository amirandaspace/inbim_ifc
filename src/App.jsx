import { useState, useCallback, useRef } from 'react';
import { useModelLoader } from './hooks/useModelLoader';
import { useSelection } from './contexts/SelectionContext.jsx';
import FileUpload from './components/FileUpload';
import IfcViewer from './components/IfcViewer';
import Header from './components/Header';
import PropertyPanel from './components/PropertyPanel';
import LoadingOverlay from './components/LoadingOverlay';
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
    
    handleFileLoad(files, async (buffer, fileName) => {
        await viewerRef.current.loadFile(buffer, fileName);
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
        {selectedElement && (
            <PropertyPanel 
              selectedElement={selectedElement} 
              onClose={clearSelection} 
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
