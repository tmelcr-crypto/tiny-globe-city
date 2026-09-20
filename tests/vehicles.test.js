import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { createCar } from '../src/entities/car.js';
import { createVehicleSystem, ENTER_VEHICLE_RANGE } from '../src/systems/vehicles.js';
import { on } from '../src/core/events.js';
import { state } from '../src/core/state.js';

const GLOBE_RADIUS = 50;

describe('car entry', () => {
  it('shows the prompt only once the player is within range, and lets them get in/out', () => {
    const worldPivot = new THREE.Group();
    const car = createCar('car_basic');
    car.position.set(0, GLOBE_RADIUS, 0);
    worldPivot.add(car);

    const events = [];
    on('vehicle:nearby', () => events.push('nearby'));
    on('vehicle:left', () => events.push('left'));
    on('vehicle:enter', () => events.push('enter'));
    on('vehicle:exit', () => events.push('exit'));

    const vehicles = createVehicleSystem([car]);
    const entryHeight = car.userData.entryPoint.position.y;
    const far = new THREE.Vector3(0, GLOBE_RADIUS + entryHeight + 5, 0);
    const near = new THREE.Vector3(0, GLOBE_RADIUS + entryHeight + ENTER_VEHICLE_RANGE / 2, 0);

    vehicles.update(far);
    expect(vehicles.isNearby()).toBe(null);

    vehicles.update(near);
    expect(vehicles.isNearby()).toBe(car);

    vehicles.enter();
    expect(state.inVehicle).toBe(true);
    expect(state.activeVehicle).toBe(car);
    expect(car.userData.occupied).toBe(true);

    vehicles.exit();
    expect(state.inVehicle).toBe(false);
    expect(car.userData.occupied).toBe(false);

    expect(events).toEqual(['nearby', 'enter', 'exit']);
  });
});
