import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { useIfcEngine } from '../hooks/useIfcEngine';
import { disposeAllFragments, clearHelperObjects, ensureSceneLighting } from '../utils/fragmentUtils';
import { ClippingManager } from '../utils/ClippingManager';
import ViewCube from './ViewCube';
import { logger } from '../utils/logger';

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
    hideSelection: () => {
        if (!engine) return;
        const hider = engine.components.get(OBC.Hider);
        const selection = engine.highlighter.selection.select;
        if (selection && Object.keys(selection).length > 0) {
            hider.set(false, selection);
            engine.highlighter.clear();
        }
    },
    showAll: () => {
        if (!engine) return;
        const hider = engine.components.get(OBC.Hider);
        hider.set(true);
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

    // Simple selection handling via highlighter events usually
    // But since logic wasn't fully implemented in original file, keeping it simple or adding if needed.
    // The original file didn't seem to have the selection logic fully wired in the effect, 
    // it just initialized the highlighter.
    // If we want to implement selection, we would add event listeners here.
    
    // For now, mirroring the original behavior which passed checks to App.

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
