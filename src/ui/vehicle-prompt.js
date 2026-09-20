// Popup shown when the player is close enough to a car to get in/out.
export function createVehiclePrompt({ onEnter, onExit }) {
  const el = document.createElement('button');
  el.id = 'vehicle-prompt';
  el.type = 'button';
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: '18%',
    transform: 'translate(-50%, 0)',
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    border: '2px solid #fff',
    background: 'rgba(20, 30, 50, 0.85)',
    color: '#fff',
    fontSize: '30px',
    lineHeight: '1',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '20',
    touchAction: 'manipulation',
  });
  document.body.appendChild(el);

  let mode = null; // 'enter' | 'exit' | null

  el.addEventListener('click', () => {
    if (mode === 'enter') onEnter();
    else if (mode === 'exit') onExit();
  });

  return {
    showEnter() {
      mode = 'enter';
      el.textContent = '🚗';
      el.setAttribute('aria-label', 'Enter car');
      el.style.display = 'flex';
    },
    showExit() {
      mode = 'exit';
      el.textContent = '🚪';
      el.setAttribute('aria-label', 'Exit car');
      el.style.display = 'flex';
    },
    hide() {
      mode = null;
      el.style.display = 'none';
    },
  };
}
