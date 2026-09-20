import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';
import houseTypes from '../data/houses.json';

const DOOR_WIDTH = 0.6;
const DOOR_HEIGHT = 1.2;
const UP = new THREE.Vector3(0, 1, 0);

// Spawns houses as children of worldPivot, each with a door mesh on its
// front face. Returns [{ id, mesh, door, dir, interiorId }] for use by the
// house-entry proximity system.
export function createHouses(pivot, count = 40) {
  const houses = [];
  for (let i = 0; i < count; i++) {
    const type = houseTypes[i % houseTypes.length];
    const dir = new THREE.Vector3().randomDirection();

    const house = new THREE.Mesh(
      new THREE.BoxGeometry(type.width, type.height, type.depth),
      new THREE.MeshStandardMaterial({ color: type.color })
    );
    house.position.copy(dir).multiplyScalar(GLOBE_RADIUS);
    house.quaternion.setFromUnitVectors(UP, dir);

    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(DOOR_WIDTH, DOOR_HEIGHT),
      new THREE.MeshStandardMaterial({ color: 0x4a2f1a, side: THREE.DoubleSide })
    );
    door.position.set(0, -type.height / 2 + DOOR_HEIGHT / 2, type.depth / 2 + 0.01);
    house.add(door);

    const id = `house_${i}`;
    house.userData.houseId = id;
    pivot.add(house);

    houses.push({ id, mesh: house, door, dir, interiorId: type.interior });
  }
  return houses;
}
