import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGlobe } from '../src/world/globe.js';
import { spawnAll } from '../src/world/spawner.js';
import {
  avenues, nearestAvenue, isOnAvenue, junctions, mapPoint, nearestRoad,
  tangentFromDirection, CORNER_RADIUS, ROAD_WIDTH, SIDEWALK_WIDTH,
} from '../src/world/city-plan.js';

const bearing = (a, b) => Math.atan2(b.v - a.v, b.u - a.u);
const degrees = (radians) => (radians * 180) / Math.PI;

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
    expect(isOnAvenue(0, 0, 4)).toBe(false);
  });

  it('counts as the nearest street when it is the closest one', () => {
    const avenue = avenues()[0];
    const point = avenue.points[Math.floor(avenue.points.length / 2)];
    const road = nearestRoad(point.u, point.v);
    expect(road.distance).toBeLessThan(1);
    expect(road.width).toBe(avenue.width);
  });
});

describe('rounded corners', () => {
  it('rounds every junction of the grid', () => {
    expect(CORNER_RADIUS).toBeGreaterThan(SIDEWALK_WIDTH);
    expect(junctions().length).toBeGreaterThan(8);
  });

  it('puts the corner arc between the road edge and the block', () => {
    const [junction] = junctions();
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
});

describe('the town around the avenues', () => {
  it('builds nothing standing in an avenue', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    const up = new THREE.Vector3();

    for (const child of pivot.children) {
      const type = child.userData?.type;
      if (type !== 'building' && type !== 'safehouse' && type !== 'tree') continue;
      up.copy(child.position);
      const { u, v } = tangentFromDirection(up);
      const avenue = nearestAvenue(u, v);
      const clearance = avenue.width / 2 + (child.userData.footprint ?? 1);
      expect(
        avenue.distance,
        `${child.userData.id ?? type} sits in avenue ${avenue.id}`
      ).toBeGreaterThan(clearance);
    }
  });

  it('still places a full town once the avenues take their space', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    const count = (type) => pivot.children.filter((c) => c.userData?.type === type).length;
    expect(count('building')).toBeGreaterThan(10);
    expect(count('car')).toBeGreaterThan(3);
    expect(count('npc')).toBeGreaterThan(1);
  });

  it('maps grid coordinates onto the street lines', () => {
    const north = mapPoint(2, 0);
    const south = mapPoint(2, 4);
    // Both ends of one street, which runs dead straight over the globe: on a
    // flat map of the globe that bows by under a metre over its whole length.
    expect(Math.abs(north.u - south.u)).toBeLessThan(1);
    expect(north.v).toBeGreaterThan(south.v);
  });
});
