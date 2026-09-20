import * as THREE from 'three';

const COLLISION_RADIUS = 1.8; // world units; player + obstacle combined bounding radius
const _worldPos = new THREE.Vector3();

// Solid obstacles (houses, cars) block movement: a tentative rotation that
// would put the player inside one is reverted for that frame. The car the
// player is currently driving is excluded so it doesn't collide with itself.
export function createCollisionSystem(worldPivot, obstacles) {
  const excluded = new Set();

  return {
    exclude(obj) { excluded.add(obj); },
    include(obj) { excluded.delete(obj); },
    tryRotate(axis, angle, playerPosition) {
      worldPivot.rotateOnWorldAxis(axis, angle);
      for (const obj of obstacles) {
        if (excluded.has(obj)) continue;
        obj.getWorldPosition(_worldPos);
        if (_worldPos.distanceTo(playerPosition) < COLLISION_RADIUS) {
          worldPivot.rotateOnWorldAxis(axis, -angle);
          return false;
        }
      }
      return true;
    },
  };
}
