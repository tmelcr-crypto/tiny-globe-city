import * as THREE from 'three';

// Collision-and-slide for the "world rotates under a fixed player" model.
//
// The player never moves, so there's no player velocity vector to begin with.
// Each frame we derive one: `localPlayerPos` is where the player currently
// sits on the *unrotated* globe (worldPivot's local space, the same space
// colliders live in), found by undoing worldPivot's current rotation. Input
// maps to a world-axis spin of worldPivot; that spin gives the player an
// apparent tangential velocity across the (static, local-space) colliders.
// We resolve collisions against that velocity, then re-encode the result as
// a single worldPivot.rotateOnWorldAxis call.
//
// Hitting an obstacle dead-on (velocity parallel to the outward normal, i.e.
// 90 degrees to the obstacle's surface) cancels the velocity entirely: stop.
// A glancing hit only removes the into-surface component, so the player
// keeps the tangential part and slides along the obstacle, slowed in
// proportion to the impact angle.

export const MOVE_SPEED = 0.6; // radians/sec of worldPivot rotation

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Scratch objects reused every frame to avoid per-frame allocations.
const _omegaWorld = new THREE.Vector3();
const _omegaLocal = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();
const _localPlayerPos = new THREE.Vector3();
const _playerWorldPos = new THREE.Vector3();
const _vLocal = new THREE.Vector3();
const _predictedPos = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _axisLocal = new THREE.Vector3();
const _axisWorld = new THREE.Vector3();

// Gathers colliders from worldPivot's direct children (per CLAUDE.md, all
// world objects are direct children of worldPivot, so their `.position` is
// already in worldPivot's local space). Tag a mesh with
// `mesh.userData.collider = { radius }` to make it collidable.
export function collectColliders(worldPivot) {
  const colliders = [];
  for (const child of worldPivot.children) {
    if (child.userData && child.userData.collider) {
      colliders.push({ position: child.position, radius: child.userData.collider.radius });
    }
  }
  return colliders;
}

// Reduces `vLocal` in place: removes the into-obstacle component of the
// velocity for any collider the predicted move would hit, leaving only the
// tangential (sliding) component.
function resolveCollisions(localPos, vLocal, colliders, playerRadius, dt) {
  for (const c of colliders) {
    _predictedPos.copy(localPos).addScaledVector(vLocal, dt);
    const minDist = c.radius + playerRadius;
    const dist = _predictedPos.distanceTo(c.position);
    if (dist >= minDist) continue;

    if (dist < 1e-6) _normal.copy(_predictedPos).normalize();
    else _normal.subVectors(_predictedPos, c.position).divideScalar(dist);

    const vDotN = vLocal.dot(_normal);
    if (vDotN < 0) vLocal.addScaledVector(_normal, -vDotN);
  }
}

// Applies input as worldPivot rotation, sliding along any obstacle hit.
export function moveWithCollision(worldPivot, player, input, colliders, dt, speed = MOVE_SPEED) {
  if (!input.up && !input.down && !input.left && !input.right) return;

  _omegaWorld.set(0, 0, 0);
  if (input.up) _omegaWorld.addScaledVector(X_AXIS, speed);
  if (input.down) _omegaWorld.addScaledVector(X_AXIS, -speed);
  if (input.right) _omegaWorld.addScaledVector(Y_AXIS, speed);
  if (input.left) _omegaWorld.addScaledVector(Y_AXIS, -speed);

  player.getWorldPosition(_playerWorldPos);
  worldPivot.worldToLocal(_localPlayerPos.copy(_playerWorldPos));

  _invQuat.copy(worldPivot.quaternion).invert();
  _omegaLocal.copy(_omegaWorld).applyQuaternion(_invQuat);

  // Velocity of the local surface point under the fixed player: v = -(omega x p).
  _vLocal.crossVectors(_omegaLocal, _localPlayerPos).negate();

  const playerRadius = (player.userData && player.userData.collider?.radius) || 0.5;
  resolveCollisions(_localPlayerPos, _vLocal, colliders, playerRadius, dt);

  const speedSq = _vLocal.lengthSq();
  if (speedSq < 1e-10) return; // stopped dead by a head-on hit

  const r = _localPlayerPos.length();
  _axisLocal.crossVectors(_localPlayerPos, _vLocal).normalize();
  const angle = (Math.sqrt(speedSq) / r) * dt;

  _axisWorld.copy(_axisLocal).applyQuaternion(worldPivot.quaternion);
  worldPivot.rotateOnWorldAxis(_axisWorld, angle);
}
