// Keyboard input. Analog-style {x, y} vector matching ui/touch-controls.js:
// x = left(-1)/right(+1), y = back(-1)/forward(+1), diagonals normalized.
export function createInput() {
  const state = { x: 0, y: 0 };
  const pressed = { up: false, down: false, left: false, right: false };
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                w: 'up', s: 'down', a: 'left', d: 'right' };

  function recompute() {
    const x = (pressed.right ? 1 : 0) - (pressed.left ? 1 : 0);
    const y = (pressed.up ? 1 : 0) - (pressed.down ? 1 : 0);
    const len = Math.hypot(x, y);
    state.x = len ? x / len : 0;
    state.y = len ? y / len : 0;
  }

  addEventListener('keydown', (e) => {
    if (!map[e.key]) return;
    pressed[map[e.key]] = true;
    recompute();
  });
  addEventListener('keyup', (e) => {
    if (!map[e.key]) return;
    pressed[map[e.key]] = false;
    recompute();
  });
  return state;
}
