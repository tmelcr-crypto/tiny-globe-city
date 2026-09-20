import { emit } from './events.js';
import { state as game } from './state.js';

// Keyboard input. Touch input lives in ui/touch-controls.js.
export function createInput() {
  const keys = { up: false, down: false, left: false, right: false };
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                w: 'up', s: 'down', a: 'left', d: 'right' };

  addEventListener('keydown', (e) => {
    if ((e.key === 'g' || e.key === 'G') && !e.repeat) emit('freefloat:toggle');
    if (game.freeFloat) return; // the globe view swallows every other control
    if (map[e.key]) keys[map[e.key]] = true;
    if ((e.key === 'e' || e.key === 'Enter') && !e.repeat) emit('interact');
    if (e.key === ' ') emit('shoot');
    if ((e.key === 'm' || e.key === 'M') && !e.repeat) emit('markers:toggle');
  });

  // Never gated: a key held as the globe view opens must not stay stuck down.
  addEventListener('keyup', (e) => { if (map[e.key]) keys[map[e.key]] = false; });

  return keys;
}
