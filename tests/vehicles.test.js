import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { createCar, placeOnGlobe } from '../src/entities/car.js';
import { createVehicleSystem, ENTER_VEHICLE_RANGE } from '../src/systems/vehicles.js';
import { on } from '../src/core/events.js';
import { state } from '../src/core/state.js';

describe('car entry', () => {
  it('shows the prompt only once the player is within range, and lets them get in/out', () => {
    const worldPivot = new THREE.Group();
    const car = createCar({ id: 'car_basic', speedMultiplier: 2 });
    placeOnGlobe(car, 50, new THREE.Vector3(0, 1, 0));
    worldPivot.add(car);

    const events = [];
    on('vehicle:nearby', () => events.push('nearby'));
    on('vehicle:left', () => events.push('left'));
    on('vehicle:enter', () => events.push('enter'));
    on('vehicle:exit', () => events.push('exit'));

    const vehicles = createVehicleSystem([car]);
    // The car's entry point sits 0.8 above the surface, same as the player's height.
    const far = new THREE.Vector3(0, 50.8 + 5, 0);
    const near = new THREE.Vector3(0, 50.8 + ENTER_VEHICLE_RANGE / 2, 0);

    vehicles.update(far);
    expect(vehicles.isNearby()).toBe(null);

    vehicles.update(near);
    expect(vehicles.isNearby()).toBe(car);

    vehicles.enter();
    expect(state.inVehicle).toBe(true);
    expect(state.activeVehicle.id).toBe('car_basic');
    expect(car.userData.occupied).toBe(true);

    vehicles.exit();
    expect(state.inVehicle).toBe(false);
    expect(car.userData.occupied).toBe(false);

    expect(events).toEqual(['nearby', 'enter', 'exit']);
  });
});
