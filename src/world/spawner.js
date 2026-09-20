import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLOBE_RADIUS } from './planet.js';
import { createCar, CAR_RADIUS } from '../entities/car.js';
import { createNpc, NPC_RADIUS } from '../entities/npc.js';
import { createTree, TREE_KINDS } from '../entities/tree.js';
import { createBuilding } from '../entities/building.js';
import { createProp } from '../entities/prop.js';
import { createCityGround } from './city-ground.js';
import { createRng, weighted } from '../core/rng.js';
import { elevation, SEA_LEVEL, slope } from './terrain.js';
import { biomeAt } from './biome.js';
import { grid } from './grid.js';
import {
  ROAD_WIDTH, SIDEWALK_WIDTH, QUARTER_SPAN, SCENERY, SEED, LAKE_RADIUS, ROCK_RING, CITY_EXTENT,
  allBlocks, plotIn, kerbSpot, blockCentre, lakeCentre, isInLake, isBuildable, isOnStreetAt,
  nearestStreet, streetUnder, chartFor, chartUnder, directionFromTangent, tangentFromDirection, tangentFacing,
} from './city-plan.js';
import { markerDirection, markerUnder, blockRef, layoutFrom, spotIn } from './markers.js';
import vehicles from '../data/vehicles.json';
import placements from '../data/placements.json';
import propDefs from '../data/props.json';
import npcDefs from '../data/npcs.json';
import buildingDefs from '../data/buildings.json';

// Builds the world: every block on the planet, dressed the way the map says.
//
// The city map gives each block a zone (what gets built there) and a list of
// what dresses it — how many trees, which props. Buildings are placed one by
// one because each is a landmark and something to walk into; the scenery is
// merged into one mesh per material per block, because a planet's worth of
// trees is tens of thousands of draw calls otherwise. What is merged still
// gets a marker of its own so it can be collided with and counted.

const NPC_HEALTH = 30;
const PLACEMENT_ATTEMPTS = 20;

const UP = new THREE.Vector3(0, 1, 0);
const _facing = new THREE.Vector3();
const _right = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _probe = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

const safehouseDef = buildingDefs.find((d) => d.id === 'safehouse');
const propById = (id) => propDefs.find((d) => d.id === id);

// Which tree grows in which country, when the map does not say.
const TREES_BY_BIOME = {
  city: ['oak', 'birch', 'bush'],
  beach: ['palm', 'bush'],
  desert: ['cactus'],
  forest: ['pine', 'pine', 'oak', 'birch'],
  meadow: ['oak', 'birch', 'bush', 'pine'],
};

// Explicit placements get their own generator, keyed off the marker, so adding
// one never shifts anything else in the town.
function markerSeed(code) {
  let hash = 0x811c9dc5;
  for (const char of code) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return (hash ^ SEED) >>> 0;
}

// --- standing things on the ground ------------------------------------------

// Stands a model at a direction, turned to look whichever way a tangent says.
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

// The same from a point on the player's own flat map, which is how the things
// around the spawn are placed.
function placeAt(mesh, u, v, facing) {
  const dir = directionFromTangent(u, v);
  placeOn(mesh, dir, facing ? tangentFacing(u, v, facing, _probe).clone() : null);
}

// Which way to face to look at the nearest street, as a tangent.
function facingStreet(faceId, u, v, chart) {
  const street = nearestStreet(faceId, u, v);
  if (!street) return null;
  const here = chart.direction(u, v, new THREE.Vector3());
  const towards = chart.direction(u + street.facing.u * 2, v + street.facing.v * 2, new THREE.Vector3());
  return towards.sub(here).addScaledVector(here, -towards.dot(here)).normalize();
}

// Measured on the sphere: the flat maps stretch, so flat distances would let
// things overlap for real.
function overlaps(placed, dir, radius) {
  for (const other of placed) {
    if (dir.angleTo(other.dir) * GLOBE_RADIUS < radius + other.radius) return true;
  }
  return false;
}

function remember(placed, dir, radius) {
  placed.push({ dir: dir.clone(), radius });
}

// --- merged scenery ----------------------------------------------------------

