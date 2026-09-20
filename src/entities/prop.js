import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { range } from '../core/rng.js';

// Street furniture and small scenery, described declaratively in
// data/props.json as a handful of primitives. A new asset is a new entry
// there, not new code here — which is what lets the catalogue grow.
//
//   { "shape": "box", "size": [1.8, 0.1, 0.5], "at": [0, 0.45, 0], "color": "#8a5a2b" }
//
// Every prop is built with its origin at ground level, so placing it on the
// surface stands it on the ground like everything else.

const materials = new Map();
function materialFor(color) {
  let material = materials.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, flatShading: true });
    materials.set(color, material);
  }
  return material;
}

function geometryFor(part) {
  const [x = 1, y = 1, z = 1] = part.size ?? [];
  switch (part.shape) {
    case 'cylinder':
      // size: [radius, height, radiusBottom?]
      return new THREE.CylinderGeometry(x, z || x, y, part.sides ?? 10);
    case 'cone':
      return new THREE.ConeGeometry(x, y, part.sides ?? 8);
    case 'sphere':
      return new THREE.IcosahedronGeometry(x, part.detail ?? 0);
    case 'box':
    default:
      return new THREE.BoxGeometry(x, y, z);
  }
}

function buildPart(part) {
  // Spheres come out non-indexed while boxes and cylinders are indexed, and
  // mergeGeometries refuses to mix the two — normalise before merging.
  const raw = geometryFor(part);
  const geometry = raw.index ? raw.toNonIndexed() : raw;
  const [rx = 0, ry = 0, rz = 0] = part.turn ?? [];
  if (rx) geometry.rotateX((rx * Math.PI) / 180);
  if (ry) geometry.rotateY((ry * Math.PI) / 180);
  if (rz) geometry.rotateZ((rz * Math.PI) / 180);
  const [ax = 0, ay = 0, az = 0] = part.at ?? [];
  return geometry.translate(ax, ay, az);
}

// Parts sharing a colour merge into one mesh, so a prop costs a draw call per
// distinct colour rather than one per piece.
export function createProp(def, rng = Math.random) {
  const group = new THREE.Group();
  const byColor = new Map();

  for (const part of def.parts) {
    const color = part.color ?? '#cccccc';
    if (!byColor.has(color)) byColor.set(color, []);
    byColor.get(color).push(buildPart(part));
  }

  for (const [color, parts] of byColor) {
    group.add(new THREE.Mesh(mergeGeometries(parts), materialFor(color)));
  }

  if (def.turnable) group.rotation.y = range(rng, [0, Math.PI * 2]);

  group.name = def.id;
  group.userData.kind = def.id;
  group.userData.footprint = def.footprint;
  return group;
}
