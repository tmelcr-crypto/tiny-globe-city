import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';
import { createWeapon } from '../entities/weapon.js';
import weapons from '../data/weapons.json';

const UP = new THREE.Vector3(0, 1, 0);

// Places `obj` on the globe surface in direction `dir` (unit vector), oriented so it stands upright.
function placeOnSurface(obj, dir) {
  obj.position.copy(dir).multiplyScalar(GLOBE_RADIUS);
  obj.quaternion.setFromUnitVectors(UP, dir);
}

// Spawns pickups (and later NPCs, cars) as children of worldPivot.
// Returns the list of pickup objects so systems/pickups.js can track them.
export function spawnAll(worldPivot) {
  const pickups = [];

  // One pistol pickup, a short walk from the player's starting position.
  const pistol = createWeapon(weapons[0]);
  placeOnSurface(pistol, new THREE.Vector3(0.12, 1, 0.08).normalize());
  worldPivot.add(pistol);
  pickups.push(pistol);

  return pickups;
}
