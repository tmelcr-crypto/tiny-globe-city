import * as THREE from 'three';
import { GLOBE_RADIUS } from './planet.js';
import { createCubeGrid, TOWN_FACE } from './sphere-grid.js';
import { DIVISIONS, STREET, findSpawn } from './city-map.js';

// The grid the planet is divided by, turned so the player's doorstep is at the
// top of the globe.
//
// It lives on its own because almost everything needs it — the charts, the
// streets, the markers, the spawner — and it needs nothing but the map.

export const CORNER_INSET = STREET.road / 2 + STREET.sidewalk + STREET.verge;

const UP = new THREE.Vector3(0, 1, 0);
const SPAWN = findSpawn();

// The player stands inside the spawn block, a verge's width in from its
// north-east corner: not stranded mid-junction and not inside a building.
function spawnDirection(draft) {
  const inset = CORNER_INSET / GLOBE_RADIUS;
  return draft.direction(
    SPAWN.faceId,
    draft.angleOfColumn(SPAWN.column + 1) - inset,
    draft.angleOfRow(SPAWN.row) - inset
  );
}

const draft = createCubeGrid({ divisions: DIVISIONS });
const orientation = new THREE.Quaternion().setFromUnitVectors(spawnDirection(draft), UP);

export const grid = createCubeGrid({ divisions: DIVISIONS, orientation });
export const SPAWN_BLOCK = SPAWN;
export { TOWN_FACE };

// A cell edge through the middle of a face: the town's block-and-street pitch.
export const CELL = grid.cellArc;
export const ROAD_WIDTH = STREET.road;
export const SIDEWALK_WIDTH = STREET.sidewalk;
export const VERGE = STREET.verge;
export const CORNER_RADIUS = STREET.corner ?? 0;
export const BLOCK = CELL - ROAD_WIDTH;
export const QUARTER_SPAN = BLOCK / 2;
