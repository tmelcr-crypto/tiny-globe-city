// On-screen drag control for mobile; writes into the same state as core/input.js.
const DEAD_ZONE = 12; // px, ignore jitter near the touch origin

export function createTouchControls(inputState) {
  let originX = 0;
  let originY = 0;
  let activeId = null;

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
  }

  addEventListener('pointerdown', (e) => {
    if (activeId !== null) return;
    activeId = e.pointerId;
    originX = e.clientX;
    originY = e.clientY;
  });

  addEventListener('pointermove', (e) => {
    if (e.pointerId !== activeId) return;
    update(e.clientX, e.clientY);
  });

  function end(e) {
    if (e.pointerId !== activeId) return;
    activeId = null;
    reset();
  }
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
}
