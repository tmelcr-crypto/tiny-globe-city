import * as THREE from 'three';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera } from './core/camera.js';
import { on } from './core/events.js';
import { state } from './core/state.js';
import { createGlobe, GLOBE_RADIUS } from './world/globe.js';
import { createHouses } from './world/houses.js';
import { createPlayer } from './entities/player.js';
import { createHud } from './ui/hud.js';
import { createEnterPrompt } from './ui/enter-prompt.js';
import { createLoadingScreen } from './ui/loading-screen.js';
import { createHouseEntrySystem } from './systems/house-entry.js';
import * as interior from './interiors/interior.js';

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
scene.add(createPlayer(GLOBE_RADIUS)); // player is NOT a child of worldPivot

const houses = createHouses(worldPivot);
const houseEntry = createHouseEntrySystem(houses, GLOBE_RADIUS);

const input = createInput();
const hud = createHud();
createEnterPrompt();
const loadingScreen = createLoadingScreen();

let transitioning = false;

on('house:enter-request', ({ house }) => {
  if (transitioning || interior.isActive()) return;
  transitioning = true;
  loadingScreen.show();
  // Faked loading beat: this is where a real interior would stream in assets.
  setTimeout(() => {
    interior.enterBuilding(house.interiorId);
    state.currentInterior = house.interiorId;
    loadingScreen.hide();
    transitioning = false;
  }, 500);
});

on('interior:exit-request', () => {
  if (transitioning || !interior.isActive()) return;
  transitioning = true;
  loadingScreen.show();
  setTimeout(() => {
    interior.exitBuilding();
    state.currentInterior = null;
    loadingScreen.hide();
    transitioning = false;
  }, 300);
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const SPEED = 0.6; // radians per second
createLoop((dt) => {
  if (interior.isActive()) {
    interior.updateInterior(dt, input);
    return;
  }

  // Movement = rotate the globe under the fixed player.
  if (input.up)    worldPivot.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0),  SPEED * dt);
  if (input.down)  worldPivot.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -SPEED * dt);
  if (input.left)  worldPivot.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -SPEED * dt);
  if (input.right) worldPivot.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0),  SPEED * dt);
  houseEntry.update();
  hud.update();
  renderer.render(scene, camera);
});
