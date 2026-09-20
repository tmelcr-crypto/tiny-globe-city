import * as THREE from 'three';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera, PLAY_CAMERA } from './core/camera.js';
import { createGlobe, GLOBE_RADIUS } from './world/globe.js';
import { walkHeight } from './world/terrain.js';
import { spawnAll } from './world/spawner.js';
import { createPlayer } from './entities/player.js';
import { createWeapon } from './entities/weapon.js';
import { createHud } from './ui/hud.js';
import { createTouchControls } from './ui/touch-controls.js';
import { createSaveDialog, loadSave } from './ui/save-dialog.js';
import { createMarkerOverlay } from './ui/markers-overlay.js';
import { createDevButtons } from './ui/dev-buttons.js';
import { createFreeFloat } from './systems/free-float.js';
import { createInteractionSystem } from './systems/interaction.js';
import { createCollisionSystem } from './systems/collision.js';
import { createCombatSystem } from './systems/combat.js';
import { createNpcWander } from './systems/npc-wander.js';
import { on } from './core/events.js';
import { state } from './core/state.js';
import weapons from './data/weapons.json';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a3a46, 0.85));
// A low sun across the land, so hills have a lit side and a shaded one.
const sun = new THREE.DirectionalLight(0xffe7c4, 1.15);
sun.position.set(-0.45, 0.72, 0.52).multiplyScalar(GLOBE_RADIUS * 3);
scene.add(sun);

const camera = createCamera(GLOBE_RADIUS);
const worldPivot = createGlobe();      // everything in the world is a child of this
scene.add(worldPivot);
const player = createPlayer(GLOBE_RADIUS);
player.add(createWeapon(weapons[0]));
scene.add(player);                     // player is NOT a child of worldPivot

const interactables = spawnAll(worldPivot);
const obstacles = worldPivot.children.filter((c) =>
  ['building', 'safehouse', 'car', 'tree', 'mountain', 'lake'].includes(c.userData?.type)
);
const npcs = worldPivot.children.filter((c) => c.userData?.type === 'npc');

const input = createInput();
createTouchControls(input);
const hud = createHud();
const interaction = createInteractionSystem(interactables, player.position);
const collision = createCollisionSystem(worldPivot, obstacles);
const combat = createCombatSystem(npcs, player.position);
const wander = createNpcWander(npcs, obstacles);
const saveDialog = createSaveDialog();
const markers = createMarkerOverlay(worldPivot);
const freeFloat = createFreeFloat(camera, worldPivot);
createDevButtons();

const saved = loadSave();
if (saved) Object.assign(state, saved);

on('safehouse:interact', () => saveDialog.show());

// Entering the globe view must not leave a held key pressed behind it.
on('freefloat:changed', () => {
  input.up = input.down = input.left = input.right = false;
  currentSpeed = 0;
  turnRate = 0;
});

const EXIT_STEP = 3.5; // metres the player steps aside when getting out

// Turns the world so a point of the map ends up under the fixed player.
const _delta = new THREE.Quaternion();
const _aligned = new THREE.Vector3();
function bringUnderPlayer(localDirection) {
  _aligned.copy(localDirection).applyQuaternion(worldPivot.quaternion).normalize();
  _delta.setFromUnitVectors(_aligned, new THREE.Vector3(0, 1, 0));
  worldPivot.quaternion.premultiply(_delta);
  worldPivot.updateMatrixWorld(true);
}

let speedMultiplier = 1;
let drivingCar = null;
let carSteer = 0;
on('vehicle:toggle', ({ entered, multiplier, car }) => {
  speedMultiplier = entered ? multiplier : 1;
  drivingCar = entered ? car : null;
  carSteer = 0;
  if (entered) {
    // The car does not come to the player: the player arrives at the car. Turn
    // the world so the car's own spot is under the player, then take it over.
    bringUnderPlayer(car.position.clone().normalize());
    collision.exclude(car);
    worldPivot.remove(car);
    scene.add(car);
    car.position.copy(player.position);
    car.quaternion.identity();
    player.visible = false;
  } else {
    // Park it exactly where it stopped — it must not jump on the way out.
    scene.remove(car);
    worldPivot.add(car);
    const local = worldPivot.worldToLocal(player.position.clone());
    car.position.copy(local);
    car.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local.clone().normalize());
    collision.include(car);
    player.visible = true;

    // Step out alongside it: the world turns, the parked car stays where it is.
    const aside = worldPivot.worldToLocal(
      player.position.clone().add(new THREE.Vector3(EXIT_STEP, 0, 0))
    );
    bringUnderPlayer(aside.normalize());
  }
});


