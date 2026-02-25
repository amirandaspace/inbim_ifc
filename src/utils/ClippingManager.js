import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { logger } from './logger';

/**
 * ClippingManager — creates interactive section planes with a full
 * TransformControls gizmo (translate + rotate), inspired by xeokit.
 *
 * Usage:
 *   const mgr = new ClippingManager(world, components);
 *   mgr.createPlaneAtCenter();   // places a plane at the model centre
 *   mgr.setMode('rotate');       // switch gizmo mode
 *   mgr.removeAll();             // clean up
 */
export class ClippingManager {
  /** @type {THREE.Plane[]} */
  _clippingPlanes = [];

  /** @type {{ helper: THREE.Mesh, plane: THREE.Plane, controls: TransformControls }[]} */
  _entries = [];

  /** @type {boolean} */
  _enabled = false;

  /** @type {boolean} */
  _visible = true;

  /** @type {string} */
  _mode = 'translate';

  constructor(world, components) {
    this.world = world;
    this.components = components;
    this.scene = world.scene.three;
    this.renderer = world.renderer.three;
    this.orbitControls = world.camera.controls;

    // The OBC camera wrapper — we need the actual THREE camera
    this._threeCamera = world.camera.three;

    // Enable local clipping on the renderer
    this.renderer.localClippingEnabled = true;

    // Start a render-loop observer that continuously ensures all
    // materials (including dynamically-added highlight overlays)
    // have the current clipping planes applied.
    this._startClippingObserver();

    logger.info('[CLIP] ClippingManager initialized');
  }

  /* ────── public API ────── */

  get enabled() { return this._enabled; }
  set enabled(val) { this._enabled = val; }

  get visible() { return this._visible; }

  toggleVisibility(visible) {
    this._visible = visible;
    for (const entry of this._entries) {
      entry.helper.visible = visible;

      const tHelper = entry.translateCtrl.getHelper();
      const rHelper = entry.rotateCtrl.getHelper();

      tHelper.visible = visible;
      rHelper.visible = visible;

      // If hidden, disable controls so they don't catch raycasts/clicks
      entry.translateCtrl.enabled = visible;
      entry.rotateCtrl.enabled = visible;
    }
  }

  get mode() { return this._mode; }
  setMode(mode) {
    this._mode = mode;
    for (const entry of this._entries) {
      entry.translateCtrl.setMode(mode);
      entry.rotateCtrl.setMode(mode);
    }
    logger.info('[CLIP] Mode changed to', mode);
  }

