// Keyboard placeholder. Touch input lives in ui/touch-controls.js (TODO).
export function createInput() {
  // `action` is edge-triggered: set true on keydown, consumed (reset) by the caller each frame.
  const state = { up: false, down: false, left: false, right: false, action: false };
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                w: 'up', s: 'down', a: 'left', d: 'right' };
  addEventListener('keydown', (e) => {
    if (map[e.key]) state[map[e.key]] = true;
    if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') state.action = true;
  });
  addEventListener('keyup', (e) => { if (map[e.key]) state[map[e.key]] = false; });
  return state;
}
