import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';

const IfcViewer = forwardRef(function IfcViewer({ onReady, onError, onSelect }, ref) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);

  // Expose loadFile method to parent
  useImperativeHandle(ref, () => ({
    loadFile: async (buffer, fileName) => {
      const engine = engineRef.current;
      if (!engine) throw new Error('Engine not ready');

      const { components, ifcLoader, fragments, world } = engine;
      const uint8 = new Uint8Array(buffer);

      // console.log('[IFC] Starting load…', fileName, uint8.byteLength, 'bytes');

      const model = await ifcLoader.load(uint8, false, fileName, {
        processData: {
          progressCallback: (progress) => {
            // console.log('[IFC] Progress:', progress);
          },
        },
      });

      // console.log('[IFC] Models loaded:', fragments.list.size);

      // Fit camera to model
      const bbox = components.get(OBC.BoundingBoxer);
      bbox.addFromModels();
      const bounds = bbox.get();
      const size = bounds.getSize(new THREE.Vector3());

      if (size.length() > 0) {
        // Visual Helper for BBox (Yellow Wireframe)
        const helper = new THREE.Box3Helper(bounds, 0xffff00);
        helper.frustumCulled = false;
        world.scene.three.add(helper);

        // Ensure lights are present (but don't duplicate)
        if (!world.scene.three.children.some(c => c.isAmbientLight)) {
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
            world.scene.three.add(ambientLight);
        }
        if (!world.scene.three.children.some(c => c.isDirectionalLight)) {
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(10, 10, 10);
            world.scene.three.add(directionalLight);
        }

        await world.camera.controls.fitToBox(bounds, true);
        // Move grid to the bottom of the model
        const grids = components.get(OBC.Grids);
        const grid = grids.list.values().next().value;
        if (grid) {
            grid.three.position.y = bounds.min.y;
        }

      } else {
        await world.camera.controls.setLookAt(50, 30, 50, 0, 0, 0);
      }
      bbox.dispose();

      // Force fragment tiles to update at the new camera position
      fragments.core.update(true);
      // Second update after a tick to catch async tile loading
      setTimeout(() => {
        fragments.core.update(true);
        console.log('[IFC] Forced fragment update done');
      }, 500);
    },
    reset: () => {
      const engine = engineRef.current;
      if (!engine) return;
      
      // Clear selection
      if (engine.highlighter) {
          engine.highlighter.clear();
      }
      
      if (engine.world && engine.world.meshes) {
          engine.world.meshes.clear();
      }
      
      // Don't dispose the manager, just the models
      if (engine.fragments.list.size > 0) {
        // Create a copy of values to iterate because we might be modifying the map?
        // Actually FragmentsManager.dispose() kills the worker.
        // We should just dispose the models.
        for (const model of engine.fragments.list.values()) {
          model.dispose();
        }
        engine.fragments.list.clear();
      }
      
      // Also clear any BoxHelpers we added to the scene
      const scene = engine.world.scene.three;
      const childrenToRemove = [];
      scene.children.forEach(child => {
        // Remove Box3Helper (yellow box) and AxesHelper if any
        // Keep SphereGeometry (cursor)
        if (child.type === 'Box3Helper' || child.type === 'AxesHelper') {
            childrenToRemove.push(child);
        }
      });
      childrenToRemove.forEach(child => scene.remove(child));
    },
  }));

  const initEngine = useCallback(async (container, signal) => {
    try {
      // Clear any existing canvases (fix for HMR/Strict Mode)
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      
      // ── Core setup ──
      console.log('THREE Version:', THREE.REVISION);
      const components = new OBC.Components();
      
      // Initialize components FIRST
      await components.init();
      if (signal.aborted) { components.dispose(); return; }
      
      const worlds = components.get(OBC.Worlds);
      const world = worlds.create();

      world.scene = new OBC.SimpleScene(components);
      world.scene.setup();
      // Dark background instead of null (transparent)
      world.scene.three.background = new THREE.Color(0x12121a);

      // Add lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      world.scene.three.add(ambientLight);
      
      const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x222222, 0.5);
      world.scene.three.add(hemisphereLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
      directionalLight.position.set(50, 100, 50);
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.bias = -0.0001;
      world.scene.three.add(directionalLight);

      world.renderer = new OBC.SimpleRenderer(components, container);
      if (world.renderer.three) {
          world.renderer.three.shadowMap.enabled = true;
          world.renderer.three.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      world.camera = new OBC.OrthoPerspectiveCamera(components);
      
      world.camera.three.far = 100000;
      world.camera.three.updateProjectionMatrix();

      await world.camera.controls.setLookAt(50, 30, 50, 0, 0, 0);
      if (signal.aborted) { components.dispose(); return; }

      // Grid
      const grids = components.get(OBC.Grids);
      grids.create(world);
      
      // Force resize to ensure canvas fills container
      if (world.renderer) {
          world.renderer.update(container);
      }
      window.dispatchEvent(new Event('resize'));

      // ── IFC Loader ──
      const ifcLoader = components.get(OBC.IfcLoader);
      ifcLoader.settings.autoSetWasm = false;
      ifcLoader.settings.wasm.path = '/wasm/';
      ifcLoader.settings.wasm.absolute = false;
      await ifcLoader.setup();
      if (signal.aborted) { components.dispose(); return; }

      console.log('[IFC] IfcLoader setup done');

      // ── Fragments Manager ──
      const fragments = components.get(OBC.FragmentsManager);
      await fragments.init('/fragments/worker.mjs');
      if (signal.aborted) { components.dispose(); return; }
      
      ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = false;
      ifcLoader.settings.webIfc.OPTIMIZE_PROFILES = true;

      console.log('[IFC] FragmentsManager initialized');

      // ── Mouse Position on Grid (Removed as requested) ──
      // const raycaster = new THREE.Raycaster(); ...

      // On camera update → refresh fragments
      world.camera.controls.addEventListener('update', () => {
        try { fragments.core.update(); } catch (_) { /* ignore pre-init */ }
      });

      // Sync camera with models when camera changes
      world.onCameraChanged.add((camera) => {
        for (const [, model] of fragments.list) {
          model.useCamera(camera.three);
        }
        fragments.core.update(true);
      });

      // When a model finishes loading, add it to the scene (official pattern)
      fragments.list.onItemSet.add(({ value: model }) => {
        model.useCamera(world.camera.three);
        world.scene.three.add(model.object);
        fragments.core.update(true);
      });

      // Remove z-fighting (official pattern)
      fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
        if (!("isLodMaterial" in material && material.isLodMaterial)) {
          material.polygonOffset = true;
          material.polygonOffsetUnits = 1;
          material.polygonOffsetFactor = Math.random();
        }
      });

      // ── Interaction (OBC Raycaster & Highlighter) ──
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

      // Handle selection events (official pattern: modelIdMap = { modelId: Set<localId> })
      highlighter.events.select.onHighlight.add(async (modelIdMap) => {
        console.log('[Highlighter] Selection:', modelIdMap);

        const promises = [];
        for (const [modelId, localIds] of Object.entries(modelIdMap)) {
          const model = fragments.list.get(modelId);
          if (!model) continue;
          promises.push(model.getItemsData([...localIds]));
        }
        const data = (await Promise.all(promises)).flat();
        console.log('[Highlighter] Item data:', data);

        if (onSelect && data.length > 0) {
          onSelect({ data, modelIdMap });
        }
      });

      highlighter.events.select.onClear.add(() => {
        console.log('[Highlighter] Cleared');
        if (onSelect) onSelect(null);
      });

      const engineData = { components, world, ifcLoader, fragments, highlighter };
      engineRef.current = engineData;
      
      if (onReady) onReady();
    } catch (err) {
      console.error('Engine init error:', err);
      if (onError) onError(err);
    }
  }, [onReady, onError]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const abortController = new AbortController();
    initEngine(container, abortController.signal);

    return () => {
      abortController.abort();
      if (engineRef.current) {
        engineRef.current.components.dispose();
        engineRef.current = null;
      }
      // Remove leftover canvases
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
