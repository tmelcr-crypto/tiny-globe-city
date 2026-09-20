import * as THREE from 'three';
import { on, emit } from '../core/events.js';
import { state } from '../core/state.js';
import { startQuest } from './quests.js';

const RANGE = 5; // world units
const _worldPos = new THREE.Vector3();

// Tracks the nearest interactable to the (fixed) player and reacts to 'interact' events.
export function createInteractionSystem(interactables, playerPosition) {
  let nearest = null;

  on('interact', () => {
    if (!nearest) return;
    const { type, def } = nearest.userData;
    if (type === 'car') {
      state.inVehicle = !state.inVehicle;
      emit('vehicle:toggle', { entered: state.inVehicle, multiplier: def.speedMultiplier });
    } else if (type === 'npc' && def?.role === 'quest_giver') {
      startQuest(def.questId);
    } else if (type === 'safehouse') {
      emit('safehouse:interact');
    }
  });

  return {
    update() {
      let best = null;
      let bestDist = RANGE;
      for (const obj of interactables) {
        obj.getWorldPosition(_worldPos);
        const d = _worldPos.distanceTo(playerPosition);
        if (d < bestDist) {
          bestDist = d;
          best = obj;
        }
      }
      if (best !== nearest) {
        nearest = best;
        emit('interact:target', nearest ? nearest.userData : null);
      }
    },
  };
}
