import { grid } from './grid.js';
import { DIVISIONS, blockAt } from './city-map.js';

// What kind of country a place is: city, beach, desert, forest or meadow.
//
// The map says it block by block, which would give the planet hard edges, so
// this reads the four blocks nearest a point and mixes them. Land cover, the
// kind of tree that grows, the colour of the ground: all of it comes from the
// mix rather than from whichever block a point happens to fall in.

export const BIOMES = ['city', 'beach', 'desert', 'forest', 'meadow'];

const blend = (t) => t * t * (3 - 2 * t);

// The share of each kind of country at a direction, adding up to one.
export function biomeMix(direction) {
  const { faceId, a, b } = grid.locate(direction);
  // Where the point sits in cell coordinates, with 0.5 at a cell's middle.
  const column = (a - grid.angleOfColumn(0)) / grid.step - 0.5;
  const row = (grid.angleOfRow(0) - b) / grid.step - 0.5;

  const c0 = Math.max(0, Math.min(DIVISIONS - 1, Math.floor(column)));
  const r0 = Math.max(0, Math.min(DIVISIONS - 1, Math.floor(row)));
  const c1 = Math.min(DIVISIONS - 1, c0 + 1);
  const r1 = Math.min(DIVISIONS - 1, r0 + 1);
  const fc = blend(Math.max(0, Math.min(1, column - c0)));
  const fr = blend(Math.max(0, Math.min(1, row - r0)));

  const mix = {};
  const add = (block, weight) => {
    if (weight <= 0) return;
    mix[block.biome] = (mix[block.biome] ?? 0) + weight;
  };
  add(blockAt(faceId, c0, r0), (1 - fc) * (1 - fr));
  add(blockAt(faceId, c1, r0), fc * (1 - fr));
  add(blockAt(faceId, c0, r1), (1 - fc) * fr);
  add(blockAt(faceId, c1, r1), fc * fr);
  return mix;
}

// How much of one kind of country there is at a point, from none to all of it.
export function biomeShare(direction, biome) {
  return biomeMix(direction)[biome] ?? 0;
}

// The kind of country a point is most of.
export function biomeAt(direction) {
  const mix = biomeMix(direction);
  let best = 'meadow';
  let most = 0;
  for (const [biome, share] of Object.entries(mix)) {
    if (share > most) {
      most = share;
      best = biome;
    }
  }
  return best;
}
