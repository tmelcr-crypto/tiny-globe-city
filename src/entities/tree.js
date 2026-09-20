import * as THREE from 'three';

// Simple low-poly tree: trunk + foliage cone. Purely decorative scenery (solid, not interactable).
export function createTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x5b3a1e })
  );
  trunk.position.y = 0.3;
  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 1.2, 7),
    new THREE.MeshStandardMaterial({ color: 0x2f7d3a })
  );
  foliage.position.y = 1.0;
  group.add(trunk, foliage);
  return group;
}
