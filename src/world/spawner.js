import * as THREE from 'three';
import { GLOBE_RADIUS } from './planet.js';
import { elevation, slope, SEA_LEVEL } from './terrain.js';
import { createCar, CAR_RADIUS } from '../entities/car.js';
import { createNpc, NPC_RADIUS } from '../entities/npc.js';
import { createTree, TREE_KINDS } from '../entities/tree.js';
import { createBuilding } from '../entities/building.js';
import { createProp } from '../entities/prop.js';
import { createCityGround } from './city-ground.js';
import { createRng, weighted } from '../core/rng.js';
import {
  BLOCK, ROAD_WIDTH, SIDEWALK_WIDTH, ROCK_RING, LAKE_RADIUS, SCENERY, SEED,
  QUARTER_SPAN,
  cityBlocks, plotIn, kerbSpot, parkBlock, lakeCentre, isOnAvenue, isBuildable, isOnPavement,
  directionFromTangent, tangentFromDirection, tangentFacing, nearestRoad, isInLake,
} from './city-plan.js';
import { markerPoint, markerDirection, markerAt, markerUnder, blockRef, layoutFrom, spotIn } from './markers.js';
import vehicles from '../data/vehicles.json';
import placements from '../data/placements.json';
import propDefs from '../data/props.json';
import npcDefs from '../data/npcs.json';
import buildingDefs from '../data/buildings.json';

const NPC_HEALTH = 30;
const PLACEMENT_ATTEMPTS = 24;

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

// Stands a model on the globe at a direction, turned to look whichever way a
// tangent says. Everything placed goes through here, so nothing floats.
function placeOn(mesh, dir, facing) {
  mesh.position.copy(dir).multiplyScalar(GLOBE_RADIUS + elevation(dir));
  if (!facing) {
    mesh.quaternion.setFromUnitVectors(UP, dir);
    return;
  }
  _facing.copy(facing).addScaledVector(dir, -facing.dot(dir)).normalize();
  _right.copy(dir).cross(_facing).normalize();
  _basis.makeBasis(_right, dir, _facing);
  mesh.quaternion.setFromRotationMatrix(_basis);
}

// The same from a point on the flat map, which is how the town is laid out.
function placeAt(mesh, u, v, facing) {
  const dir = directionFromTangent(u, v);
  mesh.position.copy(dir).multiplyScalar(GLOBE_RADIUS + elevation(dir));
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

  const vehicle = vehicleDef(name);
  if (vehicle) {
    const car = createCar(vehicle);
    car.userData.footprint = CAR_RADIUS;
    car.userData.def = vehicle;
    return { model: car, type: 'car' };
  }

  const npc = npcDefs.find((d) => d.id === name);
  if (npc) {
    const person = createNpc(npc);
    person.userData.footprint = NPC_RADIUS;
    person.userData.def = npc;
    person.userData.health = NPC_HEALTH;
    return { model: person, type: 'npc' };
  }
  return null;
}

// "car" on its own means whatever car the town uses.
function vehicleDef(name) {
  if (name === 'car') return vehicles[0];
  return vehicles.find((d) => d.id === name) ?? null;
}

// ---------------------------------------------------------------------------
// Placements: what data/placements.json asks for, exactly where it asks.
//
// A placement can be dropped on a marker and left at that, or laid out to the
// metre: `offset` moves it east and north of the marker, `facing` turns it,
// and `repeat` copies it along one or two directions — which is how four
// parallel blocks of flats, their parking courts and the cars in them are one
// entry each rather than eighty.
//
// East and north are read off the grid where the marker stands, so a layout
// means the same thing anywhere on the planet.


// The tangent a compass name points along at a spot in a layout. Read off the
// layout's own frame, so every block in an estate faces the same way even
// where the estate runs onto the next face of the grid.
function facingTangent(spot, facing) {
  if (!facing) return null;
  switch (facing) {
    case 'north': return spot.north.clone();
    case 'south': return spot.north.clone().negate();
    case 'east': return spot.east.clone();
    case 'west': return spot.east.clone().negate();
    default: return null;
  }
}

