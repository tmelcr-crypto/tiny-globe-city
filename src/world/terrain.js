import * as THREE from 'three';
import { GLOBE_RADIUS } from './planet.js';
import { grid } from './grid.js';
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
//
// Streets run all over the planet, so the index is per face of the grid, and
// each face's own flat map is what the buckets are cut from.

const BUCKET_SIZE = 20;      // metres of map to a bucket
const BUCKET_REACH = 400;    // how far from a face's middle the index reaches
const BUCKETS = Math.ceil((BUCKET_REACH * 2) / BUCKET_SIZE);

let corridors = [];
let index = null;   // Map(faceId → Map(bucket → [corridor]))

const bucketOf = (u, v) => {
  const x = Math.floor((u + BUCKET_REACH) / BUCKET_SIZE);
  const y = Math.floor((v + BUCKET_REACH) / BUCKET_SIZE);
  if (x < 0 || y < 0 || x >= BUCKETS || y >= BUCKETS) return -1;
  return y * BUCKETS + x;
};

// Hand the streets' profiles to the land. Each run is a list of samples on one
// face's map with where they are, how high the road sits, and whether the road
// is actually on the ground there.
export function carveStreets(runs) {
  corridors = [];
  const placed = [];
  for (const run of runs) {
    for (let s = 0; s < run.samples.length - 1; s++) {
      const a = run.samples[s];
      const b = run.samples[s + 1];
      corridors.push({
        faceId: run.faceId,
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

  // A street is indexed on the faces its ground actually lies on, not the one
  // it was drawn on: the ends of a run reach past the edge of their own face,
  // and a point there looks itself up on the face it is standing on.
  index = new Map();
  for (let c = 0; c < corridors.length; c++) {
    const seg = corridors[c];
    for (const faceId of facesUnder(seg)) {
      const here = { ...seg, ...cornersOn(faceId, seg) };
      if (!index.has(faceId)) index.set(faceId, new Map());
      const onFace = index.get(faceId);
      const reach = seg.half + seg.shoulder;
      const minU = Math.min(here.au, here.bu) - reach;
      const maxU = Math.max(here.au, here.bu) + reach;
      const minV = Math.min(here.av, here.bv) - reach;
      const maxV = Math.max(here.av, here.bv) + reach;
      const at = placed.length;
      placed.push(here);
      for (let u = minU; u <= maxU + BUCKET_SIZE; u += BUCKET_SIZE) {
        for (let v = minV; v <= maxV + BUCKET_SIZE; v += BUCKET_SIZE) {
          const key = bucketOf(u, v);
          if (key < 0) continue;
          if (!onFace.has(key)) onFace.set(key, []);
          const list = onFace.get(key);
          if (list[list.length - 1] !== at) list.push(at);
        }
      }
    }
  }
  corridors = placed;
}

// The faces a segment's ground stands on: usually one, more where a street
// runs along the edge of a face. Its shoulders count too, which is why the
// corners of the ground it covers are probed and not just its ends.
function facesUnder(seg) {
  const reach = seg.half + seg.shoulder;
  const found = new Set();
  for (const [u, v] of [[seg.au, seg.av], [seg.bu, seg.bv]]) {
    for (const [du, dv] of [[0, 0], [reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {
      grid.direction(seg.faceId, (u + du) / GLOBE_RADIUS, (v + dv) / GLOBE_RADIUS, _probe);
      found.add(grid.locate(_probe).faceId);
    }
  }
  return found;
}

// The same segment, written in another face's map.
function cornersOn(faceId, seg) {
  const at = (u, v) => {
    grid.direction(seg.faceId, u / GLOBE_RADIUS, v / GLOBE_RADIUS, _probe);
    const { a, b } = grid.localOn(faceId, _probe);
    return [a * GLOBE_RADIUS, b * GLOBE_RADIUS];
  };
  const [au, av] = at(seg.au, seg.av);
  const [bu, bv] = at(seg.bu, seg.bv);
  return { au, av, bu, bv };
}

export function clearStreets() {
  corridors = [];
  index = null;
}

// Where a direction falls on its own face's flat map.
function onMap(dir) {
  const { faceId, a, b } = grid.locate(dir);
  return { faceId, u: a * GLOBE_RADIUS, v: b * GLOBE_RADIUS };
}

// The corridors that might cover a point, on the face it stands on.
function corridorsUnder(dir) {
  if (!index) return null;
  const { faceId, u, v } = onMap(dir);
  const onFace = index.get(faceId);
  if (!onFace) return null;
  const key = bucketOf(u, v);
  if (key < 0) return null;
  const nearby = onFace.get(key);
  return nearby ? { nearby, u, v } : null;
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
  const found = corridorsUnder(dir);
  if (!found) return height;

  // Whichever corridor has the strongest claim on this spot, and of those, the
  // nearest: a crossing is covered by two streets at once, and the one whose
  // carriageway you are standing on is the one that sets the level.
  let best = null;
  for (const c of found.nearby) {
    const seg = corridors[c];
    if (!seg.carves) continue;
    const { distance, height: road } = roadAt(found.u, found.v, seg);
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

// What you actually stand on: the land, unless a street is carrying you over
// it on a deck or through it in a bore. This is what the player rides.
//
// Which street you are on is whichever one's carriageway you are nearest the
// middle of — roads on the ground count too, so driving over the top of a
// tunnel keeps you on the surface instead of dropping you into the bore that
// passes below. Two streets that genuinely cross were levelled to meet, so
// there it makes no difference which of them answers.
export function walkHeight(direction) {
  const land = elevation(direction);
  const found = corridorsUnder(direction);
  if (!found) return land;

  let best = null;
  for (const c of found.nearby) {
    const seg = corridors[c];
    const { distance, height: road } = roadAt(found.u, found.v, seg);
    if (distance >= (seg.carves ? seg.half : seg.deck)) continue;
    if (best && distance >= best.distance) continue;
    best = { distance, height: seg.carves ? land : road };
  }
  return best ? best.height : land;
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



