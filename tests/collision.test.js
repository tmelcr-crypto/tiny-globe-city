import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { moveWithCollision, collectColliders, MOVE_SPEED } from '../src/systems/collision.js';

const GLOBE_RADIUS = 50;

function makeWorld() {
  const worldPivot = new THREE.Group();
  const player = new THREE.Object3D();
  player.position.set(0, GLOBE_RADIUS + 0.8, 0);
  player.userData.collider = { radius: 0.5 };
  return { worldPivot, player };
}

function rotationAngle(worldPivot) {
  const w = THREE.MathUtils.clamp(Math.abs(worldPivot.quaternion.w), -1, 1);
  return 2 * Math.acos(w);
}

function rotationAxis(worldPivot) {
  return new THREE.Vector3(worldPivot.quaternion.x, worldPivot.quaternion.y, worldPivot.quaternion.z).normalize();
}

describe('moveWithCollision', () => {
  it('rotates worldPivot by the free-move angle when nothing is in the way', () => {
    const { worldPivot, player } = makeWorld();
    moveWithCollision(worldPivot, player, { up: true }, [], 0.05);
    expect(rotationAngle(worldPivot)).toBeCloseTo(MOVE_SPEED * 0.05, 6);
  });

  it('stops movement completely on a dead-on (90 degree) hit', () => {
    const { worldPivot, player } = makeWorld();
    // Directly ahead on the player's forward (-Z) path.
    const wall = { position: new THREE.Vector3(0, GLOBE_RADIUS + 0.8, -2.0), radius: 1.0 };
    moveWithCollision(worldPivot, player, { up: true }, [wall], 0.05);
    expect(rotationAngle(worldPivot)).toBeCloseTo(0, 6);
  });

  it('slows and slides along an obstacle hit at a glancing angle', () => {
    const { worldPivot, player } = makeWorld();
    const freeAngle = MOVE_SPEED * 0.05;

    const { worldPivot: straightPivot } = makeWorld();
    moveWithCollision(straightPivot, player, { up: true }, [], 0.05);

    // Offset to the side of the forward path: a glancing hit, not head-on.
    const corner = { position: new THREE.Vector3(0.8, GLOBE_RADIUS + 0.8, -2.0), radius: 1.0 };
    moveWithCollision(worldPivot, player, { up: true }, [corner], 0.05);

    const slidAngle = rotationAngle(worldPivot);
    expect(slidAngle).toBeGreaterThan(0);
    expect(slidAngle).toBeLessThan(freeAngle);

    // The rotation axis should have shifted off the pure-forward (pure X) axis,
    // evidence that the player is sliding sideways along the obstacle.
    expect(Math.abs(rotationAxis(worldPivot).z)).toBeGreaterThan(1e-3);
  });

  it('does nothing when there is no input', () => {
    const { worldPivot, player } = makeWorld();
    moveWithCollision(worldPivot, player, { up: false, down: false, left: false, right: false }, [], 0.05);
    expect(rotationAngle(worldPivot)).toBeCloseTo(0, 10);
  });

  it('collects colliders tagged on worldPivot children', () => {
    const worldPivot = new THREE.Group();
    const tagged = new THREE.Object3D();
    tagged.userData.collider = { radius: 1.2 };
    const untagged = new THREE.Object3D();
    worldPivot.add(tagged, untagged);

    const colliders = collectColliders(worldPivot);
    expect(colliders).toHaveLength(1);
    expect(colliders[0].radius).toBe(1.2);
    expect(colliders[0].position).toBe(tagged.position);
  });
});
