import { describe, it, expect } from 'vitest';
import { createGlobe } from '../src/world/globe.js';
import { spawnAll } from '../src/world/spawner.js';
import { cityBlocks, parkBlock, SPAWN_BLOCK, nearestRoad, ROAD_WIDTH, SIDEWALK_WIDTH } from '../src/world/city-plan.js';
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
  it('gives every block in the map a zone the legend defines', () => {
    const blocks = cityBlocks();
    const rows = cityMap.rows.length;
    const cols = cityMap.rows[0].split(' ').filter(Boolean).length;
    expect(blocks).toHaveLength(rows * cols);

    const zones = new Set(Object.values(cityMap.legend).map((entry) => entry.zone));
    for (const block of blocks) expect(zones.has(block.zone)).toBe(true);
  });

  it('marks exactly one spawn block and puts the player on its verge', () => {
    const spawnBlocks = cityBlocks().filter((block) => block.spawn);
    expect(spawnBlocks).toHaveLength(1);
    expect(spawnBlocks[0].i).toBe(SPAWN_BLOCK.i);
    expect(spawnBlocks[0].j).toBe(SPAWN_BLOCK.j);

    // The player stands at map (0,0): off the road, past the pavement, on grass.
    const road = nearestRoad(0, 0);
    expect(road.distance).toBeGreaterThan(ROAD_WIDTH / 2 + SIDEWALK_WIDTH);
  });

  it('puts the lake in the park block the map marks', () => {
    const park = parkBlock();
    expect(park).not.toBeNull();
    expect(park.zone).toBe('park');
    expect(park.buildings).toBe(0);
  });

  it('follows the map when the map changes', () => {
    // Every zone named in the legend should actually be used by the rows, so a
    // reader can trust the legend as the whole vocabulary of the map.
    const used = new Set(cityMap.rows.flatMap((row) => row.split(' ').filter(Boolean)));
    for (const key of Object.keys(cityMap.legend)) {
      expect(used.has(key), `legend defines "${key}" but no block uses it`).toBe(true);
    }
  });
});
