import * as THREE from 'three';
// Fixed at the top of the globe. Never moves.
export function createPlayer(globeRadius) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 0.8, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xff5533 })
  );
  mesh.position.set(0, globeRadius + 0.8, 0);
  mesh.userData.collider = { radius: 0.5 };
  return mesh;
}
