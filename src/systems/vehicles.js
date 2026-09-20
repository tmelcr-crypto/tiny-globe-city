import * as THREE from 'three';
import { state } from '../core/state.js';
import { emit } from '../core/events.js';

// How close (world units, i.e. meters) the player must be to a car to enter it.
export const ENTER_VEHICLE_RANGE = 2;

const _carPos = new THREE.Vector3();

// Tracks which car (if any) is within enter range of the fixed player position,
// and handles entering/exiting. Talks to the rest of the game via core/events.js.
export function createVehicleSystem(cars) {
  let nearby = null;

  function update(playerWorldPos) {
    let closest = null;
    let closestDist = Infinity;
    for (const car of cars) {
      if (car.userData.occupied) continue;
      car.userData.entryPoint.getWorldPosition(_carPos);
      const dist = _carPos.distanceTo(playerWorldPos);
      if (dist < closestDist) {
        closestDist = dist;
        closest = car;
      }
    }
    const inRange = closest && closestDist <= ENTER_VEHICLE_RANGE ? closest : null;
    if (inRange !== nearby) {
      nearby = inRange;
      emit(nearby ? 'vehicle:nearby' : 'vehicle:left', nearby);
    }
  }

  function enter() {
    if (!nearby || state.inVehicle) return;
    nearby.userData.occupied = true;
    state.inVehicle = true;
    state.activeVehicle = nearby;
    const entered = nearby;
    nearby = null;
    emit('vehicle:enter', entered);
  }

  function exit() {
    if (!state.inVehicle) return;
    const car = state.activeVehicle;
    if (car) {
      car.userData.occupied = false;
      car.userData.speed = 0;
    }
    state.inVehicle = false;
    state.activeVehicle = null;
    emit('vehicle:exit', car);
  }

  return { update, enter, exit, isNearby: () => nearby };
}
