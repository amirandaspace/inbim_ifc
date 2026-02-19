import { useRef, useState, useCallback } from 'react';

export default function FileUpload({ onFileLoad, disabled }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files) => {
      if (!files || files.length === 0) return;
      
      const validFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.ifc'));

      if (validFiles.length === 0) {
        alert('Please select valid .ifc files');
        return;
      }

      const readers = validFiles.map(file => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ buffer: reader.result, name: file.name });
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
      });

      Promise.all(readers).then(results => {
        onFileLoad(results);
      }).catch(err => {
        console.error('Error reading files:', err);
        alert('Error reading files');
      });
    },
    [onFileLoad]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onChange = useCallback(
    (e) => {
      handleFiles(e.target.files);
      e.target.value = '';
    },
    [handleFiles]
  );

  return (
    <div className="upload-screen">
      <div className="upload-container">
        <div className="upload-icon">
          <svg viewBox="0 0 24 24">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>

        <h1 className="upload-title">IFC Viewer</h1>
        <p className="upload-desc">
          Open and explore IFC building models directly in your browser.
          <br />
          Powered by IFC.js & Three.js
        </p>

        <div
          className={`dropzone${dragOver ? ' drag-over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <div className="dropzone-text">
            <p className="dropzone-main">
              Drop your <strong>.ifc</strong> file here or <span>browse</span>
            </p>
            <p className="dropzone-sub">IFC 2x3 &amp; IFC 4 supported</p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".ifc"
          multiple
          className="file-input"
          onChange={onChange}
        />
      </div>
    </div>
  );
}
