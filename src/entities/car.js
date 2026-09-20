import * as THREE from 'three';

// Simple low-poly car: body + cabin. def: { id, name, speedMultiplier } (data/vehicles.json).
export function createCar(def) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.6, 3),
    new THREE.MeshStandardMaterial({ color: 0xdd3333 })
  );
  body.position.y = 0.5;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.5, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x222233 })
  );
  cabin.position.set(0, 0.9, -0.2);
  group.add(body, cabin);
  group.name = def.id;
  return group;
}
