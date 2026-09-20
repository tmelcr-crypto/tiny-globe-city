import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { createCar, driveCar } from '../src/entities/car.js';
import { ON_FOOT_SPEED } from '../src/core/movement.js';

describe('car', () => {
  it('defaults to 7x on-foot max speed', () => {
    const car = createCar({ id: 'car_basic', name: 'Basic Car' });
    expect(car.userData.maxSpeed).toBeCloseTo(ON_FOOT_SPEED * 7);
  });

  it('reads speedMultiplier from the vehicle def', () => {
    const car = createCar({ id: 'car_fast', name: 'Fast Car', speedMultiplier: 10 });
    expect(car.userData.maxSpeed).toBeCloseTo(ON_FOOT_SPEED * 10);
  });

  it('accelerates toward max speed while throttled, never overshooting', () => {
    const car = createCar({ id: 'car_basic', name: 'Basic Car' });
    const worldPivot = new THREE.Object3D();
    const input = { up: true, down: false, left: false, right: false };

    let prevSpeed = 0;
    for (let i = 0; i < 200; i++) {
      driveCar(car, worldPivot, input, 1 / 60);
      expect(car.userData.speed).toBeGreaterThanOrEqual(prevSpeed);
      expect(car.userData.speed).toBeLessThanOrEqual(car.userData.maxSpeed);
      prevSpeed = car.userData.speed;
    }
    expect(car.userData.speed).toBeCloseTo(car.userData.maxSpeed);
  });

  it('decelerates to a stop once throttle is released', () => {
    const car = createCar({ id: 'car_basic', name: 'Basic Car' });
    const worldPivot = new THREE.Object3D();

    for (let i = 0; i < 200; i++) driveCar(car, worldPivot, { up: true }, 1 / 60);
    expect(car.userData.speed).toBeGreaterThan(0);

    for (let i = 0; i < 200; i++) driveCar(car, worldPivot, {}, 1 / 60);
    expect(car.userData.speed).toBe(0);
  });

  it('rotates worldPivot while moving, and stops rotating once fully stopped', () => {
    const car = createCar({ id: 'car_basic', name: 'Basic Car' });
    const worldPivot = new THREE.Object3D();

    driveCar(car, worldPivot, { up: true }, 1 / 60);
    expect(worldPivot.quaternion.equals(new THREE.Quaternion())).toBe(false);

    for (let i = 0; i < 200; i++) driveCar(car, worldPivot, {}, 1 / 60);
    const stoppedQuaternion = worldPivot.quaternion.clone();
    driveCar(car, worldPivot, {}, 1 / 60);
    expect(worldPivot.quaternion.equals(stoppedQuaternion)).toBe(true);
  });
});
