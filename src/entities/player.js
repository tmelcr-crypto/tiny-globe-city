import * as THREE from 'three';
// Fixed at the top of the globe. Never translates; only turns in place to
// face the direction the joystick is pushed while worldPivot rotates under it.
const TURN_SPEED = 10; // radians per second

const PLAYER_HEIGHT = 1.5; // meters
const CAPSULE_RADIUS = PLAYER_HEIGHT / 4; // cylinder + 2 caps = height; keeps prior proportions
const CAPSULE_LENGTH = PLAYER_HEIGHT - 2 * CAPSULE_RADIUS;

export function createPlayer(globeRadius) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_LENGTH, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xff5533 })
  );
  mesh.position.set(0, globeRadius + PLAYER_HEIGHT / 2, 0);
  mesh.userData.facing = 0; // 0 = forward, matches atan2(x, y) of the movement vector

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(CAPSULE_RADIUS / 2, CAPSULE_RADIUS, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, CAPSULE_RADIUS / 4, -(CAPSULE_RADIUS + CAPSULE_RADIUS / 4));
  mesh.add(nose);

  return mesh;
}

// Turns the player mesh toward targetAngle at TURN_SPEED, taking the shortest path.
export function turnPlayerToward(mesh, targetAngle, dt) {
  let diff = targetAngle - mesh.userData.facing;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const maxDelta = TURN_SPEED * dt;
  if (diff > maxDelta) diff = maxDelta;
  else if (diff < -maxDelta) diff = -maxDelta;
  mesh.userData.facing += diff;
  mesh.rotation.y = mesh.userData.facing;
}