// Trees and props are stamped into one geometry per material. Each still gets
// an empty marker at its own spot, which costs nothing to draw but keeps it
// collidable, countable and testable.
function createScenery(worldPivot) {
  const batches = new Map();

  return {
    add(model, dir, facing, { type, id, footprint }) {
      placeOn(model, dir, facing);
      model.updateMatrixWorld(true);

      model.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const geometry = child.geometry.clone().applyMatrix4(child.matrixWorld);
        for (const material of materials) {
          if (!batches.has(material)) batches.set(material, []);
        }
        // Scenery models are one material each; anything fancier goes in whole.
        batches.get(materials[0]).push(geometry);
      });

      const marker = new THREE.Object3D();
      marker.position.copy(model.position);
      marker.quaternion.copy(model.quaternion);
      marker.userData = { type, id, footprint, merged: true };
      worldPivot.add(marker);
      return marker;
    },

    finish() {
      for (const [material, geometries] of batches) {
        if (!geometries.length) continue;
        const merged = mergeGeometries(geometries, false);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = 'scenery';
        worldPivot.add(mesh);
        for (const geometry of geometries) geometry.dispose();
      }
      batches.clear();
    },
  };
}

// --- what goes on a block ----------------------------------------------------

function choicesFor(zone) {
  return buildingDefs
    .map((def) => [def, def.zones?.[zone] ?? 0])
    .filter(([, weight]) => weight > 0);
}

// Anything that can be asked for by name in placements.json.
function build(name, rng, look = {}) {
  const building = buildingDefs.find((d) => d.id === name);
  if (building) return { model: createBuilding(building, rng, look), type: 'building' };

  const prop = propById(name);
  if (prop) return { model: createProp(prop, rng), type: 'prop' };

  if (TREE_KINDS.includes(name)) return { model: createTree(name, rng), type: 'tree' };

  const vehicle = name === 'car' ? vehicles[0] : vehicles.find((d) => d.id === name);
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

// The buildings of one block, fronting whatever street is nearest.
function fillBuildings(worldPivot, placed, block, rng, taken) {
  const choices = choicesFor(block.zone);
  if (!block.buildings || !choices.length) return;

  const ref = blockRef(block);
  const spoken = [...taken].filter((code) => code.startsWith(ref)).length;

  for (let n = 0; n < Math.max(0, block.buildings - spoken); n++) {
    const def = weighted(rng, choices);
    const building = createBuilding(def, rng);
    const radius = building.userData.footprint;

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const plot = plotIn(rng, block, radius);
      if (!plot || overlaps(placed, plot.dir, radius)) continue;
      if (taken.has(markerUnder(plot.dir).code)) continue;

      placeOn(building, plot.dir, facingStreet(block.faceId, plot.u, plot.v, plot.chart));
      building.userData.type = 'building';
      building.userData.id = `${def.id}_${block.faceId}${block.column}${block.row}_${n}`;
      building.userData.zone = block.zone;
      worldPivot.add(building);
      remember(placed, plot.dir, radius);
      break;
    }
  }
}

// The trees and props that dress a block.
function dressBlock(scenery, placed, block, rng) {
  const chart = chartFor(block.faceId);
  const kinds = block.treeKinds ?? TREES_BY_BIOME[block.biome] ?? TREES_BY_BIOME.meadow;

  const spotFor = (radius, keepOffStreet) => {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const centre = grid.cellAngles(block.column, block.row);
      const half = grid.step / 2 - radius / GLOBE_RADIUS;
      const dir = grid.direction(
        block.faceId,
        centre.a + (rng() * 2 - 1) * half,
        centre.b + (rng() * 2 - 1) * half
      );
      const { u, v } = chart.local(dir);
      if (keepOffStreet && isOnStreetAt(dir, radius)) continue;
      if (elevation(dir) < SEA_LEVEL + 1 || slope(dir) > 0.55) continue;
      if (isInLake(dir, radius)) continue;
      if (overlaps(placed, dir, radius)) continue;
      return { dir, u, v };
    }
    return null;
  };

  for (let n = 0; n < (block.trees ?? 0); n++) {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const tree = createTree(kind, rng);
    const radius = tree.userData.footprint;
    const spot = spotFor(radius, true);
    if (!spot) continue;
    scenery.add(tree, spot.dir, null, {
      type: 'tree', id: `${kind}_${block.faceId}${block.column}${block.row}_${n}`, footprint: radius,
    });
    remember(placed, spot.dir, radius);
  }

  for (const [name, count] of Object.entries(block.props ?? {})) {
    const def = propById(name);
    if (!def) continue;
    for (let n = 0; n < count; n++) {
      const prop = createProp(def, rng);
      const radius = Math.max(0.6, prop.userData.footprint ?? 1);
      const spot = spotFor(radius, true);
      if (!spot) continue;
      scenery.add(prop, spot.dir, facingStreet(block.faceId, spot.u, spot.v, chart), {
        type: 'prop', id: `${name}_${block.faceId}${block.column}${block.row}_${n}`, footprint: radius,
      });
      remember(placed, spot.dir, radius);
    }
  }
}

