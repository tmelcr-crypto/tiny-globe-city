import { describe, it, expect, beforeEach } from 'vitest';
import { createTouchControls } from '../src/ui/touch-controls.js';
import { on } from '../src/core/events.js';

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

const CANVAS = { tagName: 'CANVAS' };
function down(props) {
  fire('pointerdown', { target: CANVAS, ...props });
}

describe('touch controls', () => {
  let state;

  beforeEach(() => {
    state = { up: false, down: false, left: false, right: false };
    createTouchControls(state);
  });

  it('dragging the finger up sets up, not down', () => {
    down({ pointerId: 1, clientX: 100, clientY: 200 });
    fire('pointermove', { pointerId: 1, clientX: 100, clientY: 150 }); // clientY decreases = drag up
    expect(state.up).toBe(true);
    expect(state.down).toBe(false);
  });

  it('dragging the finger down sets down, not up', () => {
    down({ pointerId: 1, clientX: 100, clientY: 200 });
    fire('pointermove', { pointerId: 1, clientX: 100, clientY: 250 }); // clientY increases = drag down
    expect(state.down).toBe(true);
    expect(state.up).toBe(false);
  });

  it('dragging left/right maps directly', () => {
    down({ pointerId: 1, clientX: 100, clientY: 200 });
    fire('pointermove', { pointerId: 1, clientX: 50, clientY: 200 });
    expect(state.left).toBe(true);
    expect(state.right).toBe(false);
  });

  it('releasing resets all directions', () => {
    down({ pointerId: 1, clientX: 100, clientY: 200 });
    fire('pointermove', { pointerId: 1, clientX: 100, clientY: 150 });
    fire('pointerup', { pointerId: 1, target: CANVAS });
    expect(state.up).toBe(false);
    expect(state.down).toBe(false);
    expect(state.left).toBe(false);
    expect(state.right).toBe(false);
  });

  it('ignores taps on UI chrome (e.g. a dialog button), so it cannot re-trigger interact', () => {
    let interacted = false;
    // Reproduces the save-dialog "cycling" bug: a click on a button is a
    // pointerdown+pointerup that bubbles to window just like a canvas tap.
    on('interact', () => { interacted = true; });
    const button = { tagName: 'BUTTON' };
    fire('pointerdown', { pointerId: 7, clientX: 10, clientY: 10, target: button });
    fire('pointerup', { pointerId: 7, target: button });
    expect(interacted).toBe(false);
  });
});
