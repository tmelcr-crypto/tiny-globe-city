import * as THREE from 'three';
import { emit } from '../core/events.js';

export const ENTER_DISTANCE = 0.1; // meters, per design spec

const _doorGroundPos = new THREE.Vector3();

// The player never moves; it always stands on the world-space point
// directly above the globe's origin. A house's door counts as "in front
// of the player" once its ground point (dir * GLOBE_RADIUS, rotated by
// worldPivot) comes within ENTER_DISTANCE of that fixed anchor. We use the
// house's ground point rather than the door mesh's own world position
// because the door is inset into the wall (embedded partway into the
// sphere) and would never read as being at surface level otherwise.
export function createHouseEntrySystem(houses, globeRadius) {
  const playerAnchor = new THREE.Vector3(0, globeRadius, 0);
  let nearHouse = null;

  function update() {
    let closest = null;
    let closestDist = Infinity;
    for (const house of houses) {
      _doorGroundPos.copy(house.dir).multiplyScalar(globeRadius);
      house.mesh.parent.localToWorld(_doorGroundPos);
      const dist = _doorGroundPos.distanceTo(playerAnchor);
      if (dist < closestDist) {
        closestDist = dist;
        closest = house;
      }
    }

    const isNear = closest && closestDist <= ENTER_DISTANCE;
    if (isNear && nearHouse?.id !== closest.id) {
      nearHouse = closest;
      emit('house:near', { house: nearHouse });
    } else if (!isNear && nearHouse) {
      nearHouse = null;
      emit('house:far');
    }
  }

  return { update };
}
