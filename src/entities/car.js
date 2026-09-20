import * as THREE from 'three';

export const CAR_RADIUS = 2.4; // metres of ground it takes up

const WHEEL_RADIUS = 0.34;
const WHEEL_SIDES = 10;
// A polygon wheel touches the ground on a flat edge, at its apothem rather than
// its radius — using the radius left the car hovering by a couple of centimetres.
const AXLE_HEIGHT = WHEEL_RADIUS * Math.cos(Math.PI / WHEEL_SIDES);
const BODY = new THREE.MeshStandardMaterial({ color: 0xdd3333, flatShading: true });
const CABIN = new THREE.MeshStandardMaterial({ color: 0x222233, flatShading: true });
const RUBBER = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, flatShading: true });

// Simple low-poly car, about 4.3 m long and 1.6 m tall — a real car beside a
// 1.5 m player. It rests on its wheels, so nothing floats. def: { id, name,
// speedMultiplier } (data/vehicles.json).
export function createCar(def) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.3), BODY);
  body.position.y = AXLE_HEIGHT + 0.35;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.65, 2.1), CABIN);
  cabin.position.set(0, AXLE_HEIGHT + 1.02, -0.25);
  group.add(body, cabin);

  const wheel = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.26, WHEEL_SIDES).rotateZ(Math.PI / 2);
  for (const x of [-0.82, 0.82]) {
    for (const z of [-1.35, 1.35]) {
      const tyre = new THREE.Mesh(wheel, RUBBER);
      tyre.position.set(x, AXLE_HEIGHT, z); // rests on the flat of the tyre
      group.add(tyre);
    }
  }

  group.name = def.id;
  return group;
}
