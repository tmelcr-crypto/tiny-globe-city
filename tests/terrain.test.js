import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGlobe } from '../src/world/globe.js';
import { GLOBE_RADIUS } from '../src/world/planet.js';
import { elevation, walkHeight, SEA_LEVEL, slope } from '../src/world/terrain.js';
import { streetProfiles, directionFromTangent, ROAD_LIFT, MAX_GRADE } from '../src/world/city-plan.js';
import { createRng } from '../src/core/rng.js';

const scatter = (n, each) => {
  const rng = createRng(11);
  const dir = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const y = rng() * 2 - 1;
    const angle = rng() * Math.PI * 2;
    const ring = Math.sqrt(1 - y * y);
    each(dir.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring));
  }
};

describe('the land', () => {
  it('has hills, hollows and water', () => {
    let low = Infinity;
    let high = -Infinity;
    let wet = 0;
    let n = 0;
    scatter(2000, (dir) => {
      const height = elevation(dir);
      low = Math.min(low, height);
      high = Math.max(high, height);
      if (height < SEA_LEVEL) wet++;
      n++;
    });

    expect(high - low).toBeGreaterThan(30);   // real relief, not a bumpy sphere
    expect(wet / n).toBeGreaterThan(0.1);     // seas, lakes and rivers
    expect(wet / n).toBeLessThan(0.6);        // but mostly land
  });

  it('is smooth enough to walk on', () => {
    // Nothing anywhere should be a cliff of noise: the height field has to be
    // continuous, or models on it and the player riding it would jitter.
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    scatter(400, (dir) => {
      a.copy(dir);
      b.copy(dir).addScaledVector(new THREE.Vector3(0.001, 0.002, 0.0015), 1).normalize();
      const step = a.angleTo(b) * GLOBE_RADIUS;
      // Steep is fine — a cliff of noise is not. A discontinuity in the height
      // field shows up here as tens of metres over half a metre of ground.
      expect(Math.abs(elevation(a) - elevation(b))).toBeLessThan(step * 8 + 0.3);
    });
  });

  it('keeps the town on dry, gentle ground', () => {
    const spawn = new THREE.Vector3(0, 1, 0);
    expect(elevation(spawn)).toBeGreaterThan(SEA_LEVEL + 3);
    expect(slope(spawn)).toBeLessThan(0.35);
  });
});

describe('streets over the land', () => {
  it('never lets the ground poke through the road', () => {
    createGlobe(); // carves the streets into the land
    let over = 0;
    let points = 0;
    for (const profile of streetProfiles()) {
      const samples = profile.samples;
      for (let i = 0; i < samples.length - 1; i++) {
        if (!samples[i].onGround || !samples[i + 1].onGround) continue;
        for (let f = 0; f <= 4; f++) {
          const t = f / 4;
          const u = samples[i].u + (samples[i + 1].u - samples[i].u) * t;
          const v = samples[i].v + (samples[i + 1].v - samples[i].v) * t;
          const road = samples[i].height + (samples[i + 1].height - samples[i].height) * t;
          points++;
          if (elevation(profile.chart.direction(u, v)) - road > ROAD_LIFT) over++;
        }
      }
    }
    // Where two streets on different faces of the grid meet near the edge
    // between them, they can still disagree by a metre or so — a handful of
    // points on a planet, and the surfacing covers most of it.
    expect(over / points).toBeLessThan(0.02);
  });

  it('climbs at a gradient a street could be built at', () => {
    createGlobe();
    const grades = [];
    for (const profile of streetProfiles()) {
      const samples = profile.samples;
      for (let i = 0; i < samples.length - 1; i++) {
        const run = Math.hypot(samples[i + 1].u - samples[i].u, samples[i + 1].v - samples[i].v);
        grades.push(Math.abs(samples[i + 1].height - samples[i].height) / run);
      }
    }
    // The gradient is held first and the crossings are reconciled after, so a
    // few approaches to a junction are steeper than the limit — but the street
    // as a whole is something you could drive up.
    const steep = grades.filter((g) => g > MAX_GRADE + 0.02);
    expect(steep.length / grades.length).toBeLessThan(0.1);
    expect(Math.max(...grades)).toBeLessThan(0.2);
  });

  it('bridges what it cannot bank up and bores what it cannot cut', () => {
    createGlobe();
    const carried = streetProfiles().flatMap((p) => p.samples).filter((s) => !s.onGround);
    expect(carried.filter((s) => s.carries === 'bridge').length).toBeGreaterThan(5);
    expect(carried.filter((s) => s.carries === 'tunnel').length).toBeGreaterThan(3);
  });

  it('carries the player over a bridge rather than dropping them in the valley', () => {
    createGlobe();
    // The valley under a deck, measured against the land as it finally is.
    const deck = streetProfiles()
      .flatMap((p) => p.samples)
      .filter((s) => s.carries === 'bridge')
      .map((s) => s)
      .map((s) => ({ s, clear: s.height - elevation(s.chart.direction(s.u, s.v)) }))
      .sort((a, b) => b.clear - a.clear)[0];
    expect(deck?.clear).toBeGreaterThan(3);

    const dir = deck.s.chart.direction(deck.s.u, deck.s.v);
    expect(walkHeight(dir)).toBeGreaterThan(elevation(dir) + 2);
    expect(walkHeight(dir)).toBeCloseTo(deck.s.height, 1);
  });
});
