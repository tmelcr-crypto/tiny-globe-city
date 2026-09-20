import * as THREE from 'three';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera } from './core/camera.js';
import { createGlobe, GLOBE_RADIUS, ANGULAR_SPEED } from './world/globe.js';
import { spawnAll } from './world/spawner.js';
import { createPlayer, turnPlayerToward } from './entities/player.js';
import { driveCar } from './entities/car.js';
import { createPickupSystem } from './systems/pickups.js';
import { createVehicleSystem } from './systems/vehicles.js';
import { createHud } from './ui/hud.js';
import { createTouchControls } from './ui/touch-controls.js';
import { createVehiclePrompt } from './ui/vehicle-prompt.js';
import { moveWithCollision, collectColliders } from './systems/collision.js';
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
const world = spawnAll(worldPivot); // NPCs, cars, pickups; move/track independent of the player
const player = createPlayer(GLOBE_RADIUS); // player is NOT a child of worldPivot
scene.add(player);
const colliders = collectColliders(worldPivot);
const pickupSystem = createPickupSystem(player.position, world.pickups);
const vehicles = createVehicleSystem(world.cars);

const input = createInput();
createTouchControls(input);
const hud = createHud();

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

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

createLoop((dt) => {
  if (state.inVehicle) {
    // Driving = rotate the globe under the fixed player, at the car's
    // ramped speed instead of the constant on-foot speed.
    driveCar(state.activeVehicle, worldPivot, input, dt);
  } else {
    // On-foot movement = rotate the globe under the fixed player, in the
    // joystick's direction, sliding along any obstacle it hits.
    const { x, y } = input;
    const moved = moveWithCollision(worldPivot, player, input, colliders, dt, ANGULAR_SPEED);
    if (moved) turnPlayerToward(player, Math.atan2(-x, y), dt);
  }
  world.update(dt);
  pickupSystem.update();
  vehicles.update(player.position);
  hud.update();
  renderer.render(scene, camera);
});
