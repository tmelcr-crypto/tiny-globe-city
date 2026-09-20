import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGlobe, GLOBE_RADIUS } from '../src/world/globe.js';
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
  it('offers four kinds', () => {
    expect(TREE_KINDS).toHaveLength(4);
    expect(new Set(TREE_KINDS).size).toBe(4);
  });

  it('grows every kind between 2 m and 5 m tall', () => {
    for (const kind of TREE_KINDS) {
      for (let i = 0; i < 12; i++) {
        const tree = createTree(kind);
        const height = new THREE.Box3().setFromObject(tree).max.y;
        expect(height, `${kind} is ${height.toFixed(2)} m`).toBeGreaterThanOrEqual(2);
        expect(height, `${kind} is ${height.toFixed(2)} m`).toBeLessThanOrEqual(5);
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

  it('rests every spawned object on the globe surface', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    pivot.updateMatrixWorld(true);

    const placed = pivot.children.filter((c) => c.userData?.type);
    expect(placed.length).toBeGreaterThan(20);

    for (const object of placed) {
      // The origin of each model is its base, so it belongs exactly on the surface.
      expect(object.position.length(), `${object.userData.id ?? object.userData.type} is off the ground`)
        .toBeCloseTo(GLOBE_RADIUS, 3);
    }
  });
});
