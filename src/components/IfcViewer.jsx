import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as OBC from '@thatopen/components';
import * as FRAGS from '@thatopen/fragments';
import * as THREE from 'three';
import { useIfcEngine } from '../hooks/useIfcEngine';
import { disposeAllFragments, clearHelperObjects, ensureSceneLighting } from '../utils/fragmentUtils';
import { ClippingManager } from '../utils/ClippingManager';
import ViewCube from './ViewCube';
import { logger } from '../utils/logger';

/* ─── Spatial tree helpers (OBC v3 / FRAGS v3) ─── */

/**
 * Convert a numeric FRAGS category code to a readable IFC type string.
 * ifcCategoryMap: { '103090709': 'IFCPROJECT', ... }
 * Returns 'IfcProject' style string.
 */
function catToTypeName(catCode) {
  if (catCode == null) return 'IfcElement';
  const raw = FRAGS.ifcCategoryMap?.[String(catCode)]; // e.g. 'IFCPROJECT'
  if (!raw) return `IfcType_${catCode}`;
  // 'IFCPROJECT' → 'IfcProject'
  return 'Ifc' + raw.slice(3, 4).toUpperCase() + raw.slice(4).toLowerCase();
}

/**
 * Collect all localIds in a raw getSpatialStructure tree.
 */
function collectLocalIds(node, out = []) {
  if (node?.localId != null) out.push(node.localId);
  for (const child of node?.children ?? []) collectLocalIds(child, out);
  return out;
}

/**
 * Recursively convert a raw getSpatialStructure node (category+localId+children)
 * into our display node (type, name, expressID, children).
 */
function enrichNode(raw, nameMap) {
  const typeName = catToTypeName(raw.category);
  const name = nameMap.get(raw.localId) ?? typeName;
  const children = (raw.children ?? []).map(c => enrichNode(c, nameMap));
  return { expressID: raw.localId, type: typeName, name, children };
}

/**
 * Builds the display tree for a single FragmentsModel.
 * Uses model.getSpatialStructure() (native v3 API) and batch-fetches
 * element names via model.getItemsData().
 */
