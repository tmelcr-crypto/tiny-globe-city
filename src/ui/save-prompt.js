import { on } from '../core/events.js';

// Shows a "Save Game" prompt while the player is at a savepoint (see systems/savepoints.js).
export function createSavePrompt() {
  const el = document.createElement('div');
  el.id = 'save-prompt';
  document.body.appendChild(el);

  const label = document.createElement('div');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Save Game';
  el.append(label, button);

  on('savepoint:change', (info) => {
    if (info) {
      label.textContent = `${info.name} — safehouse`;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  });

  on('save:completed', () => {
    button.textContent = 'Saved!';
    setTimeout(() => (button.textContent = 'Save Game'), 1200);
  });

  return { button };
}
