import * as THREE from 'three';

// Shared across instances: no per-pickup allocations, no per-frame allocations.
const BODY_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, flatShading: true });
const BARREL_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, flatShading: true });
const BODY_GEOMETRY = new THREE.BoxGeometry(0.16, 0.26, 0.55);
const GRIP_GEOMETRY = new THREE.BoxGeometry(0.14, 0.3, 0.16);
const BARREL_GEOMETRY = new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6);

// Low-poly pistol pickup, built from `def` (see data/weapons.json).
// Ground placement/orientation on the globe is the caller's job (see world/spawner.js).
export function createWeapon(def) {
  const group = new THREE.Group();
  group.name = `weapon:${def.id}`;

  const body = new THREE.Mesh(BODY_GEOMETRY, BODY_MATERIAL);
  body.position.set(0, 0.26, 0);
  group.add(body);

  const grip = new THREE.Mesh(GRIP_GEOMETRY, BODY_MATERIAL);
  grip.position.set(0, 0.1, 0.2);
  grip.rotation.x = -0.3;
  group.add(grip);

  const barrel = new THREE.Mesh(BARREL_GEOMETRY, BARREL_MATERIAL);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0, 0.28, -0.28);
  group.add(barrel);

  // Consumed by systems/pickups.js.
  group.userData.pickup = {
    type: 'weapon',
    weaponId: def.id,
    ammo: def.pickupAmount ?? 0,
    radius: 1,
  };

  return group;
}
