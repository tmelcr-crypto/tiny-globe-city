import * as THREE from 'three';
import { GLOBE_RADIUS } from './planet.js';
import { elevation, SEA_LEVEL, slope } from './terrain.js';
import { createCubeGrid, TOWN_FACE } from './sphere-grid.js';
import cityMap from '../data/city-map.json';

// The town is authored in data/city-map.json: one character per block, read
// north-to-south and west-to-east. This module turns that map into coordinates.
//
// The planet is divided by a cubed sphere (see sphere-grid.js): six faces of
// square cells, no poles, no pinching. The town sits on the top face and its
// blocks *are* cells of that grid, so the streets between them run along cell
// edges — great circles, which is to say dead straight on the globe.
//
// Work near the town is still done on a flat map in metres, centred on the
// player: u runs east, v runs north, and the player faces -v, looking south
// down the map. Straight lines on the globe bow very slightly on that map,
// which is why roads are polylines here rather than plain strips.

export const SEED = cityMap.seed;
export const ROAD_WIDTH = cityMap.street.road;
export const SIDEWALK_WIDTH = cityMap.street.sidewalk;
export const VERGE = cityMap.street.verge;
export const CORNER_RADIUS = cityMap.street.corner ?? 0;
export const SCENERY = cityMap.scenery;
export const LAKE_RADIUS = SCENERY.lakeRadius;
export const ROCK_RING = { min: SCENERY.rockRing[0], max: SCENERY.rockRing[1] };

export const ROAD_LIFT = 0.35;
export const SIDEWALK_LIFT = 0.52;
export const GROUND_LIFT = 0.25;

const GRID = cityMap.rows.map((row) => row.split(' ').filter(Boolean));
const ROWS = GRID.length;
const COLS = GRID[0].length;
export { ROWS, COLS };

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
      if (legendFor(row, col).spawn) return { row, col, ...indexOf(row, col) };
    }
  }
  throw new Error('city-map: no block marked as the spawn (@)');
}

const SPAWN = findSpawn();
export const SPAWN_BLOCK = { i: SPAWN.i, j: SPAWN.j };

// ---------------------------------------------------------------------------
// The grid the planet is divided by, and where the town sits on it.

// One face carries the whole town, so the face is cut as finely as the map is
// long. The town is centred on that face; anything left over is countryside.
export const DIVISIONS = Math.max(ROWS, COLS, 2);
const COLUMN_SHIFT = Math.floor((DIVISIONS - COLS) / 2);
const ROW_SHIFT = Math.floor((DIVISIONS - ROWS) / 2);

if (COLS > DIVISIONS || ROWS > DIVISIONS) {
  throw new Error('city-map: the town has to fit on one face of the grid');
}

const CORNER_INSET = ROAD_WIDTH / 2 + SIDEWALK_WIDTH + VERGE;
const UP = new THREE.Vector3(0, 1, 0);

// Where the player stands: inside the spawn block, a verge's width in from its
// north-east corner — not stranded mid-junction and not inside a building.
function spawnDirection(grid) {
  const inset = CORNER_INSET / GLOBE_RADIUS;
  return grid.direction(
    TOWN_FACE,
    grid.angleOfColumn(SPAWN.col + COLUMN_SHIFT + 1) - inset,
    grid.angleOfRow(SPAWN.row + ROW_SHIFT) - inset
  );
}

// The grid is turned so that spot ends up under the player, who is fixed at
// the top of the globe.
const draft = createCubeGrid({ divisions: DIVISIONS });
const orientation = new THREE.Quaternion().setFromUnitVectors(spawnDirection(draft), UP);
export const grid = createCubeGrid({ divisions: DIVISIONS, orientation });

// A cell edge through the middle of a face; the town's block-and-street pitch.
export const CELL = grid.cellArc;
export const BLOCK = CELL - ROAD_WIDTH;
export const QUARTER_SPAN = BLOCK / 2; // a lot is a quarter of a block

