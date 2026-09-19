import * as THREE from 'three';

const MATERIAL = new THREE.MeshStandardMaterial({ color: 0x3366cc });
const HEIGHT = 1.4; // meters, roughly person-sized
const RADIUS = HEIGHT / 4;
const SPEED = 0.5; // m/s - independent of the player's own movement
const TURN_RATE = 0.6; // max rad/s of random heading drift, for gentle wandering

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const tmpAxis = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

// A vector in the tangent plane at `up` (i.e. perpendicular to it), for an initial heading.
function randomTangent(up) {
  const arbitrary = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return arbitrary.sub(up.clone().multiplyScalar(arbitrary.dot(up))).normalize();
}

// One simple capsule NPC, wandering on its own patch of the sphere. `dir` is
// its starting position as a unit vector from the globe's center.
export function createNpc(globeRadius, dir) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(RADIUS, HEIGHT - 2 * RADIUS, 4, 8), MATERIAL);
  const up = dir.clone();
  return { mesh, up, heading: randomTangent(up), globeRadius };
}

// Wanders the NPC across the sphere's surface, independent of player input.
export function updateNpc(npc, dt) {
  // Occasionally drift the heading left/right.
  tmpQuat.setFromAxisAngle(npc.up, (Math.random() * 2 - 1) * TURN_RATE * dt);
  npc.heading.applyQuaternion(tmpQuat);

  // Walk forward along the great circle in the heading direction.
  const angle = (SPEED * dt) / npc.globeRadius;
  tmpAxis.crossVectors(npc.up, npc.heading).normalize();
  tmpQuat.setFromAxisAngle(tmpAxis, angle);
  npc.up.applyQuaternion(tmpQuat);
  npc.heading.applyQuaternion(tmpQuat);

  npc.mesh.position.copy(npc.up).multiplyScalar(npc.globeRadius + HEIGHT / 2);
  npc.mesh.quaternion.setFromUnitVectors(UP_AXIS, npc.up);
}
