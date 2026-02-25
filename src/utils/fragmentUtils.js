import * as THREE from 'three';

/**
 * Disposes all models in the fragments manager
 * @param {import('@thatopen/fragments').FragmentsManager} fragmentsManager 
 */
export const disposeAllFragments = (fragmentsManager) => {
  if (fragmentsManager.list.size > 0) {
    for (const model of fragmentsManager.list.values()) {
      model.dispose();
    }
    fragmentsManager.list.clear();
  }
};

/**
 * Clears the scene of helper objects (Box3Helper, AxesHelper)
 * @param {THREE.Scene} scene 
 */
export const clearHelperObjects = (scene) => {
  const childrenToRemove = [];
  scene.children.forEach(child => {
    if (child.type === 'Box3Helper' || child.type === 'AxesHelper') {
      childrenToRemove.push(child);
    }
  });
  childrenToRemove.forEach(child => scene.remove(child));
};

/**
 * Adds lighting to the scene if not already present
 * @param {THREE.Scene} scene 
 */
export const ensureSceneLighting = (scene) => {
  // Check what's already in the scene to avoid duplicates
  const hasAmbient = scene.children.some(c => c.isAmbientLight);
  const hasDirLight = scene.children.some(c => c.isDirectionalLight);
  const hasHemi = scene.children.some(c => c.isHemisphereLight);
  
  if (!hasAmbient) {
    const ambientLight = new THREE.AmbientLight(0xc8d8e8, 0.45);
    scene.add(ambientLight);
  }
  
  if (!hasHemi) {
    const hemisphereLight = new THREE.HemisphereLight(0x9bbbd4, 0x7a6e5a, 0.6);
    scene.add(hemisphereLight);
  }
  
  if (!hasDirLight) {
    const directionalLight = new THREE.DirectionalLight(0xfff5e6, 1.6);
    directionalLight.position.set(80, 120, 60);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.bias = -0.001;
    scene.add(directionalLight);
  }
};