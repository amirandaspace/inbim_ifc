import { useState, useCallback, useRef } from 'react';
import FileUpload from './components/FileUpload';
import IfcViewer from './components/IfcViewer';
import './App.css';

export default function App() {
  const [hasModel, setHasModel] = useState(false);
  const [modelCount, setModelCount] = useState(0);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [error, setError] = useState(null);
  const viewerRef = useRef(null);

  const handleEngineReady = useCallback(() => {
    setEngineReady(true);
  }, []);

  const handleEngineError = useCallback((err) => {
    setError(err?.message || 'Failed to initialise 3D engine');
  }, []);

  const handleFileLoad = useCallback(
    async (files) => {
      // files is array of { buffer, name }
      if (!files || files.length === 0) return;

      setLoading(true);
      setError(null);

      // If we already have models, we are appending.
      // If not, we are starting fresh (or fresh after reset).
      
      try {
        const results = [];
        for (const file of files) {
           setFileName(files.length === 1 ? file.name : `Loading ${file.name}...`);
           await viewerRef.current.loadFile(file.buffer, file.name);
           results.push(file.name);
        }
        
        setModelCount(prev => prev + results.length);
        setHasModel(true);
        if (files.length === 1 && modelCount === 0) {
            setFileName(files[0].name);
        } else {
            setFileName('Multiple Models');
        }
      } catch (err) {
        console.error('Failed to load IFC:', err);
        setError(err?.message || 'Failed to load IFC file.');
      } finally {
        setLoading(false);
      }
    },
    [modelCount]
  );

  const handleReset = useCallback(() => {
    if (viewerRef.current) viewerRef.current.reset();
    setHasModel(false);
    setModelCount(0);
    setFileName('');
    setError(null);
  }, []);

  /* ─── Selection Logic ─── */
  const [selectedElement, setSelectedElement] = useState(null);

  const handleSelect = useCallback((data) => {
    // data = { expressID, modelID, properties } or null
    console.log('App received selection:', data);
    setSelectedElement(data);
  }, []);

  const renderProperties = (props) => {
      if (!props) return <div className="empty-props">No properties data available</div>;
      
      let entries = Object.entries(props);
      // Filter out internal or heavy keys if necessary
      
      return entries.map(([key, value]) => {
          if (value === null || value === undefined) return null;
          if (typeof value === 'object') {
             // Simplify objects for now or recursive
             return (
                 <div key={key} className="prop-row">
                    <span className="prop-key">{key}</span>
                    <span className="prop-value">{'{Object}'}</span>
                 </div>
             );
          }
          return (
             <div key={key} className="prop-row">
                <span className="prop-key">{key}</span>
                <span className="prop-value">{String(value)}</span>
             </div>
          );
      });
  };

  /* ─── Render ─── */
  // Viewer is always mounted so that the engine initialises once
  const showUpload = !hasModel && !loading;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">▣</div>
          <div>
            <div className="header-title">IFC Viewer</div>
            <div className="header-subtitle">Powered by ThatOpen Engine</div>
          </div>
        </div>

        <div className="header-info">
          {hasModel && <span className="model-name">{fileName} ({modelCount})</span>}
          {hasModel && !loading && (
            <>
              <label className="btn btn-primary" style={{cursor: 'pointer'}}>
                <span>+ Add</span>
                <input 
                  type="file" 
                  accept=".ifc" 
                  multiple 
                  style={{display: 'none'}}
                  onChange={(e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    
                    const validFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.ifc'));
                    const readers = validFiles.map(file => {
                        return new Promise((resolve) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve({ buffer: reader.result, name: file.name });
                          reader.readAsArrayBuffer(file);
                        });
                    });
                    
                    Promise.all(readers).then(handleFileLoad);
                    e.target.value = '';
                  }}
                />
              </label>

              <button className="btn btn-ghost" onClick={handleReset}>
                ✕ Reset
              </button>
            </>
          )}
        </div>
      </header>

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
            <div className="properties-panel">
                <div className="panel-header">
                    <h3>
                        <span>Selected Element</span>
                        <span style={{fontSize:'11px', opacity:0.6}}>#{selectedElement.expressID}</span>
                    </h3>
                    <button onClick={() => setSelectedElement(null)} title="Close">✕</button>
                </div>
                <div className="panel-content">
                    {selectedElement.properties ? (
                        <div className="prop-section">
                            {renderProperties(selectedElement.properties)}
                        </div>
                    ) : (
                        <div className="empty-props">
                            No property data found for this element.
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Upload overlay */}
        {showUpload && (
          <div className="upload-overlay">
            <FileUpload onFileLoad={handleFileLoad} disabled={!engineReady} />
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <div className="loading-text">Processing...</div>
            <div className="loading-sub">{fileName}</div>
          </div>
        )}
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
