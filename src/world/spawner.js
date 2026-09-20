import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';
import { createCar, CAR_RADIUS } from '../entities/car.js';
import { createNpc, NPC_RADIUS } from '../entities/npc.js';
import { createTree, TREE_KINDS } from '../entities/tree.js';
import { createBuilding } from '../entities/building.js';
import { createMountain } from '../entities/mountain.js';
import { createProp } from '../entities/prop.js';
import { createCityGround } from './city-ground.js';
import { createRng, weighted } from '../core/rng.js';
import {
  BLOCK, ROAD_WIDTH, SIDEWALK_WIDTH, CELL, CITY_EXTENT, MOUNTAIN_RING, LAKE_RADIUS, SCENERY, SEED,
  QUARTER_SPAN,
  cityBlocks, plotIn, roadLines, parkBlock, lakeCentre,
  directionFromTangent, tangentFacing, nearestRoad, isInLake,
} from './city-plan.js';
import { markerPoint, markerAt, blockRef } from './markers.js';
import vehicles from '../data/vehicles.json';
import placements from '../data/placements.json';
import propDefs from '../data/props.json';
import npcDefs from '../data/npcs.json';
import buildingDefs from '../data/buildings.json';

const NPC_HEALTH = 30;
const PLACEMENT_ATTEMPTS = 24;

// Compass names you can use in placements.json instead of a raw direction.
const FACING = {
  north: { u: 0, v: 1 },
  south: { u: 0, v: -1 },
  east: { u: 1, v: 0 },
  west: { u: -1, v: 0 },
};

const UP = new THREE.Vector3(0, 1, 0);
const _facing = new THREE.Vector3();
const _right = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _probe = new THREE.Vector3();

const safehouseDef = buildingDefs.find((d) => d.id === 'safehouse');

// Explicit placements get their own generator, keyed off the marker, so adding
// one never shifts anything else in the town.
function markerSeed(code) {
  let hash = 0x811c9dc5;
  for (const char of code) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return (hash ^ SEED) >>> 0;
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

// Which building kinds a zone admits, and how common each is there.
function choicesFor(zone) {
  return buildingDefs
    .map((def) => [def, def.zones?.[zone] ?? 0])
    .filter(([, weight]) => weight > 0);
}

// Anything that can be asked for by name in placements.json.
function build(name, rng, look = {}) {
  const building = buildingDefs.find((d) => d.id === name);
  if (building) return { model: createBuilding(building, rng, look), type: 'building' };

  const prop = propDefs.find((d) => d.id === name);
  if (prop) return { model: createProp(prop, rng), type: 'prop' };

  if (TREE_KINDS.includes(name)) return { model: createTree(name, rng), type: 'tree' };
  return null;
}

// Scatters the extras a placement asks for around its main model, inside the
// lot: "a playground with 7 pines and 1 bush".
function spawnCompanions(worldPivot, placed, entry, spot, rng) {
  for (const companion of entry.with ?? []) {
    for (let n = 0; n < (companion.count ?? 1); n++) {
      const built = build(companion.place, rng, companion);
      if (!built) {
        console.warn(`placements: nothing called "${companion.place}" to put at ${entry.at}`);
        break;
      }
      const radius = built.model.userData.footprint ?? 1;

      for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
        const reach = QUARTER_SPAN / 2 - radius;
        if (reach <= 0) break;
        const u = spot.u + (rng() * 2 - 1) * reach;
        const v = spot.v + (rng() * 2 - 1) * reach;
        if (overlaps(placed, u, v, radius) || isInLake(u, v, radius)) continue;

        placeAt(built.model, u, v);
        built.model.userData.type = built.type;
        built.model.userData.id = `${companion.place}@${entry.at.toUpperCase()}_${n}`;
        built.model.userData.marker = entry.at.toUpperCase();
        worldPivot.add(built.model);
        remember(placed, u, v, radius);
        break;
      }
    }
  }
}

// Buildings and scenery asked for by marker in data/placements.json. These win:
// they go down before the filler, and the filler works around them.
function spawnPlacements(worldPivot, placed, taken) {
  for (const entry of placements) {
    const spot = markerPoint(entry.at);
    if (!spot) {
      console.warn(`placements: "${entry.at}" is not a marker in this city`);
      continue;
    }
    taken.add(entry.at.toUpperCase());
    if (entry.place === 'empty') continue;

    const rng = createRng(markerSeed(entry.at.toUpperCase()));
    const built = build(entry.place, rng, { walls: entry.walls, roof: entry.roof });

    if (!built) {
      console.warn(`placements: nothing called "${entry.place}" to put at ${entry.at}`);
      continue;
    }

    const { model, type } = built;
    const facing = entry.facing ?? nearestRoad(spot.u, spot.v).facing;
    placeAt(model, spot.u, spot.v, FACING[facing] ?? facing);
    model.userData.type = type;
    model.userData.id = `${entry.place}@${entry.at.toUpperCase()}`;
    model.userData.marker = entry.at.toUpperCase();
    worldPivot.add(model);
    remember(placed, spot.u, spot.v, model.userData.footprint ?? 1);

    spawnCompanions(worldPivot, placed, entry, spot, rng);
  }
}

