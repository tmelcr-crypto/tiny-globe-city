import * as THREE from 'three';
import { GLOBE_RADIUS } from './planet.js';
import { grid, CELL, BLOCK, QUARTER_SPAN, ROAD_WIDTH, SIDEWALK_WIDTH, VERGE, CORNER_RADIUS, SPAWN_BLOCK } from './grid.js';
import { chartFor, chartUnder } from './chart.js';
import { SEED, SCENERY, DIVISIONS, allBlocks, blocksOfZone, blockAt } from './city-map.js';
import { elevation, SEA_LEVEL, slope } from './terrain.js';
import {
  streets, streetsOn, streetProfiles, settleStructures, junctionsOn,
  nearestStreet, streetUnder, isOnPavement, isOnStreet, isOnStreetAt, kerbSpot, MAX_GRADE,
} from './streets.js';
import { TOWN_FACE } from './sphere-grid.js';

// The plan of the world: what is where, and how to get from a place on the
// ground to a point in space.
//
// The parts of it live in their own modules now — the map (city-map.js), the
// grid the planet is divided by (grid.js), a flat map per face (chart.js), the
// street network (streets.js) and the shape of the land (terrain.js). This
// module ties them together and keeps what belongs to no one else: the
// player's own view of the world, and the odd things a town has.

export { SEED, SCENERY, DIVISIONS, allBlocks, blocksOfZone, blockAt };
export { grid, CELL, BLOCK, QUARTER_SPAN, ROAD_WIDTH, SIDEWALK_WIDTH, VERGE, CORNER_RADIUS, SPAWN_BLOCK };
export { chartFor, chartUnder };
export {
  streets, streetsOn, streetProfiles, settleStructures, junctionsOn,
  nearestStreet, streetUnder, isOnPavement, isOnStreet, isOnStreetAt, kerbSpot, MAX_GRADE,
};

export const LAKE_RADIUS = SCENERY.lakeRadius;
export const ROCK_RING = { min: SCENERY.rockRing[0], max: SCENERY.rockRing[1] };

export const ROAD_LIFT = 0.35;
export const SIDEWALK_LIFT = 0.52;
export const GROUND_LIFT = 0.25;

const _probe = new THREE.Vector3();
const _dir = new THREE.Vector3();

// ---------------------------------------------------------------------------
// The player's own flat map: distances and bearings from where they stand,
// which is the top of the globe. Everything near the player — the safehouse,
// the ring of rock around the town, the lake — is easiest to say this way.

export function directionFromTangent(u, v, target = new THREE.Vector3()) {
  const distance = Math.hypot(u, v);
  if (distance < 1e-9) return target.set(0, 1, 0);
  const theta = distance / GLOBE_RADIUS;
  const sin = Math.sin(theta);
  return target.set((u / distance) * sin, Math.cos(theta), (v / distance) * sin);
}

export function tangentFromDirection(dir) {
  const y = Math.min(1, Math.max(-1, dir.y / dir.length()));
  const distance = Math.acos(y) * GLOBE_RADIUS;
  const flat = Math.hypot(dir.x, dir.z);
  if (flat < 1e-9) return { u: 0, v: 0 };
  return { u: (dir.x / flat) * distance, v: (dir.z / flat) * distance };
}

// A point on the ground, wherever the land happens to be there.
export function surfacePoint(u, v, lift = 0, target = new THREE.Vector3()) {
  directionFromTangent(u, v, target);
  return target.multiplyScalar(GLOBE_RADIUS + elevation(target) + lift);
}

// The world-space tangent direction that a point on the map faces. Used to aim
// buildings and cars along the street.
export function tangentFacing(u, v, facing, target = new THREE.Vector3()) {
  const here = directionFromTangent(u, v, _dir).clone();
  directionFromTangent(u + facing.u * 0.5, v + facing.v * 0.5, target);
  target.sub(here);
  target.addScaledVector(here, -target.dot(here));
  return target.normalize();
}

// ---------------------------------------------------------------------------
// Blocks and plots.

// The middle of a block, as a direction on the globe.
export function blockCentre(block, target = new THREE.Vector3()) {
  const { a, b } = grid.cellAngles(block.column, block.row);
  return grid.direction(block.faceId, a, b, target);
}

// The same, on that block's own flat map.
export function blockPoint(block) {
  return chartFor(block.faceId).local(blockCentre(block, _probe));
}

// Ground you can build on: out of the water, and not down the side of a hill.
export function isBuildable(direction) {
  return elevation(direction) > SEA_LEVEL + 1.5 && slope(direction) < 0.38;
}

// A buildable spot inside a block, picked in angles across the cell so it is
// inside the block however the cell is shaped. Returns the spot on the block's
// own map, and the direction it stands at.
export function plotIn(rng, block, footprint) {
  const chart = chartFor(block.faceId);
  const margin = (footprint + ROAD_WIDTH / 2 + SIDEWALK_WIDTH + 1) / GLOBE_RADIUS;
  const half = grid.step / 2 - margin;
  if (half <= 0) return null;

  const centre = grid.cellAngles(block.column, block.row);
  const dir = grid.direction(
    block.faceId,
    centre.a + (rng() * 2 - 1) * half,
    centre.b + (rng() * 2 - 1) * half
  );
  const { u, v } = chart.local(dir);
  if (isOnStreetAt(dir, footprint + 1)) return null;
  if (isInLake(dir, footprint + 2)) return null;
  if (!isBuildable(dir)) return null;
  return { u, v, dir, chart, faceId: block.faceId };
}

// ---------------------------------------------------------------------------
// The park lake: the one piece of water that is placed rather than found.

let lake = null;
function lakeBlock() {
  if (lake === null) lake = allBlocks().find((block) => block.lake) ?? false;
  return lake;
}

export function lakeCentre(target = new THREE.Vector3()) {
  const block = lakeBlock();
  return block ? blockCentre(block, target) : null;
}

export function parkBlock() {
  return lakeBlock() || null;
}

export function isInLake(direction, margin = 0) {
  const block = lakeBlock();
  if (!block) return false;
  return blockCentre(block, _probe).angleTo(direction) * GLOBE_RADIUS < LAKE_RADIUS + margin;
}

// How far the town reaches from the player, for the rock to ring it.
export const CITY_EXTENT = (() => {
  let furthest = 0;
  for (const block of allBlocks()) {
    if (block.faceId !== TOWN_FACE) continue;
    const point = tangentFromDirection(blockCentre(block, _probe));
    furthest = Math.max(furthest, Math.hypot(point.u, point.v));
  }
  return furthest + CELL;
})();
