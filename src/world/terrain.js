import * as THREE from 'three';
import { GLOBE_RADIUS } from './planet.js';
import terrainData from '../data/terrain.json';

// The shape of the land.
//
// The globe used to be a sphere with a green paint job. It now carries a
// height field: hills, ridges, hollows that fill with water, and river valleys
// cut through them. Everything else asks this module how high the ground is —
// the globe mesh, every model the spawner stands up, the streets, and the
// player, who rides up and down as the world turns under them.
//
// Heights are metres above the sphere of GLOBE_RADIUS. Sea level is a little
// below it, so anywhere the land dips far enough fills with water: that is
// what makes the ponds, the lakes and the rivers, rather than each being
// placed by hand.

export const SEA_LEVEL = terrainData.seaLevel;

// --- noise ------------------------------------------------------------------
// Value noise on a lattice, smoothly interpolated. Cheap, seedable, and smooth
// enough that a road laid over it does not jitter.

const SEED = terrainData.seed >>> 0;

function hash(x, y, z) {
  let h = SEED ^ Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967295;
}

// Smootherstep: zero first and second derivative at the ends, so hills have no
// creases along the lattice.
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a, b, t) => a + (b - a) * t;

function noise(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = ease(x - ix);
  const fy = ease(y - iy);
  const fz = ease(z - iz);

  const c = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz);
  const x00 = mix(c(0, 0, 0), c(1, 0, 0), fx);
  const x10 = mix(c(0, 1, 0), c(1, 1, 0), fx);
  const x01 = mix(c(0, 0, 1), c(1, 0, 1), fx);
  const x11 = mix(c(0, 1, 1), c(1, 1, 1), fx);
  return mix(mix(x00, x10, fy), mix(x01, x11, fy), fz);
}

// Octaves of it, summed: the big shape of the land plus the detail on it.
function fbm(dir, octaves) {
  let height = 0;
  for (const [frequency, amplitude] of octaves) {
    height += (noise(dir.x * frequency, dir.y * frequency, dir.z * frequency) * 2 - 1) * amplitude;
  }
  return height;
}

// Ridged noise: the fold where two hills meet, which reads as a mountain range
// rather than another round hill.
function ridges(dir, frequency, amplitude) {
  const n = noise(dir.x * frequency, dir.y * frequency, dir.z * frequency);
  const ridge = 1 - Math.abs(n * 2 - 1);
  return ridge * ridge * amplitude;
}

// --- the shape of this planet ------------------------------------------------

const HILLS = terrainData.hills.map(({ frequency, amplitude }) => [frequency, amplitude]);
const RIDGE = terrainData.ridge;
const SETTLED = terrainData.settled;
const RIVERS = terrainData.rivers;

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _probe = new THREE.Vector3();

// Where the towns are, the land is calmer: a settlement sits in a basin or on
// a shelf, not draped over a ridge. Each one damps the relief around it.
const settlements = SETTLED.map((entry) => ({
  dir: new THREE.Vector3(...entry.at).normalize(),
  inner: entry.calm / GLOBE_RADIUS,
  outer: entry.fades / GLOBE_RADIUS,
  damp: entry.damp,
  level: entry.level,
}));

// How much of the wild relief survives here, and what it is pulled towards.
// Settled ground is not flattened — the streets still run up and down — but it
// is kept on a shelf above the water instead of wherever the noise fell.
function settlementShelf(dir) {
  let damp = 1;
  let level = 0;
  for (const town of settlements) {
    const angle = dir.angleTo(town.dir);
    if (angle >= town.outer) continue;
    const t = angle <= town.inner ? 0
      : ease((angle - town.inner) / (town.outer - town.inner));
    const here = mix(town.damp, 1, t);
    if (here >= damp) continue;
    damp = here;
    level = mix(town.level, 0, t);
  }
  return { damp, level };
}

// A river is a line drawn on the globe and a valley cut along it. Anything the
// cut takes below sea level fills with water on its own.
const rivers = RIVERS.map((river) => ({
  from: new THREE.Vector3(...river.from).normalize(),
  to: new THREE.Vector3(...river.to).normalize(),
  width: river.width,
  depth: river.depth,
  bank: river.bank ?? river.width * 2.2,
  axis: new THREE.Vector3().crossVectors(
    new THREE.Vector3(...river.from).normalize(),
    new THREE.Vector3(...river.to).normalize()
  ).normalize(),
  wander: river.wander ?? 0,
}));