// Every copy a `repeat` asks for, as offsets from the entry's own spot. One
// step makes a row; two make a grid.
function copies(repeat) {
  const axes = [].concat(repeat ?? []).filter(Boolean);
  let spots = [[0, 0]];
  for (const axis of axes) {
    const [east = 0, north = 0] = axis.step ?? [];
    const next = [];
    for (const [e, n] of spots) {
      for (let c = 0; c < (axis.count ?? 1); c++) next.push([e + east * c, n + north * c]);
    }
    spots = next;
  }
  return spots;
}

// One model, built and stood on the globe.
function put(worldPivot, placed, interactables, { model, type }, spot, facing, id, marker, group) {
  const radius = model.userData.footprint ?? 1;
  const dir = spot.dir;
  placeOn(model, dir, facingTangent(spot, facing));
  model.userData.type = type;
  model.userData.id = id;
  model.userData.marker = marker;
  // Pieces of one hand-placed run: a long block is a row of sections that
  // overlap on purpose, so they are allowed to.
  if (group) model.userData.group = group;
  worldPivot.add(model);
  placed.push({ dir: dir.clone(), radius });
  if (type === 'car' || type === 'npc') interactables.push(model);
  return model;
}

// A placement's extras: either laid out exactly, like the main model, or
// scattered around it inside the lot — "a playground with 7 pines and 1 bush".
function spawnCompanions(worldPivot, placed, interactables, entry, home, rng, taken) {
  (entry.with ?? []).forEach((companion, index) => {
    const exact = companion.offset || companion.repeat;
    const count = exact ? 1 : (companion.count ?? 1);

    for (let n = 0; n < count; n++) {
      if (exact) {
        spawnLayout(worldPivot, placed, interactables, companion, home, rng, taken,
          `${entry.at}_${index}_${companion.place}`);
        continue;
      }

      const built = build(companion.place, rng, companion);
      if (!built) {
        console.warn(`placements: nothing called "${companion.place}" to put at ${entry.at}`);
        break;
      }
      const radius = built.model.userData.footprint ?? 1;

      for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
        const reach = QUARTER_SPAN / 2 - radius;
        if (reach <= 0) break;
        const spot = spotIn(home, (rng() * 2 - 1) * reach, (rng() * 2 - 1) * reach);
        const { u, v } = tangentFromDirection(spot.dir);
        if (overlaps(placed, u, v, radius) || isInLake(u, v, radius)) continue;

        put(worldPivot, placed, interactables, built, spot, companion.facing,
          `${companion.place}@${entry.at.toUpperCase()}_${n}`, entry.at.toUpperCase());
        break;
      }
    }
  });
}

// Lays a thing out from a marker: offset, turned, and repeated as asked.
function spawnLayout(worldPivot, placed, interactables, entry, home, rng, taken, label) {
  const [east = 0, north = 0] = entry.offset ?? [];
  let made = 0;

  for (const [stepEast, stepNorth] of copies(entry.repeat)) {
    const spot = spotIn(home, east + stepEast, north + stepNorth);
    const built = build(entry.place, rng, entry);
    if (!built) {
      console.warn(`placements: nothing called "${entry.place}" to put at ${entry.at ?? label}`);
      return 0;
    }
    const where = markerUnder(spot.dir);
    taken?.add(where.code);
    put(worldPivot, placed, interactables, built, spot, entry.facing, `${label}_${made}`, where.code, label);
    made++;
  }
  return made;
}

