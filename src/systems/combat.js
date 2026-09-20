import * as THREE from 'three';
import { on, emit } from '../core/events.js';
import weapons from '../data/weapons.json';

const WEAPON_RANGE = 8; // world units
const _worldPos = new THREE.Vector3();

// Hitscan combat: firing damages the nearest living NPC within weapon range.
export function createCombatSystem(npcs, playerPosition) {
  const def = weapons[0];
  let cooldown = 0;
  let requested = false;

  on('shoot', () => { requested = true; });

  function fire() {
    let best = null;
    let bestDist = WEAPON_RANGE;
    for (const npc of npcs) {
      if (npc.userData.health <= 0) continue;
      npc.getWorldPosition(_worldPos);
      const d = _worldPos.distanceTo(playerPosition);
      if (d < bestDist) {
        bestDist = d;
        best = npc;
      }
    }
    if (!best) return;
    best.userData.health -= def.damage;
    emit('npc:hit', { npc: best, health: best.userData.health });
    if (best.userData.health <= 0) {
      best.visible = false;
      emit('npc:down', best);
    }
  }

  return {
    update(dt) {
      cooldown = Math.max(0, cooldown - dt);
      if (requested && cooldown <= 0) {
        fire();
        cooldown = def.cooldown;
      }
      requested = false;
    },
  };
}
