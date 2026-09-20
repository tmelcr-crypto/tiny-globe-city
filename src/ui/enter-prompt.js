import { on, emit } from '../core/events.js';

// "Enter" prompt shown when the player is standing at a house's door.
// Works from both touch (tap) and keyboard ('e'), per house-entry.js events.
export function createEnterPrompt() {
  let current = null;

  const el = document.createElement('button');
  el.id = 'enter-prompt';
  el.textContent = 'Enter';
  el.style.cssText = `
    position: fixed; left: 50%; bottom: 18%; transform: translate(-50%, 0);
    padding: 10px 22px; font: 16px sans-serif; border: none; border-radius: 8px;
    background: #ffcc33; color: #221; display: none; z-index: 10;`;
  document.body.appendChild(el);

  const request = () => current && emit('house:enter-request', { house: current });
  el.addEventListener('click', request);

  on('house:near', ({ house }) => {
    current = house;
    el.style.display = 'block';
  });
  on('house:far', () => {
    current = null;
    el.style.display = 'none';
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'e' || e.key === 'E') request();
  });

  return el;
}
