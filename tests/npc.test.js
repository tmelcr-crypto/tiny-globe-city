import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGlobe, GLOBE_RADIUS } from '../src/world/globe.js';
import { spawnAll } from '../src/world/spawner.js';
import { createNpc } from '../src/entities/npc.js';
import { createNpcWander } from '../src/systems/npc-wander.js';

describe('npc entity', () => {
  it('stands on the ground rather than sinking into it', () => {
    const npc = createNpc({ id: 'npc_test', role: 'wanderer' });
    const box = new THREE.Box3().setFromObject(npc);
    // Origin is at the feet, so nothing should hang below it once placed on the surface.
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(box.max.y).toBeGreaterThan(1);
  });

  it('sits above the globe surface once spawned', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    pivot.updateMatrixWorld(true);
    const bodyPos = new THREE.Vector3();

    for (const npc of pivot.children.filter((c) => c.userData?.type === 'npc')) {
      // Feet on the surface, and the body standing outward from the centre
      // rather than buried inside the globe.
      expect(npc.position.length()).toBeCloseTo(GLOBE_RADIUS, 3);
      npc.children[0].getWorldPosition(bodyPos);
      expect(bodyPos.length()).toBeGreaterThan(GLOBE_RADIUS);
    }
  });
});

describe('npc wander', () => {
  it('moves NPCs along the surface over time', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    const npcs = pivot.children.filter((c) => c.userData?.type === 'npc');
    const obstacles = pivot.children.filter((c) =>
      ['building', 'safehouse', 'car', 'tree', 'mountain', 'lake'].includes(c.userData?.type)
    );
    const start = npcs.map((n) => n.position.clone());

    const wander = createNpcWander(npcs, obstacles);
    for (let i = 0; i < 120; i++) wander.update(1 / 60); // two seconds

    const moved = npcs.filter((n, i) => n.position.distanceTo(start[i]) > 0.05);
    expect(moved.length).toBeGreaterThan(0);
  });

  it('keeps NPCs on the globe surface and near where they spawned', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    const npcs = pivot.children.filter((c) => c.userData?.type === 'npc');
    const obstacles = pivot.children.filter((c) =>
      ['building', 'safehouse', 'car', 'tree', 'mountain', 'lake'].includes(c.userData?.type)
    );

    const wander = createNpcWander(npcs, obstacles);
    for (let i = 0; i < 3600; i++) wander.update(1 / 60); // a full minute

    for (const npc of npcs) {
      expect(npc.position.length()).toBeCloseTo(GLOBE_RADIUS, 3);
      const fromHome = npc.position.angleTo(npc.userData.home) * GLOBE_RADIUS;
      expect(fromHome).toBeLessThan(40); // leash is 25 m, allow overshoot before it turns back
    }
  });

  it('leaves downed NPCs where they fell', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    const npcs = pivot.children.filter((c) => c.userData?.type === 'npc');
    const wander = createNpcWander(npcs, []);

    const victim = npcs[0];
    victim.visible = false;
    const restingPlace = victim.position.clone();
    for (let i = 0; i < 120; i++) wander.update(1 / 60);

    expect(victim.position.distanceTo(restingPlace)).toBe(0);
  });
});
