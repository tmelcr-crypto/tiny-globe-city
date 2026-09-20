import * as THREE from 'three';
import { GLOBE_RADIUS } from '../world/globe.js';

const PLAYER_RADIUS = 0.5;    // the player's own footprint on the ground
const DEFAULT_FOOTPRINT = 1;  // for obstacles that didn't declare one
// Well below a real frame's movement (~0.016 units) but above float32 noise, so
// turning on the spot — which leaves obstacle distances unchanged — is never blocked.
const EPSILON = 1e-4;
const _worldPos = new THREE.Vector3();

// Distance along the ground between two points on the globe. Measured as an arc
// so it ignores how tall an object is or how far its origin sits above the surface.
function groundDistance(a, b) {
  return a.angleTo(b) * GLOBE_RADIUS;
}

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
        distanceBefore[i] = groundDistance(_worldPos, playerPosition);
      }

      worldPivot.rotateOnWorldAxis(axis, angle);

      for (let i = 0; i < obstacles.length; i++) {
        const obj = obstacles[i];
        if (excluded.has(obj)) continue;
        obj.getWorldPosition(_worldPos);
        const after = groundDistance(_worldPos, playerPosition);
        const clearance = (obj.userData.footprint ?? DEFAULT_FOOTPRINT) + PLAYER_RADIUS;
        // Only reject moves that close the gap further. Blocking purely on
        // "ends up too close" freezes the player completely whenever they
        // start out already overlapping something (e.g. spawning next to a tree).
        if (after < clearance && after < distanceBefore[i] - EPSILON) {
          worldPivot.rotateOnWorldAxis(axis, -angle);
          return false;
        }
      }
      return true;
    },
  };
}
