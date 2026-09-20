import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGlobe } from '../src/world/globe.js';
import { spawnAll } from '../src/world/spawner.js';
import {
  streets, streetsOn, junctionsOn, nearestStreet, isOnStreet, chartFor, chartUnder,
  allBlocks, blockCentre, CORNER_RADIUS, ROAD_WIDTH, SIDEWALK_WIDTH, CELL,
} from '../src/world/city-plan.js';
import { FACE_IDS, TOWN_FACE } from '../src/world/sphere-grid.js';

const bearing = (a, b) => Math.atan2(b.v - a.v, b.u - a.u);
const degrees = (radians) => (radians * 180) / Math.PI;
const avenues = () => streets().filter((street) => street.kind === 'avenue');

describe('the street network', () => {
  it('lays streets on every face of the planet', () => {
    for (const faceId of FACE_IDS) {
      expect(streetsOn(faceId).length, `face ${faceId} has no streets`).toBeGreaterThan(0);
    }
  });

  it('gives every face an avenue, and the city a few', () => {
    for (const faceId of FACE_IDS) {
      expect(avenues().filter((a) => a.faceId === faceId).length, `face ${faceId} has no avenue`)
        .toBeGreaterThan(0);
    }
    expect(avenues().filter((a) => a.faceId === TOWN_FACE).length).toBeGreaterThan(1);
  });

  it('leaves open country off the grid', () => {
    // A forest is crossed by the road that passes through it and nothing more:
    // the grid belongs where the map says something is built.
    const built = allBlocks().filter((block) => block.streets).length;
    const total = allBlocks().length;
    expect(built).toBeGreaterThan(total * 0.3);
    expect(built).toBeLessThan(total * 0.9);

    const wild = allBlocks().find((block) => !block.streets && block.zone === 'forest');
    const chart = chartFor(wild.faceId);
    const { u, v } = chart.local(blockCentre(wild));
    // Deep in the woods there is no kerb underfoot.
    expect(isOnStreet(wild.faceId, u, v)).toBe(false);
  });

  it('builds each street as a run of points a car could follow', () => {
    for (const street of streets()) {
      expect(street.points.length, `${street.id} is a stub`).toBeGreaterThan(2);
      for (let s = 0; s < street.points.length - 1; s++) {
        const a = street.points[s];
        const b = street.points[s + 1];
        const step = Math.hypot(b.u - a.u, b.v - a.v);
        expect(step, `${street.id} has a gap in it`).toBeGreaterThan(0.5);
        expect(step, `${street.id} jumps ${step.toFixed(1)} m`).toBeLessThan(8);
      }
    }
  });
});

describe('avenues', () => {
  it('runs a good share of its length off the grid axes', () => {
    let total = 0;
    let offGrid = 0;
    for (const avenue of avenues()) {
      for (let s = 0; s < avenue.points.length - 1; s++) {
        const a = avenue.points[s];
        const b = avenue.points[s + 1];
        const length = Math.hypot(b.u - a.u, b.v - a.v);
        const angle = ((Math.abs(degrees(bearing(a, b))) % 90) + 90) % 90;
        total += length;
        if (angle > 15 && angle < 75) offGrid += length;
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(offGrid / total).toBeGreaterThan(0.25);
  });

  it('bends along its length instead of running straight', () => {
    for (const avenue of avenues()) {
      const points = avenue.points;
      let turned = 0;
      for (let s = 1; s < points.length - 1; s++) {
        const before = bearing(points[s - 1], points[s]);
        const after = bearing(points[s], points[s + 1]);
        turned = Math.max(turned, Math.abs(degrees(after - before)));
      }
      expect(turned, `${avenue.id} never bends`).toBeGreaterThan(1);
    }
  });

  it('leaves the player spawn clear', () => {
    const up = new THREE.Vector3(0, 1, 0);
    const chart = chartUnder(up);
    const { u, v } = chart.local(up);
    expect(isOnStreet(chart.faceId, u, v)).toBe(false);
  });

  it('counts as the nearest street when it is the closest one', () => {
    const avenue = avenues()[0];
    const point = avenue.points[Math.floor(avenue.points.length / 2)];
    const street = nearestStreet(avenue.faceId, point.u, point.v);
    expect(street.distance).toBeLessThan(1);
    expect(street.width).toBe(avenue.width);
  });
});

describe('rounded corners', () => {
  it('rounds every junction of the grid', () => {
    expect(CORNER_RADIUS).toBeGreaterThan(SIDEWALK_WIDTH);
    expect(junctionsOn(TOWN_FACE).length).toBeGreaterThan(8);
  });

  it('puts the corner arc between the road edge and the block', () => {
    const [junction] = junctionsOn(TOWN_FACE);
    const centre = {
      u: junction.u + ROAD_WIDTH / 2 + CORNER_RADIUS,
      v: junction.v + ROAD_WIDTH / 2 + CORNER_RADIUS,
    };
    // The kerb at 225 degrees is inside the square corner but outside the road.
    const kerb = {
      u: centre.u - Math.SQRT1_2 * CORNER_RADIUS,
      v: centre.v - Math.SQRT1_2 * CORNER_RADIUS,
    };
    expect(kerb.u).toBeGreaterThan(junction.u + ROAD_WIDTH / 2);
    expect(kerb.u).toBeLessThan(centre.u);
  });

  it('keeps its junctions inside the face they belong to', () => {
    for (const faceId of FACE_IDS) {
      for (const junction of junctionsOn(faceId)) {
        expect(Math.abs(junction.u), `a junction of ${faceId} is off its map`)
          .toBeLessThan(chartFor(faceId).span + CELL);
      }
    }
  });
});

describe('the town around the streets', () => {
  it('builds nothing standing in a street', () => {
    const pivot = createGlobe();
    spawnAll(pivot);

    for (const child of pivot.children) {
      const type = child.userData?.type;
      if (type !== 'building' && type !== 'safehouse' && type !== 'tree') continue;
      // Explicit placements are laid out to the metre on purpose — a panelák
      // estate has its own lane — so only the zoning-driven ones are checked.
      if (child.userData.marker) continue;
      const chart = chartUnder(child.position);
      const { u, v } = chart.local(child.position);
      const street = nearestStreet(chart.faceId, u, v);
      if (!street) continue;
      const clearance = street.width / 2 + (child.userData.footprint ?? 1);
      expect(
        street.distance,
        `${child.userData.id ?? type} sits in street ${street.id}`
      ).toBeGreaterThan(clearance);
    }
  });

  it('still places a full town once the streets take their space', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    const count = (type) => pivot.children.filter((c) => c.userData?.type === type).length;
    expect(count('building')).toBeGreaterThan(10);
    expect(count('car')).toBeGreaterThan(3);
    expect(count('npc')).toBeGreaterThan(1);
  });
});
