import * as THREE from 'three';
import { GLOBE_RADIUS } from './planet.js';

// A cubed sphere: the grid the whole planet is divided by.
//
// A grid of lines of latitude and longitude is not made of squares — it pinches
// to nothing at the poles. So the planet is divided the way a cube is: six
// square faces, each cut into the same N×N grid, then blown out onto the
// sphere. Every cell is a four-sided near-square of nearly the same size, and
// there is no pole anywhere. The only odd points are the eight cube corners,
// where three cells meet instead of four.
//
// Cells are laid out in equal *angles* rather than equal distances on the flat
// face, which is what keeps them square once they are blown out: a face's
// coordinate a runs from -45° to +45° across it, and the direction of a point
// is normal + right·tan(a) + up·tan(b). A line of constant a is a great circle,
// so every cell edge is a straight line on the sphere — a road along one runs
// dead straight and comes back to where it started.

const QUARTER_TURN = Math.PI / 4; // half a face, in radians

// The six faces, each with the direction it looks out along, and which way is
// east and north across it. The top face is the town's; the four around the
// side hang below it, and the bottom face is the far side of the planet.
const FACE_DEFS = [
  { id: 'T', name: 'town', normal: [0, 1, 0], up: [0, 0, 1] },
  { id: 'N', name: 'north', normal: [0, 0, 1], up: [0, 1, 0] },
  { id: 'E', name: 'east', normal: [1, 0, 0], up: [0, 1, 0] },
  { id: 'S', name: 'south', normal: [0, 0, -1], up: [0, 1, 0] },
  { id: 'W', name: 'west', normal: [-1, 0, 0], up: [0, 1, 0] },
  { id: 'B', name: 'far side', normal: [0, -1, 0], up: [0, 0, 1] },
];

export const TOWN_FACE = 'T';
export const FACE_IDS = FACE_DEFS.map((face) => face.id);

const _point = new THREE.Vector3();
const _probe = new THREE.Vector3();

export function createCubeGrid({ divisions, orientation = new THREE.Quaternion() }) {
  const step = (Math.PI / 2) / divisions; // the angle one cell spans

  const faces = new Map();
  for (const def of FACE_DEFS) {
    const normal = new THREE.Vector3(...def.normal).applyQuaternion(orientation);
    const up = new THREE.Vector3(...def.up).applyQuaternion(orientation);
    const right = new THREE.Vector3().crossVectors(normal, up);
    faces.set(def.id, { ...def, normal, up, right });
  }

  // The angle of a cell boundary, counting columns from the west edge of a face
  // and rows from its north edge.
  const angleOfColumn = (column) => -QUARTER_TURN + column * step;
  const angleOfRow = (row) => QUARTER_TURN - row * step;

  // Where a point on a face lands on the globe.
  function direction(faceId, a, b, target = new THREE.Vector3()) {
    const face = faces.get(faceId);
    return target.copy(face.normal)
      .addScaledVector(face.right, Math.tan(a))
      .addScaledVector(face.up, Math.tan(b))
      .normalize();
  }

  // ...and back: the face a direction belongs to is the one it points most
  // nearly along, and its place on that face falls straight out of the same
  // formula: tan a is how far it leans east for how far it leans out.
  function locate(dir) {
    _probe.copy(dir).normalize();
    let onFace = null;
    let lean = -Infinity;
    for (const face of faces.values()) {
      const out = _probe.dot(face.normal);
      if (out > lean) {
        lean = out;
        onFace = face;
      }
    }
    if (!onFace) throw new Error('sphere-grid: that is not a direction on the globe');
    return {
      faceId: onFace.id,
      a: Math.atan2(_probe.dot(onFace.right), lean),
      b: Math.atan2(_probe.dot(onFace.up), lean),
    };
  }

  const clampIndex = (index) => Math.min(divisions - 1, Math.max(0, index));

  // Which cell a direction falls in.
  function cellOf(dir) {
    const { faceId, a, b } = locate(dir);
    const column = clampIndex(Math.floor((a + QUARTER_TURN) / step));
    const row = clampIndex(Math.floor((QUARTER_TURN - b) / step));
    return { faceId, column, row, a, b };
  }

  const cellAngles = (column, row) => ({
    a: angleOfColumn(column) + step / 2,
    b: angleOfRow(row) - step / 2,
  });

  function cellCentre(faceId, column, row, target = new THREE.Vector3()) {
    const { a, b } = cellAngles(column, row);
    return direction(faceId, a, b, target);
  }

  function cellCorners(faceId, column, row) {
    const west = angleOfColumn(column);
    const east = angleOfColumn(column + 1);
    const north = angleOfRow(row);
    const south = angleOfRow(row + 1);
    return [
      direction(faceId, west, north),
      direction(faceId, east, north),
      direction(faceId, east, south),
      direction(faceId, west, south),
    ];
  }

  // A cell edge is a straight line on the globe, so it only has to be sampled
  // finely enough to draw; the points in between are on the same great circle.
  function arc(faceId, from, to, samples) {
    const points = [];
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      points.push(direction(faceId, from.a + (to.a - from.a) * t, from.b + (to.b - from.b) * t));
    }
    return points;
  }

  // The great circle a cell boundary runs along, as the plane through it.
  function boundaryPlane(faceId, along, at) {
    const face = faces.get(faceId);
    const line = along === 'column'
      ? _point.copy(face.normal).addScaledVector(face.right, Math.tan(at))
      : _point.copy(face.normal).addScaledVector(face.up, Math.tan(at));
    const other = along === 'column' ? face.up : face.right;
    return new THREE.Vector3().crossVectors(line, other).normalize();
  }

  return {
    divisions,
    step,
    orientation,
    faces,
    // The length of a cell edge through the middle of a face, in metres. Cells
    // towards a face's corners are a little smaller.
    cellArc: GLOBE_RADIUS * step,
    angleOfColumn,
    angleOfRow,
    cellAngles,
    direction,
    locate,
    cellOf,
    cellCentre,
    cellCorners,
    arc,
    boundaryPlane,
  };
}
