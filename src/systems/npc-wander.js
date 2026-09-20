import * as THREE from 'three';
import { GLOBE_RADIUS } from '../world/globe.js';
import { NPC_RADIUS } from '../entities/npc.js';

const SPEED = 0.9;         // metres per second along the ground, a walking pace
const LEASH = 25;          // metres an NPC strays from where it spawned
const RETARGET_MIN = 2;    // seconds before picking a new heading
const RETARGET_MAX = 5;

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _previous = new THREE.Vector3();

// A heading on the sphere is an axis to rotate the NPC's position about, which
// carries it along a great circle. Any axis perpendicular to its position works.
function randomHeading(target, position) {
  do {
    target.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    target.cross(position);
  } while (target.lengthSq() < 1e-6);
  return target.normalize();
}

function retargetDelay() {
  return RETARGET_MIN + Math.random() * (RETARGET_MAX - RETARGET_MIN);
}

// NPCs and obstacles are both children of worldPivot, so their local positions
// are directly comparable — no world-matrix round trip needed.
function blocked(npc, obstacles) {
  for (const obj of obstacles) {
    if (obj.parent !== npc.parent) continue; // e.g. the car the player is driving
    const clearance = (obj.userData.footprint ?? 1) + NPC_RADIUS;
    if (npc.position.angleTo(obj.position) * GLOBE_RADIUS < clearance) return true;
  }
  return false;
}

// Wanders NPCs around the spot they spawned, steering them off obstacles.
export function createNpcWander(npcs, obstacles) {
  for (const npc of npcs) {
    npc.userData.home = npc.position.clone();
    npc.userData.heading = randomHeading(new THREE.Vector3(), npc.position);
    npc.userData.retargetIn = retargetDelay();
  }

  return {
    update(dt) {
      const step = (SPEED / GLOBE_RADIUS) * dt;
      for (const npc of npcs) {
        if (!npc.visible) continue; // downed NPCs stay where they fell
        const data = npc.userData;

        data.retargetIn -= dt;
        if (data.retargetIn <= 0) {
          randomHeading(data.heading, npc.position);
          data.retargetIn = retargetDelay();
        }

        // Turn back once they've strayed too far from home. Rotating about
        // position x home carries the NPC back along the shortest arc.
        if (npc.position.angleTo(data.home) * GLOBE_RADIUS > LEASH) {
          data.heading.copy(npc.position).cross(data.home).normalize();
        }

        _previous.copy(npc.position);
        npc.position.applyAxisAngle(data.heading, step);

        if (blocked(npc, obstacles)) {
          npc.position.copy(_previous);
          randomHeading(data.heading, npc.position);
          continue;
        }

        _dir.copy(npc.position).normalize();
        npc.quaternion.setFromUnitVectors(UP, _dir);
      }
    },
  };
}
