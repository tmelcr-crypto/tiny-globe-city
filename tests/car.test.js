import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import vehicles from '../src/data/vehicles.json';
import carParts from '../src/data/car-parts.json';
import { createCar, setCarPart, getCarParts, driveCar } from '../src/entities/car.js';
import { ANGULAR_SPEED } from '../src/world/globe.js';

describe('car data', () => {
  it('vehicles load', () => expect(vehicles.length).toBeGreaterThan(0));
  it('every vehicle references parts that exist in the catalog', () => {
    for (const vehicle of vehicles) {
      for (const [category, id] of Object.entries(vehicle.parts)) {
        const list = carParts[`${category}s`];
        expect(list.some((p) => p.id === id)).toBe(true);
      }
    }
  });
});

describe('modular car assembly', () => {
  it('builds a car with all slots populated per the vehicle def', () => {
    const car = createCar('car_basic');
    expect(getCarParts(car)).toEqual({
      wheel: 'wheel_standard',
      spoiler: 'spoiler_none',
      exhaust: 'exhaust_single',
      hood: 'hood_flat',
    });
    for (const name of ['FL', 'FR', 'RL', 'RR']) {
      expect(car.userData.slots[name].children.length).toBeGreaterThan(0);
    }
  });

  it('spoiler_none renders as an empty slot', () => {
    const car = createCar('car_basic');
    expect(car.userData.slots.spoiler.children.length).toBe(0);
  });

  it('can swap a single part category without touching the rest', () => {
    const car = createCar('car_basic');
    setCarPart(car, 'wheel', 'wheel_offroad');
    setCarPart(car, 'spoiler', 'spoiler_wing');

    expect(getCarParts(car)).toEqual({
      wheel: 'wheel_offroad',
      spoiler: 'spoiler_wing',
      exhaust: 'exhaust_single',
      hood: 'hood_flat',
    });
    expect(car.userData.slots.spoiler.children.length).toBeGreaterThan(0);
    for (const name of ['FL', 'FR', 'RL', 'RR']) {
      expect(car.userData.slots[name].children.length).toBeGreaterThan(0);
    }
  });

  it('mixes and matches parts across vehicle chassis (true interchangeability)', () => {
    const car = createCar('car_sport');
    setCarPart(car, 'hood', 'hood_vented');
    setCarPart(car, 'exhaust', 'exhaust_race');
    expect(getCarParts(car).hood).toBe('hood_vented');
    expect(getCarParts(car).exhaust).toBe('exhaust_race');
  });

  it('rejects unknown part ids and categories', () => {
    const car = createCar('car_basic');
    expect(() => setCarPart(car, 'wheel', 'wheel_nonexistent')).toThrow();
    expect(() => setCarPart(car, 'bumper', 'anything')).toThrow();
  });
});

describe('driveCar', () => {
  it('reads maxSpeed from the vehicle def\'s speedMultiplier over on-foot ANGULAR_SPEED', () => {
    const car = createCar('car_basic');
    expect(car.userData.maxSpeed).toBeCloseTo(ANGULAR_SPEED * 2.0);
    const sport = createCar('car_sport');
    expect(sport.userData.maxSpeed).toBeCloseTo(ANGULAR_SPEED * 2.6);
  });

  it('accelerates toward max speed while throttled, never overshooting', () => {
    const car = createCar('car_basic');
    const worldPivot = new THREE.Object3D();
    const input = { x: 0, y: 1 };

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
    const car = createCar('car_basic');
    const worldPivot = new THREE.Object3D();

    for (let i = 0; i < 200; i++) driveCar(car, worldPivot, { x: 0, y: 1 }, 1 / 60);
    expect(car.userData.speed).toBeGreaterThan(0);

    for (let i = 0; i < 200; i++) driveCar(car, worldPivot, { x: 0, y: 0 }, 1 / 60);
    expect(car.userData.speed).toBe(0);
  });

  it('rotates worldPivot while moving, and stops rotating once fully stopped', () => {
    const car = createCar('car_basic');
    const worldPivot = new THREE.Object3D();

    driveCar(car, worldPivot, { x: 0, y: 1 }, 1 / 60);
    expect(worldPivot.quaternion.equals(new THREE.Quaternion())).toBe(false);

    for (let i = 0; i < 200; i++) driveCar(car, worldPivot, { x: 0, y: 0 }, 1 / 60);
    const stoppedQuaternion = worldPivot.quaternion.clone();
    driveCar(car, worldPivot, { x: 0, y: 0 }, 1 / 60);
    expect(worldPivot.quaternion.equals(stoppedQuaternion)).toBe(true);
  });

  it('has an entry point positioned above the chassis for proximity checks', () => {
    const car = createCar('car_basic');
    expect(car.userData.entryPoint).toBeDefined();
    expect(car.userData.entryPoint.position.y).toBeGreaterThan(0);
  });
});
