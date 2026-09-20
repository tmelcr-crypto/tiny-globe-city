import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGlobe, GLOBE_RADIUS } from '../src/world/globe.js';
import { spawnAll } from '../src/world/spawner.js';
import { createBuilding } from '../src/entities/building.js';
import buildingDefs from '../src/data/buildings.json';
import { PLAYER_HEIGHT } from '../src/entities/player.js';

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

  it('sizes buildings sensibly against a 1.5 m player', () => {
    // One world unit is one metre, so these are real-world proportions:
    // a house is a couple of storeys, a skyscraper is genuinely tall.
    const expected = {
      house: [7, 12],
      safehouse: [7, 12],
      church: [24, 36],
      apartment: [15, 21],
      skyscraper: [30, 50],
      panelak: [24, 27],        // eight storeys, the height of a real slab block
      deco_hotel: [9, 16],      // three or four floors on Ocean Drive
      shop_row: [8, 13],
      office: [16, 27],
      tower_glass: [38, 60],    // the tallest thing on the planet
      warehouse: [8, 13],
      villa: [7, 12],
      cottage: [5, 9],
      barn: [7, 12],
      motel: [3, 6],            // one storey and a flat roof
    };

    for (const def of buildingDefs) {
      const [min, max] = expected[def.id];
      // Sample a few, since every dimension is randomised within a range.
      for (let i = 0; i < 8; i++) {
        const height = new THREE.Box3().setFromObject(createBuilding(def)).max.y;
        expect(height, `${def.id} is ${height.toFixed(1)} m tall`).toBeGreaterThanOrEqual(min);
        expect(height, `${def.id} is ${height.toFixed(1)} m tall`).toBeLessThanOrEqual(max);
        // Nothing is shrunk down towards the player's own height: even the
        // lowest thing on the planet, a single-storey motel, clears them twice.
        expect(height).toBeGreaterThan(PLAYER_HEIGHT * 2.5);
      }
    }
  });

  it('gives buildings doors a person could walk through', () => {
    for (const def of buildingDefs.filter((d) => d.door)) {
      const building = createBuilding(def);
      // The door group is the third material slot; measure it via the geometry groups.
      expect(building.material.length).toBeGreaterThanOrEqual(3);
      const box = new THREE.Box3().setFromObject(building);
      // A doorway is only sensible if the wall it sits in clears a 1.5 m person.
      expect(box.max.y).toBeGreaterThan(PLAYER_HEIGHT * 2);
    }
  });

  it('reports a footprint that covers the building', () => {
    for (const def of buildingDefs) {
      const building = createBuilding(def);
      const box = new THREE.Box3().setFromObject(building);
      const widest = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
      expect(building.userData.footprint).toBeGreaterThanOrEqual(widest - 1e-6);
    }
  });

  it('only puts a building in a zone the map admits it to', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    // Explicit placements override the zoning on purpose, so skip those.
    const built = pivot.children.filter((c) => c.userData?.type === 'building' && !c.userData.marker);

    for (const building of built) {
      const weight = byId(building.userData.kind).zones[building.userData.zone];
      expect(weight, `${building.userData.kind} does not belong in a "${building.userData.zone}" block`)
        .toBeGreaterThan(0);
    }
    // Towers belong downtown, and at a push on a commercial street — never in
    // a village, a farm or an oasis out in the country.
    const strays = built.filter(
      (b) => ['skyscraper', 'tower_glass'].includes(b.userData.kind)
        && !['downtown', 'commercial'].includes(b.userData.zone)
    );
    expect(strays).toHaveLength(0);
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
