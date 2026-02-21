import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as THREE from 'three';

export const createEngine = async (container) => {
  // ── Core setup ──
  console.log('THREE Version:', THREE.REVISION);
  const components = new OBC.Components();
  console.log('[ENGINE] Starting engine initialization');
  
  // Initialize components FIRST
  await components.init();
  console.log('[ENGINE] Components initialized');
  
  const worlds = components.get(OBC.Worlds);
  const world = worlds.create();
  console.log('[ENGINE] World created');

  world.scene = new OBC.SimpleScene(components);
  world.scene.setup();
  console.log('[ENGINE] Scene setup completed');

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
  console.log('[ENGINE] Renderer created');
  
  if (world.renderer.three) {
      world.renderer.three.shadowMap.enabled = true;
      world.renderer.three.shadowMap.type = THREE.PCFSoftShadowMap;
      console.log('[ENGINE] Shadow map configured');
  }
  world.camera = new OBC.OrthoPerspectiveCamera(components);
  
  world.camera.three.far = 100000;
  world.camera.three.updateProjectionMatrix();

  await world.camera.controls.setLookAt(50, 30, 50, 0, 0, 0);

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
  console.log('[ENGINE] IFC Loader setup completed');

  // ── Fragments Manager ──
  const fragments = components.get(OBC.FragmentsManager);
  await fragments.init('/fragments/worker.mjs');
  console.log('[ENGINE] Fragments Manager initialized');

  ifcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = false;
  ifcLoader.settings.webIfc.OPTIMIZE_PROFILES = true;

  console.log('[IFC] FragmentsManager initialized');

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
  console.log('[ENGINE] Highlighter setup completed');

  return { components, world, ifcLoader, fragments, highlighter };
};