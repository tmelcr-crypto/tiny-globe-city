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
export const CORNER_RADIUS = cityMap.street.corner ?? 0;
export const CELL = BLOCK + ROAD_WIDTH;
export const QUARTER_SPAN = BLOCK / 2; // a lot is a quarter of a block
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

// The reverse: which point on the flat map a direction on the globe corresponds
// to. Used to work out which plot the player is currently standing on.
export function tangentFromDirection(dir) {
  const y = Math.min(1, Math.max(-1, dir.y / dir.length()));
  const distance = Math.acos(y) * GLOBE_RADIUS;
  const flat = Math.hypot(dir.x, dir.z);
  if (flat < 1e-9) return { u: 0, v: 0 };
  return { u: (dir.x / flat) * distance, v: (dir.z / flat) * distance };
}

export { ROWS, COLS };

// ---------------------------------------------------------------------------
// Avenues: the streets that do not follow the grid.
//
// A grid of right angles reads as a suburb, not a city. Prague's streets bend
// with the river and cut across the blocks at whatever angle gets them where
// they are going, so the map may also carry avenues: a handful of points the
// street passes through, smoothed into a curve.
//
// Points are given in grid coordinates — column line, row line — so an avenue
// is authored the same way the blocks are: [0, 4] is the south-west corner of
// the map, [4, 0] the north-east, and fractions land in between.

const AVENUE_STEP = 2.5; // metres between sampled points along a curve

// A point on the road grid, in metres. Whole numbers land on road centrelines:
// column line c counts from the west edge, row line r from the north edge.
export function mapPoint(c, r) {
  return {
    u: roadU(c - Math.floor(COLS / 2)),
    v: roadV(ROWS - Math.floor(ROWS / 2) - r),
  };
}

// Catmull-Rom through the authored points, so the street curves smoothly
// instead of turning corners at each one.
function smooth(through) {
  const points = through.map(([c, r]) => {
    const { u, v } = mapPoint(c, r);
    return new THREE.Vector3(u, 0, v);
  });
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const divisions = Math.max(2, Math.ceil(curve.getLength() / AVENUE_STEP));
  return curve.getSpacedPoints(divisions).map((p) => ({ u: p.x, v: p.z }));
}

let avenueCache = null;

// Every avenue, as a polyline of points in metres.
export function avenues() {
  if (!avenueCache) {
    avenueCache = (cityMap.avenues ?? []).map((avenue) => ({
      id: avenue.id,
      width: avenue.width,
      points: smooth(avenue.through),
    }));
  }
  return avenueCache;
}

// Closest point on a segment, as the fraction along it.
function alongSegment(u, v, a, b) {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const length2 = du * du + dv * dv;
  if (length2 < 1e-9) return 0;
  return Math.min(1, Math.max(0, ((u - a.u) * du + (v - a.v) * dv) / length2));
}

// Nearest avenue to a point: how far away it is, which way it runs, and which
// way the point would have to face to look at it.
export function nearestAvenue(u, v) {
  let best = null;
  for (const avenue of avenues()) {
    for (let s = 0; s < avenue.points.length - 1; s++) {
      const a = avenue.points[s];
      const b = avenue.points[s + 1];
      const t = alongSegment(u, v, a, b);
      const pu = a.u + (b.u - a.u) * t;
      const pv = a.v + (b.v - a.v) * t;
      const distance = Math.hypot(u - pu, v - pv);
      if (best && distance >= best.distance) continue;
      const run = Math.hypot(b.u - a.u, b.v - a.v) || 1;
      best = {
        id: avenue.id,
        width: avenue.width,
        distance,
        along: { u: (b.u - a.u) / run, v: (b.v - a.v) / run },
        facing: { u: (pu - u) / (distance || 1), v: (pv - v) / (distance || 1) },
      };
    }
  }
  return best;
}

// Is a point inside an avenue's road and pavement, plus any extra clearance?
export function isOnAvenue(u, v, margin = 0) {
  const avenue = nearestAvenue(u, v);
  if (!avenue) return false;
  return avenue.distance < avenue.width / 2 + SIDEWALK_WIDTH + margin;
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

// Every crossing of two grid roads, in metres — where the corners get rounded.
export function junctions() {
  const halfCols = Math.floor(COLS / 2);
  const halfRows = Math.floor(ROWS / 2);
  const points = [];
  for (let i = -halfCols; i <= COLS - halfCols; i++) {
    for (let j = -halfRows; j <= ROWS - halfRows; j++) {
      points.push({ u: roadU(i), v: roadV(j) });
    }
  }
  return points;
}

// A spot beside a street — grid or avenue — the given distance out from the
// centreline, facing along the kerb. Parked cars and pedestrians use it, so
// both turn up on the avenues as well as the grid.
export function kerbSpot(rng, offset) {
  const lines = roadLines();
  const curves = avenues();
  const pick = Math.floor(rng() * (lines.length + curves.length));
  const side = rng() < 0.5 ? -1 : 1;

  if (pick < lines.length) {
    const line = lines[pick];
    const along = line.from + rng() * (line.to - line.from);
    const at = line.at + side * offset;
    return line.axis === 'u'
      ? { u: along, v: at, facing: { u: side, v: 0 } }
      : { u: at, v: along, facing: { u: 0, v: side } };
  }

  const avenue = curves[pick - lines.length];
  const s = Math.min(avenue.points.length - 2, Math.floor(rng() * (avenue.points.length - 1)));
  const a = avenue.points[s];
  const b = avenue.points[s + 1];
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const run = Math.hypot(du, dv) || 1;
  const out = offset + (avenue.width - ROAD_WIDTH) / 2; // wider street, kerb further out
  return {
    u: a.u + (dv / run) * side * out,
    v: a.v - (du / run) * side * out,
    facing: { u: (du / run) * side, v: (dv / run) * side },
  };
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
  const grid = toU <= toV
    ? { distance: toU, width: ROAD_WIDTH, facing: { u: 0, v: Math.sign(alongU - v) || 1 } }
    : { distance: toV, width: ROAD_WIDTH, facing: { u: Math.sign(alongV - u) || 1, v: 0 } };

  // An avenue is a street like any other: whichever is closer is the one a
  // building fronts onto.
  const avenue = nearestAvenue(u, v);
  return avenue && avenue.distance < grid.distance
    ? { distance: avenue.distance, width: avenue.width, facing: avenue.facing }
    : grid;
}

export function isOnPavement(u, v) {
  const road = nearestRoad(u, v);
  return road.distance <= road.width / 2 + SIDEWALK_WIDTH;
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
  // An avenue cuts across blocks, so a plot it crosses is not buildable.
  if (isOnAvenue(plot.u, plot.v, footprint + 1)) return null;
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