// Distance from a direction to a river's line, in metres along the ground.
function toRiver(dir, river) {
  // How far off the plane the river runs in, with a slow wander so it is not
  // ruler-straight.
  const off = Math.asin(Math.max(-1, Math.min(1, dir.dot(river.axis)))) * GLOBE_RADIUS;
  const along = noise(dir.x * 2.4, dir.y * 2.4, dir.z * 2.4) * 2 - 1;
  return Math.abs(off - along * river.wander);
}


// --- what the roads do to it -------------------------------------------------
//
// A road does not drape itself over every bump: it is cut into the hill and
// banked up over the hollow. So the streets hand their finished profile back
// here and the land takes their shape — which is what makes the cuttings and
// embankments you can see from the pavement, with no seam between road and
// ground because they are the same surface.
//
// Where a road cannot be laid on earth at all it says so, and the land is left
// alone: that is a bridge over a river, or a tunnel through a ridge.

const BUCKET_REACH = 420;   // metres either side of the town the index covers
const BUCKETS = 42;
const BUCKET_SIZE = (BUCKET_REACH * 2) / BUCKETS;
const TOWN_COS = Math.cos(1.35);  // only this cap of the globe has streets on it

let corridors = [];
let index = null;

const bucketOf = (u, v) => {
  const x = Math.floor((u + BUCKET_REACH) / BUCKET_SIZE);
  const y = Math.floor((v + BUCKET_REACH) / BUCKET_SIZE);
  if (x < 0 || y < 0 || x >= BUCKETS || y >= BUCKETS) return -1;
  return y * BUCKETS + x;
};

// The flat map the town is planned on, inlined: terrain.js cannot import
// city-plan.js, which imports this.
function flatten(dir, target) {
  const y = Math.min(1, Math.max(-1, dir.y));
  const distance = Math.acos(y) * GLOBE_RADIUS;
  const flat = Math.hypot(dir.x, dir.z);
  if (flat < 1e-9) return target.set(0, 0);
  return target.set((dir.x / flat) * distance, (dir.z / flat) * distance);
}

const _flat = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } };

// Hand the streets' profiles to the land. Each run is a list of samples with
// where they are, how high the road sits there, and whether the road is
// actually on the ground at that point.
export function carveStreets(runs) {
  corridors = [];
  for (const run of runs) {
    for (let s = 0; s < run.samples.length - 1; s++) {
      const a = run.samples[s];
      const b = run.samples[s + 1];
      corridors.push({
        au: a.u, av: a.v, ah: a.height,
        bu: b.u, bv: b.v, bh: b.height,
        half: run.half,
        shoulder: run.shoulder,
        deck: run.width / 2 + 1,
        // A stretch with the ground under it shapes the ground, including the
        // last few metres up to an abutment or a portal. A bridge or a bore
        // leaves the land alone — but you still walk on it.
        carves: a.onGround || b.onGround,
      });
    }
  }

  index = new Map();
  for (let c = 0; c < corridors.length; c++) {
    const seg = corridors[c];
    const reach = seg.half + seg.shoulder;
    const minU = Math.min(seg.au, seg.bu) - reach;
    const maxU = Math.max(seg.au, seg.bu) + reach;
    const minV = Math.min(seg.av, seg.bv) - reach;
    const maxV = Math.max(seg.av, seg.bv) + reach;
    for (let u = minU; u <= maxU + BUCKET_SIZE; u += BUCKET_SIZE) {
      for (let v = minV; v <= maxV + BUCKET_SIZE; v += BUCKET_SIZE) {
        const key = bucketOf(u, v);
        if (key < 0) continue;
        if (!index.has(key)) index.set(key, []);
        const list = index.get(key);
        if (list[list.length - 1] !== c) list.push(c);
      }
    }
  }
}

export function clearStreets() {
  corridors = [];
  index = null;
}

// How far a point on the flat map is along a corridor, and how high the road
// is there.
function roadAt(u, v, seg) {
  const du = seg.bu - seg.au;
  const dv = seg.bv - seg.av;
  const length2 = du * du + dv * dv;
  const t = length2 < 1e-9 ? 0
    : Math.min(1, Math.max(0, ((u - seg.au) * du + (v - seg.av) * dv) / length2));
  const distance = Math.hypot(u - (seg.au + du * t), v - (seg.av + dv * t));
  return { distance, height: seg.ah + (seg.bh - seg.ah) * t };
}

