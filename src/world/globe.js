import * as THREE from 'three';

// Metres. Sized so a city built to human scale (1 unit = 1 m, player 1.5 m)
// actually fits with enough density to look like a city from the camera —
// on a 50 m globe, realistically sized buildings cover the whole planet.
export const GLOBE_RADIUS = 160;

// Segment counts keep roughly the same facet size on screen as the smaller globe had.
const SEGMENTS = 96;
const RINGS = 48;

// Returns worldPivot: a Group that holds the globe and all world objects.
// Buildings, cars, trees and NPCs are added separately by world/spawner.js.
export function createGlobe() {
  const pivot = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, SEGMENTS, RINGS),
    new THREE.MeshStandardMaterial({ color: 0x4a8f4a, flatShading: true })
  );
  pivot.add(sphere);
  return pivot;
}
