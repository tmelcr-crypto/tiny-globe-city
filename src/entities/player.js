import * as THREE from 'three';
// Fixed at the top of the globe. Never moves.
export function createPlayer(globeRadius) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 0.8, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xff5533 })
  );
  mesh.position.set(0, globeRadius + 0.8, 0);

  // Small nose marker so the player's facing direction (-Z, "forward") is visible.
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: 0x331100 })
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.1, -0.5);
  mesh.add(nose);

  return mesh;
}
