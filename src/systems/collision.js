import * as THREE from 'three';

const COLLISION_RADIUS = 1.8; // world units; player + obstacle combined bounding radius
// Well below a real frame's movement (~0.016 units) but above float32 noise, so
// turning on the spot — which leaves obstacle distances unchanged — is never blocked.
const EPSILON = 1e-4;
const _worldPos = new THREE.Vector3();

// Solid obstacles (houses, trees, cars) block movement: a tentative rotation
// that pushes the player deeper into one is reverted for that frame. The car
// the player is currently driving is excluded so it doesn't collide with itself.
export function createCollisionSystem(worldPivot, obstacles) {
  const excluded = new Set();
  const distanceBefore = new Float64Array(obstacles.length);

  return {
    exclude(obj) { excluded.add(obj); },
    include(obj) { excluded.delete(obj); },
    tryRotate(axis, angle, playerPosition) {
      for (let i = 0; i < obstacles.length; i++) {
        obstacles[i].getWorldPosition(_worldPos);
        distanceBefore[i] = _worldPos.distanceTo(playerPosition);
      }

      worldPivot.rotateOnWorldAxis(axis, angle);

      for (let i = 0; i < obstacles.length; i++) {
        const obj = obstacles[i];
        if (excluded.has(obj)) continue;
        obj.getWorldPosition(_worldPos);
        const after = _worldPos.distanceTo(playerPosition);
        // Only reject moves that close the gap further. Blocking purely on
        // "ends up too close" freezes the player completely whenever they
        // start out already overlapping something (e.g. spawning next to a tree).
        if (after < COLLISION_RADIUS && after < distanceBefore[i] - EPSILON) {
          worldPivot.rotateOnWorldAxis(axis, -angle);
          return false;
        }
      }
      return true;
    },
  };
}
