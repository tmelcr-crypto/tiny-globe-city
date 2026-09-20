import * as THREE from 'three';

export const TREE_RADIUS = 2.2; // metres of ground it takes up

// Simple low-poly tree, about 8 m tall. Purely decorative scenery (solid, not interactable).
export function createTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x5b3a1e })
  );
  trunk.position.y = 1.5;
  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(TREE_RADIUS, 5.2, 7),
    new THREE.MeshStandardMaterial({ color: 0x2f7d3a })
  );
  foliage.position.y = 5.4;
  group.add(trunk, foliage);
  return group;
}
