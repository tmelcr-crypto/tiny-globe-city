import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GLOBE_RADIUS } from '../src/world/globe.js';
import {
  markerPoint, markerDirection, markerUnder, parseMarker, blockRef,
  allBlocks, allMarkers, plotsOf, CELL_COUNT,
} from '../src/world/markers.js';
import { allBlocks as mapBlocks, blockCentre, grid, CELL } from '../src/world/city-plan.js';
import { TOWN_FACE } from '../src/world/sphere-grid.js';
import { FACE_IDS } from '../src/world/sphere-grid.js';
import { createRng } from '../src/core/rng.js';

const corners = (block) => grid.cellCorners(block.faceId, block.column, block.row);
const edgeLengths = (block) => {
  const c = corners(block);
  return c.map((point, n) => point.angleTo(c[(n + 1) % 4]) * GLOBE_RADIUS);
};

// The area of a spherical quadrilateral, from the excess of its two triangles.
function area(block) {
  const c = corners(block);
  const excess = (p, q, r) => {
    const angle = (at, from, to) => {
      const a = new THREE.Vector3().crossVectors(at, from).normalize();
      const b = new THREE.Vector3().crossVectors(at, to).normalize();
      return Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
    };
    return angle(p, q, r) + angle(q, r, p) + angle(r, p, q) - Math.PI;
  };
  return (excess(c[0], c[1], c[2]) + excess(c[0], c[2], c[3])) * GLOBE_RADIUS ** 2;
}

describe('the grid over the globe', () => {
  it('divides the planet into cells with no pole anywhere', () => {
    const blocks = allBlocks();
    expect(blocks).toHaveLength(CELL_COUNT);
    expect(new Set(blocks.map((block) => block.ref)).size).toBe(blocks.length);

    // A grid of latitude and longitude pinches to nothing at its poles. This
    // one has no cell anywhere near degenerate: the shortest edge on the
    // planet is still most of a cell long.
    const shortest = Math.min(...blocks.flatMap(edgeLengths));
    expect(shortest).toBeGreaterThan(CELL * 0.6);
  });

  it('covers the sphere exactly once', () => {
    const total = allBlocks().reduce((sum, block) => sum + area(block), 0);
    expect(total).toBeCloseTo(4 * Math.PI * GLOBE_RADIUS ** 2, 0);
  });

  it('keeps every cell square, within what a sphere allows', () => {
    // You cannot tile a sphere with exact squares. On a cubed sphere every
    // cell is a four-sided near-square: sides within half of each other, and
    // areas within a quarter across the whole planet.
    const aspects = allBlocks().map((block) => {
      const [north, east] = edgeLengths(block);
      return Math.max(north, east) / Math.min(north, east);
    });
    expect(Math.max(...aspects)).toBeLessThan(1.5);

    const areas = allBlocks().map(area);
    expect(Math.max(...areas) / Math.min(...areas)).toBeLessThan(1.25);
  });

  it('names a lot under any point on the planet', () => {
    const rng = createRng(7);
    const direction = new THREE.Vector3();

    for (let n = 0; n < 500; n++) {
      const y = rng() * 2 - 1;
      const angle = rng() * Math.PI * 2;
      const ring = Math.sqrt(1 - y * y);
      direction.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring);

      const marker = markerUnder(direction);
      expect(parseMarker(marker.code).code).toBe(marker.code);
      // The lot it named really is the nearest lot to that point.
      const home = markerDirection(marker.code);
      expect(home.angleTo(direction) * GLOBE_RADIUS).toBeLessThan(CELL);
    }
  });

  it("keeps the town's own codes exactly as the city map numbers them", () => {
    for (const block of mapBlocks().filter((b) => b.faceId === TOWN_FACE)) {
      const ref = blockRef(block);
      expect(ref).toMatch(/^[A-D][1-4]$/);
      expect(markerUnder(blockCentre(block)).code.startsWith(ref)).toBe(true);
    }
  });

  it('gives the rest of the planet a face letter', () => {
    const refs = allBlocks().map((block) => block.ref);
    expect(refs.filter((ref) => !ref.includes('-'))).toHaveLength(grid.divisions ** 2);
    for (const faceId of FACE_IDS.filter((id) => id !== 'T')) {
      expect(refs.filter((ref) => ref.startsWith(`${faceId}-`)).length).toBe(grid.divisions ** 2);
    }
  });

  it('round-trips every marker on the globe', () => {
    for (const marker of allMarkers()) {
      expect(markerUnder(marker.direction).code).toBe(marker.code);
      const point = markerPoint(marker.code);
      expect(point.u).toBeCloseTo(marker.u, 6);
      expect(point.v).toBeCloseTo(marker.v, 6);
    }
  });

  it('splits any block into its four lots', () => {
    const lots = plotsOf({ faceId: 'W', column: 1, row: 2 });
    expect(lots.map((lot) => lot.plot)).toEqual(['A', 'B', 'C', 'D']);
    expect(new Set(lots.map((lot) => lot.code)).size).toBe(4);
    for (const lot of lots) expect(markerUnder(lot.direction).code).toBe(lot.code);
  });
});
