import * as THREE from 'three';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera } from './core/camera.js';
import { createGlobe, GLOBE_RADIUS } from './world/globe.js';
import { createPlayer } from './entities/player.js';
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
scene.add(createPlayer(GLOBE_RADIUS)); // player is NOT a child of worldPivot

const input = createInput();
const hud = createHud();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const SPEED = 0.6; // radians per second
createLoop((dt) => {
  // Movement = rotate the globe under the fixed player.
  if (input.up)    worldPivot.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0),  SPEED * dt);
  if (input.down)  worldPivot.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -SPEED * dt);
  if (input.left)  worldPivot.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -SPEED * dt);
  if (input.right) worldPivot.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0),  SPEED * dt);
  hud.update();
  renderer.render(scene, camera);
});
