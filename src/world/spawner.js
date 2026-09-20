import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';
import { createCar } from '../entities/car.js';
import { createNpc } from '../entities/npc.js';
import { createTree } from '../entities/tree.js';
import { createBuilding } from '../entities/building.js';
import vehicles from '../data/vehicles.json';
import npcDefs from '../data/npcs.json';
import buildingDefs from '../data/buildings.json';

const BUILDING_COUNT = 50;
const CAR_COUNT = 5;
const TREE_COUNT = 60;
const NPC_HEALTH = 30;
const TOWN_RADIUS = degToRad(32); // colatitude cap around the spawn point, so the town is actually reachable
// Keep the spawn point itself clear: an object landing on top of the player
// leaves them wedged against it with the way forward blocked from frame one.
const SPAWN_CLEARANCE = 4 / GLOBE_RADIUS; // radians of arc
// Ground radius each kind of object occupies, used both to keep spawns from
// overlapping each other and to size collision against the player. Houses vary
// in size, so each one carries its own footprint instead.
const FOOTPRINT = { car: 1.7, tree: 0.6, npc: 0.4 };
const PLACEMENT_ATTEMPTS = 40;

const UP = new THREE.Vector3(0, 1, 0);

const safehouseDef = buildingDefs.find((d) => d.id === 'safehouse');
const spawnableBuildings = buildingDefs.filter((d) => d.weight > 0);

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function pickWeighted(defs) {
  let roll = Math.random() * defs.reduce((total, d) => total + d.weight, 0);
  for (const def of defs) {
    roll -= def.weight;
    if (roll <= 0) return def;
  }
  return defs[defs.length - 1];
}

// Area-uniform direction in a colatitude band around the north pole (the player's spawn point).
function randomCapDirection({ max = TOWN_RADIUS, min = SPAWN_CLEARANCE, phi } = {}) {
  const angle = phi ?? Math.random() * Math.PI * 2;
  const cosMax = Math.cos(max);
  const cosMin = Math.cos(Math.min(min, max));
  const y = cosMax + Math.random() * (cosMin - cosMax);
  const sinTheta = Math.sqrt(1 - y * y);
  return new THREE.Vector3(sinTheta * Math.cos(angle), y, sinTheta * Math.sin(angle));
}

// Ground (great-circle) distance between two directions, in world units.
function groundDistance(a, b) {
  return a.angleTo(b) * GLOBE_RADIUS;
}

// Rejection-sample a direction whose footprint doesn't overlap anything placed so far.
function findFreeDirection(placed, radius, band) {
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const dir = randomCapDirection(band);
    let clear = true;
    for (const other of placed) {
      if (groundDistance(dir, other.dir) < radius + other.radius) {
        clear = false;
        break;
      }
    }
    if (clear) return dir;
  }
  return null;
}

function placeOnSurface(mesh, dir, lift = 0) {
  mesh.position.copy(dir).multiplyScalar(GLOBE_RADIUS + lift);
  mesh.quaternion.setFromUnitVectors(UP, dir);
}

// Spawns houses, cars, NPCs and trees as children of worldPivot, none of them
// overlapping. Returns the objects the player can interact with (the safehouse,
// cars, and quest-giving NPCs).
export function spawnAll(worldPivot) {
  const interactables = [];
  const placed = [];

  // The safehouse goes down first, close and directly ahead of spawn so it's easy to find.
  const safehouseBand = { max: degToRad(12), min: safehouseDef.minSpawnDistance / GLOBE_RADIUS, phi: -Math.PI / 2 };
  const safehouse = createBuilding(safehouseDef);
  const safehouseRadius = safehouse.userData.footprint;
  const safehouseDir = findFreeDirection(placed, safehouseRadius, safehouseBand) ?? randomCapDirection(safehouseBand);
  placeOnSurface(safehouse, safehouseDir); // building origins sit at the doorstep
  safehouse.userData.type = 'safehouse';
  safehouse.userData.id = 'safehouse';
  worldPivot.add(safehouse);
  placed.push({ dir: safehouseDir, radius: safehouseRadius });
  interactables.push(safehouse);

  for (let i = 1; i < BUILDING_COUNT; i++) {
    const def = pickWeighted(spawnableBuildings);
    const building = createBuilding(def);
    const radius = building.userData.footprint;
    // Taller kinds keep their distance, so the skyline sits out in the city
    // rather than walling in the spot the player starts on.
    const dir = findFreeDirection(placed, radius, { min: def.minSpawnDistance / GLOBE_RADIUS });
    if (!dir) continue;

    placeOnSurface(building, dir);
    building.userData.type = 'building';
    building.userData.id = `${def.id}_${i}`;
    worldPivot.add(building);
    placed.push({ dir, radius });
  }

  for (let i = 0; i < CAR_COUNT; i++) {
    const radius = FOOTPRINT.car;
    const dir = findFreeDirection(placed, radius, TOWN_RADIUS);
    if (!dir) continue;

    const def = vehicles[i % vehicles.length];
    const car = createCar(def);
    placeOnSurface(car, dir);
    car.userData = { type: 'car', id: `${def.id}_${i}`, def, footprint: radius };
    worldPivot.add(car);
    placed.push({ dir, radius });
    interactables.push(car);
  }

  for (const def of npcDefs) {
    const radius = FOOTPRINT.npc;
    const dir = findFreeDirection(placed, radius, TOWN_RADIUS);
    if (!dir) continue;

    const npc = createNpc(def);
    placeOnSurface(npc, dir);
    npc.userData = { type: 'npc', id: def.id, def, health: NPC_HEALTH, footprint: radius };
    worldPivot.add(npc);
    placed.push({ dir, radius });
    interactables.push(npc);
  }

  for (let i = 0; i < TREE_COUNT; i++) {
    const radius = FOOTPRINT.tree;
    const dir = findFreeDirection(placed, radius, TOWN_RADIUS);
    if (!dir) continue;

    const tree = createTree();
    placeOnSurface(tree, dir);
    tree.userData = { type: 'tree', id: `tree_${i}`, footprint: radius };
    worldPivot.add(tree);
    placed.push({ dir, radius });
  }

  return interactables;
}
