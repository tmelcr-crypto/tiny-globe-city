import * as THREE from 'three';

// Shared across instances: no per-pickup allocations, no per-frame allocations.
const BODY_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, flatShading: true });
const BARREL_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, flatShading: true });

// Built lying flat on its local XZ plane (thin along Y, long along Z) so that
// aligning local +Y with the ground's surface normal (see world/spawner.js)
// drops it flat on the ground, not standing upright.
const SLIDE_GEOMETRY = new THREE.BoxGeometry(0.16, 0.1, 0.5);
const GRIP_GEOMETRY = new THREE.BoxGeometry(0.14, 0.08, 0.22);
const BARREL_GEOMETRY = new THREE.CylinderGeometry(0.045, 0.045, 0.4, 6);

// Low-poly pistol pickup, built from `def` (see data/weapons.json).
// Ground placement/orientation on the globe is the caller's job (see world/spawner.js).
export function createWeapon(def) {
  const group = new THREE.Group();
  group.name = `weapon:${def.id}`;

  const slide = new THREE.Mesh(SLIDE_GEOMETRY, BODY_MATERIAL);
  slide.position.set(0, 0.05, 0.05);
  group.add(slide);

  const grip = new THREE.Mesh(GRIP_GEOMETRY, BODY_MATERIAL);
  grip.position.set(0, 0.04, -0.28);
  grip.rotation.y = 0.5; // angled off the slide, like a dropped pistol's grip
  group.add(grip);

  const barrel = new THREE.Mesh(BARREL_GEOMETRY, BARREL_MATERIAL);
  barrel.rotation.x = Math.PI / 2; // cylinder's own axis (Y) -> local Z, pointing forward
  barrel.position.set(0, 0.05, 0.35);
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
