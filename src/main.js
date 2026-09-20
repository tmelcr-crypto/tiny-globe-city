import * as THREE from 'three';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera } from './core/camera.js';
import { createGlobe, GLOBE_RADIUS, ANGULAR_SPEED } from './world/globe.js';
import { spawnAll } from './world/spawner.js';
import { createHouses } from './world/houses.js';
import { createPlayer, turnPlayerToward } from './entities/player.js';
import { createSavepoint } from './entities/savepoint.js';
import { driveCar } from './entities/car.js';
import { createPickupSystem } from './systems/pickups.js';
import { createVehicleSystem } from './systems/vehicles.js';
import { createSavepointSystem } from './systems/savepoints.js';
import { createSaveSystem, loadSave } from './systems/save.js';
import { createHouseEntrySystem } from './systems/house-entry.js';
import { moveWithCollision, collectColliders } from './systems/collision.js';
import { createHud } from './ui/hud.js';
import { createTouchControls } from './ui/touch-controls.js';
import { createVehiclePrompt } from './ui/vehicle-prompt.js';
import { createPlayerCreation } from './ui/player-creation.js';
import { createSavePrompt } from './ui/save-prompt.js';
import { createEnterPrompt } from './ui/enter-prompt.js';
import { createLoadingScreen } from './ui/loading-screen.js';
import * as interior from './interiors/interior.js';
import { on } from './core/events.js';
import { state } from './core/state.js';
import savepointDefs from './data/savepoints.json';

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

const savepointMeshes = savepointDefs.map((def) => {
  const mesh = createSavepoint(def, GLOBE_RADIUS);
  worldPivot.add(mesh);
  return mesh;
});

const houses = createHouses(worldPivot);
const houseEntry = createHouseEntrySystem(houses, GLOBE_RADIUS);

const input = createInput();
createTouchControls(input);
const hud = createHud();
const savePrompt = createSavePrompt();
const savepointSystem = createSavepointSystem(savepointMeshes);
createSaveSystem();

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

savePrompt.button.addEventListener('click', () => savepointSystem.interact());
addEventListener('keydown', (e) => {
  if (e.key === 'e' || e.key === 'E') savepointSystem.interact();
});

let running = false;

const existingSave = loadSave();
createPlayerCreation({
  existingName: existingSave?.player?.name ?? null,
  onCreate(name) {
    state.player.name = name;
    if (existingSave && existingSave.player?.name === name) {
      state.money = existingSave.money;
      state.health = existingSave.health;
    }
    running = true;
  },
});

createLoop((dt) => {
  if (running) {
    if (interior.isActive()) {
      // 2D interior mode renders its own canvas; skip the 3D scene/HUD.
      interior.updateInterior(dt, input);
      return;
    }
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
    savepointSystem.update();
    houseEntry.update();
  }
  hud.update();
  renderer.render(scene, camera);
});
