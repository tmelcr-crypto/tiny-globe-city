import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGlobe, GLOBE_RADIUS } from '../src/world/globe.js';
import { elevation, SEA_LEVEL } from '../src/world/terrain.js';
import { spawnAll } from '../src/world/spawner.js';
import { createTree, TREE_KINDS } from '../src/entities/tree.js';
import { createCar } from '../src/entities/car.js';
import { createNpc } from '../src/entities/npc.js';
import { createMountain } from '../src/entities/mountain.js';
import { createBuilding } from '../src/entities/building.js';
import { createPlayer } from '../src/entities/player.js';
import buildingDefs from '../src/data/buildings.json';

// Nothing may hang below its own origin, because the origin is what gets placed
// on the surface — anything below it sinks, anything above it floats.
function lowestPoint(object) {
  return new THREE.Box3().setFromObject(object).min.y;
}

describe('trees', () => {
  it('offers a kind for every country', () => {
    expect(TREE_KINDS).toEqual(['pine', 'oak', 'birch', 'bush', 'palm', 'cactus']);
    expect(new Set(TREE_KINDS).size).toBe(TREE_KINDS.length);
  });

  it('grows every kind to the height its country expects', () => {
    // Bushes are waist high, palms tower, and the rest are ordinary trees
    // beside a 1.5 m player.
    const expected = { pine: [3.5, 5], oak: [3, 4.5], birch: [3, 4.5], bush: [2, 2.5], palm: [5, 8.5], cactus: [1.8, 3.8] };
    for (const kind of TREE_KINDS) {
      const [low, high] = expected[kind];
      for (let i = 0; i < 12; i++) {
        const tree = createTree(kind);
        const height = new THREE.Box3().setFromObject(tree).max.y;
        expect(height, `${kind} is ${height.toFixed(2)} m`).toBeGreaterThanOrEqual(low);
        expect(height, `${kind} is ${height.toFixed(2)} m`).toBeLessThanOrEqual(high);
      }
    }
  });
});

describe('nothing levitates', () => {
  it('builds every model standing on its own base', () => {
    const models = [
      ...TREE_KINDS.map((kind) => [kind, createTree(kind)]),
      ['car', createCar({ id: 'car_basic' })],
      ['npc', createNpc({ id: 'npc', role: 'wanderer' })],
      ['mountain', createMountain()],
      ...buildingDefs.map((def) => [def.id, createBuilding(def)]),
    ];

    for (const [name, model] of models) {
      const lowest = lowestPoint(model);
      expect(lowest, `${name} floats/sinks by ${lowest.toFixed(3)} m`).toBeCloseTo(0, 2);
    }
  });

  it('stands the player on the surface, not in it or above it', () => {
    const player = createPlayer(GLOBE_RADIUS);
    const box = new THREE.Box3().setFromObject(player);
    expect(box.min.y).toBeCloseTo(GLOBE_RADIUS, 5);
  });

  it('rests every spawned object on the land, wherever the land is', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    pivot.updateMatrixWorld(true);

    const placed = pivot.children.filter((c) => c.userData?.type);
    expect(placed.length).toBeGreaterThan(20);

    for (const object of placed) {
      // The origin of each model is its base, so it belongs exactly on the
      // ground — which is no longer a sphere but a height field over one.
      const ground = GLOBE_RADIUS + elevation(object.position);
      expect(object.position.length(), `${object.userData.id ?? object.userData.type} is off the ground`)
        .toBeCloseTo(ground, 3);
    }
  });

  it('keeps what it builds out of the water', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    const dry = ['building', 'safehouse', 'tree', 'car', 'npc'];

    for (const object of pivot.children) {
      if (!dry.includes(object.userData?.type)) continue;
      expect(elevation(object.position), `${object.userData.id} is in the water`)
        .toBeGreaterThan(SEA_LEVEL);
    }
  });
});
