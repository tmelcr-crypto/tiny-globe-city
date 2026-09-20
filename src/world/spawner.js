// Spawn NPCs, cars, pickups onto the globe (children of worldPivot).
import * as THREE from 'three';
import { createCar } from '../entities/car.js';
import { GLOBE_RADIUS } from './globe.js';

const CAR_SPAWNS = [
  { id: 'car_basic', dir: new THREE.Vector3(0.6, 0.7, 0.2).normalize() },
  { id: 'car_sport', dir: new THREE.Vector3(-0.5, 0.75, -0.4).normalize() },
];

function placeOnGlobe(object, dir, radius) {
  object.position.copy(dir).multiplyScalar(radius);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
}

export function spawnAll(worldPivot) {
  for (const spawn of CAR_SPAWNS) {
    const car = createCar(spawn.id);
    placeOnGlobe(car, spawn.dir, GLOBE_RADIUS);
    worldPivot.add(car);
  }
}
