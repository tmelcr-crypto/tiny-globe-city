import { state } from '../core/state.js';
export function createHud() {
  const el = document.getElementById('hud');
  return {
    update() {
      const vehicle = state.inVehicle ? `  [driving, E to exit]` : `  [E to enter car]`;
      el.textContent = `HP ${state.health}  $${state.money}${vehicle}`;
    },
  };
}