function spawnBuildings(worldPivot, placed, rng, taken) {
  for (const block of cityBlocks()) {
    const choices = choicesFor(block.zone);
    if (!block.buildings || choices.length === 0) continue;

    // A block already holding placed buildings needs fewer filler ones.
    const ref = blockRef(block);
    const spoken = [...taken].filter((code) => code.startsWith(ref)).length;

    for (let n = 0; n < Math.max(0, block.buildings - spoken); n++) {
      const def = weighted(rng, choices);
      const building = createBuilding(def, rng);
      const radius = building.userData.footprint;

      for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
        const plot = plotIn(rng, block, radius);
        if (!plot || overlaps(placed, plot.u, plot.v, radius)) continue;

        if (taken.has(markerAt(plot.u, plot.v)?.code)) continue;

        placeAt(building, plot.u, plot.v, nearestRoad(plot.u, plot.v).facing);
        building.userData.type = 'building';
        building.userData.id = `${def.id}_${block.i}_${block.j}_${n}`;
        building.userData.zone = block.zone;
        worldPivot.add(building);
        remember(placed, plot.u, plot.v, radius);
        break;
      }
    }
  }
}

// Parked along the kerb, nose pointing down the street.
function spawnCars(worldPivot, placed, interactables, rng) {
  const lines = roadLines();
  for (let i = 0; i < SCENERY.cars; i++) {
    const line = lines[Math.floor(rng() * lines.length)];
    const along = (rng() * 2 - 1) * (CITY_EXTENT - CELL / 2);
    const side = rng() < 0.5 ? -1 : 1;
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

function spawnNpcs(worldPivot, placed, interactables, rng) {
  const lines = roadLines();
  for (const def of npcDefs) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const line = lines[Math.floor(rng() * lines.length)];
      const along = (rng() * 2 - 1) * (CITY_EXTENT - CELL / 2);
      const offset = (rng() < 0.5 ? -1 : 1) * (ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2);
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

function spawnTree(worldPivot, placed, u, v, rng) {
  const tree = createTree(null, rng);
  const radius = tree.userData.footprint;
  if (overlaps(placed, u, v, radius) || isInLake(u, v, radius + 1.5)) return false;
  placeAt(tree, u, v);
  tree.userData.type = 'tree';
  worldPivot.add(tree);
  remember(placed, u, v, radius);
  return true;
}

function spawnTrees(worldPivot, placed, rng) {
  // The park: dense planting around the lake.
  const park = parkBlock();
  if (park) {
    for (let i = 0; i < SCENERY.parkTrees; i++) {
      const angle = rng() * Math.PI * 2;
      const distance = LAKE_RADIUS + 2 + rng() * (BLOCK / 2 - LAKE_RADIUS - 3);
      spawnTree(worldPivot, placed, park.u + Math.cos(angle) * distance, park.v + Math.sin(angle) * distance, rng);
    }
  }

  // Gardens: scattered through the blocks, wherever a building isn't.
  const blocks = cityBlocks().filter((block) => !block.lake);
  for (let i = 0; i < SCENERY.gardenTrees; i++) {
    const block = blocks[Math.floor(rng() * blocks.length)];
    const plot = plotIn(rng, block, 2);
    if (plot) spawnTree(worldPivot, placed, plot.u, plot.v, rng);
  }
}

// A ring of peaks just outside the city, giving the little planet a horizon.
function spawnMountains(worldPivot, placed, rng) {
  const span = MOUNTAIN_RING.max - MOUNTAIN_RING.min;
  for (let i = 0; i < SCENERY.mountains; i++) {
    const mountain = createMountain(rng);
    const radius = mountain.userData.footprint;

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const angle = ((i + rng() * 0.8) / SCENERY.mountains) * Math.PI * 2;
      const distance = MOUNTAIN_RING.min + rng() * span;
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

// Builds the town described by data/city-map.json as children of worldPivot.
// Everything is drawn from a seeded generator, so the same map always produces
// exactly the same town. Returns the objects the player can interact with (the
// safehouse, cars, and quest-giving NPCs).
export function spawnAll(worldPivot) {
  const rng = createRng(SEED);
  const interactables = [];
  const placed = [];

  worldPivot.add(createCityGround());

  // The lake is water, not ground: an invisible collider keeps the player out of it.
  const shore = lakeCentre();
  if (shore) {
    const lake = new THREE.Object3D();
    placeAt(lake, shore.u, shore.v);
    lake.userData = { type: 'lake', id: 'lake', footprint: LAKE_RADIUS };
    worldPivot.add(lake);
    remember(placed, shore.u, shore.v, LAKE_RADIUS);
  }

  // The safehouse stands in the spawn block, straight ahead of the player.
  const safehouse = createBuilding(safehouseDef, rng);
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

  const taken = new Set();
  spawnPlacements(worldPivot, placed, taken);
  spawnBuildings(worldPivot, placed, rng, taken);
  spawnCars(worldPivot, placed, interactables, rng);
  spawnNpcs(worldPivot, placed, interactables, rng);
  spawnTrees(worldPivot, placed, rng);
  spawnMountains(worldPivot, placed, rng);

  return interactables;
}
