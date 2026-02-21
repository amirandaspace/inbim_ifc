
import { useRef, useEffect, useState, useCallback } from 'react';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';
import { logger } from '../utils/logger';

export const useIfcEngine = (containerRef) => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const engineRef = useRef(null);

  const initEngine = useCallback(async (container, signal) => {
    try {
      logger.info('[ENGINE] Starting engine initialization');
      
      // Clear container
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      
      const components = new OBC.Components();
      await components.init();
      logger.info('[ENGINE] Components initialized');
      
      if (signal.aborted) { components.dispose(); return; }
      
      const worlds = components.get(OBC.Worlds);
      const world = worlds.create();
      
      world.scene = new OBC.SimpleScene(components);
      world.scene.setup();
      world.scene.three.background = new THREE.Color(0x12121a);

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      world.scene.three.add(ambientLight);
      const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x222222, 0.5);
      world.scene.three.add(hemisphereLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
      directionalLight.position.set(50, 100, 50);
      world.scene.three.add(directionalLight);

      world.renderer = new OBC.SimpleRenderer(components, container);
      world.camera = new OBC.OrthoPerspectiveCamera(components);
      world.camera.three.far = 100000;
      world.camera.three.updateProjectionMatrix();
      await world.camera.controls.setLookAt(50, 30, 50, 0, 0, 0);

      const grids = components.get(OBC.Grids);
      grids.create(world);
      
      // Force resize
      if (world.renderer) world.renderer.update(container);
      window.dispatchEvent(new Event('resize'));

      // IFC Loader
      const ifcLoader = components.get(OBC.IfcLoader);
      ifcLoader.settings.autoSetWasm = false;
      ifcLoader.settings.wasm.path = '/wasm/';
      ifcLoader.settings.wasm.absolute = false;
      await ifcLoader.setup();

      // Fragments
      const fragments = components.get(OBC.FragmentsManager);
      await fragments.init('/fragments/worker.mjs');

      ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = false;
      ifcLoader.settings.webIfc.OPTIMIZE_PROFILES = true;

      // Event Listeners
      world.camera.controls.addEventListener('update', () => {
        try { fragments.core.update(); } catch (_) { /* ignore */ }
      });

      world.onCameraChanged.add((camera) => {
        for (const [, model] of fragments.list) {
          model.useCamera(camera.three);
        }
        fragments.core.update(true);
      });

      fragments.list.onItemSet.add(({ value: model }) => {
        model.useCamera(world.camera.three);
        world.scene.three.add(model.object);
        fragments.core.update(true);
        logger.info('[ENGINE] Model added to scene');
      });

      fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
        if (!("isLodMaterial" in material && material.isLodMaterial)) {
          material.polygonOffset = true;
          material.polygonOffsetUnits = 1;
          material.polygonOffsetFactor = Math.random();
        }
      });

      // Highlighter
      components.get(OBC.Raycasters).get(world);
      const highlighter = components.get(OBCF.Highlighter);
      highlighter.setup({
        world,
        selectMaterialDefinition: {
          color: new THREE.Color('#bcf124'),
          opacity: 1,
          transparent: false,
          renderedFaces: 0,
        },
      });

      engineRef.current = { components, world, ifcLoader, fragments, highlighter };
      setIsReady(true);
      logger.info('[ENGINE] Initialization complete');

    } catch (err) {
      logger.error('Engine init error:', err);
      setError(err);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const abortController = new AbortController();
    initEngine(container, abortController.signal);

    return () => {
      logger.info('[ENGINE] Cleaning up');
      abortController.abort();
      if (engineRef.current) {
        engineRef.current.components.dispose();
        engineRef.current = null;
      }
      setIsReady(false);
    };
  }, [containerRef, initEngine]);

  return { engine: engineRef.current, isReady, error };
};
