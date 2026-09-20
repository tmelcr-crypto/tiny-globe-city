import * as THREE from 'three';
import { createNpc, updateNpc } from '../entities/npc.js';
import { createWeapon } from '../entities/weapon.js';
import weapons from '../data/weapons.json';
import { GLOBE_RADIUS } from './globe.js';

const NPC_COUNT = 10;
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

// Spawns NPCs, pickups (and later cars) onto the globe (children of
// worldPivot). Returns a handle to keep NPCs moving each frame, independent
// of the player, plus the list of pickup objects for systems/pickups.js.
export function spawnAll(worldPivot) {
  const npcs = [];
  for (let i = 0; i < NPC_COUNT; i++) {
    const npc = createNpc(GLOBE_RADIUS, new THREE.Vector3().randomDirection());
    worldPivot.add(npc.mesh);
    npcs.push(npc);
  }

  const pickups = [];
  // One pistol pickup, lying on the ground a short walk from the player's start.
  const pistol = createWeapon(weapons[0]);
  placeOnSurface(pistol, new THREE.Vector3(0.12, 1, 0.08).normalize(), Math.random() * Math.PI * 2);
  worldPivot.add(pistol);
  pickups.push(pistol);

  return {
    pickups,
    update(dt) {
      npcs.forEach((npc) => updateNpc(npc, dt));
    },
  };
}
