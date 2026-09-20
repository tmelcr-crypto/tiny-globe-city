import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';
import cityMap from '../data/city-map.json';

// The town is authored in data/city-map.json: one character per block, read
// north-to-south and west-to-east. This module turns that map into coordinates.
// The city is planned on a flat map in metres, centred on the player's spawn
// point, then wrapped onto the globe. u runs east, v runs north; the player
// faces -v, so they look south down the map.

export const SEED = cityMap.seed;
export const BLOCK = cityMap.street.block;
export const ROAD_WIDTH = cityMap.street.road;
export const SIDEWALK_WIDTH = cityMap.street.sidewalk;
export const VERGE = cityMap.street.verge;
export const CELL = BLOCK + ROAD_WIDTH;
export const SCENERY = cityMap.scenery;
export const LAKE_RADIUS = SCENERY.lakeRadius;
export const MOUNTAIN_RING = { min: SCENERY.mountainRing[0], max: SCENERY.mountainRing[1] };

export const ROAD_LIFT = 0.03;
export const SIDEWALK_LIFT = 0.1;
export const GROUND_LIFT = 0.02;

const GRID = cityMap.rows.map((row) => row.split(' ').filter(Boolean));
const ROWS = GRID.length;
const COLS = GRID[0].length;

// Row 0 is the north edge of the map, column 0 the west edge.
function indexOf(row, col) {
  return { i: col - Math.floor(COLS / 2), j: -Math.floor(ROWS / 2) + (ROWS - 1 - row) };
}

function legendFor(row, col) {
  const key = GRID[row][col];
  const entry = cityMap.legend[key];
  if (!entry) throw new Error(`city-map: no legend entry for "${key}"`);
  return entry;
}

function findSpawn() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (legendFor(row, col).spawn) return indexOf(row, col);
    }
  }
  throw new Error('city-map: no block marked as the spawn (@)');
}

export const SPAWN_BLOCK = findSpawn();

// The grid is shifted so the player spawns on the verge inside the spawn block,
// just off the corner — not stranded mid-junction and not inside a building.
const CORNER_INSET = ROAD_WIDTH / 2 + SIDEWALK_WIDTH + VERGE;
const OFFSET = {
  u: CORNER_INSET - (SPAWN_BLOCK.i + 1) * CELL,
  v: CORNER_INSET - (SPAWN_BLOCK.j + 1) * CELL,
};

export const CITY_EXTENT =
  Math.max(COLS, ROWS) * CELL + BLOCK / 2 + Math.max(Math.abs(OFFSET.u), Math.abs(OFFSET.v));

const _dir = new THREE.Vector3();

// Centre of a road, per axis.
export function roadU(i) {
  return i * CELL + OFFSET.u;
}
export function roadV(j) {
  return j * CELL + OFFSET.v;
}

// Centre of the block with the given indices — the square between two roads.
export function blockCentre({ i, j }) {
  return { u: roadU(i) + CELL / 2, v: roadV(j) + CELL / 2 };
}

// Every block the map declares, with the zone it was assigned.
export function cityBlocks() {
  const blocks = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const entry = legendFor(row, col);
      const index = indexOf(row, col);
      blocks.push({ ...index, ...blockCentre(index), ...entry });
    }
  }
  return blocks;
}

export function parkBlock() {
  return cityBlocks().find((block) => block.lake) ?? null;
}

export function lakeCentre() {
  const park = parkBlock();
  return park ? { u: park.u, v: park.v } : null;
}

export function isInLake(u, v, margin = 0) {
  const centre = lakeCentre();
  if (!centre) return false;
  return Math.hypot(u - centre.u, v - centre.v) < LAKE_RADIUS + margin;
}

// Where a point on the flat map lands on the globe.
export function directionFromTangent(u, v, target = new THREE.Vector3()) {
  const distance = Math.hypot(u, v);
  if (distance < 1e-9) return target.set(0, 1, 0);
  const theta = distance / GLOBE_RADIUS;
  const sin = Math.sin(theta);
  return target.set((u / distance) * sin, Math.cos(theta), (v / distance) * sin);
}

export function surfacePoint(u, v, lift = 0, target = new THREE.Vector3()) {
  return directionFromTangent(u, v, target).multiplyScalar(GLOBE_RADIUS + lift);
}

// Road centrelines, as straight runs across the city on the flat map.
export function roadLines() {
  const halfCols = Math.floor(COLS / 2);
  const halfRows = Math.floor(ROWS / 2);
  const fromU = roadU(-halfCols) - BLOCK / 2;
  const toU = roadU(COLS - halfCols) + BLOCK / 2;
  const fromV = roadV(-halfRows) - BLOCK / 2;
  const toV = roadV(ROWS - halfRows) + BLOCK / 2;

  const lines = [];
  for (let i = -halfCols; i <= COLS - halfCols; i++) {
    lines.push({ axis: 'v', at: roadU(i), from: fromV, to: toV }); // runs north-south
  }
  for (let j = -halfRows; j <= ROWS - halfRows; j++) {
    lines.push({ axis: 'u', at: roadV(j), from: fromU, to: toU }); // runs east-west
  }
  return lines;
}

// Snap a coordinate to the nearest road centreline. A 'u' road runs east-west,
// so it is a line of constant v and snaps against the v offset.
export function snapToRoad(value, axis) {
  const offset = axis === 'u' ? OFFSET.v : OFFSET.u;
  return Math.round((value - offset) / CELL) * CELL + offset;
}

// Distance from a point on the map to the nearest road centreline, and which
// way that road lies — used to set buildings back and face them at the street.
export function nearestRoad(u, v) {
  const alongU = snapToRoad(v, 'u');
  const alongV = snapToRoad(u, 'v');
  const toU = Math.abs(v - alongU);
  const toV = Math.abs(u - alongV);
  return toU <= toV
    ? { distance: toU, facing: { u: 0, v: Math.sign(alongU - v) || 1 } }
    : { distance: toV, facing: { u: Math.sign(alongV - u) || 1, v: 0 } };
}

export function isOnPavement(u, v) {
  return nearestRoad(u, v).distance <= ROAD_WIDTH / 2 + SIDEWALK_WIDTH;
}

// A buildable spot inside a block: clear of the pavement and of the lake.
export function plotIn(rng, block, footprint) {
  const limit = BLOCK / 2 - footprint - 1;
  if (limit <= 0) return null;
  const plot = {
    u: block.u + (rng() * 2 - 1) * limit,
    v: block.v + (rng() * 2 - 1) * limit,
  };
  if (isInLake(plot.u, plot.v, footprint + 2)) return null;
  return plot;
}

// The world-space tangent direction that a point on the map faces, given a
// direction on the map. Used to aim buildings and cars along the street.
export function tangentFacing(u, v, facing, target = new THREE.Vector3()) {
  const here = directionFromTangent(u, v, _dir).clone();
  directionFromTangent(u + facing.u * 0.5, v + facing.v * 0.5, target);
  target.sub(here);
  // Flatten onto the tangent plane at `here` so it's a pure heading.
  target.addScaledVector(here, -target.dot(here));
  return target.normalize();
}
