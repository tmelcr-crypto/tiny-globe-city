import * as THREE from 'three';
import { BLOCK, ROWS, COLS, CELL, blockCentre, tangentFromDirection } from './city-plan.js';

// Every buildable plot in the city has a short code you can read off the ground
// in game and quote back: "B3C". It is the block's map reference plus which
// quarter of that block you mean.
//
//   B3C
//   ││└─ plot: quarters of the block — A B along the north side, C D the south
//   │└── row: 1 at the north edge of the map, counting south
//   └─── column: A at the west edge of the map, counting east
//
// Block references line up with data/city-map.json exactly: row 3, column B of
// that file is block B3 in the world.

export const PLOTS = ['A', 'B', 'C', 'D'];
export const QUARTER = BLOCK / 4;

const PLOT_OFFSET = {
  A: { u: -1, v: 1 },  // north-west
  B: { u: 1, v: 1 },   // north-east
  C: { u: -1, v: -1 }, // south-west
  D: { u: 1, v: -1 },  // south-east
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _local = new THREE.Vector3();

const columnLetter = (col) => String.fromCharCode(65 + col);

// Map row/column to the block indices the plan works in.
function blockIndex(row, col) {
  return { i: col - Math.floor(COLS / 2), j: -Math.floor(ROWS / 2) + (ROWS - 1 - row) };
}

// The two-character reference of a block the plan works in, e.g. "B3".
export function blockRef({ i, j }) {
  const col = i + Math.floor(COLS / 2);
  const row = ROWS - 1 - (j + Math.floor(ROWS / 2));
  return `${columnLetter(col)}${row + 1}`;
}

export function parseMarker(code) {
  const match = /^([A-Z])(\d+)([A-D])$/.exec(String(code).trim().toUpperCase());
  if (!match) return null;
  const col = match[1].charCodeAt(0) - 65;
  const row = Number(match[2]) - 1;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { row, col, plot: match[3], code: `${match[1]}${match[2]}${match[3]}` };
}

// Centre of the plot a marker names, in flat-map metres.
export function markerPoint(code) {
  const parsed = parseMarker(code);
  if (!parsed) return null;
  const centre = blockCentre(blockIndex(parsed.row, parsed.col));
  const offset = PLOT_OFFSET[parsed.plot];
  return { u: centre.u + offset.u * QUARTER, v: centre.v + offset.v * QUARTER };
}

// Every marker in the city, reading like the map: north-west first.
export function allMarkers() {
  const markers = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      for (const plot of PLOTS) {
        const code = `${columnLetter(col)}${row + 1}${plot}`;
        markers.push({ code, row, col, plot, ...markerPoint(code) });
      }
    }
  }
  return markers;
}

// Which marker a point on the map falls in, or null if it is outside the city.
export function markerAt(u, v) {
  const origin = blockCentre(blockIndex(0, 0));
  const col = Math.round((u - origin.u) / CELL);
  const row = Math.round((origin.v - v) / CELL);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;

  const centre = blockCentre(blockIndex(row, col));
  const north = v >= centre.v;
  const east = u >= centre.u;
  const plot = north ? (east ? 'B' : 'A') : east ? 'D' : 'C';
  const code = `${columnLetter(col)}${row + 1}${plot}`;
  return { code, row, col, plot, ...markerPoint(code) };
}

// The marker under the player. The player is fixed at the top of the globe, so
// this is whichever point the pivot has currently rotated to the pole.
export function markerUnderPlayer(worldPivot) {
  _local.copy(WORLD_UP);
  worldPivot.worldToLocal(_local);
  const { u, v } = tangentFromDirection(_local);
  return markerAt(u, v);
}
