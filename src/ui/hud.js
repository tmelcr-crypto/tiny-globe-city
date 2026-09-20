import { state } from '../core/state.js';
export function createHud() {
  const el = document.getElementById('hud');
  return {
    update() {
      const name = state.player.name ?? 'Player';
      el.textContent = `${name}  HP ${state.health}  $${state.money}`;
    },
  };
}
