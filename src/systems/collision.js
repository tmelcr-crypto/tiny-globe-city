import * as THREE from 'three';
import { GLOBE_RADIUS } from '../world/planet.js';
import { PLAYER_RADIUS } from '../entities/player.js';

const DEFAULT_FOOTPRINT = 1;  // metres, for obstacles that didn't declare one
// Well below a real frame's movement (~0.016 units) but above float32 noise, so
// turning on the spot — which leaves obstacle distances unchanged — is never blocked.
const EPSILON = 1e-4;
const _worldPos = new THREE.Vector3();

// Distance along the ground between two points on the globe. Measured as an arc
// so it ignores how tall an object is or how far its origin sits above the surface.
function groundDistance(a, b) {
  return a.angleTo(b) * GLOBE_RADIUS;
}

const _toward = new THREE.Vector3();
const _side = new THREE.Vector3();
const _front = new THREE.Vector3();

// How far a point is from an object's edge. Anything that declares the box it
// occupies is measured against that box, turned the way it stands: walking
// along a block of flats should put you at its wall, not on a circle drawn
// round the whole building.
export function edgeDistance(obj, position, objPosition) {
  const gap = groundDistance(objPosition, position);
  const half = obj.userData.half;
  if (!half) return gap - (obj.userData.footprint ?? DEFAULT_FOOTPRINT);
  if (gap < 1e-6) return -Math.min(half.width, half.depth);

  // The way to the point, laid flat on the ground where the object stands.
  _toward.copy(position).normalize();
  _side.copy(objPosition).normalize();
  _toward.addScaledVector(_side, -_toward.dot(_side)).normalize().multiplyScalar(gap);

  _side.set(1, 0, 0).applyQuaternion(obj.quaternion);   // across the building
  _front.set(0, 0, 1).applyQuaternion(obj.quaternion);  // the way it faces
  const across = Math.max(0, Math.abs(_toward.dot(_side)) - half.width);
  const along = Math.max(0, Math.abs(_toward.dot(_front)) - half.depth);
  return Math.hypot(across, along);
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
        distanceBefore[i] = edgeDistance(obstacles[i], playerPosition, _worldPos);
      }

      worldPivot.rotateOnWorldAxis(axis, angle);

      for (let i = 0; i < obstacles.length; i++) {
        const obj = obstacles[i];
        if (excluded.has(obj)) continue;
        obj.getWorldPosition(_worldPos);
        const after = edgeDistance(obj, playerPosition, _worldPos);
        const clearance = PLAYER_RADIUS;
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
