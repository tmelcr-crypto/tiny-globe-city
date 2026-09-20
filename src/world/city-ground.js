import * as THREE from 'three';
import {
  ROAD_WIDTH, SIDEWALK_WIDTH, BLOCK, LAKE_RADIUS, CORNER_RADIUS,
  ROAD_LIFT, SIDEWALK_LIFT, GROUND_LIFT,
  streets, streetProfiles, junctions, surfacePoint, parkBlock, lakeCentre,
  directionFromTangent,
} from './city-plan.js';
import { GLOBE_RADIUS } from './planet.js';
import { elevation } from './terrain.js';

// Flat quads laid on a sphere sag in the middle; if that sag exceeds the height
// they're lifted by, the ground pokes through. Keeping every span short keeps
// the sag far below the lift, so surfaces stay clean without floating.
const ACROSS = 2;      // bands across a strip's width
const RINGS = 4;       // rings in a disc
const ARC_STEPS = 6;   // segments in a rounded corner
const SCAN = 0.5;      // metres between tests for where a pavement breaks

// Streets cross each other. They are all asphalt, so a crossing would be two
// coplanar surfaces fighting over the same pixels — lift each street a hair
// above the last.
const LAYER = 0.015;

const ASPHALT = new THREE.MeshStandardMaterial({ color: 0x3a3d42, flatShading: true, side: THREE.DoubleSide });
const PAVING = new THREE.MeshStandardMaterial({ color: 0x9a9a95, flatShading: true, side: THREE.DoubleSide });
const LAWN = new THREE.MeshStandardMaterial({ color: 0x5aa551, flatShading: true, side: THREE.DoubleSide });
const WATER = new THREE.MeshStandardMaterial({ color: 0x2f6f9f, flatShading: true, side: THREE.DoubleSide });

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

function pushTriangle(out, p, q, r) {
  out.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
}

// The sideways direction at each point of a polyline, averaged between the two
// segments that meet there so a bend has no gap or overlap on its inside.
function normalsAlong(points) {
  return points.map((point, s) => {
    const back = points[Math.max(0, s - 1)];
    const ahead = points[Math.min(points.length - 1, s + 1)];
    const du = ahead.u - back.u;
    const dv = ahead.v - back.v;
    const run = Math.hypot(du, dv) || 1;
    return { u: dv / run, v: -du / run };
  });
}

// A flat band of given width running along a polyline on the map.
function addRibbon(out, points, halfWidth, lift, skip) {
  const normals = normalsAlong(points);

  for (let s = 0; s < points.length - 1; s++) {
    const p = points[s];
    const q = points[s + 1];
    if (skip && skip((p.u + q.u) / 2, (p.v + q.v) / 2)) continue;
    const np = normals[s];
    const nq = normals[s + 1];

    for (let w = 0; w < ACROSS; w++) {
      const near = -halfWidth + (2 * halfWidth * w) / ACROSS;
      const far = -halfWidth + (2 * halfWidth * (w + 1)) / ACROSS;
      surfacePoint(p.u + np.u * near, p.v + np.v * near, lift, _a);
      surfacePoint(p.u + np.u * far, p.v + np.v * far, lift, _b);
      surfacePoint(q.u + nq.u * near, q.v + nq.v * near, lift, _c);
      surfacePoint(q.u + nq.u * far, q.v + nq.v * far, lift, _d);
      pushTriangle(out, _a, _b, _c);
      pushTriangle(out, _b, _d, _c);
    }
  }
}

// The line a kerb follows: the street's polyline, pushed out to one side.
function kerbLine(points, offset, side) {
  const normals = normalsAlong(points);
  return points.map((point, s) => ({
    u: point.u + normals[s].u * side * offset,
    v: point.v + normals[s].v * side * offset,
  }));
}

// Round a corner between two streets. The kerb sweeps an arc of CORNER_RADIUS
// into the block, about a point set back from the junction along both streets.
// It works whichever way the two streets happen to run, which matters once
// they are cell edges on a globe rather than lines on a drawing.
function cornerCentre(junction, first, second, radius) {
  const reach = ROAD_WIDTH / 2 + radius;
  return {
    u: junction.u + (first.u + second.u) * reach,
    v: junction.v + (first.v + second.v) * reach,
  };
}

