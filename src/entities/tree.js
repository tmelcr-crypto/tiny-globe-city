import treeTypes from '../data/trees.json';
import { createFromParts } from './parts.js';

// Builds a tree from a data/trees.json entry. The result's ground plane is
// local y=0, so world/globe.js can seat it flush against the sphere.
export function createTree(def) {
  return createFromParts(def.parts);
}

export function createRandomTree() {
  const def = treeTypes[Math.floor(Math.random() * treeTypes.length)];
  return createTree(def);
}
