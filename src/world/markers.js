import * as THREE from 'three';
import { GLOBE_RADIUS } from './planet.js';
import { grid, tangentFromDirection, directionFromTangent, blockCell, BLOCK } from './city-plan.js';
import { TOWN_FACE, FACE_IDS } from './sphere-grid.js';

// Every plot on the planet has a short code you can read off the ground in
// game and quote back: "B3C" in town, "E-B3C" out over the eastern horizon.
//
//   B3C
//   ││└─ plot: quarters of the block — A B along the north side, C D the south
//   │└── row: counting south from the top of the face
//   └─── column: counting east from the west side of the face
//
// The planet is divided by a cubed sphere: six faces of square cells (see
// sphere-grid.js). The town covers the top face, and its codes are the ones
// the city map already uses — row 3, column B of data/city-map.json is block
// B3 here too, so the town needs no prefix. The other five faces each take a
// letter: N, E, S and W for the ones around the sides, and B for the far side
// of the planet.

export const PLOTS = ['A', 'B', 'C', 'D'];
export const QUARTER = BLOCK / 4;

// Which way each plot lies from the middle of its block, in cell angles.
const PLOT_OFFSET = {
  A: { a: -1, b: 1 },  // north-west
  B: { a: 1, b: 1 },   // north-east
  C: { a: -1, b: -1 }, // south-west
  D: { a: 1, b: -1 },  // south-east
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _local = new THREE.Vector3();

const columnLetter = (column) => String.fromCharCode(65 + column);
const facePrefix = (faceId) => (faceId === TOWN_FACE ? '' : `${faceId}-`);

export const CELL_COUNT = FACE_IDS.length * grid.divisions * grid.divisions;

// The reference of a block: either one of the town's, by its map indices, or
// any cell on the globe.
export function blockRef(block) {
  const cell = block.faceId ? block : { faceId: TOWN_FACE, ...blockCell(block) };
  return `${facePrefix(cell.faceId)}${columnLetter(cell.column)}${cell.row + 1}`;
}

export function parseMarker(code) {
  const match = /^([TNESWB])?[-\s]?([A-Z])(\d+)([A-D])$/.exec(String(code).trim().toUpperCase());
  if (!match) return null;
  const faceId = match[1] ?? TOWN_FACE;
  const column = match[2].charCodeAt(0) - 65;
  const row = Number(match[3]) - 1;
  if (column < 0 || column >= grid.divisions) return null;
  if (row < 0 || row >= grid.divisions) return null;
  return { faceId, column, row, plot: match[4], code: `${facePrefix(faceId)}${match[2]}${row + 1}${match[4]}` };
}

// The middle of the plot a marker names, as a direction on the globe.
export function markerDirection(code, target = new THREE.Vector3()) {
  const parsed = typeof code === 'string' ? parseMarker(code) : code;
  if (!parsed) return null;
  const centre = grid.cellAngles(parsed.column, parsed.row);
  const offset = PLOT_OFFSET[parsed.plot];
  return grid.direction(
    parsed.faceId,
    centre.a + (offset.a * grid.step) / 4,
    centre.b + (offset.b * grid.step) / 4,
    target
  );
}

// The same point on the flat map the town is planned on.
export function markerPoint(code) {
  const direction = markerDirection(code);
  return direction ? tangentFromDirection(direction) : null;
}

// Which marker a direction on the globe falls in.
export function markerUnder(direction) {
  const cell = grid.cellOf(direction);
  const centre = grid.cellAngles(cell.column, cell.row);
  const plot = cell.b >= centre.b
    ? (cell.a >= centre.a ? 'B' : 'A')
    : (cell.a >= centre.a ? 'D' : 'C');
  const marker = { faceId: cell.faceId, column: cell.column, row: cell.row, plot };
  return { ...marker, code: `${blockRef(marker)}${plot}`, ...tangentFromDirection(markerDirection(marker)) };
}

// The same, from a point on the flat map.
export function markerAt(u, v) {
  return markerUnder(directionFromTangent(u, v));
}

// Every block on the planet: six faces of square cells.
export function allBlocks() {
  const blocks = [];
  for (const faceId of FACE_IDS) {
    for (let row = 0; row < grid.divisions; row++) {
      for (let column = 0; column < grid.divisions; column++) {
        blocks.push({ faceId, column, row, ref: blockRef({ faceId, column, row }) });
      }
    }
  }
  return blocks;
}

// The four plots of one block, with where each one sits on the globe.
export function plotsOf(block) {
  return PLOTS.map((plot) => {
    const marker = { faceId: block.faceId, column: block.column, row: block.row, plot };
    const direction = markerDirection(marker);
    return {
      ...marker,
      code: `${blockRef(block)}${plot}`,
      direction,
      ...tangentFromDirection(direction),
    };
  });
}

// Every marker on the planet.
export function allMarkers() {
  return allBlocks().flatMap((block) => plotsOf(block));
}

// Which way east and north run where a marker stands — the frame anything
// placed there is laid out in, so "twenty metres north" means the same thing
// on any face of the planet.
export function frameAt(direction) {
  const face = grid.faces.get(grid.locate(direction).faceId);
  const north = face.up.clone().addScaledVector(direction, -face.up.dot(direction)).normalize();
  const east = new THREE.Vector3().crossVectors(north, direction).normalize();
  return { east, north };
}

// A layout's own frame: where it starts and which way east and north run
// there. Everything in one layout is placed in this frame rather than working
// out the compass again at each spot — east and north are read off the face a
// thing stands on, and an estate long enough to cross onto the next face would
// otherwise turn a right angle halfway along.
export function layoutFrom(direction) {
  const { east, north } = frameAt(direction);
  return { up: direction.clone().normalize(), east, north };
}

const _turn = new THREE.Quaternion();

// A spot that many metres east and north within a layout, and the way east and
// north lie once you are there. Turning about the frame's own axes keeps the
// rows parallel and evenly spaced, which is what a row of blocks needs.
export function spotIn(frame, east, north) {
  const up = frame.up.clone();
  const eastward = frame.east.clone();
  const northward = frame.north.clone();

  _turn.setFromAxisAngle(frame.east, -north / GLOBE_RADIUS);
  up.applyQuaternion(_turn);
  northward.applyQuaternion(_turn);

  _turn.setFromAxisAngle(frame.north, east / GLOBE_RADIUS);
  up.applyQuaternion(_turn);
  eastward.applyQuaternion(_turn);
  northward.applyQuaternion(_turn);

  // Keep the frame square to the ground it ended up on.
  northward.addScaledVector(up, -northward.dot(up)).normalize();
  eastward.crossVectors(northward, up).normalize().negate();
  return { dir: up.normalize(), east: eastward, north: northward };
}

// A point that many metres east and north of a direction, over the surface.
export function stepFrom(direction, east, north, target = new THREE.Vector3()) {
  const reach = Math.hypot(east, north);
  if (reach < 1e-9) return target.copy(direction);
  const frame = frameAt(direction);
  const way = frame.east.multiplyScalar(east / reach).addScaledVector(frame.north, north / reach);
  const angle = reach / GLOBE_RADIUS;
  return target.copy(direction).multiplyScalar(Math.cos(angle)).addScaledVector(way, Math.sin(angle)).normalize();
}

// The marker under the player. The player is fixed at the top of the globe, so
// this is whichever point the pivot has currently rotated to the pole.
export function markerUnderPlayer(worldPivot) {
  _local.copy(WORLD_UP);
  worldPivot.worldToLocal(_local);
  return markerUnder(_local);
}
