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

const PART_CATEGORIES = ['wheel', 'spoiler', 'exhaust', 'hood'];
const toColor = (value, fallback) => (value == null ? fallback : Number(value));

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
  car.userData = { def, chassis, bodyColor, slots: createSlots(chassis), parts: {} };

  car.add(buildBody(chassis, bodyColor));
  for (const slot of Object.values(car.userData.slots)) car.add(slot);

  for (const category of PART_CATEGORIES) {
    mount(car, category, def.parts[category]);
  }

  return car;
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
