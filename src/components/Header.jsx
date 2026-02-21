import { useCallback } from 'react';

const Header = ({ 
  hasModel, 
  modelCount, 
  fileName, 
  loading, 
  onAddClick, 
  onReset 
}) => {
  return (
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
                  
                  Promise.all(readers).then(onAddClick);
                  e.target.value = '';
                }}
              />
            </label>

            <button className="btn btn-ghost" onClick={onReset}>
              ✕ Reset
            </button>
          </>
        )}
      </div>
    </header>
  );
};

export default Header;