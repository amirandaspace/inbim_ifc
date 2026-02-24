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
const RELATION_KEYS = new Set(['IsDefinedBy', 'HasAssociations', 'IsTypedBy']);

/**
 * Try to extract property rows from a relation ItemData object.
 * In OBC v3, each value is { value, type } (ItemAttribute), and nested
 * relations are ItemData[] arrays.
 *
 * Handles:
 *   IsDefinedBy → IfcPropertySet (HasProperties[]) or IfcRelDefinesByType
 *   HasAssociations → IfcRelAssociatesMaterial
 *   IsTypedBy → IfcRelDefinesByType → HasPropertySets[]
 */
function extractPset(rel) {
  if (!rel || typeof rel !== 'object') return null;

  const category = extractScalar(rel._category) ?? '';
  const psetName = extractScalar(rel.Name) ?? null;

  // ── Material association ──────────────────────────────────────────────────
  if (category.includes('MATERIAL')) {
    const matName = extractScalar(rel.Name);
    if (matName) return { title: 'Material', rows: [{ key: 'material', label: 'Material', value: matName }] };
    // IfcRelAssociatesMaterial: the material is under RelatingMaterial (also ItemData)
    const related = rel.RelatingMaterial;
    if (related && typeof related === 'object') {
      const name = extractScalar(related.Name) ?? extractScalar(related.Category);
      if (name) return { title: 'Material', rows: [{ key: 'material', label: 'Material', value: name }] };
    }
    return null;
  }

  // ── Type object (IsTypedBy or RelatingType items) ─────────────────────────
  if (category.includes('RELDEFINESBYTYPE')) {
    const sections = [];
    const typeRels = rel.RelatingType;
    const typeItems = Array.isArray(typeRels) ? typeRels : typeRels ? [typeRels] : [];
    for (const t of typeItems) {
      const typeName = extractScalar(t?.Name);
      if (typeName) sections.push({ title: 'Type', rows: [{ key: 'typeName', label: 'Type Name', value: typeName }] });
      // Psets attached to the type
      const typePsets = t?.HasPropertySets;
      if (Array.isArray(typePsets)) {
        for (const ps of typePsets) {
          const s = extractPset(ps);
          if (s) sections.push(s);
        }
      }
    }
    return sections.length === 1 ? sections[0] : sections.length > 1 ? sections[0] : null;
  }

  // ── Standard IfcPropertySet (HasProperties) ───────────────────────────────
  const hasProp = rel.HasProperties;
  if (hasProp) {
    const propList = Array.isArray(hasProp) ? hasProp : [hasProp];
    const rows = [];
    for (const p of propList) {
      if (!p || typeof p !== 'object') continue;
      const name = extractScalar(p.Name);
      // NominalValue is another { value, type } wrapper inside ItemData
      const nominal = p.NominalValue;
      const val = nominal && typeof nominal === 'object' && 'value' in nominal
        ? extractScalar(nominal)
        : extractScalar(p.Value);
      if (name && val !== null) rows.push({ key: name, label: name, value: val });
    }
    if (rows.length) return { title: psetName ?? 'Property Set', rows };
    return null;
  }

  // ── IfcRelDefinesByProperties wrapper (points to IfcPropertySet) ─────────
  const relPset = rel.RelatingPropertyDefinition;
  if (relPset) {
    const items = Array.isArray(relPset) ? relPset : [relPset];
    for (const ps of items) {
      const s = extractPset(ps);
      if (s) return s;
    }
  }

  return null;
}

const PropertyPanel = ({ selectedElement, onClose }) => {
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
      const pset = extractPset(rel);
      if (pset) psetSections.push(pset);
    }
  }

  const renderRow = ({ key, label, value }) => (
    <div key={key} className="prop-row">
      <span className="prop-key" title={key}>{label}</span>
      <span className="prop-value" title={value}>{value}</span>
    </div>
  );

  return (
    <div className="properties-panel">
      <div className="panel-header">
        <h3>
          <span>{typeLabel}</span>
          <span style={{ fontSize: '11px', opacity: 0.5 }}>#{selectedElement?.expressID}</span>
        </h3>
        <button onClick={onClose} title="Close">✕</button>
      </div>

      <div className="panel-content">
        {mainRows.length === 0 && psetSections.length === 0 && systemRows.length === 0 ? (
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