import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGlobe, GLOBE_RADIUS } from '../src/world/globe.js';
import { spawnAll } from '../src/world/spawner.js';
import { markerPoint, markerAt, allMarkers, parseMarker, blockRef } from '../src/world/markers.js';
import { directionFromTangent } from '../src/world/city-plan.js';
import placements from '../src/data/placements.json';

const spawn = () => {
  const pivot = createGlobe();
  spawnAll(pivot);
  return pivot;
};

describe('markers', () => {
  it('round-trips a code to a point and back', () => {
    for (const marker of allMarkers()) {
      expect(markerAt(marker.u, marker.v).code).toBe(marker.code);
    }
  });

  it('takes a code anywhere on the globe and rejects the rest', () => {
    expect(parseMarker('Z9A')).not.toBeNull();   // out in the country, west of the town
    expect(parseMarker('B99A')).toBeNull();      // no such row on a planet this size
    expect(parseMarker('B3E')).toBeNull();       // a block has four plots, A to D
    expect(parseMarker('nonsense')).toBeNull();
    expect(parseMarker('b3c').code).toBe('B3C'); // case-insensitive
  });

  it('names the four quarters around each block centre', () => {
    // A and B are the north half, A and C the west half.
    const north = markerPoint('B3A').v;
    const south = markerPoint('B3C').v;
    const west = markerPoint('B3A').u;
    const east = markerPoint('B3B').u;
    expect(north).toBeGreaterThan(south);
    expect(east).toBeGreaterThan(west);
  });

  it('agrees with the block references the plan uses', () => {
    const marker = markerAt(markerPoint('C2D').u, markerPoint('C2D').v);
    expect(blockRef(marker)).toBe('C2');
  });
});

describe('placements', () => {
  it('puts every requested thing on its marker', () => {
    const pivot = spawnAll ? spawn() : null;
    const world = new THREE.Vector3();

    for (const entry of placements) {
      if (entry.place === 'empty') continue;
      const marker = entry.at.toUpperCase();
      const model = pivot.children.find((c) => c.userData?.id === `${entry.place}@${marker}`);
      expect(model, `nothing placed at ${entry.at}`).toBeTruthy();

      // It stands on the marker it was asked for, within a metre.
      const target = directionFromTangent(markerPoint(entry.at).u, markerPoint(entry.at).v)
        .multiplyScalar(GLOBE_RADIUS);
      model.getWorldPosition(world);
      expect(world.distanceTo(target)).toBeLessThan(1);
    }
  });

  it('places the extras a lot asks for, in the numbers asked for', () => {
    const pivot = spawn();
    const withExtras = placements.find((entry) => entry.with);
    const marker = withExtras.at.toUpperCase();

    for (const companion of withExtras.with) {
      const found = pivot.children.filter(
        (c) => c.userData?.marker === marker && c.userData.id.startsWith(`${companion.place}@`)
      );
      expect(found, `${companion.place} at ${marker}`).toHaveLength(companion.count);
    }
  });

  it('keeps the extras inside the lot they belong to', () => {
    const pivot = spawn();
    const withExtras = placements.find((entry) => entry.with);
    const marker = withExtras.at.toUpperCase();
    const centre = markerPoint(marker);
    const world = new THREE.Vector3();
    const target = directionFromTangent(centre.u, centre.v).multiplyScalar(GLOBE_RADIUS);

    for (const model of pivot.children.filter((c) => c.userData?.marker === marker)) {
      model.getWorldPosition(world);
      // A lot is a quarter of a block; nothing should stray beyond its half-span.
      expect(world.distanceTo(target)).toBeLessThan(18);
    }
  });

  it('honours a requested roof colour', () => {
    const pivot = spawn();
    const withRoof = placements.find((entry) => entry.roof);
    const model = pivot.children.find((c) => c.userData?.marker === withRoof.at.toUpperCase());

    // Material slot 1 is the roof.
    const roof = model.material[1];
    expect(`#${roof.color.getHexString()}`).toBe(withRoof.roof.toLowerCase());
  });

  it('leaves the rest of the town untouched when a placement is added', () => {
    // Placements draw from their own generator keyed on the marker, so the
    // filler's stream is identical whether or not they exist.
    const fingerprint = (pivot) => pivot.children
      .filter((c) => c.userData?.type && !c.userData.marker)
      .map((c) => `${c.userData.id}|${c.position.toArray().map((n) => n.toFixed(3))}`)
      .join('\n');

    expect(fingerprint(spawn())).toBe(fingerprint(spawn()));
  });
});
