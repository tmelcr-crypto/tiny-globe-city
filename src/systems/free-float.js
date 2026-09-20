import * as THREE from 'three';
import { on, emit } from '../core/events.js';
import { state } from '../core/state.js';
import { GLOBE_RADIUS } from '../world/globe.js';
import { PLAY_CAMERA } from '../core/camera.js';

// Development fast travel: pull back off the surface and spin the whole planet
// under your finger like a desk globe. Whatever ends up at the top is where you
// are standing, so switching back drops you there.
//
// Everything else stops while this is on — walking, driving, interacting,
// shooting, NPCs — so nothing moves under you while you are steering the world.

const VIEW_DISTANCE = GLOBE_RADIUS * 3.1;
const DRAG_SPEED = 0.005;   // radians per pixel dragged
const SPIN_DECAY = 1.6;     // how quickly a flick runs out, per second
const MIN_SPIN = 1e-4;
const EASE = 3.5;           // how fast the camera moves between the two views

const _axis = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export function createFreeFloat(camera, worldPivot) {
  const position = camera.position.clone();
  const target = new THREE.Vector3(0, GLOBE_RADIUS + PLAY_CAMERA.aim, 0);
  const wantPosition = position.clone();
  const wantTarget = target.clone();

  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let spinX = 0; // pending rotation about the camera's right axis
  let spinY = 0; // and about its up axis

  function setView(active) {
    if (active) {
      wantPosition.set(0, GLOBE_RADIUS * 0.55, VIEW_DISTANCE);
      wantTarget.set(0, 0, 0);
    } else {
      wantPosition.set(0, GLOBE_RADIUS + PLAY_CAMERA.height, PLAY_CAMERA.behind);
      wantTarget.set(0, GLOBE_RADIUS + PLAY_CAMERA.aim, 0);
    }
  }

  function spinBy(dx, dy) {
    // Spin about the camera's own axes, so dragging left always sends the
    // surface left no matter how the globe is already turned.
    camera.matrixWorld.extractBasis(_right, _up, _axis);
    worldPivot.rotateOnWorldAxis(_up, dx);
    worldPivot.rotateOnWorldAxis(_right, dy);
  }

  addEventListener('pointerdown', (e) => {
    if (!state.freeFloat || pointerId !== null) return;
    if (e.target.tagName !== 'CANVAS') return;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    spinX = 0;
    spinY = 0;
  });

  addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    spinY = (e.clientX - lastX) * DRAG_SPEED;
    spinX = (e.clientY - lastY) * DRAG_SPEED;
    lastX = e.clientX;
    lastY = e.clientY;
    spinBy(spinY, spinX);
  });

  function release(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null; // whatever was left becomes the flick that carries on
  }
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);

  on('freefloat:toggle', () => {
    state.freeFloat = !state.freeFloat;
    if (!state.freeFloat) {
      spinX = 0;
      spinY = 0;
      pointerId = null;
    }
    setView(state.freeFloat);
    emit('freefloat:changed', state.freeFloat);
  });

  return {
    update(dt) {
      // Carry a flick on after the finger lifts, then settle.
      if (state.freeFloat && pointerId === null && (Math.abs(spinX) > MIN_SPIN || Math.abs(spinY) > MIN_SPIN)) {
        spinBy(spinY, spinX);
        const decay = Math.exp(-SPIN_DECAY * dt);
        spinX *= decay;
        spinY *= decay;
      }

      position.x = damp(position.x, wantPosition.x, EASE, dt);
      position.y = damp(position.y, wantPosition.y, EASE, dt);
      position.z = damp(position.z, wantPosition.z, EASE, dt);
      target.x = damp(target.x, wantTarget.x, EASE, dt);
      target.y = damp(target.y, wantTarget.y, EASE, dt);
      target.z = damp(target.z, wantTarget.z, EASE, dt);

      camera.position.copy(position);
      camera.lookAt(target);
    },
  };
}
