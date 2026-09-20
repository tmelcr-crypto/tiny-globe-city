import * as THREE from 'three';
import { emit } from '../core/events.js';

const NEAR_ANGLE = 0.12; // radians (~7deg) the player must be within to use a savepoint

// Tracks which savepoint (if any) the fixed player is currently standing on,
// since worldPivot rotates the globe under them rather than the player moving.
export function createSavepointSystem(savepoints) {
  const top = new THREE.Vector3(0, 1, 0);
  const worldPos = new THREE.Vector3();
  let current = null;

  return {
    update() {
      let nearest = null;
      for (const sp of savepoints) {
        sp.getWorldPosition(worldPos).normalize();
        if (worldPos.angleTo(top) < NEAR_ANGLE) nearest = sp;
      }
      if (nearest !== current) {
        current = nearest;
        emit('savepoint:change', current
          ? { id: current.userData.savepointId, name: current.userData.savepointName }
          : null);
      }
    },
    interact() {
      if (current) emit('save:requested', { id: current.userData.savepointId });
    },
  };
}
