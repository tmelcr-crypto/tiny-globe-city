import * as THREE from 'three';
import {
  ROAD_WIDTH, SIDEWALK_WIDTH, BLOCK, LAKE_RADIUS, CORNER_RADIUS,
  ROAD_LIFT, SIDEWALK_LIFT, GROUND_LIFT,
  roadLines, surfacePoint, snapToRoad, parkBlock, lakeCentre,
  avenues, junctions, isOnAvenue,
} from './city-plan.js';

// Flat quads laid on a sphere sag in the middle; if that sag exceeds the height
// they're lifted by, the ground pokes through. Keeping every span short keeps
// the sag far below the lift, so surfaces stay clean without floating.
const STEP = 3;        // metres along a strip
const ACROSS = 2;      // bands across its width
const RINGS = 4;       // rings in a disc
const SCAN = 0.5;      // metres between tests for where a strip breaks
const ARC_STEPS = 6;   // segments in a rounded corner

// Avenues cross the grid roads. Both are asphalt, so the crossing would be two
// coplanar surfaces fighting over the same pixels — lift the avenues a hair.
const AVENUE_LIFT = ROAD_LIFT + 0.02;

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

// Which parts of a run survive a break. Scanning finely and then laying the
// surface over what is left keeps the kerb ending where the break begins,
// instead of a whole step at a time — otherwise gaps open up at junctions.
function keptSpans(from, to, skip) {
  if (!skip) return [[from, to]];
  const spans = [];
  let open = null;
  for (let at = from; at < to; at += SCAN) {
    const end = Math.min(to, at + SCAN);
    if (skip((at + end) / 2)) {
      if (open) { spans.push([open, at]); open = null; }
    } else if (!open) {
      open = at;
    }
  }
  if (open !== null) spans.push([open, to]);
  return spans.filter(([a, b]) => b - a > SCAN);
}

// A flat strip of given width running along a straight line on the map.
function addStrip(out, axis, from, to, at, halfWidth, lift) {
  const steps = Math.max(1, Math.ceil((to - from) / STEP));
  const span = (to - from) / steps;

  for (let s = 0; s < steps; s++) {
    const start = from + s * span;
    const end = start + span;

    for (let w = 0; w < ACROSS; w++) {
      const near = -halfWidth + (2 * halfWidth * w) / ACROSS;
      const far = -halfWidth + (2 * halfWidth * (w + 1)) / ACROSS;
      // axis 'u': the strip runs along u at constant v, so its width lies in v.
      const corner = (along, offset, target) => (axis === 'u'
        ? surfacePoint(along, at + offset, lift, target)
        : surfacePoint(at + offset, along, lift, target));

      corner(start, near, _a);
      corner(start, far, _b);
      corner(end, near, _c);
      corner(end, far, _d);
      pushTriangle(out, _a, _b, _c);
      pushTriangle(out, _b, _d, _c);
    }
  }
}

