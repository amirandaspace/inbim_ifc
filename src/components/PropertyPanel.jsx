/** Extract a displayable scalar from an OBC v3 property: { value, type } wrapper or plain scalar. */
function extractScalar(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && 'value' in v) {
    const inner = v.value;
    return inner === null || inner === undefined ? null : String(inner);
  }
  if (typeof v === 'object') return null;
  return String(v);
}

/** camelCase / PascalCase → readable label */
function formatKey(key) {
  const k = key.replace(/^_+/, '');
  return k
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

const SKIP_KEYS = new Set(['localId', 'expressID', 'handle', 'type']);
const SYSTEM_KEYS = new Set(['_category', '_guid', '_localId']);
// IFC relation arrays we know how to render specially
const RELATION_KEYS = new Set(['IsDefinedBy', 'HasAssociations', 'IsTypedBy', 'HasMaterial', 'Material']);

/**
 * Helper to recursively extract a material name from complex material structures.
 */
function extractMaterialName(mat) {
  if (!mat) return null;

  // Handle arrays explicitly
  if (Array.isArray(mat)) {
    const names = mat
      .map(m => extractMaterialName(m))
      .filter(n => n && !n.toUpperCase().startsWith('IFC'));
    return names.length > 0 ? Array.from(new Set(names)).join(', ') : null;
  }

  if (typeof mat !== 'object') return null;

  // 1. Direct Name check
  const directName = extractScalar(mat.Name);
  // We skip names that are just the IFC class name or generic (unhelpful)
  const isGeneric = !directName || directName.toUpperCase().startsWith('IFC') || directName.toUpperCase() === 'MATERIAL';
  if (directName && !isGeneric) return directName;

  // 2. Drill down into common IFC material structures

  // IfcMaterialLayerSetUsage -> ForLayerSet
  if (mat.ForLayerSet) return extractMaterialName(mat.ForLayerSet);

  // IfcMaterialLayerSet -> MaterialLayers[]
  if (mat.MaterialLayers) return extractMaterialName(mat.MaterialLayers);

  // IfcMaterialLayer -> Material
  if (mat.Material) {
    const n = extractMaterialName(mat.Material);
    if (n) return n;
  }

  // IfcMaterialList -> Materials[]
  if (mat.Materials) return extractMaterialName(mat.Materials);

  // IfcMaterialProfileSetUsage -> ForProfileSet
  if (mat.ForProfileSet) return extractMaterialName(mat.ForProfileSet);

  // IfcMaterialProfileSet -> MaterialProfiles[]
  if (mat.MaterialProfiles) return extractMaterialName(mat.MaterialProfiles);

  // IfcMaterialProfile -> Material
  // (already handled by mat.Material check above)

  // 3. Last resort: check if any of the attributes is a string that doesn't look like a type
  if (directName) return directName;

  return null;
}

/**
 * Try to extract property rows from a relation or property object.
 * Returns an array of sections: { title, rows: [{ key, label, value }] }[]
 */
function extractPsets(rel) {
  if (!rel || typeof rel !== 'object') return [];
  const results = [];

  // ── 1. Material Relation (IfcRelAssociatesMaterial) ──
  if (rel.RelatingMaterial) {
    const name = extractMaterialName(rel.RelatingMaterial);
    if (name) {
      results.push({ title: 'Material', rows: [{ key: 'material', label: 'Material', value: name }] });
    }
  }

  // ── 2. Property Set (IfcPropertySet) ──
  if (rel.HasProperties) {
    const psetName = extractScalar(rel.Name);
    const propList = Array.isArray(rel.HasProperties) ? rel.HasProperties : [rel.HasProperties];
    const rows = [];
    for (const p of propList) {
      if (!p || typeof p !== 'object') continue;
      const name = extractScalar(p.Name);
      const nominal = p.NominalValue;
      const val = nominal && typeof nominal === 'object' && 'value' in nominal
        ? extractScalar(nominal)
        : extractScalar(p.Value);
      if (name && val !== null) rows.push({ key: name, label: name, value: val });
    }
    if (rows.length) results.push({ title: psetName ?? 'Property Set', rows });
  }

  // ── 3. Relation Wrapper (IfcRelDefinesByProperties) ──
  if (rel.RelatingPropertyDefinition) {
    const items = Array.isArray(rel.RelatingPropertyDefinition) ? rel.RelatingPropertyDefinition : [rel.RelatingPropertyDefinition];
    for (const ps of items) {
      results.push(...extractPsets(ps));
    }
  }

  // ── 4. Type Relation (IfcRelDefinesByType) ──
  if (rel.RelatingType) {
    const typeItems = Array.isArray(rel.RelatingType) ? rel.RelatingType : [rel.RelatingType];
    for (const t of typeItems) {
      const typeName = extractScalar(t?.Name);
      if (typeName) {
        results.push({ title: 'Type', rows: [{ key: 'typeName', label: 'Type Name', value: typeName }] });
      }
      // Psets / Materials attached to the type
      if (t.HasPropertySets) {
        const psets = Array.isArray(t.HasPropertySets) ? t.HasPropertySets : [t.HasPropertySets];
        for (const ps of psets) results.push(...extractPsets(ps));
      }
      if (t.HasAssociations) {
        const assocs = Array.isArray(t.HasAssociations) ? t.HasAssociations : [t.HasAssociations];
        for (const assoc of assocs) results.push(...extractPsets(assoc));
      }
    }
  }

  // ── 5. Direct Material (IfcMaterial style) ──
  // If we haven't found anything yet and this object looks like a material
  if (results.length === 0) {
    const cat = (extractScalar(rel._category) ?? '').toUpperCase();
    const isMatCat = cat.includes('MATERIAL') || !isNaN(Number(cat)); // Numeric categories are opaque, be generous
    if (isMatCat || rel.MaterialLayers || rel.Materials || rel.MaterialProfiles) {
      const name = extractMaterialName(rel);
      if (name) {
        results.push({ title: 'Material', rows: [{ key: 'material', label: 'Material', value: name }] });
      }
    }
  }

  return results;
}

import React, { useState } from 'react';

const PropertyPanel = ({ selectedElement, onClose }) => {
  const [showDebug, setShowDebug] = useState(false);
  const props = selectedElement?.properties ?? null;

  if (!props) {
    return (
      <div className="properties-panel">
        <div className="panel-header">
          <h3><span>IFC Element</span></h3>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        <div className="panel-content">
          <div className="empty-props">No property data found for this element.</div>
        </div>
      </div>
    );
  }

  // ── Derive type label from _category ──
  const catRaw = props._category;
  const catVal = extractScalar(catRaw);
  const typeLabel = catVal ? catVal.replace(/^IFC/i, 'Ifc') : 'IFC Element';

  // ── Main attributes (direct scalar props) ──
  const mainRows = [];
  const systemRows = [];
  for (const [key, value] of Object.entries(props)) {
    if (RELATION_KEYS.has(key)) continue; // handled separately
    const displayed = extractScalar(value);
    if (displayed === null) continue;
    if (SKIP_KEYS.has(key)) continue;
    const row = { key, label: formatKey(key), value: displayed };
    if (SYSTEM_KEYS.has(key)) systemRows.push(row);
    else mainRows.push(row);
  }

  // ── Relations → Psets, Materials, Type ──
  const psetSections = [];
  for (const relKey of RELATION_KEYS) {
    const relValue = props[relKey];
    if (!relValue) continue;
    const relArray = Array.isArray(relValue) ? relValue : [relValue];
    for (const rel of relArray) {
      if (!rel || typeof rel !== 'object') continue;
      const results = extractPsets(rel);
      psetSections.push(...results);
    }
  }

  const renderRow = ({ key, label, value }) => (
    <div key={key} className="prop-row">
      <span className="prop-key" title={key}>{label}</span>
      <span className="prop-value" title={value}>{value}</span>
    </div>
  );

  const getCircularReplacer = () => {
    const seen = new WeakSet();
    return (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    };
  };

  return (
    <div className="properties-panel" style={{ display: 'flex', flexDirection: 'column', width: showDebug ? '600px' : undefined }}>
      <div className="panel-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{typeLabel}</span>
          <span style={{ fontSize: '11px', opacity: 0.5 }}>#{selectedElement?.expressID}</span>
          <button onClick={() => setShowDebug(!showDebug)} style={{ background: 'none', border: '1px solid currentColor', fontSize: '10px', padding: '2px 4px', cursor: 'pointer', borderRadius: '4px' }}>
            {showDebug ? 'Hide JSON' : 'Show JSON'}
          </button>
        </h3>
        <button onClick={onClose} title="Close">✕</button>
      </div>

      <div className="panel-content" style={{ flex: 1, overflowY: 'auto' }}>
        {showDebug ? (
          <pre style={{ fontSize: '10px', whiteSpace: 'pre-wrap', padding: '8px', background: '#f5f5f5', color: '#333' }}>
            {JSON.stringify(props, getCircularReplacer(), 2)}
          </pre>
        ) : mainRows.length === 0 && psetSections.length === 0 && systemRows.length === 0 ? (
          <div className="empty-props">No displayable properties.</div>
        ) : (
          <>
            {/* Direct attributes */}
            {mainRows.length > 0 && (
              <div className="prop-section">
                <div className="prop-section-title">Attributes</div>
                {mainRows.map(renderRow)}
              </div>
            )}
            {/* Property Sets & Relations */}
            {psetSections.map((section, i) => (
              <div key={i} className="prop-section">
                <div className="prop-section-title">{section.title}</div>
                {section.rows.map(renderRow)}
              </div>
            ))}
            {/* System / internal */}
            {systemRows.length > 0 && (
              <div className="prop-section">
                <div className="prop-section-title">System</div>
                {systemRows.map(renderRow)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PropertyPanel;