// --- traffic and people ------------------------------------------------------

function spawnTraffic(worldPivot, placed, interactables, rng) {
  for (let i = 0; i < SCENERY.cars; i++) {
    const spot = kerbSpot(rng, ROAD_WIDTH / 2 - 1.3);
    if (!spot) continue;
    const dir = spot.chart.direction(spot.u, spot.v, new THREE.Vector3());
    if (overlaps(placed, dir, CAR_RADIUS) || !isBuildable(dir)) continue;

    const def = vehicles[i % vehicles.length];
    const car = createCar(def);
    const facing = spot.chart.direction(spot.u + spot.facing.u * 2, spot.v + spot.facing.v * 2, new THREE.Vector3())
      .sub(dir).normalize();
    placeOn(car, dir, facing);
    car.userData = { type: 'car', id: `${def.id}_${i}`, def, footprint: CAR_RADIUS };
    worldPivot.add(car);
    remember(placed, dir, CAR_RADIUS);
    interactables.push(car);
  }
}

function spawnPeople(worldPivot, placed, interactables, rng) {
  const people = SCENERY.people ?? npcDefs.length;
  for (let i = 0; i < people; i++) {
    const def = npcDefs[i % npcDefs.length];
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const spot = kerbSpot(rng, ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2);
      if (!spot) break;
      const dir = spot.chart.direction(spot.u, spot.v, new THREE.Vector3());
      if (overlaps(placed, dir, NPC_RADIUS) || !isBuildable(dir)) continue;

      const npc = createNpc(def);
      placeOn(npc, dir, null);
      npc.userData = { type: 'npc', id: `${def.id}_${i}`, def, health: NPC_HEALTH, footprint: NPC_RADIUS };
      worldPivot.add(npc);
      remember(placed, dir, NPC_RADIUS);
      interactables.push(npc);
      break;
    }
  }
}

// Loose rock, where the land is steep or high enough to break through the turf.
// Would this stand in the road? A hand-placed layout is authored to the metre
// and left alone — an estate has its own lane — but anything scattered has to
// keep out of the traffic, whichever face of the planet it lands on.
function blocksTraffic(dir, radius) {
  const street = streetUnder(dir);
  return street ? street.distance < street.width / 2 + radius + 0.5 : false;
}

function spawnRocks(scenery, placed, rng) {
  const span = ROCK_RING.max - ROCK_RING.min;
  for (let i = 0; i < SCENERY.rocks; i++) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const angle = rng() * Math.PI * 2;
      const distance = ROCK_RING.min + rng() * span;
      const dir = directionFromTangent(Math.cos(angle) * distance, Math.sin(angle) * distance).clone();

      const height = elevation(dir);
      const steep = slope(dir);
      if (height < SEA_LEVEL + 1) continue;
      if (steep < 0.22 && height < 16) continue;

      const big = steep > 0.45 || height > 24;
      const def = propById(big ? 'crag' : 'rock');
      const rock = createProp(def, rng);
      const radius = rock.userData.footprint;
      if (overlaps(placed, dir, radius)) continue;
      if (blocksTraffic(dir, radius)) continue;   // no boulders in the road

      scenery.add(rock, dir, null, { type: 'rock', id: `${def.id}_${i}`, footprint: radius });
      remember(placed, dir, radius);
      break;
    }
  }
}

// --- placements: what data/placements.json asks for, exactly where -----------

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

