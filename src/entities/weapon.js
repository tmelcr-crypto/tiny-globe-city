import * as THREE from 'three';

// Simple equipped-weapon mesh, held out in front of the player. def: { id, name, damage, cooldown } (data/weapons.json).
export function createWeapon(def) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  mesh.name = def.id;
  mesh.userData = { def };
  return mesh;
}
