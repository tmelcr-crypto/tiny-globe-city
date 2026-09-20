import { state } from '../core/state.js';
export function createHud() {
  const el = document.getElementById('hud');
  return { update() { el.textContent = `HP ${state.health}  $${state.money}  Ammo ${state.ammo}`; } };
}