// Which cell of the top face a block of the map lives on.
export function blockCell({ i, j }) {
  return {
    column: i + Math.floor(COLS / 2) + COLUMN_SHIFT,
    row: ROWS - 1 - (j + Math.floor(ROWS / 2)) + ROW_SHIFT,
  };
}

const TOWN_COLUMNS = { from: COLUMN_SHIFT, to: COLUMN_SHIFT + COLS };
const TOWN_ROWS = { from: ROW_SHIFT, to: ROW_SHIFT + ROWS };

// ---------------------------------------------------------------------------
// The flat map used for everything near the town.

const _dir = new THREE.Vector3();
const _probe = new THREE.Vector3();

// Where a point on the flat map lands on the globe.
export function directionFromTangent(u, v, target = new THREE.Vector3()) {
  const distance = Math.hypot(u, v);
  if (distance < 1e-9) return target.set(0, 1, 0);
  const theta = distance / GLOBE_RADIUS;
  const sin = Math.sin(theta);
  return target.set((u / distance) * sin, Math.cos(theta), (v / distance) * sin);
}

// A point on the ground, wherever the land happens to be there.
export function surfacePoint(u, v, lift = 0, target = new THREE.Vector3()) {
  directionFromTangent(u, v, target);
  return target.multiplyScalar(GLOBE_RADIUS + elevation(target) + lift);
}

