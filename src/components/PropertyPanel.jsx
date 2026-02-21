import { useCallback } from 'react';

const PropertyPanel = ({ selectedElement, onClose }) => {
  const renderProperties = (props) => {
    if (!props) return <div className="empty-props">No properties data available</div>;
    
    let entries = Object.entries(props);
    
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

  return (
    <div className="properties-panel">
        <div className="panel-header">
            <h3>
                <span>Selected Element</span>
                <span style={{fontSize:'11px', opacity:0.6}}>#{selectedElement?.expressID}</span>
            </h3>
            <button onClick={onClose} title="Close">✕</button>
        </div>
        <div className="panel-content">
            {selectedElement?.properties ? (
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
  );
};

export default PropertyPanel;