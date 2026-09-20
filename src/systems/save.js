import { state } from '../core/state.js';
import { on, emit } from '../core/events.js';

const STORAGE_KEY = 'tiny-globe-city:save';

// Manual save, triggered by systems/savepoints.js when the player interacts at a safehouse.
export function createSaveSystem() {
  on('save:requested', () => {
    const payload = {
      player: { name: state.player.name },
      money: state.money,
      health: state.health,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Private browsing / blocked storage: saving is best-effort.
    }
    emit('save:completed', payload);
  });
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
