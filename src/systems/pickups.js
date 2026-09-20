import * as THREE from 'three';
import { emit } from '../core/events.js';
import { state } from '../core/state.js';

const PLAYER_RADIUS = 0.6;
const _pickupWorldPos = new THREE.Vector3(); // reused every check, no per-frame allocation

// The player never moves; pickups do, since they're children of worldPivot which
// rotates under the player. So "crossing" a pickup means its world position (after
// worldPivot's current rotation) has drifted within reach of the player's fixed spot.
export function createPickupSystem(playerPosition, pickups) {
  return {
    update() {
      for (let i = pickups.length - 1; i >= 0; i--) {
        const pickup = pickups[i];
        const info = pickup.userData.pickup;
        pickup.getWorldPosition(_pickupWorldPos);
        const hitRadius = info.radius + PLAYER_RADIUS;
        if (_pickupWorldPos.distanceToSquared(playerPosition) > hitRadius * hitRadius) continue;

        pickup.parent?.remove(pickup);
        pickups.splice(i, 1);

        if (info.type === 'weapon') {
          state.ammo = (state.ammo ?? 0) + info.ammo;
        }
        emit('pickup', info);
      }
    },
  };
}
