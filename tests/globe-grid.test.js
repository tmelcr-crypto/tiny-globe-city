import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GLOBE_RADIUS } from '../src/world/globe.js';
import {
  markerAt, markerPoint, parseMarker, blockRef, allBlocks, allMarkers,
  BLOCK_RANGE, REACH, plotsOf,
} from '../src/world/markers.js';
import { tangentFromDirection, cityBlocks } from '../src/world/city-plan.js';
import { createRng } from '../src/core/rng.js';

describe('the grid covers the whole globe', () => {
  it('names a lot under any point on the planet', () => {
    const rng = createRng(7);
    const direction = new THREE.Vector3();

    for (let n = 0; n < 500; n++) {
      // An even scatter of directions over the sphere.
      const y = rng() * 2 - 1;
      const angle = rng() * Math.PI * 2;
      const ring = Math.sqrt(1 - y * y);
      direction.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring).multiplyScalar(GLOBE_RADIUS);

      const { u, v } = tangentFromDirection(direction);
      const marker = markerAt(u, v);
      expect(marker, `nothing at ${u.toFixed(1)}, ${v.toFixed(1)}`).not.toBeNull();
      expect(parseMarker(marker.code).code).toBe(marker.code);
    }
  });

  it('reaches at least as far as the point opposite the player', () => {
    const corner = Math.hypot(BLOCK_RANGE.minI, BLOCK_RANGE.minJ);
    expect(corner).toBeGreaterThan(0);
    expect(markerAt(REACH - 1, 0)).not.toBeNull();
    expect(markerAt(0, -(REACH - 1))).not.toBeNull();
  });

  it('gives every block on the globe its own code', () => {
    const blocks = allBlocks();
    const refs = new Set(blocks.map((block) => block.ref));
    expect(blocks.length).toBeGreaterThan(300);
    expect(refs.size).toBe(blocks.length);
  });

  it('keeps the town's own codes exactly as the city map numbers them', () => {
    // The city is rows 1..4 and columns A..D, and nothing about going global
    // may move them.
    for (const block of cityBlocks()) {
      const ref = blockRef(block);
      expect(ref).toMatch(/^[A-D][1-4]$/);
      const centre = markerAt(block.u, block.v);
      expect(centre.code.startsWith(ref)).toBe(true);
    }
  });

  it('carries on past the town, wrapping the letters and numbers round', () => {
    // West of column A is Z, and north of row 1 is the last row on the globe.
    const townBlock = cityBlocks()[0];
    const west = blockRef({ i: BLOCK_RANGE.minI, j: townBlock.j });
    expect(west).toMatch(/^[A-Z]\d+$/);
    expect(blockRef({ i: -3, j: townBlock.j })).toBe(`Z${blockRef(townBlock).slice(1)}`);
    expect(blockRef({ i: townBlock.i, j: 2 })).toBe(`${blockRef(townBlock)[0]}20`);
  });

  it('round-trips every marker on the globe', () => {
    for (const marker of allMarkers()) {
      if (Math.hypot(marker.u, marker.v) > REACH) continue; // off the back of the planet
      expect(markerAt(marker.u, marker.v).code).toBe(marker.code);
      const point = markerPoint(marker.code);
      expect(point.u).toBeCloseTo(marker.u, 6);
      expect(point.v).toBeCloseTo(marker.v, 6);
    }
  });

  it('splits any block into its four lots', () => {
    const lots = plotsOf(BLOCK_RANGE.minI + 1, BLOCK_RANGE.maxJ - 1);
    expect(lots.map((lot) => lot.plot)).toEqual(['A', 'B', 'C', 'D']);
    expect(new Set(lots.map((lot) => lot.code)).size).toBe(4);
  });
});
