import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { useIfcEngine } from '../hooks/useIfcEngine';
import { disposeAllFragments, clearHelperObjects, ensureSceneLighting } from '../utils/fragmentUtils';
import { logger } from '../utils/logger';

const IfcViewer = forwardRef(function IfcViewer({ onReady, onError, onSelect }, ref) {
  const containerRef = useRef(null);
  const { engine, isReady, error } = useIfcEngine(containerRef);

  // Expose loadFile method to parent
  useImperativeHandle(ref, () => ({
    loadFile: async (buffer, fileName) => {
        if (!engine) throw new Error('Engine not ready');

        const { components, ifcLoader, fragments, world } = engine;
        const uint8 = new Uint8Array(buffer);

        const model = await ifcLoader.load(uint8, false, fileName, {
            processData: {
                progressCallback: (progress) => {
                    logger.info('[IFC] Loading progress:', progress);
                },
            },
        });
        logger.info('[IFC] Model loaded successfully:', model);
        logger.info('[IFC] Fragments list size after load:', fragments.list.size);

        if (fragments.list.size === 0) {
            logger.error('[IFC] ERROR: No models added to fragments list after loading');
        }

        // Check model properties
        if (model) {
            logger.info('[IFC] Model ID:', model.uuid);
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
            logger.info('[IFC] Camera fitted to bounding box');
            
            // Move grid to the bottom of the model
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
      <div className="controls-hint">
        <span className="hint-tag">🖱 Left: Rotate</span>
        <span className="hint-tag">🖱 Right: Pan</span>
        <span className="hint-tag">⚙ Scroll: Zoom</span>
      </div>
    </div>
  );
});

export default IfcViewer;
