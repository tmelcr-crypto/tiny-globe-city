import { emit } from '../core/events.js';
import interiors from '../data/interiors.json';

const GRAVITY = 900; // px/s^2
const MOVE_SPEED = 110; // px/s
const JUMP_SPEED = 320; // px/s
const PLAYER_W = 12;
const PLAYER_H = 20;

let canvas, ctx;
let level = null;
let player = null;
let active = false;

// Touch zones (left third / middle / right third of the screen) since this
// mode has no controls of its own yet and mobile Chrome is the primary
// target. Tracked by touch identifier so a moved finger can't leave a zone
// stuck "on".
const touchState = { left: false, right: false, jump: false };
const touchZones = new Map(); // identifier -> zone

function zoneFor(clientX) {
  const frac = clientX / innerWidth;
  if (frac < 0.33) return 'left';
  if (frac > 0.66) return 'right';
  return 'jump';
}

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.id = 'interior-canvas';
  canvas.style.cssText = `
    position: fixed; inset: 0; width: 100%; height: 100%;
    display: none; z-index: 5; image-rendering: pixelated; touch-action: none;`;
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');

  canvas.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      const zone = zoneFor(t.clientX);
      touchZones.set(t.identifier, zone);
      touchState[zone] = true;
    }
  });
  const releaseTouch = (e) => {
    for (const t of e.changedTouches) {
      const zone = touchZones.get(t.identifier);
      if (zone) touchState[zone] = false;
      touchZones.delete(t.identifier);
    }
  };
  canvas.addEventListener('touchend', releaseTouch);
  canvas.addEventListener('touchcancel', releaseTouch);
}

export function isActive() {
  return active;
}

export function enterBuilding(interiorId) {
  ensureCanvas();
  level = interiors.find((l) => l.id === interiorId) || interiors[0];
  canvas.width = level.width;
  canvas.height = level.height;
  canvas.style.display = 'block';
  player = { x: level.spawn.x, y: level.spawn.y, vx: 0, vy: 0, onGround: false };
  active = true;
  emit('interior:entered', { id: level.id });
}

export function exitBuilding() {
  active = false;
  canvas.style.display = 'none';
  touchState.left = touchState.right = touchState.jump = false;
  touchZones.clear();
  emit('interior:exited');
}

function overlaps(rect) {
  return (
    player.x < rect.x + rect.w &&
    player.x + PLAYER_W > rect.x &&
    player.y < rect.y + rect.h &&
    player.y + PLAYER_H > rect.y
  );
}

export function updateInterior(dt, input) {
  if (!active) return;

  const left = input.left || touchState.left;
  const right = input.right || touchState.right;
  const jump = input.up || touchState.jump;

  player.vx = left ? -MOVE_SPEED : right ? MOVE_SPEED : 0;
  if (jump && player.onGround) {
    player.vy = -JUMP_SPEED;
    player.onGround = false;
  }

  player.vy += GRAVITY * dt;
  const prevY = player.y;
  player.x = Math.max(0, Math.min(level.width - PLAYER_W, player.x + player.vx * dt));
  player.y += player.vy * dt;

  player.onGround = false;
  for (const p of level.platforms) {
    if (!overlaps(p)) continue;
    if (player.vy >= 0 && prevY + PLAYER_H <= p.y + 1) {
      player.y = p.y - PLAYER_H; // landed on top
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0 && prevY >= p.y + p.h - 1) {
      player.y = p.y + p.h; // bonked the underside
      player.vy = 0;
    }
  }

  if (overlaps(level.exit)) emit('interior:exit-request');

  render();
}

function render() {
  ctx.fillStyle = level.background;
  ctx.fillRect(0, 0, level.width, level.height);

  ctx.fillStyle = '#5a4a2a';
  for (const p of level.platforms) ctx.fillRect(p.x, p.y, p.w, p.h);

  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(level.exit.x, level.exit.y, level.exit.w, level.exit.h);

  ctx.fillStyle = '#ff5533';
  ctx.fillRect(player.x, player.y, PLAYER_W, PLAYER_H);
}