async function buildModelTree(model) {
  logger.info('[TREE] buildModelTree called. model type:', Object.getPrototypeOf(model)?.constructor?.name);
  logger.info('[TREE] model keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(model)).join(', '));
  logger.info('[TREE] model.modelId:', model.modelId);
  logger.info('[TREE] model.name:', model.name);
  logger.info('[TREE] typeof model.getSpatialStructure:', typeof model.getSpatialStructure);

  let raw = null;
  try {
    raw = await model.getSpatialStructure();
    logger.info('[TREE] getSpatialStructure raw result:', raw);
    logger.info('[TREE] raw type:', typeof raw);
    if (raw !== null && raw !== undefined) {
      logger.info('[TREE] raw keys:', Object.keys(raw).join(', '));
      logger.info('[TREE] raw.localId:', raw.localId);
      logger.info('[TREE] raw.category:', raw.category);
      logger.info('[TREE] raw.children length:', raw.children?.length ?? 'no children prop');
    }
  } catch (err) {
    logger.warn('[TREE] getSpatialStructure threw:', err);
    return null;
  }

  if (!raw || raw.localId == null) {
    logger.warn('[TREE] raw is null/empty or has no localId – returning null. raw=', raw);
    return null;
  }

  // Batch-fetch names for all localIds in one call
  const nameMap = new Map();
  try {
    const localIds = collectLocalIds(raw);
    logger.info('[TREE] localIds collected:', localIds.length, 'first few:', localIds.slice(0,5));
    const itemsData = await model.getItemsData(localIds);
    logger.info('[TREE] getItemsData returned:', itemsData?.length, 'items, sample[0]:', itemsData?.[0]);
    for (const item of itemsData ?? []) {
      if (item == null) continue;
      const id = item.localId ?? item.expressID;
      if (id == null) continue;
      const nameRaw = item.Name ?? item.LongName;
      const name = typeof nameRaw === 'object' ? nameRaw?.value : nameRaw;
      if (name) nameMap.set(id, String(name));
    }
    logger.info('[TREE] nameMap size:', nameMap.size);
  } catch (err) {
    logger.warn('[TREE] getItemsData failed (names will fall back to types):', err);
  }

  const tree = enrichNode(raw, nameMap);
  logger.info('[TREE] final tree root:', tree?.type, tree?.name, 'children:', tree?.children?.length);
  return tree;
}

const IfcViewer = forwardRef(function IfcViewer({ onReady, onError, onSelect }, ref) {
  const containerRef = useRef(null);
  const { engine, isReady, error } = useIfcEngine(containerRef);
  const clippingMgrRef = useRef(null);

  // Expose loadFile method to parent
  useImperativeHandle(ref, () => ({
    loadFiles: async (files) => {
        if (!engine) throw new Error('Engine not ready');

        const { components, ifcLoader, fragments, world } = engine;

        const loadPromises = files.map(file => {
            const uint8 = new Uint8Array(file.buffer);
            return ifcLoader.load(uint8, false, file.name, {
                processData: {
                    progressCallback: (progress) => {
                        logger.info(`[IFC] Loading progress for ${file.name}:`, progress);
                    },
                },
            });
        });

        const models = await Promise.all(loadPromises);
        
        logger.info(`[IFC] ${models.length} models loaded successfully`);
        logger.info('[IFC] Fragments list size after load:', fragments.list.size);

        if (fragments.list.size === 0) {
            logger.error('[IFC] ERROR: No models added to fragments list after loading');
        }

        // Fit camera to model
        const bbox = components.get(OBC.BoundingBoxer);
        bbox.addFromModels();
        const bounds = bbox.get();
        const size = bounds.getSize(new THREE.Vector3());
        logger.info('[IFC] Bounding box size:', size.length());

        if (size.length() > 0) {
            // Visual Helper for BBox
            const helper = new THREE.Box3Helper(bounds, 0xffff00);
            helper.frustumCulled = false;
            world.scene.three.add(helper);
            logger.info('[IFC] Bounding box helper added');

            ensureSceneLighting(world.scene.three);

            await world.camera.controls.fitToBox(bounds, true);
            logger.info('[IFC] Camera fitted to combined bounding box');
            
            // Move grid to the bottom of the bounding box
            const grids = components.get(OBC.Grids);
            const grid = grids.list.values().next().value;
            if (grid) {
                grid.three.position.y = bounds.min.y;
                logger.info('[IFC] Grid positioned at y=', bounds.min.y);
            }

        } else {
            await world.camera.controls.setLookAt(50, 30, 50, 0, 0, 0);
            logger.info('[IFC] Camera set to default position');
        }
        bbox.dispose();

        // Force fragment tiles to update at the new camera position
        fragments.core.update(true);
        logger.info('[IFC] Fragments core updated');
        
        setTimeout(() => {
            fragments.core.update(true);
            logger.info('[IFC] Forced fragment update done');
        }, 500);
    },
    fitModel: async () => {
        if (!engine) return;
        const { components, world } = engine;
        const bbox = components.get(OBC.BoundingBoxer);
        bbox.addFromModels();
        const bounds = bbox.get();
        await world.camera.controls.fitToBox(bounds, true);
        bbox.dispose();
    },
    toggleProjection: () => {
        if (!engine) return false;
        const camera = engine.world.camera;
        const isPerspective = camera.projection.current === "Perspective";
        camera.projection.set(isPerspective ? "Orthographic" : "Perspective");
        return camera.projection.current;
    },
    toggleGrid: () => {
        if (!engine) return false;
        const grids = engine.components.get(OBC.Grids);
        if (grids.list.size > 0) {
            const grid = grids.list.values().next().value;
            if (grid) {
                grid.three.visible = !grid.three.visible;
                return grid.three.visible;
            }
        }
        return false;
    },
    toggleClipping: () => {
        if (!engine) return false;
        
        // Lazy-create the manager
        if (!clippingMgrRef.current) {
            clippingMgrRef.current = new ClippingManager(engine.world, engine.components);
        }
        const mgr = clippingMgrRef.current;
        mgr.enabled = !mgr.enabled;

        const container = engine.world.renderer.three.domElement;
        
        if (mgr.enabled) {
            container.ondblclick = async (event) => {
                // Try to raycast onto a face using OBC raycaster
                const raycasters = engine.components.get(OBC.Raycasters);
                const raycaster = raycasters.get(engine.world);
                const result = await raycaster.castRay();
                
                logger.info('[CLIP] Raycast result:', result);
                
                if (result && result.point) {
                    // Use the face normal from OBC raycaster
                    let normal;
                    if (result.normal) {
                        normal = result.normal.clone();
                    } else if (result.face && result.face.normal) {
                        normal = result.face.normal.clone();
                        if (result.object) {
                            normal.transformDirection(result.object.matrixWorld);
                        }
                    } else {
                        // Fallback: camera direction
                        normal = result.point.clone()
                            .sub(engine.world.camera.three.position)
                            .normalize();
                    }
                    mgr.createPlane(result.point.clone(), normal.negate());
                } else {
                    // No hit — place at model centre
                    mgr.createPlaneAtCenter();
                }
            };
            window.onkeydown = (e) => {
                if (e.code === 'Delete' || e.code === 'Backspace') mgr.removeLastPlane();
            };
        } else {
            container.ondblclick = null;
            window.onkeydown = null;
            mgr.removeAll();
        }
        return mgr.enabled;
    },
    setClipMode: (mode) => {
        if (!clippingMgrRef.current) return;
        clippingMgrRef.current.setMode(mode);
    },
    toggleClippingVisibility: () => {
        if (!clippingMgrRef.current) return false;
        const mgr = clippingMgrRef.current;
        mgr.toggleVisibility(!mgr.visible);
        return mgr.visible;
    },
    hideSelection: () => {
        if (!engine) return;
        const hider = engine.components.get(OBC.Hider);
        const selection = engine.highlighter.selection.select;
        if (selection && Object.keys(selection).length > 0) {
            hider.set(false, selection);
            engine.highlighter.clear();
        }
    },
    showAll: async () => {
        if (!engine) return;
        const { fragments, components } = engine;
        // Try the v3 model-level reset first, fall back to v2 Hider
        for (const [, model] of fragments.list) {
            try { await model.resetVisible(); } catch (_) { /* skip */ }
        }
        try {
            const hider = components.get(OBC.Hider);
            hider.set(true);
        } catch (_) { /* Hider may throw in pure v3 */ }
    },
    reset: () => {
        if (!engine) return;
        
        // Clear selection
        if (engine.highlighter) {
            engine.highlighter.clear();
        }
        
        if (engine.world && engine.world.meshes) {
            engine.world.meshes.clear();
        }
        
        disposeAllFragments(engine.fragments);
        clearHelperObjects(engine.world.scene.three);
    },

    /* ─── Spatial tree ─── */

    getSpatialStructure: async () => {
        if (!engine) return [];
        const { fragments } = engine;
        const results = [];

        logger.info('[TREE] fragments.list size:', fragments.list.size);
        logger.info('[TREE] fragments.list type:', Object.getPrototypeOf(fragments.list)?.constructor?.name);

        let idx = 0;
        for (const [modelId, model] of fragments.list) {
            logger.info(`[TREE] model[${idx}] key="${modelId}" constructor="${Object.getPrototypeOf(model)?.constructor?.name}"`);
            logger.info(`[TREE] model[${idx}] own props:`, Object.getOwnPropertyNames(model).join(', '));
            logger.info(`[TREE] model[${idx}] proto methods:`, Object.getOwnPropertyNames(Object.getPrototypeOf(model) ?? {}).join(', '));
            logger.info(`[TREE] model[${idx}] getSpatialStructure?`, typeof model.getSpatialStructure);
            logger.info(`[TREE] model[${idx}] getItemsData?`, typeof model.getItemsData);
            idx++;
            try {
                const tree = await buildModelTree(model);
                results.push({
                    modelId,
                    name: model.name || model.modelId || 'IFC Model',
                    tree,
                });
            } catch (err) {
                logger.warn('[TREE] Error building tree for model:', err);
            }
        }
        logger.info('[TREE] getSpatialStructure results:', results.length, 'models');
        return results;
    },

    highlightNode: (expressID, modelId) => {
        if (!engine) return;
        const { fragments, highlighter } = engine;

        // Build a fragment map: { modelId: Set<localId> }
        // If modelId is given, target that model; otherwise try all models
        const fragmentMap = {};
        for (const [mid] of fragments.list) {
            if (!modelId || mid === modelId) {
                fragmentMap[mid] = new Set([expressID]);
            }
        }

        if (Object.keys(fragmentMap).length > 0) {
            highlighter.highlightByID('select', fragmentMap, true, true);
        }
    },

    setNodeVisibility: async (expressIDs, visible, modelId) => {
        if (!engine) return;
        const { fragments } = engine;

        for (const [mid, model] of fragments.list) {
            if (!modelId || mid === modelId) {
                try {
                    await model.setVisible(visible, expressIDs);
                } catch (err) {
                    logger.warn('[TREE] setVisible failed:', err);
                }
            }
        }
    },
  }));

  // Handle engine ready/error callbacks
  useEffect(() => {
    if (isReady && onReady) {
        onReady();
    }
  }, [isReady, onReady]);

  useEffect(() => {
    if (error && onError) {
        onError(error);
    }
  }, [error, onError]);

  // Handle selection
  useEffect(() => {
    if (!engine || !onSelect) return;

    const highlighter = engine.highlighter;
    const components = engine.components;

    // Handle selection via highlighter events
    const handleHighlight = async (selection) => {
        if (!selection || Object.keys(selection).length === 0) {
            onSelect(null);
            return;
        }

        const fragmentId = Object.keys(selection)[0];
        const expressIDSet = selection[fragmentId];
        
        if (!expressIDSet || expressIDSet.size === 0) {
           onSelect(null);
           return;
        }

        const expressID = Array.from(expressIDSet)[0];
        
        let targetModel = null;
        let props = null;

        try {
        // In v3 the selection key IS the model ID – look it up directly
            if (engine.fragments.list) {
                targetModel = engine.fragments.list.get(fragmentId) ?? null;
                // If not found by model ID, scan all models (backward compat)
                if (!targetModel) {
                    for (const [, m] of engine.fragments.list) {
                        targetModel = m;
                        break;
                    }
                }
            }
            
            // Fetch properties via v3 getItemsData
            if (targetModel) {
                try {
                    const itemsData = await targetModel.getItemsData([expressID]);
                    props = itemsData?.[0] ?? null;
                } catch (_) { /* properties unavailable */ }
            }
        } catch (err) {
            console.warn('[IFC] Failed to fetch properties for', expressID, err);
        }

        onSelect({ 
            expressID, 
            modelID: fragmentId,   // in v3, selection key is the model ID
            properties: props 
        });
    };

    const handleClear = () => {
        onSelect(null);
    };

    highlighter.events.select.onHighlight.add(handleHighlight);
    highlighter.events.select.onClear.add(handleClear);

    return () => {
        highlighter.events.select.onHighlight.remove(handleHighlight);
        highlighter.events.select.onClear.remove(handleClear);
    };

  }, [engine, onSelect]);

  return (
    <div className="viewer-wrapper">
      <div ref={containerRef} className="viewer-container" />
      {engine && <ViewCube world={engine.world} />}
      <div className="controls-hint">
        <span className="hint-tag">🖱 Left: Rotate</span>
        <span className="hint-tag">🖱 Right: Pan</span>
        <span className="hint-tag">⚙ Scroll: Zoom</span>
      </div>
    </div>
  );
});

export default IfcViewer;
