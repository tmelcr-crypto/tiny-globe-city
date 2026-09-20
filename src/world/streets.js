import * as THREE from 'three';
import { GLOBE_RADIUS } from './planet.js';
import { grid, ROAD_WIDTH, SIDEWALK_WIDTH, CORNER_RADIUS, CELL } from './grid.js';
import { chartFor } from './chart.js';
import { DIVISIONS, allBlocks, blockAt, avenuesOn, wantsStreet } from './city-map.js';
import { elevation, SEA_LEVEL } from './terrain.js';
import { FACE_IDS } from './sphere-grid.js';

// Every street on the planet.
//
// A street is a run of points on one face's flat map (see chart.js), so a grid
// street is a straight line there and a great circle on the globe. Streets are
// laid where the map says blocks are built up — a forest gets the road that
// passes through it and nothing more — and each one is then given a profile:
// the height it sits at, smoothed, held to a gradient, and agreed with every
// street it crosses. The land is carved to that (terrain.js), and where the
// earth cannot carry it, a bridge or a tunnel does.

const ROAD_STEP = 4;         // metres between samples along a street
const AVENUE_STEP = 3;
export const MAX_GRADE = 0.085;  // 8.5 in 100, about as steep as a street gets
const SMOOTH_REACH = 13;     // samples either side averaged over
const BRIDGE_CLEAR = 2.2;    // road this far above the ground: bridge it
const TUNNEL_COVER = 6;      // ground this far above the road: bore it
const MIN_RUN = 3;           // a structure shorter than this is not worth it
const CONTACT_REACH = 6;    // how near two streets have to come to count as crossing
const HANDOVER_REACH = 14;  // ...and how near, at the end of a run, to count as its continuation
const RECONCILE_PASSES = 3;
const SETTLE_ROUNDS = 8;      // rounds of agreeing at the crossings, then re-grading
const SPREAD = 12;           // samples a crossing's correction is eased out over

const _probe = new THREE.Vector3();

// --- where the streets run ---------------------------------------------------

const lineOf = (index) => (index - DIVISIONS / 2) * CELL;   // a grid line, in chart metres
const overhang = CELL * 0.35;

function sampled(chart, from, to, step) {
  const length = Math.hypot(to.u - from.u, to.v - from.v);
  const steps = Math.max(2, Math.ceil(length / step));
  const points = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    points.push({ u: from.u + (to.u - from.u) * t, v: from.v + (to.v - from.v) * t });
  }
  return points;
}

// The block at a point on a face's map, wherever it really is — which may be
// on the next face along, where a line runs down the edge of this one.
function blockUnder(chart, u, v) {
  const cell = grid.cellOf(chart.direction(u, v, _probe));
  return blockAt(cell.faceId, cell.column, cell.row);
}

// The blocks either side of a grid line, so open country gets no grid.
function neighbours(faceId, along, index, cell) {
  const chart = chartFor(faceId);
  const step = CELL * 0.3;
  const at = lineOf(index);
  const middle = lineOf(cell) + CELL / 2;
  return along === 'column'
    ? [blockUnder(chart, at - step, -middle), blockUnder(chart, at + step, -middle)]
    : [blockUnder(chart, middle, -(at - step)), blockUnder(chart, middle, -(at + step))];
}

// A line down the edge of a face belongs to both faces that meet there, so
// only one of them lays it: the one that comes first, arbitrarily but
// consistently, so the street is built exactly once.
function ownsEdge(faceId, along, index) {
  if (index !== 0 && index !== DIVISIONS) return true;
  const chart = chartFor(faceId);
  const at = lineOf(index) + (index === 0 ? -CELL * 0.3 : CELL * 0.3);
  const beyond = along === 'column'
    ? chart.direction(at, 0, _probe)
    : chart.direction(0, -at, _probe);
  const other = grid.locate(beyond).faceId;
  if (other === faceId) return true;
  return FACE_IDS.indexOf(faceId) < FACE_IDS.indexOf(other);
}

