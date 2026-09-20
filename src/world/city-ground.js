import * as THREE from 'three';
import {
  ROAD_WIDTH, SIDEWALK_WIDTH, CELL, BLOCK, LAKE_RADIUS, ROAD_OFFSET,
  ROAD_LIFT, SIDEWALK_LIFT, GROUND_LIFT,
  roadLines, surfacePoint, blockCentre, lakeCentre, PARK_BLOCK,
} from './city-plan.js';

// Flat quads laid on a sphere sag in the middle; if that sag exceeds the height
// they're lifted by, the ground pokes through. Keeping every span short keeps
// the sag far below the lift, so surfaces stay clean without floating.
const STEP = 3;        // metres along a strip
const ACROSS = 2;      // bands across its width
const RINGS = 4;       // rings in a disc

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

// A flat strip of given width running along a straight line on the map.
function addStrip(out, axis, at, from, to, halfWidth, lift, skip) {
  const steps = Math.max(1, Math.ceil((to - from) / STEP));
  const span = (to - from) / steps;

  for (let s = 0; s < steps; s++) {
    const start = from + s * span;
    const end = start + span;
    if (skip && skip(start + span / 2)) continue;

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
  const junctionHalf = ROAD_WIDTH / 2 + SIDEWALK_WIDTH;
  const atJunction = (value) => {
    const nearest = Math.round((value - ROAD_OFFSET) / CELL) * CELL + ROAD_OFFSET;
    return Math.abs(value - nearest) < junctionHalf;
  };

  for (const line of roadLines()) {
    addStrip(roads, line.axis, line.at, line.from, line.to, ROAD_WIDTH / 2, ROAD_LIFT);
    const offset = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2;
    for (const side of [-1, 1]) {
      addStrip(
        pavements, line.axis, line.at + side * offset, line.from, line.to,
        SIDEWALK_WIDTH / 2, SIDEWALK_LIFT, atJunction
      );
    }
  }

  const park = [];
  addRect(park, blockCentre(PARK_BLOCK), BLOCK / 2, BLOCK / 2, GROUND_LIFT);

  const lake = [];
  addDisc(lake, lakeCentre(), LAKE_RADIUS, GROUND_LIFT + 0.03);

  const group = new THREE.Group();
  group.add(meshFrom(park, LAWN));
  group.add(meshFrom(lake, WATER));
  group.add(meshFrom(roads, ASPHALT));
  group.add(meshFrom(pavements, PAVING));
  group.name = 'city-ground';
  return group;
}