// The quarter turn about that point, at whatever radius is wanted: the kerb
// itself, or the middle of the pavement just inside it.
function arcAbout(centre, first, second, radius) {
  const points = [];
  for (let s = 0; s <= ARC_STEPS; s++) {
    const angle = (Math.PI / 2) * (s / ARC_STEPS);
    const towards = Math.cos(angle);
    const away = Math.sin(angle);
    points.push({
      u: centre.u - radius * (first.u * towards + second.u * away),
      v: centre.v - radius * (first.v * towards + second.v * away),
    });
  }
  return points;
}

// The sliver of asphalt left between the square corner and the arc rounding it.
function addCornerFill(out, junction, first, second, arc, lift) {
  const half = ROAD_WIDTH / 2;
  const apex = {
    u: junction.u + (first.u + second.u) * half,
    v: junction.v + (first.v + second.v) * half,
  };
  surfacePoint(apex.u, apex.v, lift, _a);
  for (let s = 0; s < arc.length - 1; s++) {
    surfacePoint(arc[s].u, arc[s].v, lift, _b);
    surfacePoint(arc[s + 1].u, arc[s + 1].v, lift, _c);
    pushTriangle(out, _a, _b, _c);
  }
}

// A disc lying on the surface, built as concentric rings so it hugs the curve.
function addDisc(out, centre, radius, lift, segments = 32) {
  const at = (r, t, target) =>
    surfacePoint(centre.u + Math.cos(t) * r, centre.v + Math.sin(t) * r, lift, target);

  for (let ring = 0; ring < RINGS; ring++) {
    const inner = (radius * ring) / RINGS;
    const outer = (radius * (ring + 1)) / RINGS;
    for (let s = 0; s < segments; s++) {
      const t0 = (s / segments) * Math.PI * 2;
      const t1 = ((s + 1) / segments) * Math.PI * 2;
      at(inner, t0, _a);
      at(outer, t0, _b);
      at(inner, t1, _c);
      at(outer, t1, _d);
      pushTriangle(out, _a, _b, _c);
      pushTriangle(out, _b, _d, _c);
    }
  }
}

function addRect(out, centre, halfU, halfV, lift, steps = 14) {
  for (let a = 0; a < steps; a++) {
    for (let b = 0; b < steps; b++) {
      const u0 = centre.u - halfU + (2 * halfU * a) / steps;
      const u1 = centre.u - halfU + (2 * halfU * (a + 1)) / steps;
      const v0 = centre.v - halfV + (2 * halfV * b) / steps;
      const v1 = centre.v - halfV + (2 * halfV * (b + 1)) / steps;
      surfacePoint(u0, v0, lift, _a);
      surfacePoint(u1, v0, lift, _b);
      surfacePoint(u0, v1, lift, _c);
      surfacePoint(u1, v1, lift, _d);
      pushTriangle(out, _a, _b, _c);
      pushTriangle(out, _b, _d, _c);
    }
  }
}

