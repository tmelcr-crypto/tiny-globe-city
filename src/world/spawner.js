import * as THREE from 'three';
import { createNpc, updateNpc } from '../entities/npc.js';
import { GLOBE_RADIUS } from './globe.js';

const NPC_COUNT = 10;

// Spawns NPCs (and later cars, pickups) onto the globe (children of
// worldPivot) and returns a handle to keep them moving each frame,
// independent of the player.
export function spawnAll(worldPivot) {
  const npcs = [];
  for (let i = 0; i < NPC_COUNT; i++) {
    const npc = createNpc(GLOBE_RADIUS, new THREE.Vector3().randomDirection());
    worldPivot.add(npc.mesh);
    npcs.push(npc);
  }

  return {
    update(dt) {
      npcs.forEach((npc) => updateNpc(npc, dt));
    },
  };
}
