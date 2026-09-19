import * as THREE from 'three';
import { createRandomBuilding } from '../entities/building.js';
import { createRandomTree } from '../entities/tree.js';

const UP = new THREE.Vector3(0, 1, 0);

// Sized so a player moving at 5 km/h completes one full 360° lap in LAP_TIME_S:
// lap distance = speed * lapTime = circumference = 2*pi*GLOBE_RADIUS.
const PLAYER_SPEED_MPS = 5000 / 3600; // 5 km/h
const LAP_TIME_S = 240; // 4x the original 60s lap, i.e. a 4x bigger globe at the same walking speed
export const GLOBE_RADIUS = (PLAYER_SPEED_MPS * LAP_TIME_S) / (2 * Math.PI); // ~53.05 m
export const ANGULAR_SPEED = (2 * Math.PI) / LAP_TIME_S; // rad/s of worldPivot at full joystick deflection

const GRID_METERS = 1; // reference grid cell size, for future layout orientation
const GRID_PIXELS_PER_METER = 8; // kept low enough that the grid texture stays under common mobile GPU size limits

// Equirectangular grid texture: sphere UVs already run 0-1 around the equator
// and 0-1 pole-to-pole, so a texture sized in whole meters lines up as a 1x1m grid.
function createGridTexture() {
  const circumference = 2 * Math.PI * GLOBE_RADIUS;
  const halfCircumference = Math.PI * GLOBE_RADIUS;
  const cols = Math.round(circumference / GRID_METERS);
  const rows = Math.round(halfCircumference / GRID_METERS);
  const canvas = document.createElement('canvas');
  canvas.width = cols * GRID_PIXELS_PER_METER;
  canvas.height = rows * GRID_PIXELS_PER_METER;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4a8f4a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= cols; i++) {
    const x = i * GRID_PIXELS_PER_METER;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let i = 0; i <= rows; i++) {
    const y = i * GRID_PIXELS_PER_METER;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

// A flat base tangent to the sphere only touches it at the object's center;
// the sphere curves away underneath the rest of the footprint, leaving the
// corners floating above the surface (worse the bigger the footprint). Instead
// solve for the placement radius that puts the farthest ground corner exactly
// on the sphere: |placeRadius*dir + cornerOffset|^2 = GLOBE_RADIUS^2, and since
// cornerOffset ends up perpendicular to dir after rotation, that's a simple
// Pythagorean relation. This sinks the object's center in slightly instead.
function seatOnSurface(object, dir) {
  const bounds = new THREE.Box3().setFromObject(object);
  const maxCornerDistSq = Math.max(
    bounds.min.x ** 2 + bounds.min.z ** 2,
    bounds.min.x ** 2 + bounds.max.z ** 2,
    bounds.max.x ** 2 + bounds.min.z ** 2,
    bounds.max.x ** 2 + bounds.max.z ** 2
  );
  const placeRadius = Math.sqrt(GLOBE_RADIUS ** 2 - maxCornerDistSq);

  object.position.copy(dir).multiplyScalar(placeRadius);
  object.quaternion.setFromUnitVectors(UP, dir);
}

// Returns worldPivot: a Group that holds the globe and all world objects.
export function createGlobe() {
  const pivot = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 48, 32),
    new THREE.MeshStandardMaterial({ map: createGridTexture(), flatShading: true })
  );
  pivot.add(sphere);

  // Placeholder buildings, mixed types, so movement is visible.
  for (let i = 0; i < 40; i++) {
    const building = createRandomBuilding();
    seatOnSurface(building, new THREE.Vector3().randomDirection());
    pivot.add(building);
  }

  // Placeholder trees, mixed types, scattered more densely than buildings.
  for (let i = 0; i < 80; i++) {
    const tree = createRandomTree();
    seatOnSurface(tree, new THREE.Vector3().randomDirection());
    pivot.add(tree);
  }

  return pivot;
}