function put(worldPivot, placed, interactables, { model, type }, spot, facing, id, marker, group) {
  const radius = model.userData.footprint ?? 1;
  placeOn(model, spot.dir, facingTangent(spot, facing));
  model.userData.type = type;
  model.userData.id = id;
  model.userData.marker = marker;
  // Pieces of one hand-placed run: a long block is a row of sections that
  // overlap on purpose, so they are allowed to.
  if (group) model.userData.group = group;
  worldPivot.add(model);
  placed.push({ dir: spot.dir.clone(), radius });
  if (type === 'car' || type === 'npc') interactables.push(model);
  return model;
}

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
    taken?.add(markerUnder(spot.dir).code);
    put(worldPivot, placed, interactables, built, spot, entry.facing, `${label}_${made}`,
      markerUnder(spot.dir).code, label);
    made++;
  }
  return made;
}

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
        if (overlaps(placed, spot.dir, radius) || isInLake(spot.dir, radius)) continue;
        if (blocksTraffic(spot.dir, radius)) continue;
        put(worldPivot, placed, interactables, built, spot, companion.facing,
          `${companion.place}@${entry.at.toUpperCase()}_${n}`, entry.at.toUpperCase());
        break;
      }
    }
  });
}

function spawnPlacements(worldPivot, placed, interactables, taken) {
  for (const entry of placements) {
    const anchor = markerDirection(entry.at);
    if (!anchor) {
      console.warn(`placements: "${entry.at}" is not a marker on this planet`);
      continue;
    }
    const home = layoutFrom(anchor);
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
      const spot = spotIn(home, 0, 0);
      const chart = chartFor(markerUnder(anchor).faceId);
      const local = chart.local(anchor);
      const facing = entry.facing
        ? facingTangent(spot, entry.facing)
        : facingStreet(markerUnder(anchor).faceId, local.u, local.v, chart);
      const { model, type } = built;
      placeOn(model, anchor, facing);
      model.userData.type = type;
      model.userData.id = `${entry.place}@${marker}`;
      model.userData.marker = marker;
      worldPivot.add(model);
      remember(placed, anchor, model.userData.footprint ?? 1);
      if (type === 'car' || type === 'npc') interactables.push(model);
    }

    spawnCompanions(worldPivot, placed, interactables, entry, home, rng, taken);
  }
}

// --- the world ---------------------------------------------------------------

// Builds the planet described by data/city-map.json as children of worldPivot.
// Everything is drawn from a seeded generator, so the same map always produces
// exactly the same world. Returns what the player can interact with.
export function spawnAll(worldPivot) {
  const rng = createRng(SEED);
  const interactables = [];
  const placed = [];
  const scenery = createScenery(worldPivot);

  worldPivot.add(createCityGround());

  // The lake is water, not ground: an invisible collider keeps the player out.
  const shore = lakeCentre();
  if (shore) {
    const lake = new THREE.Object3D();
    placeOn(lake, shore, null);
    lake.userData = { type: 'lake', id: 'lake', footprint: LAKE_RADIUS };
    worldPivot.add(lake);
    remember(placed, shore, LAKE_RADIUS);
  }

  // The safehouse stands in the spawn block, ahead of the player and set back
  // off the corner: the player starts on the verge of a junction, so going
  // straight south would put the house's flank in the road running east.
  const safehouse = createBuilding(safehouseDef, rng);
  const safehouseRadius = safehouse.userData.footprint;
  const setBack = safehouseRadius + 10;
  placeAt(safehouse, -setBack, -setBack, { u: 0, v: 1 });
  safehouse.userData.type = 'safehouse';
  safehouse.userData.id = 'safehouse';
  worldPivot.add(safehouse);
  remember(placed, directionFromTangent(-setBack, -setBack), safehouseRadius);
  interactables.push(safehouse);

  const taken = new Set();
  spawnPlacements(worldPivot, placed, interactables, taken);

  for (const block of allBlocks()) {
    fillBuildings(worldPivot, placed, block, rng, taken);
    dressBlock(scenery, placed, block, rng);
  }

  spawnRocks(scenery, placed, rng);
  spawnTraffic(worldPivot, placed, interactables, rng);
  spawnPeople(worldPivot, placed, interactables, rng);
  scenery.finish();

  return interactables;
}
