import { state } from '../core/state.js';
export function createHud() {
  const el = document.getElementById('hud');
  return {
    update() {
      const driving = state.inVehicle ? '  🚗' : '';
      el.textContent = `HP ${state.health}  $${state.money}  Ammo ${state.ammo}${driving}`;
    },
  };
}
