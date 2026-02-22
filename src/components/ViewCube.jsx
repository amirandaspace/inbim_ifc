import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

/**
 * ViewCube — a small orientation cube in the bottom-right corner.
 * Syncs rotation with the main camera and allows clicking faces
 * to snap the camera to predefined orientations.
 */

const FACE_LABELS = [
  { text: 'FRENTE',   color: '#e2e8f0', normal: new THREE.Vector3(0, 0,  1) },
  { text: 'TRÁS',     color: '#e2e8f0', normal: new THREE.Vector3(0, 0, -1) },
  { text: 'TOPO',     color: '#f8fafc', normal: new THREE.Vector3(0,  1, 0) },
  { text: 'BASE',     color: '#f8fafc', normal: new THREE.Vector3(0, -1, 0) },
  { text: 'DIREITA',  color: '#cbd5e1', normal: new THREE.Vector3( 1, 0, 0) },
  { text: 'ESQUERDA', color: '#cbd5e1', normal: new THREE.Vector3(-1, 0, 0) },
];

function createLabelTexture(text, faceColor) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = faceColor;
  ctx.fillRect(0, 0, size, size);

  // Border
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);

  // Text
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 36px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createCube() {
  const materials = FACE_LABELS.map(face =>
    new THREE.MeshBasicMaterial({
      map: createLabelTexture(face.text, face.color),
      transparent: false,
    })
  );

  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  // Map to: RIGHT, LEFT, TOP, BOTTOM, FRONT, BACK
  const orderedMats = [
    materials[4], // +X = RIGHT
    materials[5], // -X = LEFT
    materials[2], // +Y = TOP
    materials[3], // -Y = BOTTOM
    materials[0], // +Z = FRONT
    materials[1], // -Z = BACK
  ];

  const geo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  const mesh = new THREE.Mesh(geo, orderedMats);
  return mesh;
}

export default function ViewCube({ world }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);

  // Init the mini scene
  useEffect(() => {
    if (!canvasRef.current || !world) return;

    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 4);

    const cube = createCube();
    scene.add(cube);

    // Hover highlight mesh (slightly larger, transparent blue)
    const hoverGeo = new THREE.BoxGeometry(1.61, 1.61, 1.61);
    const hoverMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6, // soft blue highlight
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const hoverMesh = new THREE.Mesh(hoverGeo, hoverMat);
    hoverMesh.visible = false;
    scene.add(hoverMesh);

    // Soft light
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    stateRef.current = { renderer, scene, camera, cube, hoverMesh };

    // Mouse tracking for hover
    const mouse = new THREE.Vector2(-100, -100);
    const raycaster = new THREE.Raycaster();
    
    const onMouseMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    
    const onMouseLeave = () => {
      mouse.set(-100, -100); // Move mouse off-screen
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    // Animation loop — sync cube rotation and update hover
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Copy main camera orientation
      const mainCam = world.camera.three;
      cube.quaternion.copy(mainCam.quaternion).invert();
      hoverMesh.quaternion.copy(cube.quaternion);

      // Raycast for hover
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(cube);

      if (hits.length > 0) {
        hoverMesh.visible = true;
        const localPoint = hits[0].point.clone();
        cube.worldToLocal(localPoint);
        
        const dir = new THREE.Vector3();
        const threshold = 0.4;
        
        if (localPoint.x > threshold) dir.x = 1;
        else if (localPoint.x < -threshold) dir.x = -1;
        
        if (localPoint.y > threshold) dir.y = 1;
        else if (localPoint.y < -threshold) dir.y = -1;
        
        if (localPoint.z > threshold) dir.z = 1;
        else if (localPoint.z < -threshold) dir.z = -1;

        if (dir.lengthSq() === 0) dir.copy(hits[0].face.normal);

        // Adjust hover mesh size to highlight face, edge, or corner
        // Scale down the axes that ARE part of the click direction
        const s = 1.61;
        const edgeW = 0.4; // thickness of the highlight
        hoverMesh.scale.set(
          dir.x !== 0 ? edgeW / s : 1,
          dir.y !== 0 ? edgeW / s : 1,
          dir.z !== 0 ? edgeW / s : 1
        );
        hoverMesh.position.set(
          dir.x * (s - edgeW) / 2,
          dir.y * (s - edgeW) / 2,
          dir.z * (s - edgeW) / 2
        ).applyQuaternion(cube.quaternion);
        
      } else {
        hoverMesh.visible = false;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      renderer.dispose();
      hoverGeo.dispose();
      hoverMat.dispose();
    };
  }, [world]);

  // Handle click on cube face to snap camera
  const handleClick = useCallback((event) => {
    if (!stateRef.current || !world) return;

    const { camera, cube, renderer } = stateRef.current;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(cube);

    if (hits.length > 0) {
      // Get the hit point in the cube's local space
      const localPoint = hits[0].point.clone();
      cube.worldToLocal(localPoint);

      // Quantize the local point to determine face, edge, or corner
      // The cube is size 1.6, so local coordinates range from -0.8 to 0.8.
      // Use a threshold of 0.4 to detect clicks on the outer edges of a face.
      const dir = new THREE.Vector3();
      const threshold = 0.4;
      
      if (localPoint.x > threshold) dir.x = 1;
      else if (localPoint.x < -threshold) dir.x = -1;
      
      if (localPoint.y > threshold) dir.y = 1;
      else if (localPoint.y < -threshold) dir.y = -1;
      
      if (localPoint.z > threshold) dir.z = 1;
      else if (localPoint.z < -threshold) dir.z = -1;

      // Fallback to exact face normal if no threshold exceeded (shouldn't happen on surface)
      if (dir.lengthSq() === 0) {
        dir.copy(hits[0].face.normal);
      }
      dir.normalize();

      const distance = 50;
      const target = new THREE.Vector3(0, 0, 0);

      // Get current camera target from controls
      const controls = world.camera.controls;
      const currentTarget = controls.getTarget(new THREE.Vector3());

      const eye = currentTarget.clone().add(dir.clone().multiplyScalar(distance));

      // Determine up vector
      let up = new THREE.Vector3(0, 1, 0);
      if (Math.abs(dir.y) > 0.9) {
        up = new THREE.Vector3(0, 0, dir.y > 0 ? -1 : 1);
      }

      controls.setLookAt(
        eye.x, eye.y, eye.z,
        currentTarget.x, currentTarget.y, currentTarget.z,
        true
      );
    }
  }, [world]);

  return (
    <canvas
      ref={canvasRef}
      className="viewcube-canvas"
      onClick={handleClick}
      width={120}
      height={120}
    />
  );
}
