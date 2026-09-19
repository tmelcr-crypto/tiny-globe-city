// Left-side virtual joystick. Writes into the same boolean state shape as core/input.js.
const SIZE = 120;
const KNOB = 50;
const RADIUS = SIZE / 2;
const DEADZONE = 0.3; // fraction of radius before a direction is considered "pressed"

export function createTouchControls(inputState) {
  const base = document.createElement('div');
  base.style.cssText = `
    position: fixed; left: 24px; bottom: 24px; width: ${SIZE}px; height: ${SIZE}px;
    border-radius: 50%; background: rgba(255,255,255,0.12); border: 2px solid rgba(255,255,255,0.3);
    touch-action: none; z-index: 10;
  `;
  const knob = document.createElement('div');
  knob.style.cssText = `
    position: absolute; left: 50%; top: 50%; width: ${KNOB}px; height: ${KNOB}px;
    margin-left: ${-KNOB / 2}px; margin-top: ${-KNOB / 2}px; border-radius: 50%;
    background: rgba(255,255,255,0.35);
  `;
  base.appendChild(knob);
  document.body.appendChild(base);

  let activePointerId = null;

  function setKnob(x, y) {
    knob.style.left = `${x}px`;
    knob.style.top = `${y}px`;
  }

  function reset() {
    setKnob(RADIUS, RADIUS);
    inputState.up = inputState.down = inputState.left = inputState.right = false;
  }

  function update(dx, dy) {
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, RADIUS);
    const angle = Math.atan2(dy, dx);
    setKnob(RADIUS + Math.cos(angle) * clamped, RADIUS + Math.sin(angle) * clamped);

    const nx = dist ? (dx / dist) * (clamped / RADIUS) : 0;
    const ny = dist ? (dy / dist) * (clamped / RADIUS) : 0;
    inputState.up = ny < -DEADZONE;
    inputState.down = ny > DEADZONE;
    inputState.left = nx < -DEADZONE;
    inputState.right = nx > DEADZONE;
  }

  function pointerVector(e) {
    const rect = base.getBoundingClientRect();
    return [e.clientX - rect.left - RADIUS, e.clientY - rect.top - RADIUS];
  }

  base.addEventListener('pointerdown', (e) => {
    activePointerId = e.pointerId;
    base.setPointerCapture(e.pointerId);
    update(...pointerVector(e));
  });

  base.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    update(...pointerVector(e));
  });

  function end(e) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    reset();
  }
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);

  return { destroy: () => base.remove() };
}
