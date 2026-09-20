import { state } from '../core/state.js';
import { on } from '../core/events.js';

export function createHud() {
  const el = document.getElementById('hud');
  let target = null;
  let marker = null;
  on('interact:target', (t) => { target = t; });
  on('markers:here', (code) => { marker = code; });

  function prompt() {
    if (!target) return '';
    if (target.type === 'safehouse') return '  —  E / Tap: Save Game';
    if (target.type === 'car') return state.inVehicle ? '  —  E / Tap: Exit Vehicle' : '  —  E / Tap: Enter Vehicle';
    if (target.type === 'npc' && target.def?.role === 'quest_giver') return '  —  E / Tap: Talk';
    return '';
  }

  return {
    update() {
      const plot = marker ? `  [plot ${marker}]` : '';
      el.textContent = `HP ${state.health}  $${state.money}${plot}${prompt()}`;
    },
  };
}