// Ground you can build on: out of the water, and not down the side of a hill.
export function isBuildable(u, v) {
  const dir = directionFromTangent(u, v, _probe);
  return elevation(dir) > SEA_LEVEL + 1.5 && slope(dir) < 0.38;
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

const mapOf = (direction) => tangentFromDirection(direction);

// A point on the town's face, in flat-map metres.
function facePoint(a, b) {
  return mapOf(grid.direction(TOWN_FACE, a, b, _probe));
}

// Centre of a block — the square between four streets.
export function blockCentre(block) {
  const cell = blockCell(block);
  const { a, b } = grid.cellAngles(cell.column, cell.row);
  return facePoint(a, b);
}

// Every block the map declares, with the zone it was assigned.
export function cityBlocks() {
  const blocks = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const entry = legendFor(row, col);
      const index = indexOf(row, col);
      blocks.push({ ...index, cell: blockCell(index), ...blockCentre(index), ...entry });
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

// How far the town reaches from the player, for the mountains to ring it.
export const CITY_EXTENT = (() => {
  let furthest = 0;
  for (const column of [TOWN_COLUMNS.from, TOWN_COLUMNS.to]) {
    for (const row of [TOWN_ROWS.from, TOWN_ROWS.to]) {
      const corner = facePoint(grid.angleOfColumn(column), grid.angleOfRow(row));
      furthest = Math.max(furthest, Math.hypot(corner.u, corner.v));
    }
  }
  return furthest;
})();

// ---------------------------------------------------------------------------
// Streets.
//
// A street runs along a cell edge, which is a great circle: straight on the
// globe. On the flat map that reads as a very slight bow, so every street is
// carried as a polyline rather than a ruled line.

const ROAD_STEP = 4;      // metres between samples along a street
const AVENUE_STEP = 2.5;  // and along an avenue's curve

const clampAngle = (angle) => Math.min(Math.PI / 4, Math.max(-Math.PI / 4, angle));

function samplesFor(fromAngle, toAngle) {
  return Math.max(2, Math.ceil((Math.abs(toAngle - fromAngle) * GLOBE_RADIUS) / ROAD_STEP));
}

// Grid streets: the cell edges that run through the town, with half a block of
// overhang at the ends so the outer junctions are proper crossings.
function gridStreets() {
  const overhang = grid.step / 2;
  const streets = [];

  const northEdge = clampAngle(grid.angleOfRow(TOWN_ROWS.from) + overhang);
  const southEdge = clampAngle(grid.angleOfRow(TOWN_ROWS.to) - overhang);
  const westEdge = clampAngle(grid.angleOfColumn(TOWN_COLUMNS.from) - overhang);
  const eastEdge = clampAngle(grid.angleOfColumn(TOWN_COLUMNS.to) + overhang);

  for (let column = TOWN_COLUMNS.from; column <= TOWN_COLUMNS.to; column++) {
    const a = grid.angleOfColumn(column);
    const steps = samplesFor(northEdge, southEdge);
    const points = [];
    for (let s = 0; s <= steps; s++) {
      points.push(facePoint(a, northEdge + ((southEdge - northEdge) * s) / steps));
    }
    streets.push({ id: `column-${column}`, kind: 'grid', width: ROAD_WIDTH, points });
  }

  for (let row = TOWN_ROWS.from; row <= TOWN_ROWS.to; row++) {
    const b = grid.angleOfRow(row);
    const steps = samplesFor(westEdge, eastEdge);
    const points = [];
    for (let s = 0; s <= steps; s++) {
      points.push(facePoint(westEdge + ((eastEdge - westEdge) * s) / steps, b));
    }
    streets.push({ id: `row-${row}`, kind: 'grid', width: ROAD_WIDTH, points });
  }

  return streets;
}

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

// A point on the street grid, in flat-map metres. Whole numbers land on street
// centrelines: column line c counts from the west edge, row line r from the
// north edge.
export function mapPoint(c, r) {
  return facePoint(
    grid.angleOfColumn(c + COLUMN_SHIFT),
    grid.angleOfRow(r + ROW_SHIFT)
  );
}

// Catmull-Rom through the authored points — in angles across the face, so the
// curve bends over the globe rather than over a flat drawing of it.
function smooth(through) {
  const points = through.map(([c, r]) => new THREE.Vector3(
    grid.angleOfColumn(c + COLUMN_SHIFT) * GLOBE_RADIUS, 0,
    grid.angleOfRow(r + ROW_SHIFT) * GLOBE_RADIUS
  ));
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const divisions = Math.max(2, Math.ceil(curve.getLength() / AVENUE_STEP));
  return curve.getSpacedPoints(divisions)
    .map((point) => facePoint(point.x / GLOBE_RADIUS, point.z / GLOBE_RADIUS));
}

let avenueCache = null;

// Every avenue, as a polyline of points in metres.
export function avenues() {
  if (!avenueCache) {
    avenueCache = (cityMap.avenues ?? []).map((avenue) => ({
      id: avenue.id,
      kind: 'avenue',
      width: avenue.width,
      points: smooth(avenue.through),
    }));
  }
  return avenueCache;
}

let streetCache = null;

// Every street in town: the grid and the avenues, all as polylines.
export function streets() {
  if (!streetCache) streetCache = [...gridStreets(), ...avenues()];
  return streetCache;
}

// ---------------------------------------------------------------------------
// How a street sits on the land.
//
// A road is not draped over every bump: it is cut into the hill and banked up
// over the hollow, and it has a limit to how steeply it will climb. So each
// street gets a profile — a height per sample, smoothed and then held to a
// gradient — and the land is carved to match it (see terrain.js). What the
// earthworks cannot do, structures do: where the road would stand too far
// above the ground it becomes a bridge, and where the ground would bury it, a
// tunnel.

export const MAX_GRADE = 0.085;     // 8.5 in 100, about as steep as a street gets
const SMOOTH_REACH = 13;     // samples either side averaged over: wide enough
                             // to carry a street straight over a river valley
const BRIDGE_CLEAR = 2.2;    // road this far above the ground: bridge it
const TUNNEL_COVER = 6;    // ground this far above the road: bore it
const MIN_RUN = 3;           // a structure shorter than this is not worth it

function smoothed(values) {
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - SMOOTH_REACH); j <= Math.min(values.length - 1, i + SMOOTH_REACH); j++) {
      sum += values[j];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

// Hold the profile to a gradient, both ways: lower whatever climbs too fast,
// so the road cuts through high ground rather than going over it, then raise
// whatever falls too fast, so it banks up across a hollow instead of diving
// into it. The second pass is what carries a street out over a river on an
// embankment, and then on a deck.
function graded(heights, spacing) {
  const rise = MAX_GRADE * spacing;
  for (let i = 1; i < heights.length; i++) heights[i] = Math.min(heights[i], heights[i - 1] + rise);
  for (let i = heights.length - 2; i >= 0; i--) heights[i] = Math.min(heights[i], heights[i + 1] + rise);
  for (let i = 1; i < heights.length; i++) heights[i] = Math.max(heights[i], heights[i - 1] - rise);
  for (let i = heights.length - 2; i >= 0; i--) heights[i] = Math.max(heights[i], heights[i + 1] - rise);
  return heights;
}

// Short stretches of bridge or tunnel are not worth building: fill them in.
function settle(kinds) {
  let start = 0;
  while (start < kinds.length) {
    let end = start;
    while (end + 1 < kinds.length && kinds[end + 1] === kinds[start]) end++;
    if (kinds[start] !== 'road' && end - start + 1 < MIN_RUN) {
      for (let i = start; i <= end; i++) kinds[i] = 'road';
    }
    start = end + 1;
  }
  return kinds;
}

// Two streets that cross have to agree on how high the crossing is. Each
// profile is worked out on its own, so they start out differing by a couple of
// metres; this pulls every contact to a common height and eases each street
// back into it.
const CONTACT_REACH = 6;
const RECONCILE_PASSES = 4;

function contactsBetween(profiles) {
  const contacts = [];
  for (let a = 0; a < profiles.length; a++) {
    for (let b = a + 1; b < profiles.length; b++) {
      const one = profiles[a].samples;
      const two = profiles[b].samples;

      // Every sample of one street that comes near the other, paired with its
      // nearest opposite number. A street and an avenue may cross more than
      // once, so this is not a single meeting point.
      for (let i = 0; i < one.length; i++) {
        let bestGap = CONTACT_REACH;
        let best = -1;
        for (let j = 0; j < two.length; j++) {
          const gap = Math.hypot(one[i].u - two[j].u, one[i].v - two[j].v);
          if (gap < bestGap) {
            bestGap = gap;
            best = j;
          }
        }
        if (best >= 0) contacts.push([a, i, b, best]);
      }
    }
  }
  return contacts;
}

// Bring crossings to a common height without kinking the streets that meet
// there: the correction is applied in full at the crossing and tapered away
// over a good stretch of street either side, so it changes the gradient by a
// little rather than putting a step in it.
const SPREAD = 12; // samples the correction is eased out over

function reconcile(profiles, heights) {
  const contacts = contactsBetween(profiles);

  for (let pass = 0; pass < RECONCILE_PASSES; pass++) {
    const shift = heights.map((run) => new Array(run.length).fill(0));

    for (const [a, i, b, j] of contacts) {
      const meet = (heights[a][i] + heights[b][j]) / 2;
      for (const [street, at, delta] of [[a, i, meet - heights[a][i]], [b, j, meet - heights[b][j]]]) {
        for (let n = -SPREAD; n <= SPREAD; n++) {
          const index = at + n;
          if (index < 0 || index >= shift[street].length) continue;
          const taper = delta * (1 - Math.abs(n) / (SPREAD + 1));
          // Where two crossings pull the same stretch, the stronger one wins
          // rather than the two adding up.
          if (Math.abs(taper) > Math.abs(shift[street][index])) shift[street][index] = taper;
        }
      }
    }

    for (let s = 0; s < heights.length; s++) {
      for (let i = 0; i < heights[s].length; i++) heights[s][i] += shift[s][i];
    }
  }
  return heights;
}

let profileCache = null;

// Every street's profile: where it runs, how high it sits, and what carries it
// there. Worked out from the bare land, once, before the land is carved.
export function streetProfiles() {
  if (profileCache) return profileCache;

  const roads = streets();
  const spacings = roads.map((street) => (street.points.length > 1
    ? Math.hypot(street.points[1].u - street.points[0].u, street.points[1].v - street.points[0].v)
    : ROAD_STEP));

  const profiles = roads.map((street) => ({
    street,
    ground: street.points.map((point) => {
      const height = elevation(directionFromTangent(point.u, point.v, _probe));
      // Over water the profile is worked out as if the bank came up to meet
      // it, so the road crosses on the level and then finds itself on a bridge.
      return Math.max(height, SEA_LEVEL + 3);
    }),
    samples: street.points,
  }));

  // Smoothed, held to a gradient, lifted clear of the water — which is what
  // puts a deck over the river rather than a ford through it — and only then
  // reconciled, so the crossings agree in the profile that actually gets built.
  const levels = reconcile(profiles, profiles.map((profile, s) => graded(
    smoothed(profile.ground).map((h) => Math.max(h, SEA_LEVEL + 4.5)),
    spacings[s]
  // Agreeing at the crossings can put a kink back in, so hold the gradient one
  // last time. It moves a crossing by a few centimetres at most, which the
  // surfacing covers.
  ))).map((heights, s) => graded(heights, spacings[s]));

  profileCache = roads.map((street, s) => {
    const heights = levels[s];

    const kinds = street.points.map((point, i) => {
      const land = elevation(directionFromTangent(point.u, point.v, _probe));
      if (heights[i] - land > BRIDGE_CLEAR) return 'bridge';
      if (land - heights[i] > TUNNEL_COVER) return 'tunnel';
      return 'road';
    });
    settle(kinds);

    return {
      id: street.id,
      kind: street.kind,
      width: street.width,
      half: street.width / 2 + SIDEWALK_WIDTH,
      shoulder: street.width,
      samples: street.points.map((point, i) => ({
        u: point.u,
        v: point.v,
        height: heights[i],
        land: elevation(directionFromTangent(point.u, point.v, _probe)),
        carries: kinds[i],
        onGround: kinds[i] === 'road',
      })),
    };
  });
  return profileCache;
}

let settled = false;

export function settleStructures() {
  if (settled) return profileCache ?? [];
  settled = true;
  for (const profile of profileCache ?? []) {
    const kinds = profile.samples.map((sample) => {
      const land = elevation(directionFromTangent(sample.u, sample.v, _probe));
      sample.land = land;
      if (sample.carries === 'tunnel' && land - sample.height < TUNNEL_COVER * 0.6) return 'road';
      if (sample.carries === 'bridge' && sample.height - land < BRIDGE_CLEAR * 0.6) return 'road';
      return sample.carries;
    });
    settle(kinds);
    profile.samples.forEach((sample, i) => {
      sample.carries = kinds[i];
      sample.onGround = kinds[i] === 'road';
    });
  }
  return profileCache ?? [];
}

// The height the road sits at, at a point along it.
export function streetHeightAt(profile, index) {
  return profile.samples[Math.min(profile.samples.length - 1, Math.max(0, index))].height;
}

// ---------------------------------------------------------------------------
// Where the streets are, for anything that has to keep off them or face them.

// Closest point on a segment, as the fraction along it.
function alongSegment(u, v, a, b) {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const length2 = du * du + dv * dv;
  if (length2 < 1e-9) return 0;
  return Math.min(1, Math.max(0, ((u - a.u) * du + (v - a.v) * dv) / length2));
}

function nearestOn(list, u, v) {
  let best = null;
  for (const street of list) {
    for (let s = 0; s < street.points.length - 1; s++) {
      const a = street.points[s];
      const b = street.points[s + 1];
      const t = alongSegment(u, v, a, b);
      const pu = a.u + (b.u - a.u) * t;
      const pv = a.v + (b.v - a.v) * t;
      const distance = Math.hypot(u - pu, v - pv);
      if (best && distance >= best.distance) continue;
      const run = Math.hypot(b.u - a.u, b.v - a.v) || 1;
      best = {
        id: street.id,
        kind: street.kind,
        width: street.width,
        distance,
        along: { u: (b.u - a.u) / run, v: (b.v - a.v) / run },
        facing: { u: (pu - u) / (distance || 1), v: (pv - v) / (distance || 1) },
      };
    }
  }
  return best;
}

// Nearest avenue to a point: how far away it is and which way it runs.
export function nearestAvenue(u, v) {
  return nearestOn(avenues(), u, v);
}

// Is a point inside an avenue's road and pavement, plus any extra clearance?
export function isOnAvenue(u, v, margin = 0) {
  const avenue = nearestAvenue(u, v);
  if (!avenue) return false;
  return avenue.distance < avenue.width / 2 + SIDEWALK_WIDTH + margin;
}

// Distance from a point on the map to the nearest street centreline, and which
// way that street lies — used to set buildings back and face them at it.
export function nearestRoad(u, v) {
  return nearestOn(streets(), u, v);
}

export function isOnPavement(u, v) {
  const road = nearestRoad(u, v);
  return road ? road.distance <= road.width / 2 + SIDEWALK_WIDTH : false;
}

// Every crossing of two grid streets, with the way each of them runs there:
// that is what the rounded corners are built around.
export function junctions() {
  const points = [];
  const nudge = grid.step / 40;

  for (let column = TOWN_COLUMNS.from; column <= TOWN_COLUMNS.to; column++) {
    for (let row = TOWN_ROWS.from; row <= TOWN_ROWS.to; row++) {
      const a = grid.angleOfColumn(column);
      const b = grid.angleOfRow(row);
      const here = facePoint(a, b);
      const alongRow = facePoint(a + nudge, b);
      const alongColumn = facePoint(a, b + nudge);
      const unit = (to) => {
        const du = to.u - here.u;
        const dv = to.v - here.v;
        const run = Math.hypot(du, dv) || 1;
        return { u: du / run, v: dv / run };
      };
      points.push({ ...here, along: [unit(alongRow), unit(alongColumn)] });
    }
  }
  return points;
}

// A spot beside a street — grid or avenue — the given distance out from the
// centreline, facing along the kerb. Parked cars and pedestrians use it.
export function kerbSpot(rng, offset) {
  const list = streets();
  const street = list[Math.floor(rng() * list.length)];
  const side = rng() < 0.5 ? -1 : 1;
  const s = Math.min(street.points.length - 2, Math.floor(rng() * (street.points.length - 1)));
  const a = street.points[s];
  const b = street.points[s + 1];
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const run = Math.hypot(du, dv) || 1;
  const out = offset + (street.width - ROAD_WIDTH) / 2; // a wider street sets its kerb further out

  return {
    u: a.u + (dv / run) * side * out,
    v: a.v - (du / run) * side * out,
    facing: { u: (du / run) * side, v: (dv / run) * side },
  };
}

// A buildable spot inside a block: clear of the pavement, the lake and the
// avenues. Picked in angles across the cell, so it is inside the block however
// the cell is shaped.
export function plotIn(rng, block, footprint) {
  const cell = block.cell ?? blockCell(block);
  const margin = (footprint + ROAD_WIDTH / 2 + SIDEWALK_WIDTH + 1) / GLOBE_RADIUS;
  const half = grid.step / 2 - margin;
  if (half <= 0) return null;

  const centre = grid.cellAngles(cell.column, cell.row);
  const plot = facePoint(
    centre.a + (rng() * 2 - 1) * half,
    centre.b + (rng() * 2 - 1) * half
  );
  if (isInLake(plot.u, plot.v, footprint + 2)) return null;
  // Nobody builds in the river or on the side of a cliff.
  if (!isBuildable(plot.u, plot.v)) return null;
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
