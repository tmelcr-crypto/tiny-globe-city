import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createWeapon } from '../src/entities/weapon.js';
import { createPickupSystem } from '../src/systems/pickups.js';
import { state } from '../src/core/state.js';
import { on } from '../src/core/events.js';
import weapons from '../src/data/weapons.json';

describe('weapon pickup', () => {
  beforeEach(() => { state.ammo = 0; });

  it('gives 50 rounds and removes the pickup when the player crosses it', () => {
    const worldPivot = new THREE.Group();
    const pickup = createWeapon(weapons[0]);
    pickup.position.set(0, 0, 0); // coincides with the player below
    worldPivot.add(pickup);

    const playerPosition = new THREE.Vector3(0, 0, 0);
    const pickups = [pickup];
    const system = createPickupSystem(playerPosition, pickups);

    let emitted = null;
    on('pickup', (info) => { emitted = info; });

    system.update();

    expect(state.ammo).toBe(50);
    expect(pickups.length).toBe(0);
    expect(pickup.parent).toBeNull();
    expect(emitted).toMatchObject({ type: 'weapon', ammo: 50 });
  });

  it('leaves a distant pickup untouched', () => {
    const worldPivot = new THREE.Group();
    const pickup = createWeapon(weapons[0]);
    pickup.position.set(100, 0, 0);
    worldPivot.add(pickup);

    const playerPosition = new THREE.Vector3(0, 0, 0);
    const pickups = [pickup];
    const system = createPickupSystem(playerPosition, pickups);

    system.update();

    expect(state.ammo).toBe(0);
    expect(pickups.length).toBe(1);
  });
});
