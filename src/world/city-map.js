import cityMap from '../data/city-map.json';
import { FACE_IDS } from './sphere-grid.js';

// The planet, as data. src/data/city-map.json holds six faces of blocks — one
// character each — and a legend saying what a character means. This module
// turns that into something the rest of the world can ask questions of, and
// nothing more: no geometry, no three.js.

export const SEED = cityMap.seed;
export const STREET = cityMap.street;
export const SCENERY = cityMap.scenery;
export const LEGEND = cityMap.legend;

const FACES = cityMap.faces;
const rowCache = new Map();
// Read once and kept: the land mesh asks what is under a point a quarter of a
// million times, and splitting the same strings again each time is wasted work.
function rowsOf(faceId) {
  let rows = rowCache.get(faceId);
  if (!rows) {
    rows = FACES[faceId].rows.map((row) => row.split(' ').filter(Boolean));
    rowCache.set(faceId, rows);
  }
  return rows;
}

// Every face is cut into the same grid, and it has to be square: the cubed
// sphere has no way to be four blocks one way and five the other.
export const DIVISIONS = (() => {
  const sizes = new Set();
  for (const faceId of FACE_IDS) {
    const rows = rowsOf(faceId);
    sizes.add(rows.length);
    for (const row of rows) sizes.add(row.length);
  }
  if (sizes.size !== 1) throw new Error(`city-map: every face must be the same square grid, got ${[...sizes]}`);
  return [...sizes][0];
})();

function legendFor(key) {
  const entry = LEGEND[key];
  if (!entry) throw new Error(`city-map: no legend entry for "${key}"`);
  return entry;
}

const blockCache = new Map();

// What is on one block: its face, where it sits on that face, and what the
// legend says about it. Blocks are read-only and asked for constantly, so each
// one is built once and handed out again.
export function blockAt(faceId, column, row) {
  const at = `${faceId}${column},${row}`;
  let block = blockCache.get(at);
  if (!block) {
    const key = rowsOf(faceId)[row][column];
    block = Object.freeze({ faceId, column, row, key, ...legendFor(key) });
    blockCache.set(at, block);
  }
  return block;
}

let all = null;

// Every block on the planet.
export function allBlocks() {
  if (!all) {
    all = [];
    for (const faceId of FACE_IDS) {
      for (let row = 0; row < DIVISIONS; row++) {
        for (let column = 0; column < DIVISIONS; column++) all.push(blockAt(faceId, column, row));
      }
    }
  }
  return all;
}

export const faceName = (faceId) => FACES[faceId].name ?? faceId;
export const avenuesOn = (faceId) => FACES[faceId].avenues ?? [];

// Where the player starts.
export function findSpawn() {
  for (const block of allBlocks()) {
    if (block.spawn) return block;
  }
  throw new Error('city-map: no block marked as the spawn (@)');
}

// Whether a street should run along the line between two blocks. A grid of
// streets belongs where the blocks are built up; open country gets whatever
// the avenues give it and nothing else.
export function wantsStreet(a, b) {
  return Boolean(a?.streets || b?.streets);
}

// Blocks of one zone, in map order.
export const blocksOfZone = (zone) => allBlocks().filter((block) => block.zone === zone);
