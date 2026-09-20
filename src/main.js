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
const obstacles = worldPivot.children.filter((c) =>
  ['house', 'safehouse', 'car', 'tree'].includes(c.userData?.type)
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
let drivingCar = null;
let carSteer = 0;
on('vehicle:toggle', ({ entered, multiplier, car }) => {
  speedMultiplier = entered ? multiplier : 1;
  drivingCar = entered ? car : null;
  carSteer = 0;
  if (entered) {
    // Swap the player for the car: fixed in place like the player, world rotates beneath it.
    collision.exclude(car);
    worldPivot.remove(car);
    scene.add(car);
    car.position.copy(player.position);
    car.quaternion.identity();
    player.visible = false;
  } else {
    // Drop the car back onto the globe beside the player, not on top of them
    // (parking it exactly at the player's spot hid the player behind/inside it).
    scene.remove(car);
    worldPivot.add(car);
    const dropWorldPos = player.position.clone().add(new THREE.Vector3(1.6, 0, 0));
    const local = worldPivot.worldToLocal(dropWorldPos);
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

const WALK_SPEED = 1.0;  // world units ("meters") per second, on foot
const ACCEL = 3.0;       // units/sec^2 speeding up
const DECEL = 7.0;       // units/sec^2 slowing down (brakes faster than it accelerates)
// Turning spins the world around the fixed player rather than covering ground,
// so it's a rate in rad/sec — scaling it by 1/GLOBE_RADIUS made turns glacial.
const TURN_SPEED = 1.2;
const STEER_MAX = 0.5;   // radians the car visibly turns into a curve
const STEER_RATE = 4;    // radians/sec toward the target steer angle
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function approach(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

let currentSpeed = 0;
createLoop((dt) => {
  const walking = input.up || input.down;
  const targetSpeed = walking ? WALK_SPEED * speedMultiplier : 0;
  currentSpeed = approach(currentSpeed, targetSpeed, (targetSpeed > currentSpeed ? ACCEL : DECEL) * dt);
  const angularSpeed = currentSpeed / GLOBE_RADIUS;
  const turn = TURN_SPEED * dt;

  // Movement = rotate the globe under the fixed player, blocked by collision.
  if (input.up)    collision.tryRotate(X_AXIS,  angularSpeed * dt, player.position);
  if (input.down)  collision.tryRotate(X_AXIS, -angularSpeed * dt, player.position);
  if (input.left)  collision.tryRotate(Y_AXIS, -turn, player.position);
  if (input.right) collision.tryRotate(Y_AXIS,  turn, player.position);

  if (drivingCar) {
    const targetSteer = input.left ? STEER_MAX : input.right ? -STEER_MAX : 0;
    carSteer = approach(carSteer, targetSteer, STEER_RATE * dt);
    drivingCar.rotation.y = carSteer;
  }

  interaction.update();
  combat.update(dt);
  hud.update();
  renderer.render(scene, camera);
});