// Grid streets: the cell edges that have something built along them. A run is
// only laid where at least one of the blocks it passes wants a street, so the
// network thins out into the country instead of covering the whole planet.
function gridStreets(faceId) {
  const chart = chartFor(faceId);
  const streets = [];

  for (const along of ['column', 'row']) {
    for (let index = 0; index <= DIVISIONS; index++) {
      if (!ownsEdge(faceId, along, index)) continue;
      let start = null;
      for (let cell = 0; cell <= DIVISIONS; cell++) {
        const wanted = cell < DIVISIONS && wantsStreet(...neighbours(faceId, along, index, cell));
        if (wanted && start === null) start = cell;
        if (wanted || start === null) continue;

        // A run stops a little past its last junction, so the corner is fully
        // paved — but never past the edge of the face, where the next face's
        // own grid carries the same road on. Two faces both hanging over the
        // edge would lay one road twice, at two different heights.
        const from = lineOf(start) - (start > 0 ? overhang : 0);
        const to = lineOf(cell) + (cell < DIVISIONS ? overhang : 0);
        const at = lineOf(index);
        const ends = along === 'column'
          ? [{ u: at, v: -from }, { u: at, v: -to }]
          : [{ u: from, v: -at }, { u: to, v: -at }];
        streets.push({
          id: `${faceId}-${along}${index}-${start}`,
          faceId,
          chart,
          kind: 'grid',
          width: ROAD_WIDTH,
          points: sampled(chart, ends[0], ends[1], ROAD_STEP),
        });
        start = null;
      }
    }
  }
  return streets;
}

// Avenues are authored in grid coordinates — column line, row line — so they
// read the same way the block map does, and curve through a Catmull-Rom.
function avenueStreets(faceId) {
  const chart = chartFor(faceId);
  return avenuesOn(faceId).map((avenue) => {
    const through = avenue.through.map(([c, r]) => new THREE.Vector3(lineOf(c), 0, -lineOf(r)));
    const curve = new THREE.CatmullRomCurve3(through, false, 'catmullrom', 0.5);
    const divisions = Math.max(2, Math.ceil(curve.getLength() / AVENUE_STEP));
    return {
      id: avenue.id,
      faceId,
      chart,
      kind: 'avenue',
      width: avenue.width,
      points: curve.getSpacedPoints(divisions).map((point) => ({ u: point.x, v: point.z })),
    };
  });
}

let streetCache = null;

export function streets() {
  if (!streetCache) {
    streetCache = FACE_IDS.flatMap((faceId) => [...gridStreets(faceId), ...avenueStreets(faceId)]);
  }
  return streetCache;
}

export const streetsOn = (faceId) => streets().filter((street) => street.faceId === faceId);

// --- how high they sit -------------------------------------------------------

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
// whatever falls too fast, so it banks up across a hollow instead of diving in.
function graded(heights, spacing) {
  const rise = MAX_GRADE * spacing;
  for (let i = 1; i < heights.length; i++) heights[i] = Math.min(heights[i], heights[i - 1] + rise);
  for (let i = heights.length - 2; i >= 0; i--) heights[i] = Math.min(heights[i], heights[i + 1] + rise);
  for (let i = 1; i < heights.length; i++) heights[i] = Math.max(heights[i], heights[i - 1] - rise);
  for (let i = heights.length - 2; i >= 0; i--) heights[i] = Math.max(heights[i], heights[i + 1] - rise);
  return heights;
}

// Short stretches of bridge or tunnel are not worth building: fill them in.
function settleRuns(kinds) {
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

// Two streets that cross have to agree on how high the crossing is. The
// correction is applied in full where they meet and tapered away either side,
// so it bends the street rather than putting a step in it.
//
// Crossings are found on the globe rather than on a face's flat map, because
// two streets can meet across the edge between two faces — the ends of a run
// hang over into the next face along — and on their own maps those two are
// nowhere near each other.
function samplePoints(street) {
  return street.points.map((point) => street.chart.direction(point.u, point.v, new THREE.Vector3()));
}

function boundsOf(points) {
  const centre = new THREE.Vector3();
  for (const point of points) centre.add(point);
  centre.normalize();
  let reach = 0;
  for (const point of points) reach = Math.max(reach, centre.angleTo(point));
  return { centre, reach };
}

function contacts(list) {
  const points = list.map(samplePoints);
  const bounds = points.map(boundsOf);
  const gap = CONTACT_REACH / GLOBE_RADIUS;
  const handover = HANDOVER_REACH / GLOBE_RADIUS;
  const found = [];

  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      // Nowhere near each other: no point walking their samples.
      if (bounds[a].centre.angleTo(bounds[b].centre) > bounds[a].reach + bounds[b].reach + handover) continue;
      const one = points[a];
      const two = points[b];
      for (let i = 0; i < one.length; i++) {
        // Where a run ends it is usually handing over to the street that
        // carries the same road on across the edge of a face, which starts a
        // little further off than a crossing does but has to agree just as
        // exactly — otherwise the road has a step in it at the seam.
        let bestGap = i === 0 || i === one.length - 1 ? handover : gap;
        let best = -1;
        for (let j = 0; j < two.length; j++) {
          const angle = one[i].angleTo(two[j]);
          if (angle < bestGap) {
            bestGap = angle;
            best = j;
          }
        }
        if (best >= 0) found.push([a, i, b, best]);
      }
    }
  }
  return found;
}

