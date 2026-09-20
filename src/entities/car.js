import * as THREE from 'three';

export const CAR_RADIUS = 2.4; // metres of ground it takes up

// Simple low-poly car, roughly 4.3 m long and 1.5 m tall — a real car beside a
// 1.5 m player. def: { id, name, speedMultiplier } (data/vehicles.json).
export function createCar(def) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.8, 4.3),
    new THREE.MeshStandardMaterial({ color: 0xdd3333 })
  );
  body.position.y = 0.6;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.7, 2.1),
    new THREE.MeshStandardMaterial({ color: 0x222233 })
  );
  cabin.position.set(0, 1.35, -0.25);
  group.add(body, cabin);
  group.name = def.id;
  return group;
}
