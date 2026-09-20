import * as THREE from 'three';

// One world unit is one metre. The player is 1.5 m tall, which sets the scale
// everything else in the world is built to.
export const PLAYER_HEIGHT = 1.5;
export const PLAYER_RADIUS = 0.3;

// Fixed at the top of the globe. Never moves.
export function createPlayer(globeRadius) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HEIGHT - PLAYER_RADIUS * 2, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xff5533 })
  );
  mesh.position.set(0, globeRadius + PLAYER_HEIGHT / 2, 0);

  // Small nose marker so the player's facing direction (-Z, "forward") is visible.
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x331100 })
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.1, -0.42);
  mesh.add(nose);

  return mesh;
}
