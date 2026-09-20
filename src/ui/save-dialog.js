import { state } from '../core/state.js';

const SAVE_KEY = 'tiny-globe-city-save';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Confirm-to-save modal, shown when the player interacts with the safehouse.
export function createSaveDialog() {
  const el = document.createElement('div');
  el.id = 'save-dialog';
  el.style.cssText =
    'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,0.6);font:16px sans-serif;color:#fff;z-index:10;';
  el.innerHTML = `
    <div style="background:#101a2e;padding:20px 28px;border-radius:8px;text-align:center;min-width:220px;">
      <p id="save-dialog-text">Save your game?</p>
      <button id="save-dialog-yes">Save</button>
      <button id="save-dialog-no">Cancel</button>
    </div>`;
  document.body.appendChild(el);

  const text = el.querySelector('#save-dialog-text');

  function hide() {
    el.style.display = 'none';
  }

  el.querySelector('#save-dialog-yes').addEventListener('click', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ money: state.money, health: state.health }));
    text.textContent = 'Game saved!';
    setTimeout(hide, 900);
  });
  el.querySelector('#save-dialog-no').addEventListener('click', hide);

  return {
    show() {
      text.textContent = 'Save your game?';
      el.style.display = 'flex';
    },
  };
}
