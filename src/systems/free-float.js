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

// Pinch to zoom, as a multiple of the default view distance: in far enough to
// read a street, out far enough to see the whole planet with room around it.
const ZOOM_IN = 0.42;
const ZOOM_OUT = 1.9;
const WHEEL_SPEED = 0.0016;  // per notch, for a mouse

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

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

  // Every finger currently on the canvas, so a second one turns a drag into a
  // pinch without losing track of the first.
  const touches = new Map();
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let spinX = 0; // pending rotation about the camera's right axis
  let spinY = 0; // and about its up axis
  let zoom = 1;
  let pinch = null;

  function setView(active) {
    if (active) {
      wantPosition.set(0, GLOBE_RADIUS * 0.55 * zoom, VIEW_DISTANCE * zoom);
      wantTarget.set(0, 0, 0);
    } else {
      wantPosition.set(0, GLOBE_RADIUS + PLAY_CAMERA.height, PLAY_CAMERA.behind);
      wantTarget.set(0, GLOBE_RADIUS + PLAY_CAMERA.aim, 0);
    }
  }

  function zoomTo(value) {
    zoom = clamp(value, ZOOM_IN, ZOOM_OUT);
    if (state.freeFloat) setView(true);
  }

  const spread = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function spinBy(dx, dy) {
    // Spin about the camera's own axes, so dragging left always sends the
    // surface left no matter how the globe is already turned.
    camera.matrixWorld.extractBasis(_right, _up, _axis);
    worldPivot.rotateOnWorldAxis(_up, dx);
    worldPivot.rotateOnWorldAxis(_right, dy);
  }

  addEventListener('pointerdown', (e) => {
    if (!state.freeFloat) return;
    if (e.target.tagName !== 'CANVAS') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (touches.size === 2) {
      // A second finger: stop spinning and start pinching from here.
      pinch = { spread: spread(), zoom };
      pointerId = null;
      spinX = 0;
      spinY = 0;
      return;
    }
    if (touches.size > 2 || pointerId !== null) return;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    spinX = 0;
    spinY = 0;
  });

  addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && touches.size === 2) {
      const now = spread();
      if (now > 1) zoomTo((pinch.spread / now) * pinch.zoom);
      return;
    }

    if (e.pointerId !== pointerId) return;
    // Dragging turns the globe by what is on screen, so close in it turns less.
    spinY = (e.clientX - lastX) * DRAG_SPEED * zoom;
    spinX = (e.clientY - lastY) * DRAG_SPEED * zoom;
    lastX = e.clientX;
    lastY = e.clientY;
    spinBy(spinY, spinX);
  });

  function release(e) {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;

    if (touches.size === 1 && pointerId === null) {
      // One finger left after a pinch: carry on dragging from where it is.
      const [id] = touches.keys();
      const point = touches.get(id);
      pointerId = id;
      lastX = point.x;
      lastY = point.y;
      spinX = 0;
      spinY = 0;
      return;
    }
    if (e.pointerId !== pointerId) return;
    pointerId = null; // whatever was left becomes the flick that carries on
  }
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);

  // A mouse has no second finger.
  addEventListener('wheel', (e) => {
    if (!state.freeFloat) return;
    zoomTo(zoom * (1 + e.deltaY * WHEEL_SPEED));
  }, { passive: true });

  const offToggle = on('freefloat:toggle', () => {
    state.freeFloat = !state.freeFloat;
    if (!state.freeFloat) {
      spinX = 0;
      spinY = 0;
      pointerId = null;
      pinch = null;
      touches.clear();
    }
    setView(state.freeFloat);
    emit('freefloat:changed', state.freeFloat);
  });

  return {
    // Only the tests tear a globe view down; the game keeps one for good.
    dispose() {
      offToggle();
    },

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
