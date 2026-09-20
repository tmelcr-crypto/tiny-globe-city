import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGlobe, GLOBE_RADIUS } from '../src/world/globe.js';
import { spawnAll } from '../src/world/spawner.js';
import { createInteractionSystem } from '../src/systems/interaction.js';
import { on, emit } from '../src/core/events.js';
import { state } from '../src/core/state.js';

describe('world population', () => {
  it('spawns houses (with exactly one safehouse), cars, and NPCs as children of worldPivot', () => {
    const pivot = createGlobe();
    const interactables = spawnAll(pivot);

    const byType = (type) => pivot.children.filter((c) => c.userData?.type === type);
    expect(byType('house').length).toBeGreaterThan(0);
    expect(byType('safehouse').length).toBe(1);
    expect(byType('car').length).toBeGreaterThan(0);
    expect(byType('npc').length).toBeGreaterThan(0);

    expect(interactables).toContain(byType('safehouse')[0]);
    for (const car of byType('car')) expect(interactables).toContain(car);
  });

  it('places the safehouse within reach of the fixed spawn point', () => {
    const pivot = createGlobe();
    spawnAll(pivot);
    const safehouse = pivot.children.find((c) => c.userData?.type === 'safehouse');
    const playerPos = new THREE.Vector3(0, GLOBE_RADIUS + 0.8, 0);
    const worldPos = new THREE.Vector3();
    safehouse.getWorldPosition(worldPos);
    expect(worldPos.distanceTo(playerPos)).toBeLessThan(12);
  });
});

describe('interaction system', () => {
  it('entering a car applies its speed multiplier, exiting resets it', () => {
    const pivot = createGlobe();
    const interactables = spawnAll(pivot);
    const car = interactables.find((o) => o.userData.type === 'car');
    const playerPos = new THREE.Vector3();
    car.getWorldPosition(playerPos); // stand exactly on the car so it's nearest

    const system = createInteractionSystem(interactables, playerPos);
    system.update();

    let toggle;
    on('vehicle:toggle', (payload) => { toggle = payload; });

    emit('interact');
    expect(toggle).toEqual({ entered: true, multiplier: car.userData.def.speedMultiplier, car });
    expect(state.inVehicle).toBe(true);

    emit('interact');
    expect(toggle).toEqual({ entered: false, multiplier: car.userData.def.speedMultiplier, car });
    expect(state.inVehicle).toBe(false);
  });

  it('talking to a quest-giving NPC grants its reward exactly once', () => {
    const pivot = createGlobe();
    const interactables = spawnAll(pivot);
    const giver = interactables.find((o) => o.userData.type === 'npc' && o.userData.def.role === 'quest_giver');
    const playerPos = new THREE.Vector3();
    giver.getWorldPosition(playerPos);

    const system = createInteractionSystem(interactables, playerPos);
    system.update();

    const before = state.money;
    emit('interact');
    expect(state.money).toBeGreaterThan(before);

    const afterFirst = state.money;
    emit('interact'); // talking again should not double-grant the reward
    expect(state.money).toBe(afterFirst);
  });

  it('emits safehouse:interact when the nearest target is the safehouse', () => {
    const pivot = createGlobe();
    const interactables = spawnAll(pivot);
    const safehouse = interactables.find((o) => o.userData.type === 'safehouse');
    const playerPos = new THREE.Vector3();
    safehouse.getWorldPosition(playerPos);

    const system = createInteractionSystem(interactables, playerPos);
    system.update();

    let fired = false;
    on('safehouse:interact', () => { fired = true; });
    emit('interact');
    expect(fired).toBe(true);
  });
});
