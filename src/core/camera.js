import * as THREE from 'three';

// Metres. Framed for a 1.5 m player standing among buildings several storeys
// tall — close enough to read the player, far enough that a house fits on screen.
const HEIGHT = 11;   // above the surface
const BEHIND = 15;   // back from the player
const AIM_HEIGHT = 4; // looks slightly above head height, not down at the player's feet

// Camera is fixed above/behind the player, who sits on top of the globe.
export function createCamera(globeRadius) {
  const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
  cam.position.set(0, globeRadius + HEIGHT, BEHIND);
  cam.lookAt(0, globeRadius + AIM_HEIGHT, 0);
  return cam;
}
