import * as THREE from 'three';
export const GLOBE_RADIUS = 50;

// Returns worldPivot: a Group that holds the globe and all world objects.
export function createGlobe() {
  const pivot = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0x4a8f4a, flatShading: true })
  );
  pivot.add(sphere);

  // Placeholder "buildings" so movement is visible.
  for (let i = 0; i < 40; i++) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 2 + Math.random() * 3, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xcccccc })
    );
    const dir = new THREE.Vector3().randomDirection();
    b.position.copy(dir).multiplyScalar(GLOBE_RADIUS);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    pivot.add(b);
  }
  return pivot;
}
