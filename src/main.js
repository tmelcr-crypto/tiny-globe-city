import * as THREE from 'three';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera } from './core/camera.js';
import { createGlobe, GLOBE_RADIUS } from './world/globe.js';
import { spawnAll } from './world/spawner.js';
import { createPlayer } from './entities/player.js';
import { createWeapon } from './entities/weapon.js';
import { createHud } from './ui/hud.js';
import { createTouchControls } from './ui/touch-controls.js';
import { createSaveDialog, loadSave } from './ui/save-dialog.js';
import { createInteractionSystem } from './systems/interaction.js';
import { createCollisionSystem } from './systems/collision.js';
import { createCombatSystem } from './systems/combat.js';
import { on } from './core/events.js';
import { state } from './core/state.js';
import weapons from './data/weapons.json';

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
player.add(createWeapon(weapons[0]));
scene.add(player);                     // player is NOT a child of worldPivot

const interactables = spawnAll(worldPivot);
const obstacles = worldPivot.children.filter(
  (c) => c.userData?.type === 'house' || c.userData?.type === 'safehouse' || c.userData?.type === 'car'
);
const npcs = worldPivot.children.filter((c) => c.userData?.type === 'npc');

const input = createInput();
createTouchControls(input);
const hud = createHud();
const interaction = createInteractionSystem(interactables, player.position);
const collision = createCollisionSystem(worldPivot, obstacles);
const combat = createCombatSystem(npcs, player.position);
const saveDialog = createSaveDialog();

const saved = loadSave();
if (saved) Object.assign(state, saved);

on('safehouse:interact', () => saveDialog.show());

let speedMultiplier = 1;
on('vehicle:toggle', ({ entered, multiplier, car }) => {
  speedMultiplier = entered ? multiplier : 1;
  if (entered) {
    // Swap the player for the car: fixed in place like the player, world rotates beneath it.
    collision.exclude(car);
    worldPivot.remove(car);
    scene.add(car);
    car.position.copy(player.position);
    car.quaternion.identity();
    player.visible = false;
  } else {
    // Drop the car back onto the globe at whatever ground point the player is now over.
    scene.remove(car);
    worldPivot.add(car);
    const local = worldPivot.worldToLocal(player.position.clone());
    car.position.copy(local);
    car.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local.clone().normalize());
    collision.include(car);
    player.visible = true;
  }
});

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
  // Movement = rotate the globe under the fixed player, blocked by collision.
  if (input.up)    collision.tryRotate(X_AXIS,  speed * dt, player.position);
  if (input.down)  collision.tryRotate(X_AXIS, -speed * dt, player.position);
  if (input.left)  collision.tryRotate(Y_AXIS, -speed * dt, player.position);
  if (input.right) collision.tryRotate(Y_AXIS,  speed * dt, player.position);
  interaction.update();
  combat.update(dt);
  hud.update();
  renderer.render(scene, camera);
});
