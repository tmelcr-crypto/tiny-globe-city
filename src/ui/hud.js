import { state } from '../core/state.js';
import { on } from '../core/events.js';

export function createHud() {
  const el = document.getElementById('hud');
  let target = null;
  on('interact:target', (t) => { target = t; });

  function prompt() {
    if (!target) return '';
    if (target.type === 'safehouse') return '  —  E / Tap: Save Game';
    if (target.type === 'car') return state.inVehicle ? '  —  E / Tap: Exit Vehicle' : '  —  E / Tap: Enter Vehicle';
    if (target.type === 'npc' && target.def?.role === 'quest_giver') return '  —  E / Tap: Talk';
    return '';
  }

  return {
    update() {
      el.textContent = `HP ${state.health}  $${state.money}${prompt()}`;
    },
  };
}
