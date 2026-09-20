import * as THREE from 'three';
export const GLOBE_RADIUS = 50;

// Returns worldPivot: a Group that holds the globe and all world objects.
// Houses, cars and NPCs are added separately by world/spawner.js.
export function createGlobe() {
  const pivot = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0x4a8f4a, flatShading: true })
  );
  pivot.add(sphere);
  return pivot;
}
