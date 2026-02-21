import { useState, useCallback } from 'react';

const useModelLoader = () => {
  const [hasModel, setHasModel] = useState(false);
  const [modelCount, setModelCount] = useState(0);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileLoad = useCallback(
    async (files, currentModelCount, fileProcessor) => {
      // files is array of { buffer, name }
      if (!files || files.length === 0) return;

      console.log('[MODEL] Starting file load for', files.length, 'files');
      setLoading(true);
      setError(null);

      // If we already have models, we are appending.
      // If not, we are starting fresh (or fresh after reset).
      
      try {
        const results = files.map(f => f.name);
        setFileName(files.length === 1 ? files[0].name : `Loading ${files.length} models...`);
        
        // Execute the processor (loading into viewer) with all files at once
        if (fileProcessor) {
            await fileProcessor(files);
        }
        
        setModelCount(prev => prev + results.length);
        setHasModel(true);
        if (files.length === 1 && currentModelCount === 0) {
            setFileName(files[0].name);
        } else {
            setFileName('Multiple Models');
        }
        console.log('[MODEL] File load completed successfully');
      } catch (err) {
        console.error('[MODEL] Failed to load IFC:', err);
        setError(err?.message || 'Failed to load IFC file.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleReset = useCallback(() => {
    console.log('[MODEL] Resetting model state');
    setHasModel(false);
    setModelCount(0);
    setFileName('');
    setError(null);
  }, []);

  return {
    hasModel,
    modelCount,
    fileName,
    loading,
    error,
    setError,
    handleFileLoad: (files, fileProcessor) => handleFileLoad(files, modelCount, fileProcessor),
    handleReset
  };
};

export { useModelLoader };