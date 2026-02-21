import { createContext, useContext, useState, useCallback } from 'react';

const SelectionContext = createContext(null);

export const useSelection = () => {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return context;
};

export const SelectionProvider = ({ children }) => {
  const [selectedElement, setSelectedElement] = useState(null);

  const handleSelect = useCallback((data) => {
    // data = { expressID, modelID, properties } or null
    console.log('SelectionProvider received selection:', data);
    setSelectedElement(data);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedElement(null);
  }, []);

  const value = {
    selectedElement,
    handleSelect,
    clearSelection
  };

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
};