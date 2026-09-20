import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGlobe, GLOBE_RADIUS } from '../src/world/globe.js';
import { spawnAll } from '../src/world/spawner.js';
import { createBuilding } from '../src/entities/building.js';
import buildingDefs from '../src/data/buildings.json';

const byId = (id) => buildingDefs.find((d) => d.id === id);

describe('building assets', () => {
  it('defines a house, church, apartment and skyscraper', () => {
    for (const id of ['house', 'church', 'apartment', 'skyscraper', 'safehouse']) {
      expect(byId(id), `missing building def: ${id}`).toBeTruthy();
    }
  });

  it('builds every kind as a single mesh standing on its own origin', () => {
    for (const def of buildingDefs) {
      const building = createBuilding(def);
      expect(building.isMesh, `${def.id} should be one mesh`).toBe(true);

      const box = new THREE.Box3().setFromObject(building);
      // Origin sits at the doorstep, so nothing hangs below it.
      expect(box.min.y, `${def.id} sinks below its origin`).toBeGreaterThanOrEqual(-1e-6);
      expect(box.max.y, `${def.id} has no height`).toBeGreaterThan(0.5);
      expect(building.userData.kind).toBe(def.id);
    }
  });

  it('scales each kind to its declared height range', () => {
    const totalHeight = (def) => {
      const building = createBuilding(def);
      return new THREE.Box3().setFromObject(building).max.y;
    };
    // A skyscraper towers over an apartment block, which towers over a house.
    expect(totalHeight(byId('skyscraper'))).toBeGreaterThan(totalHeight(byId('apartment')));
    expect(totalHeight(byId('apartment'))).toBeGreaterThan(totalHeight(byId('house')));
    // The church is defined by its steeple rather than its walls.
    expect(totalHeight(byId('church'))).toBeGreaterThan(totalHeight(byId('house')));
  });

  it('reports a footprint that covers the building', () => {
    for (const def of buildingDefs) {
      const building = createBuilding(def);
      const box = new THREE.Box3().setFromObject(building);
      const widest = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
      expect(building.userData.footprint).toBeGreaterThanOrEqual(widest - 1e-6);
    }
  });

  it('keeps the tall kinds away from the spawn point', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    const spawn = new THREE.Vector3(0, GLOBE_RADIUS, 0);

    for (const building of pivot.children.filter((c) => c.userData?.type === 'building')) {
      const def = byId(building.userData.kind);
      const distance = building.position.angleTo(spawn) * GLOBE_RADIUS;
      expect(distance, `${building.userData.kind} spawned too close`)
        .toBeGreaterThanOrEqual(def.minSpawnDistance - 1e-6);
    }
  });

  it('spawns a mix of kinds, not just houses', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    const kinds = new Set(
      pivot.children.filter((c) => c.userData?.type === 'building').map((c) => c.userData.kind)
    );
    expect(kinds.size).toBeGreaterThan(1);
  });
});
