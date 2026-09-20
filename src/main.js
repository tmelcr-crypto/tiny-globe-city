import * as THREE from 'three';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera } from './core/camera.js';
import { createGlobe, GLOBE_RADIUS } from './world/globe.js';
import { spawnAll } from './world/spawner.js';
import { createPlayer } from './entities/player.js';
import { createHud } from './ui/hud.js';
import { createVehiclePrompt } from './ui/vehicle-prompt.js';
import { createVehicleSystem } from './systems/vehicles.js';
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

const player = createPlayer(GLOBE_RADIUS); // player is NOT a child of worldPivot, and never moves
scene.add(player);
const PLAYER_POS = player.position.clone();

const { cars } = spawnAll(worldPivot);
const vehicles = createVehicleSystem(cars);
const vehiclePrompt = createVehiclePrompt({
  onEnter: () => vehicles.enter(),
  onExit: () => vehicles.exit(),
});

on('vehicle:nearby', () => vehiclePrompt.showEnter());
on('vehicle:left', () => vehiclePrompt.hide());
on('vehicle:enter', () => {
  player.visible = false;
  vehiclePrompt.showExit();
});
on('vehicle:exit', () => {
  player.visible = true;
  vehiclePrompt.hide();
});

const input = createInput();
const hud = createHud();

addEventListener('keydown', (e) => {
  if (e.key === 'e' || e.key === 'E') {
    if (state.inVehicle) vehicles.exit();
    else vehicles.enter();
  }
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const SPEED = 0.6; // radians per second
createLoop((dt) => {
  const speed = SPEED * (state.inVehicle ? state.activeVehicle.speedMultiplier : 1);
  // Movement = rotate the globe under the fixed player.
  if (input.up)    worldPivot.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0),  speed * dt);
  if (input.down)  worldPivot.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -speed * dt);
  if (input.left)  worldPivot.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -speed * dt);
  if (input.right) worldPivot.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0),  speed * dt);
  vehicles.update(PLAYER_POS);
  hud.update();
  renderer.render(scene, camera);
});
