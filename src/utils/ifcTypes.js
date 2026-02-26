/**
 * IFC entity type utilities.
 * Builds a reverse map from web-ifc's numeric type codes to human-readable names.
 */
import * as WEBIFC from 'web-ifc';

/** Lazily-built map: numeric type code → "IFCPROJECT" style string */
let _typeCodeMap = null;

function getTypeCodeMap() {
  if (_typeCodeMap) return _typeCodeMap;
  _typeCodeMap = {};
  for (const [key, value] of Object.entries(WEBIFC)) {
    if (typeof value === 'number' && key.startsWith('IFC')) {
      _typeCodeMap[value] = key; // e.g. { 103090709: 'IFCPROJECT' }
    }
  }
  return _typeCodeMap;
}

const PROPER_CASING_MAP = {
  IFCPROJECT: 'IfcProject', IFCSITE: 'IfcSite', IFCBUILDING: 'IfcBuilding', IFCBUILDINGSTOREY: 'IfcBuildingStorey',
  IFCSPACE: 'IfcSpace', IFCZONE: 'IfcZone', IFCWALL: 'IfcWall', IFCWALLSTANDARDCASE: 'IfcWallStandardCase',
  IFCSLAB: 'IfcSlab', IFCBEAM: 'IfcBeam', IFCCOLUMN: 'IfcColumn', IFCDOOR: 'IfcDoor', IFCWINDOW: 'IfcWindow',
  IFCSTAIR: 'IfcStair', IFCSTAIRFLIGHT: 'IfcStairFlight', IFCROOF: 'IfcRoof', IFCRAILING: 'IfcRailing',
  IFCPLATE: 'IfcPlate', IFCMEMBER: 'IfcMember', IFCFOOTING: 'IfcFooting', IFCPILE: 'IfcPile',
  IFCCURTAINWALL: 'IfcCurtainWall', IFCBUILDINGELEMENTPROXY: 'IfcBuildingElementProxy',
  IFCFURNISHINGELEMENT: 'IfcFurnishingElement', IFCOPENINGELEMENT: 'IfcOpeningElement',
  IFCDISTRIBUTIONELEMENT: 'IfcDistributionElement', IFCFLOWTERMINAL: 'IfcFlowTerminal',
  IFCFLOWSEGMENT: 'IfcFlowSegment', IFCFLOWFITTING: 'IfcFlowFitting', IFCFLOWCONTROLLER: 'IfcFlowController'
};

/**
 * Returns correctly-cased string given numeric web-ifc type code, or fallback upper case string.
 */
export function getIfcTypeName(typeCode) {
  if (typeCode == null) return 'IfcElement';

  // If it's already a string, process it directly instead of map lookup
  let raw = String(typeCode);
  if (!isNaN(Number(typeCode))) {
    const map = getTypeCodeMap();
    raw = map[typeCode] || `IfcType_${typeCode}`;
  }

  // Pre-mapped camelCasing for correct comparison against Sets
  const upperRaw = raw.toUpperCase();
  if (PROPER_CASING_MAP[upperRaw]) {
    return PROPER_CASING_MAP[upperRaw];
  }

  // Fallback title-case transformation Ifc+something
  if (upperRaw.startsWith('IFC')) {
    return 'Ifc' + upperRaw.slice(3, 4).toUpperCase() + upperRaw.slice(4).toLowerCase();
  }
  return raw;
}

/**
 * IFC types that form the spatial hierarchy (auto-expanded in tree).
 */
export const SPATIAL_TYPES = new Set([
  'IfcProject',
  'IfcSite',
  'IfcBuilding',
  'IfcBuildingStorey',
  'IfcSpace',
  'IfcZone',
]);

/** Short display label for IFC type (strips "Ifc" prefix, adds spaces) */
export function getTypeLabel(typeName) {
  const labels = {
    IfcProject: 'Project',
    IfcSite: 'Site',
    IfcBuilding: 'Building',
    IfcBuildingStorey: 'Storey',
    IfcSpace: 'Space',
    IfcZone: 'Zone',
    IfcWall: 'Wall',
    IfcWallStandardCase: 'Wall',
    IfcSlab: 'Slab',
    IfcBeam: 'Beam',
    IfcColumn: 'Column',
    IfcDoor: 'Door',
    IfcWindow: 'Window',
    IfcStair: 'Stair',
    IfcStairFlight: 'Stair Flight',
    IfcRoof: 'Roof',
    IfcRailing: 'Railing',
    IfcPlate: 'Plate',
    IfcMember: 'Member',
    IfcFooting: 'Footing',
    IfcPile: 'Pile',
    IfcCurtainWall: 'Curtain Wall',
    IfcBuildingElementProxy: 'Element',
    IfcFurnishingElement: 'Furnishing',
    IfcOpeningElement: 'Opening',
    IfcDistributionElement: 'Distribution',
    IfcFlowTerminal: 'Terminal',
    IfcFlowSegment: 'Flow Segment',
    IfcFlowFitting: 'Flow Fitting',
    IfcFlowController: 'Flow Ctrl',
  };
  return labels[typeName] ?? typeName.replace(/^Ifc/, '');
}

/** Returns an emoji icon for the given IFC type name */
export function getTypeIcon(typeName) {
  const icons = {
    IfcProject: '🏗',
    IfcSite: '🌍',
    IfcBuilding: '🏢',
    IfcBuildingStorey: '🏬',
    IfcSpace: '📐',
    IfcZone: '🔲',
    IfcWall: '🧱',
    IfcWallStandardCase: '🧱',
    IfcSlab: '▬',
    IfcBeam: '━',
    IfcColumn: '║',
    IfcDoor: '🚪',
    IfcWindow: '🪟',
    IfcStair: '🪜',
    IfcStairFlight: '🪜',
    IfcRoof: '⌂',
    IfcRailing: '╫',
    IfcCurtainWall: '⬛',
    IfcFurnishingElement: '🪑',
    IfcOpeningElement: '⬜',
    IfcFooting: '⚓',
    IfcPile: '↓',
    IfcBuildingElementProxy: '◈',
  };
  return icons[typeName] ?? '◈';
}

/**
 * Extracts the string value from an IFC attribute (handles both
 * raw strings and STEP-encoded { type, value } objects).
 */
export function getStringValue(attr) {
  if (!attr) return null;
  if (typeof attr === 'string') return attr;
  if (typeof attr === 'object' && attr.value != null) return String(attr.value);
  return null;
}
