import * as THREE from 'three';
// Camera is fixed above/behind the player, who sits on top of the globe.
export function createCamera(globeRadius) {
  const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
  cam.position.set(0, globeRadius + 6, 8);
  cam.lookAt(0, globeRadius, 0);
  return cam;
}
