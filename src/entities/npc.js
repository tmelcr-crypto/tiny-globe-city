import * as THREE from 'three';

export const NPC_RADIUS = 0.4;
const NPC_HEIGHT = 1.5; // same build as the player

// Simple NPC capsule; quest givers are colored differently. def: { id, name, role, questId } (data/npcs.json).
// Origin sits at the feet (like trees and cars) so placing it on the surface stands it up rather than burying it.
export function createNpc(def) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, NPC_HEIGHT - 0.6, 4, 8),
    new THREE.MeshStandardMaterial({ color: def.role === 'quest_giver' ? 0xffcc00 : 0x3399ff })
  );
  body.position.y = NPC_HEIGHT / 2; // capsule geometry is centred on its origin
  group.add(body);
  group.name = def.id;
  return group;
}
