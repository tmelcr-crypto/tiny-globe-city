import { emit } from './events.js';

// Keyboard input. Touch input lives in ui/touch-controls.js.
export function createInput() {
  const state = { up: false, down: false, left: false, right: false };
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                w: 'up', s: 'down', a: 'left', d: 'right' };
  addEventListener('keydown', (e) => {
    if (map[e.key]) state[map[e.key]] = true;
    if ((e.key === 'e' || e.key === 'Enter') && !e.repeat) emit('interact');
  });
  addEventListener('keyup',   (e) => { if (map[e.key]) state[map[e.key]] = false; });
  return state;
}
