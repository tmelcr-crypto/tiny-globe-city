import * as THREE from 'three';
import { ON_FOOT_SPEED } from '../core/movement.js';

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

// Low-poly car: box body + cabin + four cylinder wheels.
export function createCar(def) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.6, 3.2),
    new THREE.MeshStandardMaterial({ color: def.color ?? 0x3366cc, flatShading: true })
  );
  body.position.y = 0.5;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.5, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x222233, flatShading: true })
  );
  cabin.position.set(0, 1.05, -0.2);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 8);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const wheelOffsets = [
    [0.9, 0.35, 1.1], [-0.9, 0.35, 1.1],
    [0.9, 0.35, -1.1], [-0.9, 0.35, -1.1],
  ];
  for (const [x, y, z] of wheelOffsets) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }

  // Driving reuses the on-foot rotation logic, scaled by the vehicle's speedMultiplier.
  const maxSpeed = ON_FOOT_SPEED * (def.speedMultiplier ?? 7);
  group.userData.def = def;
  group.userData.maxSpeed = maxSpeed;
  group.userData.acceleration = maxSpeed * 1.5; // ~0.67s to reach max speed
  group.userData.deceleration = maxSpeed * 2.5; // stops quicker than it speeds up
  group.userData.speed = 0;
  group.userData.occupied = false;
  return group;
}

// Ramps the car's current speed toward maxSpeed (throttle held) or toward zero
// (coasting to a stop), then rotates worldPivot the same way on-foot movement
// does, just scaled by that ramped speed instead of a constant.
export function driveCar(car, worldPivot, input, dt) {
  const throttled = input.up || input.down || input.left || input.right;
  const { acceleration, deceleration, maxSpeed } = car.userData;
  const rate = throttled ? acceleration : deceleration;
  const target = throttled ? maxSpeed : 0;

  let speed = car.userData.speed;
  speed = speed < target
    ? Math.min(target, speed + rate * dt)
    : Math.max(target, speed - rate * dt);
  car.userData.speed = speed;

  if (speed <= 0) return;
  if (input.up)    worldPivot.rotateOnWorldAxis(AXIS_X,  speed * dt);
  if (input.down)  worldPivot.rotateOnWorldAxis(AXIS_X, -speed * dt);
  if (input.left)  worldPivot.rotateOnWorldAxis(AXIS_Y, -speed * dt);
  if (input.right) worldPivot.rotateOnWorldAxis(AXIS_Y,  speed * dt);
}
