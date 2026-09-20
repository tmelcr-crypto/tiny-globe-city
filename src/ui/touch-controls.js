// On-screen drag control for mobile; writes into the same state as core/input.js.
import { emit } from '../core/events.js';

const DEAD_ZONE = 12; // px, ignore jitter near the touch origin

export function createTouchControls(inputState) {
  let originX = 0;
  let originY = 0;
  let activeId = null;
  let dragged = false;

  function reset() {
    inputState.up = false;
    inputState.down = false;
    inputState.left = false;
    inputState.right = false;
  }

  function update(x, y) {
    const dx = x - originX;
    // Screen/touch Y grows downward, opposite of the "up" gesture, so invert it here.
    const dy = originY - y;
    inputState.up = dy > DEAD_ZONE;
    inputState.down = dy < -DEAD_ZONE;
    inputState.left = dx < -DEAD_ZONE;
    inputState.right = dx > DEAD_ZONE;
    if (inputState.up || inputState.down || inputState.left || inputState.right) dragged = true;
  }

  addEventListener('pointerdown', (e) => {
    if (activeId !== null) return;
    activeId = e.pointerId;
    originX = e.clientX;
    originY = e.clientY;
    dragged = false;
  });

  addEventListener('pointermove', (e) => {
    if (e.pointerId !== activeId) return;
    update(e.clientX, e.clientY);
  });

  function end(e) {
    if (e.pointerId !== activeId) return;
    activeId = null;
    // A tap (no drag past the dead zone) is an interact, not a movement gesture.
    if (!dragged) emit('interact');
    reset();
  }
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
}
