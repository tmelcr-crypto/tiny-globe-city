import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCombatSystem } from '../src/systems/combat.js';
import { emit } from '../src/core/events.js';
import weapons from '../src/data/weapons.json';

function makeNpc(position, health = 30) {
  const npc = new THREE.Object3D();
  npc.position.copy(position);
  npc.userData = { health };
  return npc;
}

describe('combat system', () => {
  it('shooting damages the nearest living NPC in range', () => {
    const playerPos = new THREE.Vector3(0, 0, 0);
    const npc = makeNpc(new THREE.Vector3(0, 0, -2));
    const combat = createCombatSystem([npc], playerPos);

    emit('shoot');
    combat.update(0);

    expect(npc.userData.health).toBe(30 - weapons[0].damage);
  });

  it('respects the weapon cooldown between shots', () => {
    const playerPos = new THREE.Vector3(0, 0, 0);
    const npc = makeNpc(new THREE.Vector3(0, 0, -2));
    const combat = createCombatSystem([npc], playerPos);

    emit('shoot');
    combat.update(0);
    emit('shoot');
    combat.update(0.01); // well under weapons[0].cooldown

    expect(npc.userData.health).toBe(30 - weapons[0].damage); // second shot didn't land yet
  });

  it('hides the NPC once its health drops to zero', () => {
    const playerPos = new THREE.Vector3(0, 0, 0);
    const npc = makeNpc(new THREE.Vector3(0, 0, -2), weapons[0].damage);
    const combat = createCombatSystem([npc], playerPos);

    emit('shoot');
    combat.update(0);

    expect(npc.userData.health).toBeLessThanOrEqual(0);
    expect(npc.visible).toBe(false);
  });

  it('ignores NPCs out of weapon range', () => {
    const playerPos = new THREE.Vector3(0, 0, 0);
    const npc = makeNpc(new THREE.Vector3(0, 0, -50));
    const combat = createCombatSystem([npc], playerPos);

    emit('shoot');
    combat.update(0);

    expect(npc.userData.health).toBe(30);
  });
});
