import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';
import { createWeapon } from '../entities/weapon.js';
import weapons from '../data/weapons.json';

const UP = new THREE.Vector3(0, 1, 0);

// Places `obj` on the globe surface in direction `dir` (unit vector), aligning the
// object's local +Y with the outward surface normal. For meshes built tall along Y
// (buildings) this stands them up; for meshes built thin along Y (ground pickups,
// see entities/weapon.js) this lays them flat. `spin` yaws it around that normal.
function placeOnSurface(obj, dir, spin = 0) {
  obj.position.copy(dir).multiplyScalar(GLOBE_RADIUS);
  obj.quaternion.setFromUnitVectors(UP, dir);
  obj.rotateY(spin);
}

// Spawns pickups (and later NPCs, cars) as children of worldPivot.
// Returns the list of pickup objects so systems/pickups.js can track them.
export function spawnAll(worldPivot) {
  const pickups = [];

  // One pistol pickup, lying on the ground a short walk from the player's start.
  const pistol = createWeapon(weapons[0]);
  placeOnSurface(pistol, new THREE.Vector3(0.12, 1, 0.08).normalize(), Math.random() * Math.PI * 2);
  worldPivot.add(pistol);
  pickups.push(pistol);

  return pickups;
}
