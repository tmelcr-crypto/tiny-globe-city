import { describe, it, expect } from 'vitest';
import { createGlobe } from '../src/world/globe.js';
import { spawnAll } from '../src/world/spawner.js';
import {
  allBlocks, parkBlock, SPAWN_BLOCK, chartUnder, nearestStreet, ROAD_WIDTH, SIDEWALK_WIDTH,
} from '../src/world/city-plan.js';
import { DIVISIONS, LEGEND } from '../src/world/city-map.js';
import { FACE_IDS } from '../src/world/sphere-grid.js';
import * as THREE from 'three';
import { createRng } from '../src/core/rng.js';
import cityMap from '../src/data/city-map.json';

// A fingerprint of the whole town: what was built, and exactly where.
function fingerprint(pivot) {
  return pivot.children
    .filter((c) => c.userData?.type)
    .map((c) => [
      c.userData.type,
      c.userData.id ?? '',
      c.position.toArray().map((n) => n.toFixed(4)).join(','),
      c.quaternion.toArray().map((n) => n.toFixed(4)).join(','),
    ].join('|'))
    .join('\n');
}

describe('fixed layout', () => {
  it('builds the identical town every time', () => {
    const first = createGlobe();
    spawnAll(first);
    const second = createGlobe();
    spawnAll(second);

    expect(fingerprint(second)).toBe(fingerprint(first));
  });

  it('places something worth looking at', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    const count = (type) => pivot.children.filter((c) => c.userData?.type === type).length;

    expect(count('building')).toBeGreaterThan(10);
    expect(count('tree')).toBeGreaterThan(10);
    expect(count('rock')).toBeGreaterThan(20);
    expect(count('safehouse')).toBe(1);
  });
});

describe('seeded generator', () => {
  it('repeats itself for a given seed and differs for another', () => {
    const draw = (seed) => {
      const rng = createRng(seed);
      return Array.from({ length: 8 }, () => rng());
    };
    expect(draw(1)).toEqual(draw(1));
    expect(draw(1)).not.toEqual(draw(2));
  });

  it('stays inside 0..1', () => {
    const rng = createRng(cityMap.seed);
    for (let i = 0; i < 500; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('city map', () => {
  it('gives every block on the planet a zone the legend defines', () => {
    const blocks = allBlocks();
    // Six faces of the cubed sphere, each cut into the same square grid.
    expect(blocks).toHaveLength(FACE_IDS.length * DIVISIONS * DIVISIONS);

    const zones = new Set(Object.values(LEGEND).map((entry) => entry.zone));
    for (const block of blocks) {
      expect(zones.has(block.zone), `block ${block.faceId} ${block.key} has no zone`).toBe(true);
      expect(typeof block.biome, `block ${block.faceId} ${block.key} has no biome`).toBe('string');
    }
  });

  it('spreads the planet over more than one kind of country', () => {
    // A city on one face and nothing but city everywhere else would be a
    // wasted globe: the map has to name districts, forest, desert and village.
    const biomes = new Set(allBlocks().map((block) => block.biome));
    for (const biome of ['city', 'beach', 'meadow', 'forest', 'desert']) {
      expect(biomes.has(biome), `nowhere on the planet is ${biome}`).toBe(true);
    }
    const zones = new Set(allBlocks().map((block) => block.zone));
    for (const zone of ['downtown', 'village', 'farm', 'forest', 'industrial', 'resort']) {
      expect(zones.has(zone), `no block is zoned ${zone}`).toBe(true);
    }
  });

  it('marks exactly one spawn block and puts the player on its verge', () => {
    const spawnBlocks = allBlocks().filter((block) => block.spawn);
    expect(spawnBlocks).toHaveLength(1);
    expect(spawnBlocks[0].faceId).toBe(SPAWN_BLOCK.faceId);
    expect(spawnBlocks[0].column).toBe(SPAWN_BLOCK.column);
    expect(spawnBlocks[0].row).toBe(SPAWN_BLOCK.row);

    // The grid is turned so the player's doorstep is the top of the globe:
    // off the road, past the pavement, on grass.
    const up = new THREE.Vector3(0, 1, 0);
    const chart = chartUnder(up);
    const { u, v } = chart.local(up);
    const street = nearestStreet(chart.faceId, u, v);
    expect(street.distance).toBeGreaterThan(ROAD_WIDTH / 2 + SIDEWALK_WIDTH);
  });

  it('puts the lake in the park block the map marks', () => {
    const park = parkBlock();
    expect(park).not.toBeNull();
    expect(park.zone).toBe('park');
    expect(park.buildings).toBe(0);
  });

  it('follows the map when the map changes', () => {
    // Every key in the legend should actually be used by some face, so a
    // reader can trust the legend as the whole vocabulary of the planet.
    const used = new Set(
      Object.values(cityMap.faces).flatMap((face) => face.rows.flatMap((row) => row.split(' ').filter(Boolean)))
    );
    for (const key of Object.keys(cityMap.legend)) {
      expect(used.has(key), `legend defines "${key}" but no block uses it`).toBe(true);
    }
  });

  it('cuts every face to the same square grid', () => {
    for (const faceId of FACE_IDS) {
      const rows = cityMap.faces[faceId].rows;
      expect(rows, `face ${faceId} is not ${DIVISIONS} rows`).toHaveLength(DIVISIONS);
      for (const row of rows) {
        expect(row.split(' ').filter(Boolean), `a row of face ${faceId} is short`).toHaveLength(DIVISIONS);
      }
    }
  });
});
