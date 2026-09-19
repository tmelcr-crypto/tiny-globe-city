// Keyboard placeholder. Touch input lives in ui/touch-controls.js (TODO).
export function createInput() {
  const state = { up: false, down: false, left: false, right: false };
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                w: 'up', s: 'down', a: 'left', d: 'right' };
  addEventListener('keydown', (e) => { if (map[e.key]) state[map[e.key]] = true; });
  addEventListener('keyup',   (e) => { if (map[e.key]) state[map[e.key]] = false; });
  return state;
}
