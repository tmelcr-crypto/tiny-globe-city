import buildingTypes from '../data/buildings.json';
import { createFromParts } from './parts.js';

// Builds a building from a data/buildings.json entry. The result's ground
// plane is local y=0, so world/globe.js can seat it flush against the sphere.
export function createBuilding(def) {
  return createFromParts(def.parts);
}

export function createRandomBuilding() {
  const def = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
  return createBuilding(def);
}
