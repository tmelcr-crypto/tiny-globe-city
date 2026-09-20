import * as THREE from 'three';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera } from './core/camera.js';
import { createGlobe, GLOBE_RADIUS } from './world/globe.js';
import { spawnAll } from './world/spawner.js';
import { createPlayer } from './entities/player.js';
import { createHud } from './ui/hud.js';
import { createTouchControls } from './ui/touch-controls.js';
import { createSaveDialog, loadSave } from './ui/save-dialog.js';
import { createInteractionSystem } from './systems/interaction.js';
import { on } from './core/events.js';
import { state } from './core/state.js';

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
const player = createPlayer(GLOBE_RADIUS);
scene.add(player);                     // player is NOT a child of worldPivot

const interactables = spawnAll(worldPivot);

const input = createInput();
createTouchControls(input);
const hud = createHud();
const interaction = createInteractionSystem(interactables, player.position);
const saveDialog = createSaveDialog();

const saved = loadSave();
if (saved) Object.assign(state, saved);

on('safehouse:interact', () => saveDialog.show());

let speedMultiplier = 1;
on('vehicle:toggle', ({ entered, multiplier }) => { speedMultiplier = entered ? multiplier : 1; });

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const BASE_SPEED = 0.6; // radians per second
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
createLoop((dt) => {
  const speed = BASE_SPEED * speedMultiplier;
  // Movement = rotate the globe under the fixed player.
  if (input.up)    worldPivot.rotateOnWorldAxis(X_AXIS,  speed * dt);
  if (input.down)  worldPivot.rotateOnWorldAxis(X_AXIS, -speed * dt);
  if (input.left)  worldPivot.rotateOnWorldAxis(Y_AXIS, -speed * dt);
  if (input.right) worldPivot.rotateOnWorldAxis(Y_AXIS,  speed * dt);
  interaction.update();
  hud.update();
  renderer.render(scene, camera);
});
