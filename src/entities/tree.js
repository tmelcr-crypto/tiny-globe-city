import * as THREE from 'three';

// Four kinds of tree, 2 m to 5 m tall. Every one is built with its origin at the
// base of the trunk, so placing it on the surface stands it on the ground, and
// each is sized so its crown tops out at exactly the height asked for.
export const TREE_KINDS = ['pine', 'oak', 'birch', 'bush'];

// A three.js icosahedron's extreme vertex sits at this fraction of its radius,
// not at the full radius — the difference is what made foliage hover.
const ICO_EXTENT = 0.8506508;

const BARK = new THREE.MeshStandardMaterial({ color: 0x5b3a1e, flatShading: true });
const PALE_BARK = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, flatShading: true });
const PINE_LEAF = new THREE.MeshStandardMaterial({ color: 0x2c6b36, flatShading: true });
const OAK_LEAF = new THREE.MeshStandardMaterial({ color: 0x3f8b3f, flatShading: true });
const BIRCH_LEAF = new THREE.MeshStandardMaterial({ color: 0x6aa84f, flatShading: true });
const BUSH_LEAF = new THREE.MeshStandardMaterial({ color: 0x35722f, flatShading: true });

const RANGES = { pine: [3.5, 5], oak: [3, 4.5], birch: [3, 4.5], bush: [2, 2.5] };

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

const BUILDERS = { pine, oak, birch, bush };

export function createTree(kind = TREE_KINDS[Math.floor(Math.random() * TREE_KINDS.length)]) {
  const [min, max] = RANGES[kind];
  const height = min + Math.random() * (max - min);

  const group = new THREE.Group();
  const spread = BUILDERS[kind](group, height);
  group.name = kind;
  group.userData.kind = kind;
  group.userData.height = height;
  group.userData.footprint = spread;
  return group;
}
