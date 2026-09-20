import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';
import { BLOCK, ROWS, COLS, CELL, roadU, roadV, blockCentre, tangentFromDirection } from './city-plan.js';

// Every buildable plot on the planet has a short code you can read off the
// ground in game and quote back: "B3C".
//
//   B3C
//   ││└─ plot: quarters of the block — A B along the north side, C D the south
//   │└── row: counting south from the town's north edge
//   └─── column: counting east from the town's west edge
//
// The grid is the town's own grid carried on across the whole globe, so the
// codes inside the city are exactly the ones the city map uses: row 3, column
// B of data/city-map.json is block B3 here too. Outside the town it keeps
// going — the planet is 20 blocks across in each direction — and the letters
// and numbers wrap round the far side the way a clock face does, so the block
// west of A is Z and the block north of row 1 is row 20.
//
// It is a flat grid wrapped onto a sphere, so blocks stay square around the
// town and squeeze together towards the point opposite the player, the same
// way a map's grid does at the poles.

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

// The furthest any point on the globe can be from the player, in metres: the
// grid has to reach that far to cover the planet.
export const REACH = Math.PI * GLOBE_RADIUS;

const ORIGIN_U = roadU(0);
const ORIGIN_V = roadV(0);

// A block spans one cell east and one north of its own road corner, so these
// are the blocks any part of which lands on the globe at all.
const first = (origin) => Math.ceil((-REACH - CELL - origin) / CELL);
const last = (origin) => Math.ceil((REACH - origin) / CELL) - 1;

export const BLOCK_RANGE = {
  minI: first(ORIGIN_U), maxI: last(ORIGIN_U),
  minJ: first(ORIGIN_V), maxJ: last(ORIGIN_V),
};

// Where the city's own row and column numbering starts, in grid indices.
const COL_BASE = Math.floor(COLS / 2);
const ROW_BASE = Math.floor(ROWS / 2);

const colOf = (i) => i + COL_BASE;
const rowOf = (j) => ROWS - 1 - (j + ROW_BASE);

export const COLUMN_COUNT = BLOCK_RANGE.maxI - BLOCK_RANGE.minI + 1;
export const ROW_COUNT = BLOCK_RANGE.maxJ - BLOCK_RANGE.minJ + 1;

const wrap = (value, span) => ((value % span) + span) % span;

const columnLetter = (col) => String.fromCharCode(65 + wrap(col, 26));
const rowNumber = (row) => wrap(row, ROW_COUNT) + 1;

// Back from a label to the one grid index in range that carries it.
function indexFor(label, span, from, to, of) {
  for (let index = from; index <= to; index++) {
    if (wrap(of(index), span) === label) return index;
  }
  return null;
}

// The two-character reference of a block, e.g. "B3".
export function blockRef({ i, j }) {
  return `${columnLetter(colOf(i))}${rowNumber(rowOf(j))}`;
}

export function parseMarker(code) {
  const match = /^([A-Z])(\d+)([A-D])$/.exec(String(code).trim().toUpperCase());
  if (!match) return null;
  const i = indexFor(match[1].charCodeAt(0) - 65, 26, BLOCK_RANGE.minI, BLOCK_RANGE.maxI, colOf);
  const j = indexFor(Number(match[2]) - 1, ROW_COUNT, BLOCK_RANGE.minJ, BLOCK_RANGE.maxJ, rowOf);
  if (i === null || j === null) return null;
  return { i, j, plot: match[3], code: `${match[1]}${Number(match[2])}${match[3]}` };
}

// Centre of the plot a marker names, in flat-map metres.
export function markerPoint(code) {
  const parsed = parseMarker(code);
  if (!parsed) return null;
  const centre = blockCentre(parsed);
  const offset = PLOT_OFFSET[parsed.plot];
  return { u: centre.u + offset.u * QUARTER, v: centre.v + offset.v * QUARTER };
}

// Every block on the globe, north-west first, as the grid overlay draws them.
export function allBlocks() {
  const blocks = [];
  for (let j = BLOCK_RANGE.maxJ; j >= BLOCK_RANGE.minJ; j--) {
    for (let i = BLOCK_RANGE.minI; i <= BLOCK_RANGE.maxI; i++) {
      blocks.push({ i, j, ...blockCentre({ i, j }), ref: blockRef({ i, j }) });
    }
  }
  return blocks;
}

// Every marker on the globe. There are thousands, so the overlay labels the
// ones near the player rather than all of them.
export function allMarkers() {
  return allBlocks().flatMap((block) => PLOTS.map((plot) => markersOf(block, plot)));
}

function markersOf(block, plot) {
  const offset = PLOT_OFFSET[plot];
  return {
    code: `${block.ref}${plot}`,
    i: block.i,
    j: block.j,
    plot,
    u: block.u + offset.u * QUARTER,
    v: block.v + offset.v * QUARTER,
  };
}

// The four plots of one block, given its indices.
export function plotsOf(i, j) {
  const block = { i, j, ...blockCentre({ i, j }), ref: blockRef({ i, j }) };
  return PLOTS.map((plot) => markersOf(block, plot));
}

// Which marker a point on the map falls in, anywhere on the globe.
export function markerAt(u, v) {
  const i = Math.floor((u - ORIGIN_U) / CELL);
  const j = Math.floor((v - ORIGIN_V) / CELL);
  if (i < BLOCK_RANGE.minI || i > BLOCK_RANGE.maxI) return null;
  if (j < BLOCK_RANGE.minJ || j > BLOCK_RANGE.maxJ) return null;

  const centre = blockCentre({ i, j });
  const north = v >= centre.v;
  const east = u >= centre.u;
  const plot = north ? (east ? 'B' : 'A') : east ? 'D' : 'C';
  return { code: `${blockRef({ i, j })}${plot}`, i, j, plot, ...markerPoint(`${blockRef({ i, j })}${plot}`) };
}

// The marker under the player. The player is fixed at the top of the globe, so
// this is whichever point the pivot has currently rotated to the pole.
export function markerUnderPlayer(worldPivot) {
  _local.copy(WORLD_UP);
  worldPivot.worldToLocal(_local);
  const { u, v } = tangentFromDirection(_local);
  return markerAt(u, v);
}