  /**
   * Compute a bounding box center from the scene's children. 
   */
  _getSceneCenter() {
    const box = new THREE.Box3();
    let found = false;
    this.scene.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        try {
          // Some fragment geometries don't support computeBoundingBox
          // Use the object's world bounding box if geometry BB fails
          if (obj.geometry.boundingBox) {
            const bb = obj.geometry.boundingBox.clone();
            bb.applyMatrix4(obj.matrixWorld);
            box.union(bb);
            found = true;
          } else {
            obj.geometry.computeBoundingBox();
            if (obj.geometry.boundingBox) {
              const bb = obj.geometry.boundingBox.clone();
              bb.applyMatrix4(obj.matrixWorld);
              box.union(bb);
              found = true;
            }
          }
        } catch (e) {
          // Skip meshes whose geometry can't compute a bounding box
        }
      }
    });

    // If traversal failed, try using the whole scene bounding box
    if (!found) {
      try {
        box.setFromObject(this.scene);
        if (!box.isEmpty()) found = true;
      } catch (e) {
        // ignore
      }
    }

    if (!found) {
      logger.warn('[CLIP] No geometry bounds found, using origin');
      return { center: new THREE.Vector3(0, 0, 0), size: 30 };
    }
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    logger.info('[CLIP] Scene center:', center, 'size:', size);
    return { center, size: Math.max(size.x, size.y, size.z) };
  }

  /**
   * Create a new clipping plane at the given position.
   */
  createPlane(position, normal, planeSize) {
    const pos = position || new THREE.Vector3(0, 0, 0);
    const norm = normal || new THREE.Vector3(0, -1, 0);

    // If no size provided, calculate based on controls visual size (120%)
    const sz = planeSize || this._getPlaneSizeAt(pos);

    logger.info('[CLIP] Creating plane at', pos.toArray(), 'normal:', norm.toArray(), 'size:', sz);

    // ── 1. THREE.Plane (used for actual clipping) ──
    const plane = new THREE.Plane();
    plane.setFromNormalAndCoplanarPoint(norm.clone().normalize(), pos);
    this._clippingPlanes.push(plane);

    // ── 2. Visual helper mesh ──
    const helperGeo = new THREE.PlaneGeometry(sz, sz);
    const helperMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
      depthTest: false,
      clippingPlanes: [],       // don't clip the helper itself
    });
    const helper = new THREE.Mesh(helperGeo, helperMat);
    helper.position.copy(pos);
    helper.userData.__clippingHelper = true;

    // Align mesh to the normal
    const up = new THREE.Vector3(0, 0, 1);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, norm.clone().normalize());
    helper.quaternion.copy(quat);

    helper.renderOrder = 999;
    helper.frustumCulled = false;
    this.scene.add(helper);
    logger.info('[CLIP] Helper mesh added to scene');

    // ── 3. TransformControls gizmos — translate + rotate together ──
    const domElement = this.renderer.domElement;

    const translateCtrl = new TransformControls(this._threeCamera, domElement);
    translateCtrl.setMode('translate');
    translateCtrl.setSize(0.75);
    translateCtrl.setSpace('local');
    translateCtrl.attach(helper);
    const translateHelper = translateCtrl.getHelper();
    translateHelper.frustumCulled = false;
    this.scene.add(translateHelper);

    // Hide plane handles (XY, XZ, YZ) and centre sphere (XYZ) — only keep 3 arrows
    this._hideGizmoParts(translateHelper, ['XY', 'YZ', 'XZ', 'XYZ']);

    const rotateCtrl = new TransformControls(this._threeCamera, domElement);
    rotateCtrl.setMode('rotate');
    rotateCtrl.setSize(0.9);
    rotateCtrl.setSpace('local');
    rotateCtrl.attach(helper);
    const rotateHelper = rotateCtrl.getHelper();
    rotateHelper.frustumCulled = false;
    this.scene.add(rotateHelper);

    // Hide screen-space ring (E) and trackball sphere (XYZE) — only keep 3 arcs
    this._hideGizmoParts(rotateHelper, ['E', 'XYZE']);

    // Mark gizmos so _applyClippingToScene always skips them
    this._markAsClippingHelper(translateHelper);
    this._markAsClippingHelper(rotateHelper);

    logger.info('[CLIP] Translate + Rotate gizmos added (xeokit style)');

    // While one gizmo is being dragged, disable the other to prevent interference
    translateCtrl.addEventListener('dragging-changed', (event) => {
      if (this.orbitControls) this.orbitControls.enabled = !event.value;
      rotateCtrl.enabled = !event.value;
    });
    rotateCtrl.addEventListener('dragging-changed', (event) => {
      if (this.orbitControls) this.orbitControls.enabled = !event.value;
      translateCtrl.enabled = !event.value;
    });

    // Sync the THREE.Plane every time either gizmo moves / rotates
    const onTransform = () => {
      this._syncPlane(helper, plane);
      this._applyClippingToScene();
    };
    translateCtrl.addEventListener('change', onTransform);
    rotateCtrl.addEventListener('change', onTransform);

    // ── 4. Apply clipping planes to all scene materials ──
    this._applyClippingToScene();

    const entry = { helper, plane, translateCtrl, rotateCtrl };
    this._entries.push(entry);
    logger.info('[CLIP] Clipping plane created, total:', this._entries.length);
    return entry;
  }

  /**
   * Create a plane at the centre of all loaded geometry.
   */
  createPlaneAtCenter() {
    const { center } = this._getSceneCenter();
    return this.createPlane(center, new THREE.Vector3(0, -1, 0));
  }

  removeLastPlane() {
    if (this._entries.length === 0) return;
    const entry = this._entries.pop();

    entry.translateCtrl.detach();
    entry.translateCtrl.dispose();
    this.scene.remove(entry.translateCtrl.getHelper());

    entry.rotateCtrl.detach();
    entry.rotateCtrl.dispose();
    this.scene.remove(entry.rotateCtrl.getHelper());

    this.scene.remove(entry.helper);
    entry.helper.geometry.dispose();
    entry.helper.material.dispose();

    const idx = this._clippingPlanes.indexOf(entry.plane);
    if (idx !== -1) this._clippingPlanes.splice(idx, 1);

    this._applyClippingToScene();
    logger.info('[CLIP] Last plane removed, remaining:', this._entries.length);
  }

  removeAll() {
    while (this._entries.length > 0) {
      this.removeLastPlane();
    }
  }

  /**
   * Calculates a world-space size for the plane helper mesh
   * that is roughly 120% of the visual size of the transform controls.
   */
  _getPlaneSizeAt(position) {
    if (!this._threeCamera || !this.renderer) return 30;

    const distance = position.distanceTo(this._threeCamera.position);

    let worldScreenHeight = 1;
    if (this._threeCamera.isPerspectiveCamera) {
      worldScreenHeight = (distance * Math.tan(THREE.MathUtils.DEG2RAD * this._threeCamera.fov / 2) * 2);
    } else if (this._threeCamera.isOrthographicCamera) {
      worldScreenHeight = (this._threeCamera.top - this._threeCamera.bottom) / this._threeCamera.zoom;
    }

    // Heuristic: TransformControls with size 0.9 occupy a small portion of the screen height
    // We want the plane to be 120% of that visual footprint
    const gizmoScreenRatio = 0.15; // 15% of screen height
    const gizmoWorldSize = worldScreenHeight * gizmoScreenRatio;

    return gizmoWorldSize * 1.2;
  }

  /* ────── internal ────── */

  /** Hide specific named parts of a TransformControls gizmo helper */
  _hideGizmoParts(gizmoHelper, namesToHide) {
    gizmoHelper.traverse((child) => {
      if (child.name && namesToHide.includes(child.name)) {
        child.visible = false;
        // Also prevent raycasting on hidden parts
        child.layers.set(31);
      }
    });
  }

  /** Mark an object and all its children as clipping helpers so they are skipped */
  _markAsClippingHelper(obj) {
    obj.traverse((child) => {
      child.userData.__clippingHelper = true;
    });
  }

  /** Keep the THREE.Plane in sync with the mesh helper's transform */
  _syncPlane(helper, plane) {
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(helper.quaternion).normalize();
    plane.setFromNormalAndCoplanarPoint(normal, helper.position);
  }

  /**
   * Public method: force-refresh clipping on all scene materials.
   * Call after events that create new meshes (e.g. highlight selection).
   */
  refreshClipping() {
    if (this._clippingPlanes.length > 0) {
      this._applyClippingToScene();
    }
  }

  /**
   * Start an animation-frame loop that re-applies clipping planes
   * whenever there are active planes. This catches any mesh added
   * by third-party code (Highlighter, etc.) that bypasses scene.add hooks.
   */
  _startClippingObserver() {
    this._observerRunning = true;
    const tick = () => {
      if (!this._observerRunning) return;
      if (this._clippingPlanes.length > 0) {
        this._applyClippingToScene();
      }
      this._observerRAF = requestAnimationFrame(tick);
    };
    this._observerRAF = requestAnimationFrame(tick);
  }

  /**
   * Stop the clipping observer (call on dispose).
   */
  _stopClippingObserver() {
    this._observerRunning = false;
    if (this._observerRAF) {
      cancelAnimationFrame(this._observerRAF);
      this._observerRAF = null;
    }
  }

  /** Walk the scene and set clippingPlanes on every material */
  _applyClippingToScene() {
    const planes = this._clippingPlanes;
    this.scene.traverse((obj) => {
      if (obj.isMesh && obj.material && !obj.userData.__clippingHelper) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          // Only update if planes reference changed to minimise overhead
          if (planes.length > 0) {
            if (!mat.clippingPlanes || mat.clippingPlanes.length !== planes.length ||
              !planes.every((p, i) => mat.clippingPlanes[i] === p)) {
              mat.clippingPlanes = [...planes];
              mat.clipShadows = true;
              mat.needsUpdate = true;
            }
          } else if (mat.clippingPlanes && mat.clippingPlanes.length > 0) {
            mat.clippingPlanes = null;
            mat.needsUpdate = true;
          }
        }
      }
    });
  }
}
