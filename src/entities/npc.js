import * as THREE from 'three';

// Simple NPC capsule; quest givers are colored differently. def: { id, name, role, questId } (data/npcs.json).
export function createNpc(def) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.7, 4, 8),
    new THREE.MeshStandardMaterial({ color: def.role === 'quest_giver' ? 0xffcc00 : 0x3399ff })
  );
  mesh.name = def.id;
  return mesh;
}
