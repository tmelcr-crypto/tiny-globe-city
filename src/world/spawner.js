import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';
import { createCar } from '../entities/car.js';
import { createNpc } from '../entities/npc.js';
import vehicles from '../data/vehicles.json';
import npcDefs from '../data/npcs.json';

const HOUSE_COUNT = 50;
const CAR_COUNT = 5;
const TOWN_RADIUS = degToRad(32); // colatitude cap around the spawn point, so the town is actually reachable

function degToRad(d) {
  return (d * Math.PI) / 180;
}

// Area-uniform direction within a colatitude cap around the north pole (the player's spawn point).
function randomCapDirection(maxColatitude, phi = Math.random() * Math.PI * 2) {
  const cosMax = Math.cos(maxColatitude);
  const y = cosMax + Math.random() * (1 - cosMax);
  const sinTheta = Math.sqrt(1 - y * y);
  return new THREE.Vector3(sinTheta * Math.cos(phi), y, sinTheta * Math.sin(phi));
}

function placeOnSurface(mesh, dir) {
  mesh.position.copy(dir).multiplyScalar(GLOBE_RADIUS);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
}

// Spawns houses, cars and NPCs as children of worldPivot. Returns the objects
// the player can interact with (the safehouse, cars, and quest-giving NPCs).
export function spawnAll(worldPivot) {
  const interactables = [];

  for (let i = 0; i < HOUSE_COUNT; i++) {
    const isSafehouse = i === 0;
    const house = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 2 + Math.random() * 3, 1.5),
      new THREE.MeshStandardMaterial({ color: isSafehouse ? 0x3388ff : 0xcccccc })
    );
    // Put the safehouse close and directly ahead of spawn so it's easy to find.
    const dir = isSafehouse
      ? randomCapDirection(degToRad(12), -Math.PI / 2)
      : randomCapDirection(TOWN_RADIUS);
    placeOnSurface(house, dir);
    house.userData = { type: isSafehouse ? 'safehouse' : 'house', id: isSafehouse ? 'safehouse' : `house_${i}` };
    worldPivot.add(house);
    if (isSafehouse) interactables.push(house);
  }

  for (let i = 0; i < CAR_COUNT; i++) {
    const def = vehicles[i % vehicles.length];
    const car = createCar(def);
    placeOnSurface(car, randomCapDirection(TOWN_RADIUS));
    car.userData = { type: 'car', id: `${def.id}_${i}`, def };
    worldPivot.add(car);
    interactables.push(car);
  }

  for (const def of npcDefs) {
    const npc = createNpc(def);
    placeOnSurface(npc, randomCapDirection(TOWN_RADIUS));
    npc.userData = { type: 'npc', id: def.id, def };
    worldPivot.add(npc);
    interactables.push(npc);
  }

  return interactables;
}
