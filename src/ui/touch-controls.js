// Touch-anywhere virtual joystick. Spawns wherever the screen is touched and
// writes an analog {x, y} vector into the same input state as core/input.js.
const RADIUS = 60;
const KNOB = 50;
const DEADZONE = 0.15;

export function createTouchControls(inputState) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; touch-action: none; z-index: 10;
  `;

  const base = document.createElement('div');
  base.style.cssText = `
    position: fixed; width: ${RADIUS * 2}px; height: ${RADIUS * 2}px;
    border-radius: 50%; background: rgba(255,255,255,0.12);
    border: 2px solid rgba(255,255,255,0.3); pointer-events: none; display: none;
  `;
  const knob = document.createElement('div');
  knob.style.cssText = `
    position: absolute; width: ${KNOB}px; height: ${KNOB}px;
    margin-left: ${-KNOB / 2}px; margin-top: ${-KNOB / 2}px; border-radius: 50%;
    background: rgba(255,255,255,0.35);
  `;
  base.appendChild(knob);
  document.body.appendChild(overlay);
  document.body.appendChild(base);

  let activePointerId = null;
  let originX = 0;
  let originY = 0;

  function setKnob(x, y) {
    knob.style.left = `${x}px`;
    knob.style.top = `${y}px`;
  }

  function showAt(x, y) {
    originX = x;
    originY = y;
    base.style.left = `${x - RADIUS}px`;
    base.style.top = `${y - RADIUS}px`;
    base.style.display = 'block';
    setKnob(RADIUS, RADIUS);
  }

  function hide() {
    base.style.display = 'none';
    inputState.x = 0;
    inputState.y = 0;
  }

  function update(dx, dy) {
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, RADIUS);
    const angle = Math.atan2(dy, dx);
    setKnob(RADIUS + Math.cos(angle) * clamped, RADIUS + Math.sin(angle) * clamped);

    const mag = dist ? clamped / RADIUS : 0;
    const nx = dist ? (dx / dist) * mag : 0;
    const ny = dist ? (dy / dist) * mag : 0;
    // Screen up is forward: negate ny so pushing the stick up gives +y.
    inputState.x = Math.abs(nx) > DEADZONE ? nx : 0;
    inputState.y = Math.abs(ny) > DEADZONE ? -ny : 0;
  }

  overlay.addEventListener('pointerdown', (e) => {
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    overlay.setPointerCapture(e.pointerId);
    showAt(e.clientX, e.clientY);
  });

  overlay.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    update(e.clientX - originX, e.clientY - originY);
  });

  function end(e) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    hide();
  }
  overlay.addEventListener('pointerup', end);
  overlay.addEventListener('pointercancel', end);

  return { destroy: () => { overlay.remove(); base.remove(); } };
}
