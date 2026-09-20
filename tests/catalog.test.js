import { describe, it, expect } from 'vitest';
import catalog from '../src/data/catalog.json';
import props from '../src/data/props.json';
import buildings from '../src/data/buildings.json';
import vehicles from '../src/data/vehicles.json';
import npcs from '../src/data/npcs.json';
import { TREE_KINDS } from '../src/entities/tree.js';
import { partsFor, ARCHETYPE_NAMES } from '../scripts/catalog/archetypes.js';

const assets = catalog.categories.flatMap((category) => category.assets);
const entry = (asset) => Object.fromEntries(catalog.fields.map((field, i) => [field, asset[i]]));

describe('asset catalogue', () => {
  it('lists at least the four hundred assets the catalogue is meant to cover', () => {
    expect(assets.length).toBeGreaterThanOrEqual(400);
  });

  it('gives every asset a unique code, a size and a Prague reference', () => {
    const codes = new Set();
    for (const asset of assets) {
      const { id, name, size, prague } = entry(asset);
      expect(codes.has(id), `duplicate code ${id}`).toBe(false);
      codes.add(id);
      expect(name.length).toBeGreaterThan(2);
      expect(size.length).toBeGreaterThanOrEqual(2);
      for (const measure of size) expect(measure).toBeGreaterThan(0);
      expect(prague.length, `${id} has no reference note`).toBeGreaterThan(10);
    }
  });

  it('builds a stand-in for every archetype it names', () => {
    for (const asset of assets) {
      const { id, archetype, size, colors } = entry(asset);
      expect(ARCHETYPE_NAMES, `${id}: unknown archetype ${archetype}`).toContain(archetype);
      const parts = partsFor(archetype, size, colors);
      expect(parts.length, `${id} built nothing`).toBeGreaterThan(0);
    }
  });

  it('points every "already in the game" entry at a real model', () => {
    const known = {
      prop: props.map((p) => p.id),
      building: buildings.map((b) => b.id),
      vehicle: vehicles.map((v) => v.id),
      npc: npcs.map((n) => n.id),
      tree: TREE_KINDS,
    };
    const codes = new Set(assets.map((asset) => asset[0]));
    for (const [code, reference] of Object.entries(catalog.built)) {
      expect(codes.has(code), `built map names ${code}, which is not in the catalogue`).toBe(true);
      const [kind, id] = reference.split(':');
      expect(known[kind], `unknown asset kind ${kind}`).toBeDefined();
      expect(known[kind], `${reference} does not exist`).toContain(id);
    }
  });
});
