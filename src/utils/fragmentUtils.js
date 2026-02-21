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
  // Add ambient light if not present
  if (!scene.children.some(c => c.isAmbientLight)) {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
  }
  
  // Add directional light if not present
  if (!scene.children.some(c => c.isDirectionalLight)) {
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);
  }
};