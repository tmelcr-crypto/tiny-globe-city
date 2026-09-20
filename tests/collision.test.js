import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCollisionSystem } from '../src/systems/collision.js';

const AXIS = new THREE.Vector3(1, 0, 0);

function makeObstacle(position) {
  const obj = new THREE.Object3D();
  obj.position.copy(position);
  return obj;
}

describe('collision system', () => {
  it('blocks a rotation that would put the player inside an obstacle', () => {
    const pivot = new THREE.Group();
    const R = 50;
    const theta = 0.3; // colatitude ahead of the player, on the -Z meridian
    const obstacle = makeObstacle(new THREE.Vector3(0, R * Math.cos(theta), -R * Math.sin(theta)));
    pivot.add(obstacle);
    const playerPos = new THREE.Vector3(0, R, 0);

    const collision = createCollisionSystem(pivot, [obstacle]);
    const before = pivot.quaternion.clone();
    // Rotating by exactly `theta` about +X carries the obstacle onto the player's spot.
    const moved = collision.tryRotate(AXIS, theta, playerPos);

    expect(moved).toBe(false);
    expect(pivot.quaternion.angleTo(before)).toBeCloseTo(0, 5); // rotation was reverted (float32 precision)
  });

  it('allows movement when nothing is in the way', () => {
    const pivot = new THREE.Group();
    const obstacle = makeObstacle(new THREE.Vector3(0, 50, -40)); // far away
    pivot.add(obstacle);
    const playerPos = new THREE.Vector3(0, 50, 0);

    const collision = createCollisionSystem(pivot, [obstacle]);
    const before = pivot.quaternion.clone();
    const moved = collision.tryRotate(AXIS, 0.01, playerPos);

    expect(moved).toBe(true);
    expect(pivot.quaternion.equals(before)).toBe(false);
  });

  it('still lets the player move away when they start out overlapping an obstacle', () => {
    // Spawning inside an obstacle's radius used to block every direction,
    // freezing the player completely.
    const pivot = new THREE.Group();
    const R = 50;
    const theta = 0.02; // obstacle ~1 unit away, already inside COLLISION_RADIUS
    const obstacle = makeObstacle(new THREE.Vector3(0, R * Math.cos(theta), -R * Math.sin(theta)));
    pivot.add(obstacle);
    const playerPos = new THREE.Vector3(0, R, 0);

    const collision = createCollisionSystem(pivot, [obstacle]);
    // Rotating the other way carries the obstacle further from the player.
    const moved = collision.tryRotate(AXIS, -0.05, playerPos);

    expect(moved).toBe(true);
  });

  it('ignores an excluded obstacle (e.g. the car currently being driven)', () => {
    const pivot = new THREE.Group();
    const car = makeObstacle(new THREE.Vector3(0, 50, -1));
    pivot.add(car);
    const playerPos = new THREE.Vector3(0, 50, 0);

    const collision = createCollisionSystem(pivot, [car]);
    collision.exclude(car);
    const moved = collision.tryRotate(AXIS, 0.5, playerPos);

    expect(moved).toBe(true);
  });
});
