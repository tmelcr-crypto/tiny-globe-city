import * as THREE from 'three';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createCamera } from './core/camera.js';
import { createGlobe, GLOBE_RADIUS } from './world/globe.js';
import { createPlayer } from './entities/player.js';
import { createSavepoint } from './entities/savepoint.js';
import { createHud } from './ui/hud.js';
import { createPlayerCreation } from './ui/player-creation.js';
import { createSavePrompt } from './ui/save-prompt.js';
import { createSavepointSystem } from './systems/savepoints.js';
import { createSaveSystem, loadSave } from './systems/save.js';
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
scene.add(createPlayer(GLOBE_RADIUS)); // player is NOT a child of worldPivot

const savepointMeshes = savepointDefs.map((def) => {
  const mesh = createSavepoint(def, GLOBE_RADIUS);
  worldPivot.add(mesh);
  return mesh;
});

const input = createInput();
const hud = createHud();
const savePrompt = createSavePrompt();
const savepointSystem = createSavepointSystem(savepointMeshes);
createSaveSystem();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

savePrompt.button.addEventListener('click', () => savepointSystem.interact());
addEventListener('keydown', (e) => {
  if (e.key === 'e' || e.key === 'E') savepointSystem.interact();
});

const SPEED = 0.6; // radians per second
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
    // Movement = rotate the globe under the fixed player.
    if (input.up)    worldPivot.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0),  SPEED * dt);
    if (input.down)  worldPivot.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -SPEED * dt);
    if (input.left)  worldPivot.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -SPEED * dt);
    if (input.right) worldPivot.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0),  SPEED * dt);
    savepointSystem.update();
  }
  hud.update();
  renderer.render(scene, camera);
});
