import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { latLonToDirection } from '../src/world/geo.js';
import { createSavepoint } from '../src/entities/savepoint.js';
import { createSavepointSystem } from '../src/systems/savepoints.js';
import { on } from '../src/core/events.js';

describe('geo', () => {
  it('maps the north pole to +Y', () => {
    const dir = latLonToDirection(90, 0);
    expect(dir.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6);
  });
});

describe('savepoint proximity', () => {
  it('flags the fixed player as near only while the savepoint is rotated under them', async () => {
    const worldPivot = new THREE.Group();
    const mesh = createSavepoint({ id: 'a', name: 'A', lat: 90, lon: 0 }, 50);
    worldPivot.add(mesh);
    worldPivot.updateMatrixWorld(true);

    const changes = [];
    on('savepoint:change', (info) => changes.push(info));

    const system = createSavepointSystem([mesh]);
    system.update();
    expect(changes[0]).toMatchObject({ id: 'a', name: 'A' });

    worldPivot.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    worldPivot.updateMatrixWorld(true);
    system.update();
    expect(changes[1]).toBeNull();
  });
});