// Blend the land towards the road bed: level across the carriageway, then
// easing out through the shoulder into whatever the hill was doing.
function carve(dir, height) {
  if (!index || dir.y < TOWN_COS) return height;
  flatten(dir, _flat);
  const key = bucketOf(_flat.x, _flat.y);
  if (key < 0) return height;
  const nearby = index.get(key);
  if (!nearby) return height;

  // Whichever corridor has the strongest claim on this spot, and of those, the
  // nearest: a crossing is covered by two streets at once, and the one whose
  // carriageway you are actually standing on is the one that sets the level.
  let best = null;
  for (const c of nearby) {
    const seg = corridors[c];
    if (!seg.carves) continue;
    const { distance, height: road } = roadAt(_flat.x, _flat.y, seg);
    const reach = seg.half + seg.shoulder;
    if (distance >= reach) continue;
    const weight = distance <= seg.half ? 1
      : 1 - ease((distance - seg.half) / seg.shoulder);
    const better = !best
      || weight > best.weight + 1e-6
      || (weight > best.weight - 1e-6 && distance < best.distance);
    if (better) best = { weight, distance, road };
  }
  return best ? mix(height, best.road, best.weight) : height;
}

// Height of the land at a direction, in metres above the sphere.
export function elevation(direction) {
  _dir.copy(direction).normalize();

  let height = fbm(_dir, HILLS) + ridges(_dir, RIDGE.frequency, RIDGE.amplitude) + RIDGE.base;
  const shelf = settlementShelf(_dir);
  height = mix(shelf.level, height, shelf.damp);

  for (const river of rivers) {
    const distance = toRiver(_dir, river);
    if (distance > river.bank) continue;
    // A channel with sloped banks: deepest in the middle, easing out to the
    // sides. Everything here has to fade to nothing exactly at the bank, or
    // the river gets a cliff along its edge.
    const across = Math.min(1, distance / river.bank);
    const into = 1 - ease(across);
    const bed = SEA_LEVEL - river.width * 0.06 - river.depth * 0.12;
    height = mix(height, Math.min(height - river.depth, bed), into);
  }
  return carve(_dir, height);
}

// What you actually stand on: the land, unless a street is carrying you over
// it on a deck or through it in a bore. This is what the player rides.
export function walkHeight(direction) {
  const land = elevation(direction);
  if (!index) return land;
  _dir.copy(direction).normalize();
  if (_dir.y < TOWN_COS) return land;
  flatten(_dir, _flat);
  const key = bucketOf(_flat.x, _flat.y);
  if (key < 0) return land;
  const nearby = index.get(key);
  if (!nearby) return land;

  let best = null;
  for (const c of nearby) {
    const seg = corridors[c];
    if (seg.carves) continue; // the land already has this stretch in it
    const { distance, height: road } = roadAt(_flat.x, _flat.y, seg);
    if (distance >= seg.deck) continue;
    if (!best || distance < best.distance) best = { distance, road };
  }
  return best ? best.road : land;
}

// The ground, as a point in space.
export function groundPoint(direction, lift = 0, target = new THREE.Vector3()) {
  return target.copy(direction).normalize().multiplyScalar(GLOBE_RADIUS + elevation(direction) + lift);
}

// How high the ground stands at a direction, never below the water: what a
// boat, a road deck or a pier rests on.
export function surfaceHeight(direction) {
  return Math.max(elevation(direction), SEA_LEVEL);
}

export function isUnderwater(direction) {
  return elevation(direction) < SEA_LEVEL;
}

// The way the ground tilts, as a unit vector. Sampled rather than derived, so
// it matches whatever the height field happens to do.
export function groundNormal(direction, target = new THREE.Vector3()) {
  const step = 1.5 / GLOBE_RADIUS; // metres, as an angle
  _dir.copy(direction).normalize();
  _axis.copy(UP).cross(_dir);
  if (_axis.lengthSq() < 1e-8) _axis.set(1, 0, 0);
  _axis.normalize();

  const east = new THREE.Vector3().crossVectors(_dir, _axis).normalize();
  const height = (offset, axis) => {
    _probe.copy(_dir).addScaledVector(axis, offset).normalize();
    return elevation(_probe);
  };

  const dNorth = (height(step, _axis) - height(-step, _axis)) / (2 * step * GLOBE_RADIUS);
  const dEast = (height(step, east) - height(-step, east)) / (2 * step * GLOBE_RADIUS);
  return target.copy(_dir)
    .addScaledVector(_axis, -dNorth)
    .addScaledVector(east, -dEast)
    .normalize();
}

// How steep the ground is, as a fraction: 0.1 is one metre up in ten along.
export function slope(direction) {
  return Math.tan(Math.acos(Math.min(1, groundNormal(direction, _probe).dot(
    _dir.copy(direction).normalize()
  ))));
}



