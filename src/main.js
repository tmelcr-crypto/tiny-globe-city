import * as THREE from 'three';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera } from './core/camera.js';
import { createGlobe, GLOBE_RADIUS, ANGULAR_SPEED } from './world/globe.js';
import { createPlayer, turnPlayerToward } from './entities/player.js';
import { createHud } from './ui/hud.js';
import { createTouchControls } from './ui/touch-controls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));

const camera = createCamera(GLOBE_RADIUS);
const worldPivot = createGlobe();      // everything in the world is a child of this
scene.add(worldPivot);
const player = createPlayer(GLOBE_RADIUS); // player is NOT a child of worldPivot
scene.add(player);

const input = createInput();
createTouchControls(input);
const hud = createHud();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const SPEED = ANGULAR_SPEED; // rad/s at full joystick deflection (see world/globe.js)
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

createLoop((dt) => {
  // Movement = rotate the globe under the fixed player, in the joystick's direction.
  const { x, y } = input;
  const magnitude = Math.hypot(x, y);
  if (magnitude > 0) {
    worldPivot.rotateOnWorldAxis(AXIS_X, y * SPEED * dt);
    worldPivot.rotateOnWorldAxis(AXIS_Y, x * SPEED * dt);
    turnPlayerToward(player, Math.atan2(x, y), dt);
  }
  hud.update();
  renderer.render(scene, camera);
});