// The player is fixed at the top of the globe, so walking over a hill means
// the whole planet sinks or rises underneath them. Nothing else has to know.
const _under = new THREE.Vector3();
const _spin = new THREE.Quaternion();
const _toCamera = new THREE.Vector3();
const playCamera = camera.position.clone();
const playAim = new THREE.Vector3(0, GLOBE_RADIUS + PLAY_CAMERA.aim, 0);
const CAMERA_CLEARANCE = 3;  // metres of air the camera keeps above the ground
let ride = 0;
let lift = 0;

const ease = (value, target, rate, dt) => value + (target - value) * Math.min(1, Math.max(0, dt) * rate);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
let riding = false;

function rideTheLand(dt) {
  _spin.copy(worldPivot.quaternion).invert();
  _under.set(0, 1, 0).applyQuaternion(_spin);
  const ground = state.freeFloat ? 0 : clamp(walkHeight(_under), -40, 80);
  // Eased, so a kerb or a doorstep does not jolt the world — but snapped on
  // the first frame, so the world does not swing up from wherever it started.
  ride = riding ? ease(ride, ground, 9, dt) : ground;
  worldPivot.position.y = -ride;
  if (state.freeFloat) return;

  // The camera sits behind and above the player, which on a hillside can put it
  // inside the hill. Lift it until it is out in the air again.
  _toCamera.copy(camera.position).sub(worldPivot.position);
  const radius = _toCamera.length();
  _toCamera.normalize().applyQuaternion(_spin);
  const wanted = GLOBE_RADIUS + clamp(walkHeight(_toCamera), -40, 80) + CAMERA_CLEARANCE - ride;
  const needed = clamp(wanted - radius, 0, 30);
  lift = riding ? ease(lift, needed, 6, dt) : needed;
  riding = true;
  camera.position.set(playCamera.x, playCamera.y + lift, playCamera.z);
  camera.lookAt(playAim);
}

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
const STEER_MAX = 0.5;   // radians the car visibly leans into a curve
// Turning ramps at a constant rate rather than easing asymptotically, so how
// far you turn is proportional to how long you hold — predictable, not wobbly.
const TURN_RAMP_ON_FOOT = 9;   // rad/sec^2
const TURN_RAMP_DRIVING = 2.6;
const DRIVING_TURN = 0.8;      // a car turns less sharply than a person
const STEER_DAMP = 10;         // the car's visible yaw tracks its actual turn closely
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function approach(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

// Frame-rate independent exponential smoothing toward a target.
function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

let currentSpeed = 0;
let turnRate = 0;
createLoop((dt) => {
  freeFloat.update(dt);
  rideTheLand(dt);
  if (state.freeFloat) {
    // Nothing else runs: the world is being steered, not lived in.
    hud.update();
    renderer.render(scene, camera);
    return;
  }

  const walking = input.up || input.down;
  const targetSpeed = walking ? WALK_SPEED * speedMultiplier : 0;
  currentSpeed = approach(currentSpeed, targetSpeed, (targetSpeed > currentSpeed ? ACCEL : DECEL) * dt);
  const angularSpeed = currentSpeed / GLOBE_RADIUS;

  const turnInput = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  // A car steers through its wheels, so it only turns while it is rolling, and
  // more slowly than a person can pivot.
  const rolling = drivingCar ? currentSpeed / (WALK_SPEED * speedMultiplier) : 1;
  const maxTurn = TURN_SPEED * (drivingCar ? DRIVING_TURN * rolling : 1);
  const ramp = drivingCar ? TURN_RAMP_DRIVING : TURN_RAMP_ON_FOOT;
  turnRate = approach(turnRate, turnInput * maxTurn, ramp * dt);
  if (Math.abs(turnRate) < 1e-4) turnRate = 0;

  // Movement = rotate the globe under the fixed player, blocked by collision.
  if (input.up)   collision.tryRotate(X_AXIS,  angularSpeed * dt, player.position);
  if (input.down) collision.tryRotate(X_AXIS, -angularSpeed * dt, player.position);
  if (turnRate)   collision.tryRotate(Y_AXIS,  turnRate * dt, player.position);

  if (drivingCar) {
    carSteer = damp(carSteer, -(turnRate / (TURN_SPEED * DRIVING_TURN)) * STEER_MAX, STEER_DAMP, dt);
    drivingCar.rotation.y = carSteer;
  }

  markers.update();
  wander.update(dt);
  interaction.update();
  combat.update(dt);
  hud.update();
  renderer.render(scene, camera);
});