function reconcile(list, heights) {
  const meetings = contacts(list);
  for (let pass = 0; pass < RECONCILE_PASSES; pass++) {
    const shift = heights.map((run) => new Array(run.length).fill(0));
    for (const [a, i, b, j] of meetings) {
      const meet = (heights[a][i] + heights[b][j]) / 2;
      for (const [street, at, delta] of [[a, i, meet - heights[a][i]], [b, j, meet - heights[b][j]]]) {
        for (let n = -SPREAD; n <= SPREAD; n++) {
          const index = at + n;
          if (index < 0 || index >= shift[street].length) continue;
          const taper = delta * (1 - Math.abs(n) / (SPREAD + 1));
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

  const list = streets();
  const groundOf = (street) => street.points.map((point) => {
    const height = elevation(street.chart.direction(point.u, point.v, _probe));
    // Over water the profile is worked out as if the bank came up to meet it,
    // so the road crosses on the level and finds itself on a bridge.
    return Math.max(height, SEA_LEVEL + 3);
  });
  const spacingOf = (street) => (street.points.length > 1
    ? Math.hypot(street.points[1].u - street.points[0].u, street.points[1].v - street.points[0].v)
    : ROAD_STEP);

  const spacings = list.map(spacingOf);
  let levels = list.map((street, s) => graded(
    smoothed(groundOf(street)).map((h) => Math.max(h, SEA_LEVEL + 4.5)),
    spacings[s]
  ));

  // Agreeing at the crossings puts a kink back in, and holding the gradient
  // afterwards pulls the crossings apart again — so the two are run against
  // each other until they stop arguing. A street that meets another at the
  // edge of a face has to climb to meet it, which takes a few rounds.
  for (let round = 0; round < SETTLE_ROUNDS; round++) {
    levels = reconcile(list, levels).map((heights, s) => graded(heights, spacings[s]));
  }

  profileCache = list.map((street, s) => {
    const heights = levels[s];
    const kinds = street.points.map((point, i) => {
      const land = elevation(street.chart.direction(point.u, point.v, _probe));
      if (heights[i] - land > BRIDGE_CLEAR) return 'bridge';
      if (land - heights[i] > TUNNEL_COVER) return 'tunnel';
      return 'road';
    });
    settleRuns(kinds);

    return {
      id: street.id,
      faceId: street.faceId,
      chart: street.chart,
      kind: street.kind,
      width: street.width,
      half: street.width / 2 + SIDEWALK_WIDTH,
      shoulder: street.width,
      samples: street.points.map((point, i) => ({
        u: point.u,
        v: point.v,
        chart: street.chart,
        height: heights[i],
        land: elevation(street.chart.direction(point.u, point.v, _probe)),
        carries: kinds[i],
        onGround: kinds[i] === 'road',
      })),
    };
  });
  return profileCache;
}

// Once the land has taken the shape of the streets, some structures turn out
// not to be needed: a tunnel whose hill the street next door has cut away is
// not a tunnel any more, and a bridge the neighbouring embankment has filled
// in underneath is just a road. Run after a carve, then carve again — it
// settles down after a pass or two, so it is safe to run more than once.
// The land a structure is judged against is the land the *other* streets left,
// but carving a stretch also pulls the ground up to meet it — so a run that is
// asked this over and over eventually talks itself out of every bridge it has.
// Two passes is where it stops being worth asking.
const SETTLE_PASSES = 2;
let settlePasses = 0;

export function settleStructures() {
  if (settlePasses >= SETTLE_PASSES) return profileCache ?? [];
  settlePasses++;

  for (const profile of profileCache ?? []) {
    const kinds = profile.samples.map((sample) => {
      const land = elevation(profile.chart.direction(sample.u, sample.v, _probe));
      sample.land = land;
      const above = sample.height - land;   // road over the ground: a bridge
      const below = land - sample.height;   // ground over the road: a bore

      // A structure gives way once most of the reason for it has gone, and a
      // road takes one on once the full reason is there. The gap between the
      // two is what stops a stretch flickering between the pair of them every
      // time the land is carved again.
      if (sample.carries === 'tunnel') return below < TUNNEL_COVER * 0.6 ? 'road' : 'tunnel';
      if (sample.carries === 'bridge') return above < BRIDGE_CLEAR * 0.6 ? 'road' : 'bridge';
      if (above > BRIDGE_CLEAR) return 'bridge';
      if (below > TUNNEL_COVER) return 'tunnel';
      return 'road';
    });
    settleRuns(kinds);
    profile.samples.forEach((sample, i) => {
      sample.carries = kinds[i];
      sample.onGround = kinds[i] === 'road';
    });
  }
  return profileCache ?? [];
}

// --- asking where the streets are -------------------------------------------

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
      best = {
        id: street.id,
        kind: street.kind,
        width: street.width,
        distance,
        facing: { u: (pu - u) / (distance || 1), v: (pv - v) / (distance || 1) },
      };
    }
  }
  return best;
}

// The nearest street to a point on a face's map, and which way to face it.
export function nearestStreet(faceId, u, v) {
  return nearestOn(streetsOn(faceId), u, v);
}

// The nearest street to a point on the globe, whichever face laid it. A point
// close to the edge of a face has streets on both sides of that edge near it,
// and its own map only knows about half of them — so every face that can see
// the point gets asked, and the nearest answer wins.
const OFF_MAP = (GLOBE_RADIUS * Math.PI) / 4 + CELL;

export function streetUnder(direction) {
  let best = null;
  for (const faceId of FACE_IDS) {
    const { a, b } = grid.localOn(faceId, direction);
    const u = a * GLOBE_RADIUS;
    const v = b * GLOBE_RADIUS;
    if (!Number.isFinite(u) || Math.abs(u) > OFF_MAP || Math.abs(v) > OFF_MAP) continue;
    const street = nearestStreet(faceId, u, v);
    if (street && (!best || street.distance < best.distance)) best = street;
  }
  return best;
}

export function isOnPavement(faceId, u, v) {
  const street = nearestStreet(faceId, u, v);
  return street ? street.distance <= street.width / 2 + SIDEWALK_WIDTH : false;
}

// Is a point inside a street and its pavement, plus any clearance asked for?
export function isOnStreet(faceId, u, v, margin = 0) {
  const street = nearestStreet(faceId, u, v);
  return street ? street.distance < street.width / 2 + SIDEWALK_WIDTH + margin : false;
}

// The same question asked of the whole planet, for anything being stood on the
// ground: the street it would be standing in may belong to the next face.
export function isOnStreetAt(direction, margin = 0) {
  const street = streetUnder(direction);
  return street ? street.distance < street.width / 2 + SIDEWALK_WIDTH + margin : false;
}

// Every crossing of two grid streets on a face, with the way each of them runs
// there: what the rounded corners are built around.
export function junctionsOn(faceId) {
  const chart = chartFor(faceId);
  const lines = streetsOn(faceId).filter((street) => street.kind === 'grid');
  const points = [];

  for (let a = 0; a < lines.length; a++) {
    for (let b = a + 1; b < lines.length; b++) {
      const cross = crossingOf(lines[a], lines[b]);
      if (cross) points.push(cross);
    }
  }
  return points;

  function crossingOf(one, two) {
    // Grid streets are straight, so this is where two lines meet — if they do
    // so within both of their runs.
    const p = one.points[0];
    const r = { u: one.points[one.points.length - 1].u - p.u, v: one.points[one.points.length - 1].v - p.v };
    const q = two.points[0];
    const s = { u: two.points[two.points.length - 1].u - q.u, v: two.points[two.points.length - 1].v - q.v };
    const cross = r.u * s.v - r.v * s.u;
    if (Math.abs(cross) < 1e-6) return null;
    const t = ((q.u - p.u) * s.v - (q.v - p.v) * s.u) / cross;
    const w = ((q.u - p.u) * r.v - (q.v - p.v) * r.u) / cross;
    if (t < 0 || t > 1 || w < 0 || w > 1) return null;

    const runOne = Math.hypot(r.u, r.v) || 1;
    const runTwo = Math.hypot(s.u, s.v) || 1;
    return {
      u: p.u + r.u * t,
      v: p.v + r.v * t,
      chart,
      along: [{ u: r.u / runOne, v: r.v / runOne }, { u: s.u / runTwo, v: s.v / runTwo }],
    };
  }
}

// A spot beside a street, the given distance out from the centreline, facing
// along the kerb: where a car parks or a pedestrian walks.
export function kerbSpot(rng, offset, faceId = null) {
  const list = faceId ? streetsOn(faceId) : streets();
  if (!list.length) return null;
  const street = list[Math.floor(rng() * list.length)];
  const side = rng() < 0.5 ? -1 : 1;
  const s = Math.min(street.points.length - 2, Math.floor(rng() * (street.points.length - 1)));
  const a = street.points[s];
  const b = street.points[s + 1];
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const run = Math.hypot(du, dv) || 1;
  const out = offset + (street.width - ROAD_WIDTH) / 2;

  return {
    faceId: street.faceId,
    chart: street.chart,
    u: a.u + (dv / run) * side * out,
    v: a.v - (du / run) * side * out,
    facing: { u: (du / run) * side, v: (dv / run) * side },
  };
}

export { ROAD_WIDTH, SIDEWALK_WIDTH, CORNER_RADIUS, CELL };
