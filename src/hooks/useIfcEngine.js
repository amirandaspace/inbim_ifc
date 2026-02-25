
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
      // Use setup() with BIM360-style lighting — this creates exactly
      // 1 DirectionalLight + 1 AmbientLight internally.
      world.scene.setup({
        backgroundColor: new THREE.Color(0xd5dde3),
        directionalLight: {
          color: new THREE.Color(0xfff5e6),   // warm sun
          intensity: 1.5,
          position: new THREE.Vector3(80, 120, 60),
        },
        ambientLight: {
          color: new THREE.Color(0x93a5b8),   // cool blue-grey ambient
          intensity: 1.0,
        },
      });

      // ── Gradient background fix (blue sky → warm beige) plain 2D ──
      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = 2;
      bgCanvas.height = 512;
      const ctx = bgCanvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#9ebfdeff');   // blue sky
      grad.addColorStop(0.5, '#d9dfe5'); // neutral mid
      grad.addColorStop(1, '#e3d5c8');   // warm beige ground
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 2, 512);
      const bgTexture = new THREE.CanvasTexture(bgCanvas);
      bgTexture.colorSpace = THREE.SRGBColorSpace;
      // Define a textura diretamente ao background sem mapeamento esférico, 
      // assim o fundo ficará estático como um elemento CSS.
      world.scene.three.background = bgTexture;

      // ── Additional lights (not created by setup) ──
      // Hemisphere: blue sky above, warm ground below → gives surfaces
      // a subtle blue tint on top and warm tone on bottom (like BIM360)
      const hemisphereLight = new THREE.HemisphereLight(0x8aaccc, 0x8a7a66, 0.5);
      world.scene.three.add(hemisphereLight);

      // Enable shadows on the directional light that setup() created
      for (const [, dl] of world.scene.directionalLights) {
        dl.castShadow = true;
        dl.shadow.mapSize.width = 2048;
        dl.shadow.mapSize.height = 2048;
        dl.shadow.camera.near = 0.5;
        dl.shadow.camera.far = 500;
        dl.shadow.camera.left = -150;
        dl.shadow.camera.right = 150;
        dl.shadow.camera.top = 150;
        dl.shadow.camera.bottom = -150;
        dl.shadow.bias = -0.001;
        dl.shadow.normalBias = 0.02;
      }

      // Fill light from opposite side (no shadow) to soften dark areas
      const fillLight = new THREE.DirectionalLight(0xb0c4d8, 0.35);
      fillLight.position.set(-50, 60, -40);
      world.scene.three.add(fillLight);

      world.renderer = new OBC.SimpleRenderer(components, container);
      // Enable shadow maps for depth differentiation
      world.renderer.three.shadowMap.enabled = true;
      world.renderer.three.shadowMap.type = THREE.PCFSoftShadowMap;
      world.renderer.three.toneMapping = THREE.ACESFilmicToneMapping;
      world.renderer.three.toneMappingExposure = 1.0;
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
        logger.info('[ENGINE] onItemSet model constructor:', Object.getPrototypeOf(model)?.constructor?.name);
        logger.info('[ENGINE] onItemSet model methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(model) ?? {}).slice(0, 20).join(', '));
        logger.info('[ENGINE] onItemSet model.getSpatialStructure?:', typeof model.getSpatialStructure);
        logger.info('[ENGINE] onItemSet model.getItemsData?:', typeof model.getItemsData);
        logger.info('[ENGINE] onItemSet model.modelId:', model.modelId);
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
          color: new THREE.Color('#4fc3f7'),
          opacity: 0.85,
          transparent: true,
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
