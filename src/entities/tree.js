import * as THREE from 'three';
import { range, pick } from '../core/rng.js';

// Six kinds of tree. Every one is built with its origin at the base of the
// trunk, so placing it on the surface stands it on the ground, and each is
// sized so its crown tops out at exactly the height asked for.
//
// Which one grows where is the country's business, not this module's: see
// world/biome.js. Palms line the beach, cactus stands in the desert, and the
// other four are the temperate ones.
export const TREE_KINDS = ['pine', 'oak', 'birch', 'bush', 'palm', 'cactus'];

// A three.js icosahedron's extreme vertex sits at this fraction of its radius,
// not at the full radius — the difference is what made foliage hover.
const ICO_EXTENT = 0.8506508;

const BARK = new THREE.MeshStandardMaterial({ color: 0x5b3a1e, flatShading: true });
const PALE_BARK = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, flatShading: true });
const PINE_LEAF = new THREE.MeshStandardMaterial({ color: 0x2c6b36, flatShading: true });
const OAK_LEAF = new THREE.MeshStandardMaterial({ color: 0x3f8b3f, flatShading: true });
const BIRCH_LEAF = new THREE.MeshStandardMaterial({ color: 0x6aa84f, flatShading: true });
const BUSH_LEAF = new THREE.MeshStandardMaterial({ color: 0x35722f, flatShading: true });

const PALM_BARK = new THREE.MeshStandardMaterial({ color: 0x9b7f56, flatShading: true });
const PALM_LEAF = new THREE.MeshStandardMaterial({ color: 0x4f9a4a, flatShading: true });
const CACTUS_FLESH = new THREE.MeshStandardMaterial({ color: 0x4b7a46, flatShading: true });

const RANGES = {
  pine: [3.5, 5], oak: [3, 4.5], birch: [3, 4.5], bush: [2, 2.5],
  palm: [5, 8], cactus: [1.8, 3.6],
};

function trunk(group, material, radiusTop, radiusBottom, height) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 6), material);
  mesh.position.y = height / 2;
  group.add(mesh);
}

// Conifer: bare trunk under two stacked skirts of needles.
function pine(group, height) {
  trunk(group, BARK, 0.1, 0.16, height * 0.32);

  const lower = new THREE.Mesh(new THREE.ConeGeometry(height * 0.25, height * 0.5, 7), PINE_LEAF);
  lower.position.y = height * 0.5;
  const upper = new THREE.Mesh(new THREE.ConeGeometry(height * 0.17, height * 0.4, 7), PINE_LEAF);
  upper.position.y = height * 0.8; // half its own height below the tip
  group.add(lower, upper);
  return height * 0.25;
}

// Broadleaf: short thick trunk under a round canopy.
function oak(group, height) {
  trunk(group, BARK, 0.14, 0.2, height * 0.4);

  const radius = height * 0.42;
  const squash = 0.85;
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), OAK_LEAF);
  crown.scale.y = squash;
  crown.position.y = height - radius * ICO_EXTENT * squash;
  group.add(crown);
  return radius * ICO_EXTENT;
}

// Slender pale trunk with a small high canopy.
function birch(group, height) {
  trunk(group, PALE_BARK, 0.07, 0.1, height * 0.62);

  const radius = height * 0.26;
  const stretch = 1.2;
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), BIRCH_LEAF);
  crown.scale.y = stretch;
  crown.position.y = height - radius * ICO_EXTENT * stretch;
  group.add(crown);
  return radius * ICO_EXTENT;
}

// Low shrub, no visible trunk: a lobe resting on the ground.
function bush(group, height) {
  const radius = height / (2 * ICO_EXTENT);
  const centre = radius * ICO_EXTENT; // sits the lobe exactly on the ground

  const main = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), BUSH_LEAF);
  main.position.y = centre;
  const side = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.62, 0), BUSH_LEAF);
  side.position.set(radius * 0.7, centre * 0.8, radius * 0.2);
  group.add(main, side);
  return radius * ICO_EXTENT * 1.4;
}

// Palm: a bare leaning trunk with a crown of fronds sagging off the top.
function palm(group, height) {
  const lean = 0.12 + Math.random() * 0.1;
  const segments = 5;
  for (let s = 0; s < segments; s++) {
    const at = (s + 0.5) / segments;
    const piece = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13 - at * 0.05, 0.17 - at * 0.05, height / segments, 6),
      PALM_BARK
    );
    piece.position.set(lean * height * at * at, (height * (s + 0.5)) / segments, 0);
    piece.rotation.z = -lean * at;
    group.add(piece);
  }

  const top = new THREE.Vector3(lean * height, height, 0);
  for (let f = 0; f < 7; f++) {
    const angle = (f / 7) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.42, height * 0.52, 4), PALM_LEAF);
    frond.position.copy(top)
      .add(new THREE.Vector3(Math.cos(angle) * height * 0.2, -height * 0.05, Math.sin(angle) * height * 0.2));
    frond.rotation.set(Math.PI / 2.3, 0, -angle);
    group.add(frond);
  }
  return height * 0.3;
}

// Cactus: a column with an arm or two, like every desert ever drawn.
function cactus(group, height) {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, height, 7), CACTUS_FLESH);
  body.position.y = height / 2;
  group.add(body);

  const arms = height > 2.6 ? 2 : 1;
  for (let a = 0; a < arms; a++) {
    const side = a === 0 ? 1 : -1;
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, height * 0.38, 6), CACTUS_FLESH);
    up.position.set(side * 0.46, height * (0.55 + a * 0.12), 0);
    const out = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.62, 6), CACTUS_FLESH);
    out.rotation.z = Math.PI / 2;
    out.position.set(side * 0.24, height * (0.38 + a * 0.12), 0);
    group.add(up, out);
  }
  return 0.55;
}

const BUILDERS = { pine, oak, birch, bush, palm, cactus };

export function createTree(kind = null, rng = Math.random) {
  const chosen = kind ?? pick(rng, TREE_KINDS);
  const height = range(rng, RANGES[chosen]);

  const group = new THREE.Group();
  const spread = BUILDERS[chosen](group, height);
  group.name = chosen;
  group.userData.kind = chosen;
  group.userData.height = height;
  group.userData.footprint = spread;
  return group;
}
