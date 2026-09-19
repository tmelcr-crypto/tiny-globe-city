import * as THREE from 'three';

const WALL_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xcccccc });
const ROOF_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x8a5a44 });

// Each factory returns a mesh/group whose ground plane is local y=0, so
// world/globe.js can seat it flush against the sphere by that plane.
const TYPES = [createBlock, createTower, createApartment, createChurch];

export function createRandomBuilding() {
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];
  return type();
}

function box(width, height, depth, material = WALL_MATERIAL) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.y = height / 2;
  return mesh;
}

// Original placeholder: 5x5m footprint, 2.5m tall.
function createBlock() {
  return box(5, 2.5, 5);
}

// Same footprint as the block, 5x its height.
function createTower() {
  return box(5, 2.5 * 5, 5);
}

// Big, low residential block.
function createApartment() {
  return box(20, 5, 20);
}

// Low nave with a tall tower and a pyramidal spire at one end, church-like.
function createChurch() {
  const naveWidth = 6, naveDepth = 10, naveHeight = 6;
  const towerWidth = 3, towerDepth = 3, towerHeight = 15;
  const spireHeight = 4;

  const group = new THREE.Group();
  group.add(box(naveWidth, naveHeight, naveDepth));

  const tower = box(towerWidth, towerHeight, towerDepth);
  tower.position.z = naveDepth / 2 + towerDepth / 2;
  group.add(tower);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(towerWidth * 0.7, spireHeight, 4), ROOF_MATERIAL);
  spire.rotation.y = Math.PI / 4; // align the 4-sided cone's flat faces with the square tower
  spire.position.set(0, towerHeight + spireHeight / 2, tower.position.z);
  group.add(spire);

  return group;
}
