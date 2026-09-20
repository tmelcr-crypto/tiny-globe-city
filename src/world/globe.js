import * as THREE from 'three';
import { buildCity } from './city.js';
export const GLOBE_RADIUS = 50;

// Returns worldPivot: a Group that holds the globe and all world objects.
export function createGlobe() {
  const pivot = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0x4a8f4a, flatShading: true })
  );
  pivot.add(sphere);

  buildCity(pivot, GLOBE_RADIUS);

  return pivot;
}
