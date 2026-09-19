import * as THREE from 'three';

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

// Returns worldPivot: a Group that holds the globe and all world objects.
export function createGlobe() {
  const pivot = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 48, 32),
    new THREE.MeshStandardMaterial({ map: createGridTexture(), flatShading: true })
  );
  pivot.add(sphere);

  // Placeholder "buildings" so movement is visible: 5x5m footprint, 2.5m tall.
  const BUILDING_HEIGHT = 2.5;
  for (let i = 0; i < 40; i++) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(5, BUILDING_HEIGHT, 5),
      new THREE.MeshStandardMaterial({ color: 0xcccccc })
    );
    const dir = new THREE.Vector3().randomDirection();
    b.position.copy(dir).multiplyScalar(GLOBE_RADIUS + BUILDING_HEIGHT / 2); // base on the surface, not center
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    pivot.add(b);
  }
  return pivot;
}
