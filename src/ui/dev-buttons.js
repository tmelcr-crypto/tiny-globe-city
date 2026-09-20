import { on, emit } from '../core/events.js';

// Small on-screen controls for development: spin the globe to travel, and show
// the lot grid. Kept in code rather than index.html so the built game and the
// published page both get them.
const STYLE =
  'position:fixed;right:10px;z-index:8;padding:9px 14px;border-radius:999px;' +
  'border:1px solid rgba(255,255,255,0.35);background:rgba(12,16,28,0.78);' +
  'color:#eef2ff;font:13px system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(6px);';

function button(label, bottom, onClick) {
  const el = document.createElement('button');
  el.textContent = label;
  el.style.cssText = `${STYLE}bottom:${bottom}px;`;
  // Stop the press reaching the game: a tap on a button is not a tap on the world.
  for (const type of ['pointerdown', 'pointerup']) {
    el.addEventListener(type, (e) => e.stopPropagation());
  }
  el.addEventListener('click', onClick);
  document.body.appendChild(el);
  return el;
}

export function createDevButtons() {
  const globe = button('🌍 Spin globe', 58, () => emit('freefloat:toggle'));
  button('◻︎ Lot grid', 14, () => emit('markers:toggle'));

  on('freefloat:changed', (active) => {
    globe.textContent = active ? '✓ Back to ground' : '🌍 Spin globe';
    globe.style.borderColor = active ? '#5eead4' : 'rgba(255,255,255,0.35)';
  });
}