// The same, but following a polyline that bends — an avenue rather than a grid
// road. The width is carried around the curve on the average of the two
// segment normals, so there is no gap or overlap on the inside of a bend.
function addRibbon(out, points, halfWidth, lift, skip) {
  const normals = points.map((point, s) => {
    const back = points[Math.max(0, s - 1)];
    const ahead = points[Math.min(points.length - 1, s + 1)];
    const du = ahead.u - back.u;
    const dv = ahead.v - back.v;
    const run = Math.hypot(du, dv) || 1;
    return { u: dv / run, v: -du / run }; // perpendicular to the direction of travel
  });

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

// A band swept along an arc — the pavement going round a rounded corner.
function addArc(out, centre, inner, outer, from, to, lift) {
  const at = (radius, angle, target) => surfacePoint(
    centre.u + Math.cos(angle) * radius, centre.v + Math.sin(angle) * radius, lift, target
  );
  for (let s = 0; s < ARC_STEPS; s++) {
    const t0 = from + ((to - from) * s) / ARC_STEPS;
    const t1 = from + ((to - from) * (s + 1)) / ARC_STEPS;
    at(inner, t0, _a);
    at(outer, t0, _b);
    at(inner, t1, _c);
    at(outer, t1, _d);
    pushTriangle(out, _a, _b, _c);
    pushTriangle(out, _b, _d, _c);
  }
}

// The sliver of asphalt between a square corner and the arc that rounds it.
function addCornerFill(out, apex, centre, radius, from, to, lift) {
  surfacePoint(apex.u, apex.v, lift, _a);
  for (let s = 0; s < ARC_STEPS; s++) {
    const t0 = from + ((to - from) * s) / ARC_STEPS;
    const t1 = from + ((to - from) * (s + 1)) / ARC_STEPS;
    surfacePoint(centre.u + Math.cos(t0) * radius, centre.v + Math.sin(t0) * radius, lift, _b);
    surfacePoint(centre.u + Math.cos(t1) * radius, centre.v + Math.sin(t1) * radius, lift, _c);
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

// Roads, kerbed sidewalks, the park lawn and the lake, as four merged meshes
// laid onto the globe. Sidewalks break at junctions so crossings stay clear.
export function createCityGround() {
  const roads = [];
  const pavements = [];
  const half = ROAD_WIDTH / 2;
  // A sidewalk stops short of a junction: from there the rounded corner carries
  // it around. It also stops where an avenue cuts across it.
  const junctionHalf = half + CORNER_RADIUS;
  const breaks = (axis) => (at) => (value) => {
    if (Math.abs(value - snapToRoad(value, axis === 'u' ? 'v' : 'u')) < junctionHalf) return true;
    const u = axis === 'u' ? value : at;
    const v = axis === 'u' ? at : value;
    return isOnAvenue(u, v, SIDEWALK_WIDTH);
  };

  for (const line of roadLines()) {
    addStrip(roads, line.axis, line.from, line.to, line.at, half, ROAD_LIFT);
    const offset = half + SIDEWALK_WIDTH / 2;
    for (const side of [-1, 1]) {
      const at = line.at + side * offset;
      for (const [start, end] of keptSpans(line.from, line.to, breaks(line.axis)(at))) {
        addStrip(pavements, line.axis, start, end, at, SIDEWALK_WIDTH / 2, SIDEWALK_LIFT);
      }
    }
  }

  // Rounded corners. Each junction has four of them: the kerb sweeps an arc of
  // CORNER_RADIUS into the block, the pavement follows it round, and the
  // asphalt fills the sliver left between the arc and the old square corner.
  for (const junction of junctions()) {
    for (const [su, sv] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      const centre = {
        u: junction.u + su * (half + CORNER_RADIUS),
        v: junction.v + sv * (half + CORNER_RADIUS),
      };
      // The quadrant of the arc that faces back towards the junction.
      const from = su > 0 ? (sv > 0 ? Math.PI : Math.PI / 2) : (sv > 0 ? -Math.PI / 2 : 0);
      const to = from + Math.PI / 2;
      addCornerFill(roads, { u: junction.u + su * half, v: junction.v + sv * half },
        centre, CORNER_RADIUS, from, to, ROAD_LIFT);
      addArc(pavements, centre, CORNER_RADIUS - SIDEWALK_WIDTH, CORNER_RADIUS,
        from, to, SIDEWALK_LIFT);
    }
  }

  // The avenues, which follow their own curve across the grid.
  const onGrid = (margin) => (u, v) =>
    Math.abs(v - snapToRoad(v, 'u')) < half + margin ||
    Math.abs(u - snapToRoad(u, 'v')) < half + margin;

  avenues().forEach((avenue, index) => {
    // Each avenue sits a hair above the last for the same reason: where two of
    // them cross, one has to be on top.
    const lift = AVENUE_LIFT + index * 0.01;
    addRibbon(roads, avenue.points, avenue.width / 2, lift);
    const offset = avenue.width / 2 + SIDEWALK_WIDTH / 2;
    const skipAtCrossings = onGrid(SIDEWALK_WIDTH);
    for (const side of [-1, 1]) {
      const kerb = avenue.points.map((point, s) => {
        const back = avenue.points[Math.max(0, s - 1)];
        const ahead = avenue.points[Math.min(avenue.points.length - 1, s + 1)];
        const du = ahead.u - back.u;
        const dv = ahead.v - back.v;
        const run = Math.hypot(du, dv) || 1;
        return { u: point.u + (dv / run) * side * offset, v: point.v - (du / run) * side * offset };
      });
      addRibbon(pavements, kerb, SIDEWALK_WIDTH / 2, SIDEWALK_LIFT + index * 0.01, skipAtCrossings);
    }
  });

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
  group.name = 'city-ground';
  return group;
}
