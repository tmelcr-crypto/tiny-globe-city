import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';

// The city is planned on a flat map in metres, centred on the player's spawn
// point, then wrapped onto the globe. u runs east, v runs north; the player
// faces -v, so the safehouse sits just south of the centre.

export const BLOCK = 44;            // buildable square between roads
export const ROAD_WIDTH = 9;        // carriageway
export const SIDEWALK_WIDTH = 2.5;
export const CELL = BLOCK + ROAD_WIDTH;
export const GRID = 2;              // road centrelines at i * CELL, i in -GRID..GRID
export const CITY_EXTENT = GRID * CELL + BLOCK / 2;

// The grid is shifted so the spawn point lands on the grass beside a corner
// rather than in the middle of a junction, and downtown sits a block ahead of
// the player instead of towering over the spot they start on.
export const ROAD_OFFSET = ROAD_WIDTH / 2 + SIDEWALK_WIDTH + 2;
export const DOWNTOWN_CENTRE = { u: CELL * 0.5 + ROAD_OFFSET, v: ROAD_OFFSET - CELL * 1.5 };
export const DOWNTOWN_RADIUS = 60;  // blocks with centres inside this are downtown
export const PARK_BLOCK = { i: -2, j: 0 };
export const LAKE_RADIUS = 15;
// Close enough that the peaks clear the horizon seen from the city.
export const MOUNTAIN_RING = { min: 150, max: 205 };

// Kept shallow: the player walks at ground level, so a tall kerb would swallow
// their feet whenever they stepped onto a pavement.
export const ROAD_LIFT = 0.03;
export const SIDEWALK_LIFT = 0.1;
export const GROUND_LIFT = 0.02;

const _dir = new THREE.Vector3();

// Where a point on the flat map lands on the globe.
export function directionFromTangent(u, v, target = new THREE.Vector3()) {
  const distance = Math.hypot(u, v);
  if (distance < 1e-9) return target.set(0, 1, 0);
  const theta = distance / GLOBE_RADIUS;
  const sin = Math.sin(theta);
  return target.set((u / distance) * sin, Math.cos(theta), (v / distance) * sin);
}

export function surfacePoint(u, v, lift = 0, target = new THREE.Vector3()) {
  return directionFromTangent(u, v, target).multiplyScalar(GLOBE_RADIUS + lift);
}

// Centre of the road with the given index, on either axis.
export function roadAt(index) {
  return index * CELL + ROAD_OFFSET;
}

// Centre of the block with the given indices — the square between two roads.
export function blockCentre({ i, j }) {
  return { u: roadAt(i) + CELL / 2, v: roadAt(j) + CELL / 2 };
}

export function isParkBlock({ i, j }) {
  return i === PARK_BLOCK.i && j === PARK_BLOCK.j;
}

export function districtOf(block) {
  if (isParkBlock(block)) return 'park';
  const { u, v } = blockCentre(block);
  const fromDowntown = Math.hypot(u - DOWNTOWN_CENTRE.u, v - DOWNTOWN_CENTRE.v);
  return fromDowntown < DOWNTOWN_RADIUS ? 'downtown' : 'suburb';
}

// Every block in the grid, tagged with the district it belongs to.
export function cityBlocks() {
  const blocks = [];
  for (let i = -GRID; i < GRID; i++) {
    for (let j = -GRID; j < GRID; j++) {
      const block = { i, j };
      blocks.push({ ...block, ...blockCentre(block), district: districtOf(block) });
    }
  }
  return blocks;
}

// Road centrelines, as straight runs across the city on the flat map.
export function roadLines() {
  const lines = [];
  const from = roadAt(-GRID) - BLOCK / 2;
  const to = roadAt(GRID) + BLOCK / 2;
  for (let i = -GRID; i <= GRID; i++) {
    lines.push({ axis: 'u', at: roadAt(i), from, to }); // runs east-west
    lines.push({ axis: 'v', at: roadAt(i), from, to }); // runs north-south
  }
  return lines;
}

// Distance from a point on the map to the nearest road centreline, and which
// way that road lies — used to set buildings back and face them at the street.
export function nearestRoad(u, v) {
  const snap = (value) => Math.round((value - ROAD_OFFSET) / CELL) * CELL + ROAD_OFFSET;
  const roadU = snap(v); // east-west roads are lines of constant v
  const roadV = snap(u); // north-south roads are lines of constant u
  const toU = Math.abs(v - roadU);
  const toV = Math.abs(u - roadV);
  return toU <= toV
    ? { distance: toU, facing: { u: 0, v: Math.sign(roadU - v) || 1 } }
    : { distance: toV, facing: { u: Math.sign(roadV - u) || 1, v: 0 } };
}

export function isOnPavement(u, v) {
  return nearestRoad(u, v).distance <= ROAD_WIDTH / 2 + SIDEWALK_WIDTH;
}

export function lakeCentre() {
  return blockCentre(PARK_BLOCK);
}

export function isInLake(u, v, margin = 0) {
  const centre = lakeCentre();
  return Math.hypot(u - centre.u, v - centre.v) < LAKE_RADIUS + margin;
}

// A buildable spot inside a block: clear of the pavement and of the lake.
export function randomPlot(block, footprint) {
  const { u, v } = blockCentre(block);
  const limit = BLOCK / 2 - footprint - 1;
  if (limit <= 0) return null;
  const plot = {
    u: u + (Math.random() * 2 - 1) * limit,
    v: v + (Math.random() * 2 - 1) * limit,
  };
  if (isInLake(plot.u, plot.v, footprint + 2)) return null;
  return plot;
}

// The world-space tangent direction that a point on the map faces, given a
// direction on the map. Used to aim buildings and cars along the street.
export function tangentFacing(u, v, facing, target = new THREE.Vector3()) {
  const here = directionFromTangent(u, v, _dir).clone();
  directionFromTangent(u + facing.u * 0.5, v + facing.v * 0.5, target);
  target.sub(here);
  // Flatten onto the tangent plane at `here` so it's a pure heading.
  target.addScaledVector(here, -target.dot(here));
  return target.normalize();
}
