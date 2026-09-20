import * as THREE from 'three';
import {
  ROAD_WIDTH, SIDEWALK_WIDTH, BLOCK, LAKE_RADIUS, CORNER_RADIUS,
  ROAD_LIFT, SIDEWALK_LIFT, GROUND_LIFT,
  streets, junctions, surfacePoint, parkBlock, lakeCentre,
} from './city-plan.js';

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

// Roads, kerbed sidewalks with rounded corners, the park lawn and the lake, as
// four merged meshes laid onto the globe.
export function createCityGround() {
  const roads = [];
  const pavements = [];
  const crossings = junctions();
  const all = streets();
  // Corners sit above every street's pavement, so the overlap where a kerb
  // runs into one is covered rather than fighting with it.
  const CORNER_LIFT = SIDEWALK_LIFT + all.length * LAYER;

  // A kerb runs until something interrupts it: a junction, where the rounded
  // corner takes over, or another street crossing it. Grid streets only ever
  // meet each other at junctions, so each kind only has to watch the other.
  const crossingStreets = (street) => all.filter((other) => (street.kind === 'avenue'
    ? other.kind !== 'avenue'
    : other.kind === 'avenue'));

  all.forEach((street, index) => {
    const lift = ROAD_LIFT + index * LAYER;
    addRibbon(roads, street.points, street.width / 2, lift);

    const half = street.width / 2;
    const offset = half + SIDEWALK_WIDTH / 2;
    // Where the straight kerb hands over to the corner arc: the arc's own end,
    // measured from the junction.
    // A metre short of where the arc starts, so the two overlap rather than
    // leaving a hairline of grass between them.
    const handover = Math.hypot(offset, half + CORNER_RADIUS) - 1;
    const others = crossingStreets(street);

    const breaks = (u, v) => crossings.some(
      (junction) => Math.hypot(u - junction.u, v - junction.v) < handover
    ) || others.some((other) => nearestPointOn(other.points, u, v) < other.width / 2 + SIDEWALK_WIDTH);

    for (const side of [-1, 1]) {
      const kerb = resample(kerbLine(street.points, offset, side));
      for (const run of trim(kerb, breaks)) {
        addRibbon(pavements, run, SIDEWALK_WIDTH / 2, SIDEWALK_LIFT + index * LAYER);
      }
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
