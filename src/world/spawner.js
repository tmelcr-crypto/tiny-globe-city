import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';
import { createCar, CAR_RADIUS } from '../entities/car.js';
import { createNpc, NPC_RADIUS } from '../entities/npc.js';
import { createTree } from '../entities/tree.js';
import { createBuilding } from '../entities/building.js';
import { createMountain } from '../entities/mountain.js';
import { createCityGround } from './city-ground.js';
import {
  BLOCK, ROAD_WIDTH, SIDEWALK_WIDTH, CELL, CITY_EXTENT, MOUNTAIN_RING, LAKE_RADIUS, ROAD_OFFSET,
  cityBlocks, randomPlot, roadLines, blockCentre, roadAt, PARK_BLOCK, lakeCentre,
  directionFromTangent, tangentFacing, nearestRoad, isInLake,
} from './city-plan.js';
import vehicles from '../data/vehicles.json';
import npcDefs from '../data/npcs.json';
import buildingDefs from '../data/buildings.json';

const BUILDINGS_PER_BLOCK = { downtown: 3, suburb: 4, park: 0 };
const PARK_TREES = 26;
const GARDEN_TREES = 34;
const CAR_COUNT = 10;
const MOUNTAIN_COUNT = 10;
const NPC_HEALTH = 30;
const PLACEMENT_ATTEMPTS = 24;

const UP = new THREE.Vector3(0, 1, 0);
const _facing = new THREE.Vector3();
const _right = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _probe = new THREE.Vector3();

const safehouseDef = buildingDefs.find((d) => d.id === 'safehouse');

function pickWeighted(entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

// Stands a model on the globe. Given a facing direction it is also turned to
// look that way, so buildings front the street instead of sitting at random angles.
function placeAt(mesh, u, v, facing) {
  const dir = directionFromTangent(u, v);
  mesh.position.copy(dir).multiplyScalar(GLOBE_RADIUS);
  if (!facing) {
    mesh.quaternion.setFromUnitVectors(UP, dir);
    return;
  }
  tangentFacing(u, v, facing, _facing);
  _right.copy(dir).cross(_facing).normalize();
  _basis.makeBasis(_right, dir, _facing);
  mesh.quaternion.setFromRotationMatrix(_basis);
}

// Measured on the sphere, not the flat map: the map stretches near the city
// edge, so flat distances there would permit real overlaps.
function overlaps(placed, u, v, radius) {
  const dir = directionFromTangent(u, v, _probe);
  for (const other of placed) {
    if (dir.angleTo(other.dir) * GLOBE_RADIUS < radius + other.radius) return true;
  }
  return false;
}

function remember(placed, u, v, radius) {
  placed.push({ dir: directionFromTangent(u, v).clone(), radius });
}

function spawnBuildings(worldPivot, placed) {
  for (const block of cityBlocks()) {
    const quota = BUILDINGS_PER_BLOCK[block.district];
    const choices = buildingDefs
      .map((def) => [def, def.districts[block.district] ?? 0])
      .filter(([, weight]) => weight > 0);
    if (!quota || choices.length === 0) continue;

    for (let n = 0; n < quota; n++) {
      const def = pickWeighted(choices);
      const building = createBuilding(def);
      const radius = building.userData.footprint;

      for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
        const plot = randomPlot(block, radius);
        if (!plot || overlaps(placed, plot.u, plot.v, radius)) continue;

        placeAt(building, plot.u, plot.v, nearestRoad(plot.u, plot.v).facing);
        building.userData.type = 'building';
        building.userData.id = `${def.id}_${block.i}_${block.j}_${n}`;
        building.userData.district = block.district;
        worldPivot.add(building);
        remember(placed, plot.u, plot.v, radius);
        break;
      }
    }
  }
}

// Parked along the kerb, nose pointing down the street.
function spawnCars(worldPivot, placed, interactables) {
  const lines = roadLines();
  for (let i = 0; i < CAR_COUNT; i++) {
    const line = lines[Math.floor(Math.random() * lines.length)];
    const along = (Math.random() * 2 - 1) * (CITY_EXTENT - CELL / 2);
    const side = Math.random() < 0.5 ? -1 : 1;
    const offset = side * (ROAD_WIDTH / 2 - 1.3);
    const u = line.axis === 'u' ? along : line.at + offset;
    const v = line.axis === 'u' ? line.at + offset : along;
    if (overlaps(placed, u, v, CAR_RADIUS) || isInLake(u, v, CAR_RADIUS)) continue;

    const def = vehicles[i % vehicles.length];
    const car = createCar(def);
    const facing = line.axis === 'u' ? { u: side, v: 0 } : { u: 0, v: side };
    placeAt(car, u, v, facing);
    car.userData = { type: 'car', id: `${def.id}_${i}`, def, footprint: CAR_RADIUS };
    worldPivot.add(car);
    remember(placed, u, v, CAR_RADIUS);
    interactables.push(car);
  }
}

