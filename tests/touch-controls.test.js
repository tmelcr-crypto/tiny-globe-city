import { describe, it, expect, beforeEach } from 'vitest';
import { createTouchControls } from '../src/ui/touch-controls.js';

// No DOM available under the default (node) vitest environment, so stub
// addEventListener to capture handlers and invoke them with plain fake events.
let listeners;
beforeEach(() => {
  listeners = {};
  globalThis.addEventListener = (type, handler) => {
    (listeners[type] ??= []).push(handler);
  };
});

function fire(type, event) {
  for (const handler of listeners[type] ?? []) handler(event);
}

describe('touch controls', () => {
  let state;

  beforeEach(() => {
    state = { up: false, down: false, left: false, right: false };
    createTouchControls(state);
  });

  it('dragging the finger up sets up, not down', () => {
    fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
    fire('pointermove', { pointerId: 1, clientX: 100, clientY: 150 }); // clientY decreases = drag up
    expect(state.up).toBe(true);
    expect(state.down).toBe(false);
  });

  it('dragging the finger down sets down, not up', () => {
    fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
    fire('pointermove', { pointerId: 1, clientX: 100, clientY: 250 }); // clientY increases = drag down
    expect(state.down).toBe(true);
    expect(state.up).toBe(false);
  });

  it('dragging left/right maps directly', () => {
    fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
    fire('pointermove', { pointerId: 1, clientX: 50, clientY: 200 });
    expect(state.left).toBe(true);
    expect(state.right).toBe(false);
  });

  it('releasing resets all directions', () => {
    fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });
    fire('pointermove', { pointerId: 1, clientX: 100, clientY: 150 });
    fire('pointerup', { pointerId: 1 });
    expect(state.up).toBe(false);
    expect(state.down).toBe(false);
    expect(state.left).toBe(false);
    expect(state.right).toBe(false);
  });
});
