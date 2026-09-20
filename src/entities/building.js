import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Buildings are described by data/buildings.json: footprint and height ranges,
// wall/roof palettes, a window grid, and optional steeple or antenna. Adding a
// new kind of building is a new entry there, not new code here.

const DOOR_COLOR = '#4a3524';
const GLASS_COLOR = '#9fc6d8';
const ROOF_OVERHANG = 1.08;
// Metres — one world unit is one metre, so openings are sized like real ones.
const MAX_WINDOW_WIDTH = 1.5;
const MAX_WINDOW_HEIGHT = 1.6;
const MAX_DOOR_WIDTH = 1.2;
const MAX_DOOR_HEIGHT = 2.2;
const INSET = 0.12;

const doorMaterial = new THREE.MeshStandardMaterial({ color: DOOR_COLOR, flatShading: true });
const glassMaterial = new THREE.MeshStandardMaterial({ color: GLASS_COLOR, flatShading: true });

// Wall/roof pairs are shared between every building that rolls the same colours.
const shellCache = new Map();
function shellMaterials(wall, roof) {
  const key = `${wall}|${roof}`;
  let shell = shellCache.get(key);
  if (!shell) {
    shell = {
      wall: new THREE.MeshStandardMaterial({ color: wall, flatShading: true }),
      roof: new THREE.MeshStandardMaterial({ color: roof, flatShading: true }),
    };
    shellCache.set(key, shell);
  }
  return shell;
}

function rand([min, max]) {
  return min + Math.random() * (max - min);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Evenly spaced panes across a face, skipping the ground row where the door is.
function windowPanes(width, depth, wallHeight, spec) {
  const { rows, cols, wrap = false } = spec;
  const paneW = Math.min(MAX_WINDOW_WIDTH, (width / cols) * 0.42);
  const paneH = Math.min(MAX_WINDOW_HEIGHT, (wallHeight / rows) * 0.45);
  const panes = [];

  for (let row = 0; row < rows; row++) {
    const y = wallHeight * ((row + 1) / (rows + 1));
    for (let col = 0; col < cols; col++) {
      const across = (col + 1) / (cols + 1) - 0.5;
      panes.push(new THREE.BoxGeometry(paneW, paneH, INSET).translate(width * across, y, depth / 2));
      if (!wrap) continue;
      panes.push(new THREE.BoxGeometry(paneW, paneH, INSET).translate(width * across, y, -depth / 2));
      panes.push(new THREE.BoxGeometry(INSET, paneH, paneW).translate(width / 2, y, depth * across));
      panes.push(new THREE.BoxGeometry(INSET, paneH, paneW).translate(-width / 2, y, depth * across));
    }
  }
  return panes;
}

// Low-poly building. Every part is merged into one geometry with material
// groups, so a whole skyline still costs one draw call per building, and the
// origin sits at the doorstep so it stands on the globe's surface.
export function createBuilding(def) {
  const width = rand(def.width);
  const depth = rand(def.depth);
  const wallHeight = rand(def.wallHeight);
  const roofHeight = rand(def.roof.height);

  const walls = [new THREE.BoxGeometry(width, wallHeight, depth).translate(0, wallHeight / 2, 0)];
  const roofs = [];
  const trim = [];
  const glass = [];

  if (def.roof.type === 'pitched') {
    // A 4-sided cone is a pyramid; turning it 45 degrees squares it up with the walls.
    roofs.push(
      new THREE.ConeGeometry((Math.hypot(width, depth) / 2) * ROOF_OVERHANG, roofHeight, 4)
        .rotateY(Math.PI / 4)
        .translate(0, wallHeight + roofHeight / 2, 0)
    );
  } else {
    roofs.push(
      new THREE.BoxGeometry(width * 1.06, roofHeight, depth * 1.06)
        .translate(0, wallHeight + roofHeight / 2, 0)
    );
  }

  if (def.steeple) {
    const towerWidth = rand(def.steeple.width);
    const towerHeight = rand(def.steeple.height);
    const spireHeight = rand(def.steeple.spire);
    const z = depth / 2 - towerWidth / 2;
    walls.push(new THREE.BoxGeometry(towerWidth, towerHeight, towerWidth).translate(0, towerHeight / 2, z));
    roofs.push(
      new THREE.ConeGeometry(towerWidth * 0.78, spireHeight, 4)
        .rotateY(Math.PI / 4)
        .translate(0, towerHeight + spireHeight / 2, z)
    );
  }

  if (def.antenna) {
    const height = rand(def.antenna);
    roofs.push(
      new THREE.CylinderGeometry(0.03, 0.05, height, 5)
        .translate(0, wallHeight + roofHeight + height / 2, 0)
    );
  }

  if (def.door) {
    const doorWidth = Math.min(MAX_DOOR_WIDTH, width * 0.22);
    const doorHeight = Math.min(MAX_DOOR_HEIGHT, wallHeight * 0.4);
    trim.push(new THREE.BoxGeometry(doorWidth, doorHeight, INSET).translate(0, doorHeight / 2, depth / 2));
  }

  if (def.windows) glass.push(...windowPanes(width, depth, wallHeight, def.windows));

  const shell = shellMaterials(pick(def.walls), pick(def.roof.colors));
  const slots = [
    [walls, shell.wall],
    [roofs, shell.roof],
    [trim, doorMaterial],
    [glass, glassMaterial],
  ].filter(([parts]) => parts.length > 0);

  const geometry = mergeGeometries(slots.map(([parts]) => mergeGeometries(parts)), true);
  const mesh = new THREE.Mesh(geometry, slots.map(([, material]) => material));
  mesh.name = def.id;
  mesh.userData.kind = def.id;
  mesh.userData.footprint = (Math.hypot(width, depth) / 2) * ROOF_OVERHANG;
  return mesh;
}