function spawnNpcs(worldPivot, placed, interactables) {
  const lines = roadLines();
  for (const def of npcDefs) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const line = lines[Math.floor(Math.random() * lines.length)];
      const along = (Math.random() * 2 - 1) * (CITY_EXTENT - CELL / 2);
      const offset = (Math.random() < 0.5 ? -1 : 1) * (ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2);
      const u = line.axis === 'u' ? along : line.at + offset;
      const v = line.axis === 'u' ? line.at + offset : along;
      if (overlaps(placed, u, v, NPC_RADIUS) || isInLake(u, v, NPC_RADIUS)) continue;

      const npc = createNpc(def);
      placeAt(npc, u, v);
      npc.userData = { type: 'npc', id: def.id, def, health: NPC_HEALTH, footprint: NPC_RADIUS };
      worldPivot.add(npc);
      remember(placed, u, v, NPC_RADIUS);
      interactables.push(npc);
      break;
    }
  }
}

function spawnTree(worldPivot, placed, u, v) {
  const tree = createTree();
  const radius = tree.userData.footprint;
  if (overlaps(placed, u, v, radius) || isInLake(u, v, radius + 1.5)) return false;
  placeAt(tree, u, v);
  tree.userData.type = 'tree';
  tree.userData.footprint = radius;
  worldPivot.add(tree);
  remember(placed, u, v, radius);
  return true;
}

function spawnTrees(worldPivot, placed) {
  // The park: dense planting around the lake.
  const park = blockCentre(PARK_BLOCK);
  for (let i = 0; i < PARK_TREES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = LAKE_RADIUS + 2 + Math.random() * (BLOCK / 2 - LAKE_RADIUS - 3);
    spawnTree(worldPivot, placed, park.u + Math.cos(angle) * distance, park.v + Math.sin(angle) * distance);
  }

  // Gardens: scattered through the blocks, wherever a building isn't.
  const blocks = cityBlocks().filter((b) => b.district !== 'park');
  for (let i = 0; i < GARDEN_TREES; i++) {
    const block = blocks[Math.floor(Math.random() * blocks.length)];
    const plot = randomPlot(block, 2);
    if (plot) spawnTree(worldPivot, placed, plot.u, plot.v);
  }
}

// A ring of peaks just outside the city, giving the little planet a horizon.
function spawnMountains(worldPivot, placed) {
  const span = MOUNTAIN_RING.max - MOUNTAIN_RING.min;
  for (let i = 0; i < MOUNTAIN_COUNT; i++) {
    const mountain = createMountain();
    const radius = mountain.userData.footprint;

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const angle = ((i + Math.random() * 0.8) / MOUNTAIN_COUNT) * Math.PI * 2;
      const distance = MOUNTAIN_RING.min + Math.random() * span;
      const u = Math.cos(angle) * distance;
      const v = Math.sin(angle) * distance;
      if (overlaps(placed, u, v, radius)) continue;

      placeAt(mountain, u, v);
      mountain.userData.type = 'mountain';
      mountain.userData.id = `mountain_${i}`;
      worldPivot.add(mountain);
      remember(placed, u, v, radius);
      break;
    }
  }
}

// Lays out the city — roads, sidewalks, park and lake, then everything standing
// on them — as children of worldPivot. Returns the objects the player can
// interact with (the safehouse, cars, and quest-giving NPCs).
export function spawnAll(worldPivot) {
  const interactables = [];
  const placed = [];

  worldPivot.add(createCityGround());

  // The lake is water, not ground: an invisible collider keeps the player out of it.
  const lake = new THREE.Object3D();
  const shore = lakeCentre();
  placeAt(lake, shore.u, shore.v);
  lake.userData = { type: 'lake', id: 'lake', footprint: LAKE_RADIUS };
  worldPivot.add(lake);
  remember(placed, shore.u, shore.v, LAKE_RADIUS);

  // The safehouse fronts the street the player spawns beside, straight ahead of them.
  const safehouse = createBuilding(safehouseDef);
  const safehouseRadius = safehouse.userData.footprint;
  const safehouseU = 0;
  // Far enough ahead that the player isn't standing inside its collision radius at spawn.
  const safehouseV = -(safehouseRadius + 8);
  placeAt(safehouse, safehouseU, safehouseV, { u: 0, v: 1 });
  safehouse.userData.type = 'safehouse';
  safehouse.userData.id = 'safehouse';
  worldPivot.add(safehouse);
  remember(placed, safehouseU, safehouseV, safehouseRadius);
  interactables.push(safehouse);

  spawnBuildings(worldPivot, placed);
  spawnCars(worldPivot, placed, interactables);
  spawnNpcs(worldPivot, placed, interactables);
  spawnTrees(worldPivot, placed);
  spawnMountains(worldPivot, placed);

  return interactables;
}