// Buildings and scenery asked for by marker in data/placements.json. These win:
// they go down before the filler, and the filler works around them.
function spawnPlacements(worldPivot, placed, interactables, taken) {
  for (const entry of placements) {
    const anchor = markerDirection(entry.at);
    const home = anchor && layoutFrom(anchor);
    if (!home) {
      console.warn(`placements: "${entry.at}" is not a marker on this planet`);
      continue;
    }
    const marker = markerUnder(anchor).code;
    taken.add(marker);
    if (entry.place === 'empty') continue;

    const rng = createRng(markerSeed(marker));

    if (entry.offset || entry.repeat) {
      spawnLayout(worldPivot, placed, interactables, entry, home, rng, taken, `${entry.place}@${marker}`);
    } else {
      const built = build(entry.place, rng, { walls: entry.walls, roof: entry.roof });
      if (!built) {
        console.warn(`placements: nothing called "${entry.place}" to put at ${entry.at}`);
        continue;
      }
      const { u, v } = tangentFromDirection(anchor);
      const facing = entry.facing ?? null;
      if (facing) {
        put(worldPivot, placed, interactables, built, spotIn(home, 0, 0), facing, `${entry.place}@${marker}`, marker);
      } else {
        // No facing asked for: front it onto the nearest street.
        placeAt(built.model, u, v, nearestRoad(u, v)?.facing ?? { u: 0, v: 1 });
        built.model.userData.type = built.type;
        built.model.userData.id = `${entry.place}@${marker}`;
        built.model.userData.marker = marker;
        worldPivot.add(built.model);
        remember(placed, u, v, built.model.userData.footprint ?? 1);
        if (built.type === 'car' || built.type === 'npc') interactables.push(built.model);
      }
    }

    spawnCompanions(worldPivot, placed, interactables, entry, home, rng, taken);
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
  for (let i = 0; i < SCENERY.cars; i++) {
    const { u, v, facing } = kerbSpot(rng, ROAD_WIDTH / 2 - 1.3);
    if (overlaps(placed, u, v, CAR_RADIUS) || isInLake(u, v, CAR_RADIUS)) continue;
    if (!isBuildable(u, v)) continue;

    const def = vehicles[i % vehicles.length];
    const car = createCar(def);
    placeAt(car, u, v, facing);
    car.userData = { type: 'car', id: `${def.id}_${i}`, def, footprint: CAR_RADIUS };
    worldPivot.add(car);
    remember(placed, u, v, CAR_RADIUS);
    interactables.push(car);
  }
}

function spawnNpcs(worldPivot, placed, interactables, rng) {
  for (const def of npcDefs) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const { u, v } = kerbSpot(rng, ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2);
      if (overlaps(placed, u, v, NPC_RADIUS) || isInLake(u, v, NPC_RADIUS)) continue;
      if (!isBuildable(u, v)) continue;

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
  if (!isBuildable(u, v)) return false;
  // Trees go where the plan leaves room, and an avenue crossing the park is
  // still a street.
  if (isOnAvenue(u, v, radius)) return false;
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

// Loose rock, where the land is steep or high enough to break through the
// turf. The mountains are the land itself now, so nothing is standing cones on
// a sphere any more: this is the detail on top of them.
function spawnRocks(worldPivot, placed, rng) {
  const span = ROCK_RING.max - ROCK_RING.min;
  for (let i = 0; i < SCENERY.rocks; i++) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const angle = rng() * Math.PI * 2;
      const distance = ROCK_RING.min + rng() * span;
      const u = Math.cos(angle) * distance;
      const v = Math.sin(angle) * distance;
      const dir = directionFromTangent(u, v, _probe).clone();

      const height = elevation(dir);
      const steep = slope(dir);
      if (height < SEA_LEVEL + 1) continue;          // not in the sea
      if (steep < 0.22 && height < 16) continue;     // only where the land breaks up
      if (isOnPavement(u, v)) continue;

      const big = steep > 0.45 || height > 24;
      const def = propDefs.find((d) => d.id === (big ? 'crag' : 'rock'));
      const rock = createProp(def, rng);
      const radius = rock.userData.footprint;
      if (overlaps(placed, u, v, radius)) continue;

      placeAt(rock, u, v);
      rock.userData.type = 'rock';
      rock.userData.id = `${def.id}_${i}`;
      worldPivot.add(rock);
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
  spawnPlacements(worldPivot, placed, interactables, taken);
  spawnBuildings(worldPivot, placed, rng, taken);
  spawnCars(worldPivot, placed, interactables, rng);
  spawnNpcs(worldPivot, placed, interactables, rng);
  spawnTrees(worldPivot, placed, rng);
  spawnRocks(worldPivot, placed, rng);

  return interactables;
}