function meshFrom(positions, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

// Chop a kerb line wherever it runs into a junction or another street, finely
// enough that it stops exactly where the break begins.
function trim(points, skip) {
  const runs = [];
  let run = [];
  for (let s = 0; s < points.length; s++) {
    if (skip(points[s].u, points[s].v)) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else {
      run.push(points[s]);
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

// Split a polyline finely so a break lands where it should rather than a whole
// segment early.
function resample(points, step = SCAN) {
  const dense = [];
  for (let s = 0; s < points.length - 1; s++) {
    const p = points[s];
    const q = points[s + 1];
    const parts = Math.max(1, Math.ceil(Math.hypot(q.u - p.u, q.v - p.v) / step));
    for (let n = 0; n < parts; n++) {
      dense.push({ u: p.u + ((q.u - p.u) * n) / parts, v: p.v + ((q.v - p.v) * n) / parts });
    }
  }
  dense.push(points[points.length - 1]);
  return dense;
}


// --- bridges and tunnels -----------------------------------------------------
//
// Earthworks can only do so much. Where a street's profile leaves the ground
// behind it is carried: a deck on piers over the valley or the river, or a
// bore through the ridge with a portal at each end.

const DECK = new THREE.MeshStandardMaterial({ color: 0x55585e, flatShading: true });
const PIER = new THREE.MeshStandardMaterial({ color: 0x8a8880, flatShading: true });
const PORTAL = new THREE.MeshStandardMaterial({ color: 0x6f6d68, flatShading: true });
const BORE = new THREE.MeshStandardMaterial({
  color: 0x2a2b2e, flatShading: true, side: THREE.DoubleSide,
});

const DECK_THICKNESS = 0.9;
const PARAPET = 0.55;
const PIER_EVERY = 14;       // metres between piers
const ARCH_SEGMENTS = 9;

const _up = new THREE.Vector3();
const _along = new THREE.Vector3();
const _across = new THREE.Vector3();
const _at = new THREE.Vector3();

// The frame at a point on a street: which way is up, along and across.
function frameOn(sample, next) {
  directionFromTangent(sample.u, sample.v, _up).normalize();
  const du = next.u - sample.u;
  const dv = next.v - sample.v;
  const run = Math.hypot(du, dv) || 1;
  // A step along the street, laid flat on the ground.
  directionFromTangent(sample.u + (du / run) * 2, sample.v + (dv / run) * 2, _at).normalize();
  _along.copy(_at).addScaledVector(_up, -_at.dot(_up)).normalize();
  _across.crossVectors(_along, _up).normalize();
  return { up: _up.clone(), along: _along.clone(), across: _across.clone() };
}

const pointAt = (sample, height, target = new THREE.Vector3()) =>
  directionFromTangent(sample.u, sample.v, target).multiplyScalar(GLOBE_RADIUS + height);

// The stretches of one street that share a kind, as runs of samples.
function runsOf(profile) {
  const runs = [];
  let start = 0;
  const { samples } = profile;
  for (let i = 1; i <= samples.length; i++) {
    if (i < samples.length && samples[i].carries === samples[start].carries) continue;
    runs.push({ carries: samples[start].carries, from: start, to: Math.min(i, samples.length - 1) });
    start = i;
  }
  return runs;
}

// A box between two rings of four corners, pushed into the positions array.
function addBox(out, a, b) {
  const quad = (p, q, r, s) => {
    pushTriangle(out, p, q, r);
    pushTriangle(out, q, s, r);
  };
  quad(a[0], a[1], b[0], b[1]);  // top
  quad(a[3], a[2], b[3], b[2]);  // bottom
  quad(a[1], a[3], b[1], b[3]);  // one side
  quad(a[2], a[0], b[2], b[0]);  // the other
}

// Four corners of the deck's cross-section at a sample.
function deckRing(sample, height, frame, halfWidth, thickness) {
  const centre = pointAt(sample, height);
  const out = [];
  for (const side of [-1, 1]) {
    for (const drop of [0, -thickness]) {
      out.push(centre.clone()
        .addScaledVector(frame.across, side * halfWidth)
        .addScaledVector(frame.up, drop));
    }
  }
  // order: left-top, left-bottom, right-top, right-bottom → as addBox expects
  return [out[0], out[2], out[1], out[3]];
}

function addBridge(group, profile, run) {
  const deck = [];
  const piers = [];
  const { samples } = profile;
  const half = profile.width / 2 + SIDEWALK_WIDTH;
  let sincePier = PIER_EVERY;

  for (let i = run.from; i < run.to; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const frameA = frameOn(a, b);
    const frameB = frameOn(b, a);
    frameB.along.negate();
    frameB.across.negate();

    addBox(deck,
      deckRing(a, a.height, frameA, half, DECK_THICKNESS),
      deckRing(b, b.height, frameB, half, DECK_THICKNESS));

    // Parapets, so the deck reads as a bridge from on top of it.
    for (const side of [-1, 1]) {
      const edgeA = deckRing(a, a.height + PARAPET / 2, frameA, half, PARAPET);
      const edgeB = deckRing(b, b.height + PARAPET / 2, frameB, half, PARAPET);
      const pick = side < 0 ? [0, 1] : [2, 3];
      const inset = (ring, n) => ring[pick[n]].clone().addScaledVector(frameA.across, -side * 0.35);
      addBox(deck,
        [edgeA[pick[0]], inset(edgeA, 0), edgeA[pick[1]], inset(edgeA, 1)],
        [edgeB[pick[0]], inset(edgeB, 0), edgeB[pick[1]], inset(edgeB, 1)]);
    }

    sincePier += Math.hypot(b.u - a.u, b.v - a.v);
    const clear = a.height - a.land;
    if (sincePier >= PIER_EVERY && clear > 3) {
      sincePier = 0;
      const top = pointAt(a, a.height - DECK_THICKNESS);
      const foot = pointAt(a, a.land - 1.5);
      const ring = (point, wide) => [
        point.clone().addScaledVector(frameA.across, -wide).addScaledVector(frameA.along, -wide),
        point.clone().addScaledVector(frameA.across, wide).addScaledVector(frameA.along, -wide),
        point.clone().addScaledVector(frameA.across, -wide).addScaledVector(frameA.along, wide),
        point.clone().addScaledVector(frameA.across, wide).addScaledVector(frameA.along, wide),
      ];
      addBox(piers, ring(top, 1.6), ring(foot, 2.1));
    }
  }

  if (deck.length) group.add(meshFrom(deck, DECK));
  if (piers.length) group.add(meshFrom(piers, PIER));
}

// A half-pipe of triangles over the road: what you drive through inside a hill.
function addTunnel(group, profile, run) {
  const bore = [];
  const portals = [];
  const { samples } = profile;
  const half = profile.width / 2 + 0.4;

  // The arch is cut to whatever cover the hill has at that point, so it never
  // breaks out through the top of what it is bored through.
  const arch = (sample, deckHeight, frame, scale) => {
    const centre = pointAt(sample, deckHeight);
    const height = Math.max(3.2, Math.min(5, sample.land - sample.height - 2));
    const ring = [];
    for (let s = 0; s <= ARCH_SEGMENTS; s++) {
      const angle = Math.PI * (s / ARCH_SEGMENTS);
      ring.push(centre.clone()
        .addScaledVector(frame.across, Math.cos(angle) * half * scale)
        .addScaledVector(frame.up, Math.sin(angle) * height * scale));
    }
    return ring;
  };

  // Only bore where there is hill on both sides of the road as well as over
  // it. Where a neighbouring street has cut the slope away the road is in a
  // cutting, whatever the profile thought, and a tube there would stand out in
  // the open.
  const buried = (sample, frame) => {
    const dir = new THREE.Vector3();
    for (const side of [-1, 1]) {
      dir.copy(pointAt(sample, sample.height)).addScaledVector(frame.across, side * half).normalize();
      if (elevation(dir) < sample.height + 2) return false;
    }
    return true;
  };

  for (let i = run.from; i < run.to; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const frameA = frameOn(a, b);
    const frameB = frameOn(b, a);
    frameB.across.negate();
    if (!buried(a, frameA) || !buried(b, frameB)) continue;
    const ringA = arch(a, a.height, frameA, 1);
    const ringB = arch(b, b.height, frameB, 1);
    for (let s = 0; s < ARCH_SEGMENTS; s++) {
      pushTriangle(bore, ringA[s], ringA[s + 1], ringB[s]);
      pushTriangle(bore, ringA[s + 1], ringB[s + 1], ringB[s]);
    }
  }

  // A rim of stone at each end, where the road goes into the hill.
  for (const [end, other] of [[run.from, run.from + 1], [run.to, run.to - 1]]) {
    const sample = samples[end];
    const neighbour = samples[Math.max(0, Math.min(samples.length - 1, other))];
    const frame = frameOn(sample, neighbour);
    const inner = arch(sample, sample.height, frame, 1);
    const outer = arch(sample, sample.height, frame, 1.22);
    for (let s = 0; s < ARCH_SEGMENTS; s++) {
      pushTriangle(portals, inner[s], outer[s], inner[s + 1]);
      pushTriangle(portals, outer[s], outer[s + 1], inner[s + 1]);
    }
  }

  if (bore.length) group.add(meshFrom(bore, BORE));
  if (portals.length) group.add(meshFrom(portals, PORTAL));
}

// A band laid along a street at the height its profile says, offset sideways
// for a kerb. On the level it sits on the carved bed; over a bridge or through
// a tunnel it keeps to the deck.
function addProfileRibbon(out, samples, offset, halfWidth, lift, skip) {
  // The last sample has nothing ahead of it to take a bearing from, so it
  // looks back at the one before and turns round. Without this its frame comes
  // out as nothing at all, and the road ends in a pair of stray wings.
  const frames = samples.map((sample, s) => {
    if (s + 1 < samples.length) return frameOn(sample, samples[s + 1]);
    const frame = frameOn(sample, samples[s - 1]);
    frame.along.negate();
    frame.across.negate();
    return frame;
  });
  for (let s = 0; s < samples.length - 1; s++) {
    const a = samples[s];
    const b = samples[s + 1];
    if (skip && skip((a.u + b.u) / 2, (a.v + b.v) / 2)) continue;

    const edge = (sample, frame, across) => pointAt(sample, sample.height + lift, new THREE.Vector3())
      .addScaledVector(frame.across, offset + across);

    for (let w = 0; w < ACROSS; w++) {
      const near = -halfWidth + (2 * halfWidth * w) / ACROSS;
      const far = -halfWidth + (2 * halfWidth * (w + 1)) / ACROSS;
      pushTriangle(out, edge(a, frames[s], near), edge(a, frames[s], far), edge(b, frames[s + 1], near));
      pushTriangle(out, edge(a, frames[s], far), edge(b, frames[s + 1], far), edge(b, frames[s + 1], near));
    }
  }
}

// Roads, kerbed sidewalks with rounded corners, the park lawn and the lake, as
// four merged meshes laid onto the globe.
export function createCityGround() {
  const roads = [];
  const pavements = [];
  const crossings = junctions();
  const all = streets();
  const structures = new THREE.Group();
  // Corners sit above every street's pavement, so the overlap where a kerb
  // runs into one is covered rather than fighting with it.
  const CORNER_LIFT = SIDEWALK_LIFT + all.length * LAYER;

  // A kerb runs until something interrupts it: a junction, where the rounded
  // corner takes over, or another street crossing it. Grid streets only ever
  // meet each other at junctions, so each kind only has to watch the other.
  const crossingStreets = (street) => all.filter((other) => (street.kind === 'avenue'
    ? other.kind !== 'avenue'
    : other.kind === 'avenue'));

  const profiles = streetProfiles();
  profiles.forEach((profile, index) => {
    const lift = ROAD_LIFT + index * LAYER;
    addProfileRibbon(roads, profile.samples, 0, profile.width / 2, lift);

    const half = profile.width / 2;
    const offset = half + SIDEWALK_WIDTH / 2;
    // Where the straight kerb hands over to the corner arc: the arc's own end,
    // measured from the junction, less a metre so the two overlap.
    const handover = Math.hypot(offset, half + CORNER_RADIUS) - 1;
    const others = all.filter((other) => (profile.kind === 'avenue'
      ? other.kind !== 'avenue'
      : other.kind === 'avenue'));

    const breaks = (u, v) => crossings.some(
      (junction) => Math.hypot(u - junction.u, v - junction.v) < handover
    ) || others.some((other) => nearestPointOn(other.points, u, v) < other.width / 2 + SIDEWALK_WIDTH);

    for (const side of [-1, 1]) {
      addProfileRibbon(pavements, profile.samples, side * offset, SIDEWALK_WIDTH / 2,
        SIDEWALK_LIFT + index * LAYER, breaks);
    }

    // What carries the road where the earth cannot.
    for (const run of runsOf(profile)) {
      if (run.to - run.from < 1) continue;
      if (run.carries === 'bridge') addBridge(structures, profile, run);
      if (run.carries === 'tunnel') addTunnel(structures, profile, run);
    }
  });

  // Rounded corners: four to a junction, each turning between the two streets
  // that meet there.
  for (const junction of crossings) {
    const [first, second] = junction.along;
    for (const [s1, s2] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      const one = { u: first.u * s1, v: first.v * s1 };
      const two = { u: second.u * s2, v: second.v * s2 };
      const centre = cornerCentre(junction, one, two, CORNER_RADIUS);
      addCornerFill(roads, junction, one, two, arcAbout(centre, one, two, CORNER_RADIUS), ROAD_LIFT);
      addRibbon(
        pavements,
        arcAbout(centre, one, two, CORNER_RADIUS - SIDEWALK_WIDTH / 2),
        SIDEWALK_WIDTH / 2,
        CORNER_LIFT
      );
    }
  }

  const group = new THREE.Group();

  const park = parkBlock();
  if (park) {
    const lawn = [];
    addRect(lawn, park, BLOCK / 2, BLOCK / 2, GROUND_LIFT);
    group.add(meshFrom(lawn, LAWN));

    const water = [];
    addDisc(water, lakeCentre(), LAKE_RADIUS, GROUND_LIFT + 0.03);
    group.add(meshFrom(water, WATER));
  }

  group.add(meshFrom(roads, ASPHALT));
  group.add(meshFrom(pavements, PAVING));
  group.add(structures);
  group.name = 'city-ground';
  return group;
}

// How far a point is from a polyline, for working out where kerbs break.
function nearestPointOn(points, u, v) {
  let best = Infinity;
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s];
    const b = points[s + 1];
    const du = b.u - a.u;
    const dv = b.v - a.v;
    const length2 = du * du + dv * dv;
    const t = length2 < 1e-9 ? 0
      : Math.min(1, Math.max(0, ((u - a.u) * du + (v - a.v) * dv) / length2));
    best = Math.min(best, Math.hypot(u - (a.u + du * t), v - (a.v + dv * t)));
  }
  return best;
}
