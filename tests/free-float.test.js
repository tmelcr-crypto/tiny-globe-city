import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createFreeFloat } from '../src/systems/free-float.js';
import { createGlobe, GLOBE_RADIUS } from '../src/world/globe.js';
import { createCamera } from '../src/core/camera.js';
import { emit } from '../src/core/events.js';
import { state } from '../src/core/state.js';

// No DOM under the default vitest environment: capture the handlers and call
// them with plain fake events, as the touch control tests do.
let listeners;
beforeEach(() => {
  listeners = {};
  globalThis.addEventListener = (type, handler) => { (listeners[type] ??= []).push(handler); };
  globalThis.innerWidth = 1000;
  globalThis.innerHeight = 800;
  state.freeFloat = false;
});

// Each case builds its own globe view; without this they would all still be
// listening on the shared bus and one toggle would flip the flag several times.
const views = [];
afterEach(() => {
  while (views.length) views.pop().dispose();
  state.freeFloat = false;
});

const fire = (type, event) => { for (const handler of listeners[type] ?? []) handler(event); };
const CANVAS = { tagName: 'CANVAS' };
const touch = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y, target: CANVAS });

function globeView() {
  const camera = createCamera(GLOBE_RADIUS);
  const pivot = createGlobe();
  const view = createFreeFloat(camera, pivot);
  views.push(view);
  emit('freefloat:toggle');
  // Let the camera settle into the globe view.
  for (let step = 0; step < 200; step++) view.update(0.05);
  return { camera, pivot, view };
}

const distance = (camera) => camera.position.length();

describe('the globe view', () => {
  it('pulls the camera back off the surface', () => {
    const { camera } = globeView();
    expect(distance(camera)).toBeGreaterThan(GLOBE_RADIUS * 2);
  });

  it('pulls back when two fingers pinch together', () => {
    const { camera, view } = globeView();
    const before = distance(camera);

    fire('pointerdown', touch(1, 300, 400));
    fire('pointerdown', touch(2, 700, 400));   // 400 px apart
    fire('pointermove', touch(2, 500, 400));   // pinched to 200 px
    fire('pointerup', touch(1, 300, 400));
    fire('pointerup', touch(2, 500, 400));
    for (let step = 0; step < 200; step++) view.update(0.05);

    expect(distance(camera)).toBeGreaterThan(before);
  });

  it('comes in close when they spread apart', () => {
    const { camera, view } = globeView();
    const before = distance(camera);

    fire('pointerdown', touch(1, 450, 400));
    fire('pointerdown', touch(2, 550, 400));   // 100 px apart
    fire('pointermove', touch(2, 900, 400));   // spread to 450 px
    fire('pointerup', touch(1, 450, 400));
    fire('pointerup', touch(2, 900, 400));
    for (let step = 0; step < 200; step++) view.update(0.05);

    expect(distance(camera)).toBeLessThan(before);
    expect(distance(camera)).toBeGreaterThan(GLOBE_RADIUS); // never inside the planet
  });

  it('zooms with a mouse wheel too', () => {
    const { camera, view } = globeView();
    const before = distance(camera);
    fire('wheel', { deltaY: -400 });
    for (let step = 0; step < 200; step++) view.update(0.05);
    expect(distance(camera)).toBeLessThan(before);
  });

  it('holds still while pinching instead of spinning', () => {
    const { pivot } = globeView();
    const before = pivot.quaternion.clone();

    fire('pointerdown', touch(1, 300, 400));
    fire('pointerdown', touch(2, 700, 400));
    fire('pointermove', touch(1, 320, 430));
    fire('pointermove', touch(2, 680, 370));

    expect(pivot.quaternion.angleTo(before)).toBeCloseTo(0, 6);
  });

  it('carries on dragging with the finger left after a pinch', () => {
    const { pivot } = globeView();

    fire('pointerdown', touch(1, 300, 400));
    fire('pointerdown', touch(2, 700, 400));
    fire('pointerup', touch(2, 700, 400));
    const before = pivot.quaternion.clone();
    fire('pointermove', touch(1, 400, 400));

    expect(pivot.quaternion.angleTo(before)).toBeGreaterThan(0.01);
  });

  it('ignores a pinch when the globe view is closed', () => {
    const { camera, view } = globeView();
    emit('freefloat:toggle');
    for (let step = 0; step < 200; step++) view.update(0.05);
    const parked = distance(camera);

    fire('pointerdown', touch(1, 300, 400));
    fire('pointerdown', touch(2, 700, 400));
    fire('pointermove', touch(2, 400, 400));
    for (let step = 0; step < 200; step++) view.update(0.05);

    expect(distance(camera)).toBeCloseTo(parked, 3);
  });
});
