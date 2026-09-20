import * as THREE from 'three';
import { createCar } from '../entities/car.js';
import vehicles from '../data/vehicles.json';

// Spawns NPCs, cars, pickups onto the globe (children of worldPivot).
export function spawnAll(worldPivot, globeRadius) {
  const up = new THREE.Vector3(0, 1, 0);
  const cars = vehicles.map((def) => {
    const car = createCar(def);
    // Spawn at the globe's local "top" so it starts right under the fixed player.
    car.position.copy(up).multiplyScalar(globeRadius);
    car.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    worldPivot.add(car);
    return car;
  });
  return { cars };
}
