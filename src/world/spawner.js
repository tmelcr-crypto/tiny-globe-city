import * as THREE from 'three';
import vehicles from '../data/vehicles.json';
import { createCar, placeOnGlobe } from '../entities/car.js';
import { GLOBE_RADIUS } from './globe.js';

// Spawn NPCs, cars, pickups onto the globe (children of worldPivot).
export function spawnAll(worldPivot) {
  const cars = [];
  const def = vehicles[0];
  if (def) {
    const car = createCar(def);
    // Placed just off the player's starting point so it's easy to reach.
    placeOnGlobe(car, GLOBE_RADIUS, new THREE.Vector3(0, 1, 0.15).normalize());
    worldPivot.add(car);
    cars.push(car);
  }
  return { cars };
}
