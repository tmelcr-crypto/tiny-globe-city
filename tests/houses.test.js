import { describe, it, expect } from 'vitest';
import houses from '../src/data/houses.json';
import interiors from '../src/data/interiors.json';

describe('data', () => {
  it('houses load and each references a real interior', () => {
    expect(houses.length).toBeGreaterThan(0);
    const interiorIds = new Set(interiors.map((i) => i.id));
    for (const house of houses) expect(interiorIds.has(house.interior)).toBe(true);
  });

  it('every interior has a spawn point, an exit, and at least one platform', () => {
    for (const level of interiors) {
      expect(level.spawn).toBeDefined();
      expect(level.exit).toBeDefined();
      expect(level.platforms.length).toBeGreaterThan(0);
    }
  });
});
