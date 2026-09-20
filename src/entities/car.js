// Modular car entity. Body + cabin are fixed per vehicle def; wheels,
// spoiler, exhaust and hood are removable "slots" (THREE.Group anchors at
// fixed local positions) so any part catalog entry of the right category
// can be mounted on any chassis. See data/car-parts.json for the catalog
// and data/vehicles.json for per-vehicle chassis + starting parts.
//
// Local axes: +Z front, -Z rear, +X right, Y up, origin at ground contact
// (so the car can be placed directly on the globe like the buildings are).
import * as THREE from 'three';
import vehicleDefs from '../data/vehicles.json';
import partCatalog from '../data/car-parts.json';
import { PART_BUILDERS } from './car-parts.js';
import { ANGULAR_SPEED } from '../world/globe.js';

const PART_CATEGORIES = ['wheel', 'spoiler', 'exhaust', 'hood'];
const toColor = (value, fallback) => (value == null ? fallback : Number(value));

// The player always stands at world (0, R, 0), i.e. exactly on the world Y axis
// (see world/globe.js), so driving reuses the same X/Z axis convention as
// on-foot movement (systems/collision.js): rotating about Y would spin the
// globe in place around the player's own feet instead of translating them.
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function findVehicleDef(id) {
  const def = vehicleDefs.find((v) => v.id === id);
  if (!def) throw new Error(`Unknown vehicle id: ${id}`);
  return def;
}

function findPartDef(category, id) {
  const list = partCatalog[`${category}s`];
  const part = list.find((p) => p.id === id);
  if (!part) throw new Error(`Unknown ${category} part id: ${id}`);
  return part;
}

function disposeChildren(group) {
  for (const child of [...group.children]) {
    child.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) node.material.dispose();
    });
    group.remove(child);
  }
}

function wheelSlotPosition(side, end, chassis) {
  const x = (side === 'L' ? -1 : 1) * (chassis.track / 2);
  const z = (end === 'F' ? 1 : -1) * (chassis.wheelbase / 2);
  return new THREE.Vector3(x, chassis.groundClearance, z);
}

function buildBody(chassis, bodyColor) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: bodyColor, flatShading: true });

  const chassisBox = new THREE.Mesh(
    new THREE.BoxGeometry(chassis.width, chassis.height, chassis.length),
    material
  );
  chassisBox.position.set(0, chassis.groundClearance + chassis.height / 2, 0);
  group.add(chassisBox);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(chassis.width * 0.7, chassis.height * 0.6, chassis.length * 0.5),
    material
  );
  cabin.position.set(
    0,
    chassis.groundClearance + chassis.height + (chassis.height * 0.6) / 2,
    -chassis.length * 0.05
  );
  group.add(cabin);

  return group;
}

function createSlots(chassis) {
  const slots = {
    FL: new THREE.Group(),
    FR: new THREE.Group(),
    RL: new THREE.Group(),
    RR: new THREE.Group(),
    spoiler: new THREE.Group(),
    exhaust: new THREE.Group(),
    hood: new THREE.Group(),
  };
  slots.FL.position.copy(wheelSlotPosition('L', 'F', chassis));
  slots.FR.position.copy(wheelSlotPosition('R', 'F', chassis));
  slots.RL.position.copy(wheelSlotPosition('L', 'R', chassis));
  slots.RR.position.copy(wheelSlotPosition('R', 'R', chassis));
  slots.spoiler.position.set(0, chassis.groundClearance + chassis.height, -chassis.length / 2);
  slots.exhaust.position.set(0, chassis.groundClearance * 0.5, -chassis.length / 2);
  slots.hood.position.set(0, chassis.groundClearance + chassis.height, chassis.length / 2);
  return slots;
}

function mount(car, category, partId) {
  const part = findPartDef(category, partId);
  const build = PART_BUILDERS[category];
  const slotNames = category === 'wheel' ? ['FL', 'FR', 'RL', 'RR'] : [category];

  for (const name of slotNames) {
    const slot = car.userData.slots[name];
    disposeChildren(slot);
    const built = build(part, car.userData.chassis, car.userData.bodyColor);
    if (built.children.length > 0) slot.add(built);
  }
  car.userData.parts[category] = partId;
}

// defOrId: a vehicle id from vehicles.json, or an inline def with the same
// shape ({ chassis, bodyColor, parts }) for one-off/custom cars.
export function createCar(defOrId) {
  const def = typeof defOrId === 'string' ? findVehicleDef(defOrId) : defOrId;
  const chassis = def.chassis;
  const bodyColor = toColor(def.bodyColor, 0xcccccc);

  const car = new THREE.Group();
  car.name = def.id || 'car';

  const maxSpeed = ANGULAR_SPEED * (def.speedMultiplier ?? 2);
  car.userData = {
    def,
    chassis,
    bodyColor,
    slots: createSlots(chassis),
    parts: {},
    occupied: false,
    speed: 0,
    maxSpeed,
    acceleration: maxSpeed * 1.5, // ~0.67s to reach max speed
    deceleration: maxSpeed * 2.5, // stops quicker than it speeds up
  };

  car.add(buildBody(chassis, bodyColor));
  for (const slot of Object.values(car.userData.slots)) car.add(slot);

  for (const category of PART_CATEGORIES) {
    mount(car, category, def.parts[category]);
  }

  // Roughly driver-seat height, for proximity checks against the player
  // (see systems/vehicles.js), matching the player's own height above ground.
  const entryPoint = new THREE.Object3D();
  entryPoint.position.set(0, chassis.groundClearance + chassis.height, 0);
  car.add(entryPoint);
  car.userData.entryPoint = entryPoint;

  return car;
}

// Ramps the car's current speed toward maxSpeed (throttle held) or toward
// zero (coasting to a stop), then rotates worldPivot the same way on-foot
// movement does (see systems/collision.js), just scaled by that ramped
// speed and the joystick's continuous {x, y} direction instead of a
// constant. Returns the car's current speed.
export function driveCar(car, worldPivot, input, dt) {
  const { x, y } = input;
  const throttled = Math.hypot(x, y) > 0;
  const { acceleration, deceleration, maxSpeed } = car.userData;
  const rate = throttled ? acceleration : deceleration;
  const target = throttled ? maxSpeed : 0;

  let speed = car.userData.speed;
  speed = speed < target
    ? Math.min(target, speed + rate * dt)
    : Math.max(target, speed - rate * dt);
  car.userData.speed = speed;

  if (speed > 0) {
    worldPivot.rotateOnWorldAxis(AXIS_X, y * speed * dt);
    worldPivot.rotateOnWorldAxis(AXIS_Z, x * speed * dt);
  }
  return speed;
}

// Swaps one category of part at runtime (e.g. setCarPart(car, 'hood', 'hood_scoop')).
// Reuses the car's fixed slot positions, so any catalog entry of that
// category fits regardless of which vehicle the car started as.
export function setCarPart(car, category, partId) {
  if (!PART_CATEGORIES.includes(category)) {
    throw new Error(`Unknown part category: ${category}`);
  }
  mount(car, category, partId);
}

export function getCarParts(car) {
  return { ...car.userData.parts };
}
