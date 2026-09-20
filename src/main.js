import * as THREE from 'three';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera } from './core/camera.js';
import { ON_FOOT_SPEED } from './core/movement.js';
import { state } from './core/state.js';
import { emit } from './core/events.js';
import { createGlobe, GLOBE_RADIUS } from './world/globe.js';
import { spawnAll } from './world/spawner.js';
import { createPlayer } from './entities/player.js';
import { driveCar } from './entities/car.js';
import { createHud } from './ui/hud.js';

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

const { cars } = spawnAll(worldPivot, GLOBE_RADIUS);

const input = createInput();
const hud = createHud();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const ENTER_RADIUS = 2.5;
const carWorldPos = new THREE.Vector3(); // reused each frame, avoid per-frame allocation

function findNearbyCar() {
  for (const car of cars) {
    if (car.userData.occupied) continue;
    car.getWorldPosition(carWorldPos);
    if (carWorldPos.distanceTo(player.position) < ENTER_RADIUS) return car;
  }
  return null;
}

createLoop((dt) => {
  if (state.inVehicle) {
    const car = state.currentCar;
    driveCar(car, worldPivot, input, dt);
    if (input.action) {
      car.userData.occupied = false;
      car.userData.speed = 0;
      state.inVehicle = false;
      state.currentCar = null;
      emit('car:exit', { car });
    }
  } else {
    // On-foot movement = rotate the globe under the fixed player.
    if (input.up)    worldPivot.rotateOnWorldAxis(AXIS_X,  ON_FOOT_SPEED * dt);
    if (input.down)  worldPivot.rotateOnWorldAxis(AXIS_X, -ON_FOOT_SPEED * dt);
    if (input.left)  worldPivot.rotateOnWorldAxis(AXIS_Y, -ON_FOOT_SPEED * dt);
    if (input.right) worldPivot.rotateOnWorldAxis(AXIS_Y,  ON_FOOT_SPEED * dt);

    if (input.action) {
      const car = findNearbyCar();
      if (car) {
        car.userData.occupied = true;
        state.inVehicle = true;
        state.currentCar = car;
        emit('car:enter', { car });
      }
    }
  }
  input.action = false; // consume the edge-triggered enter/exit key
  hud.update();
  renderer.render(scene, camera);
});
