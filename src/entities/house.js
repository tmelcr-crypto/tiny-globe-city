import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Wall / roof pairs, plus the distinct look the safehouse keeps.
const VARIANTS = [
  { wall: 0xd9cfc0, roof: 0x8c4a3f },
  { wall: 0xc9d3dc, roof: 0x4f5d63 },
  { wall: 0xe0d2b8, roof: 0x7a5c3a },
  { wall: 0xcfd8cd, roof: 0x6b4a57 },
  { wall: 0xe3cfc7, roof: 0x9c5b3c },
];
const SAFEHOUSE = { wall: 0x3388ff, roof: 0x1f4f8f };
const DOOR = 0x4a3524;
const WINDOW = 0x9fc6d8;

// One material set per variant, shared by every house that uses it.
function materialsFor({ wall, roof }) {
  return [
    new THREE.MeshStandardMaterial({ color: wall, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: roof, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: DOOR, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: WINDOW, flatShading: true }),
  ];
}
const variantMaterials = VARIANTS.map(materialsFor);
const safehouseMaterials = materialsFor(SAFEHOUSE);

// Walls, pitched roof, door and two windows merged into a single mesh, so a
// whole town of these still costs one draw call each. Origin sits at the
// doorstep, like the tree and car models, so it stands on the surface.
function buildGeometry(width, depth, wallHeight, roofHeight) {
  const walls = new THREE.BoxGeometry(width, wallHeight, depth).translate(0, wallHeight / 2, 0);

  // A 4-sided cone is a pyramid; turning it 45 degrees squares it up with the walls.
  const roof = new THREE.ConeGeometry((Math.hypot(width, depth) / 2) * 1.08, roofHeight, 4)
    .rotateY(Math.PI / 4)
    .translate(0, wallHeight + roofHeight / 2, 0);

  const front = depth / 2 + 0.02;
  const door = new THREE.BoxGeometry(width * 0.2, wallHeight * 0.45, 0.06)
    .translate(0, wallHeight * 0.225, front);

  const pane = new THREE.BoxGeometry(width * 0.16, width * 0.16, 0.06);
  const windows = mergeGeometries([
    pane.clone().translate(-width * 0.28, wallHeight * 0.66, front),
    pane.clone().translate(width * 0.28, wallHeight * 0.66, front),
  ]);
  pane.dispose();

  return mergeGeometries([walls, roof, door, windows], true);
}

// Low-poly home. Total height stays under the camera's height above the
// surface so a house beside the player doesn't black out the view.
export function createHouse({ safehouse = false } = {}) {
  const width = 1.4 + Math.random() * 0.5;
  const depth = 1.3 + Math.random() * 0.5;
  const wallHeight = 0.9 + Math.random() * 0.9;
  const roofHeight = 0.5 + Math.random() * 0.4;

  const materials = safehouse
    ? safehouseMaterials
    : variantMaterials[Math.floor(Math.random() * variantMaterials.length)];

  const mesh = new THREE.Mesh(buildGeometry(width, depth, wallHeight, roofHeight), materials);
  mesh.userData.footprint = (Math.hypot(width, depth) / 2) * 1.08;
  return mesh;
}
