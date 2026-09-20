import * as THREE from 'three';
import { on, emit } from '../core/events.js';
import { markerUnderPlayer, plotsOf } from '../world/markers.js';
import { grid } from '../world/city-plan.js';
import { FACE_IDS, TOWN_FACE } from '../world/sphere-grid.js';
import { GLOBE_RADIUS } from '../world/globe.js';

// Planning overlay: the block and lot grid, drawn right around the planet, and
// a labelled peg on every plot near the player — so you can walk anywhere,
// read a code off the ground, and name that exact spot. Off by default,
// toggled with M or the on-screen button.
//
// The grid is the cubed sphere the planet is divided by: six faces of square
// cells, drawn along their own edges, which are great circles. Every cell on
// the planet is labelled in principle, but there are hundreds, so the labels
// are a small pool that follows the player from block to block while the lines
// themselves are three draw calls for the whole globe.

const LABEL_HEIGHT = 6;   // metres above the ground, clear of houses' eaves
const LABEL_WIDTH = 3.5;  // metres wide — small enough that a near label doesn't fill the screen
const PEG_RADIUS = 0.6;
const LABEL_RING = 1;     // blocks either side of the player that get labels

const PEG = new THREE.MeshBasicMaterial({ color: 0xffdd33 });
const pegGeometry = new THREE.CylinderGeometry(PEG_RADIUS, PEG_RADIUS, 0.25, 10);
const UP = new THREE.Vector3(0, 1, 0);

const TOWN_LINE = new THREE.LineBasicMaterial({ color: 0xffdd33 });
const LAND_LINE = new THREE.LineBasicMaterial({ color: 0x6b7f4a });  // the country outside the town
const LOT_LINE = new THREE.LineBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.75 });
const LINE_LIFT = 0.3;   // clear of the pavement so the lines read on any surface

const ARC_STEPS = 10;  // segments per cell edge, so a line hugs the curve

const surfaceAt = (direction, lift) =>
  direction.clone().multiplyScalar(GLOBE_RADIUS + lift);

// A cell edge, sampled into segments. It is a straight line on the globe; the
// samples are only there so the drawn line hugs the surface.
function addEdge(points, faceId, from, to) {
  const arc = grid.arc(faceId, from, to, ARC_STEPS);
  for (let s = 0; s < arc.length - 1; s++) {
    points.push(surfaceAt(arc[s], LINE_LIFT), surfaceAt(arc[s + 1], LINE_LIFT));
  }
}

// The block outlines — bright across the town's face, dull over the rest of
// the planet — and the cross that splits every block into its four lots.
function gridLines() {
  const group = new THREE.Group();
  const town = [];
  const land = [];
  const lots = [];

  const { divisions, step } = grid;
  const first = grid.angleOfColumn(0);
  const last = grid.angleOfColumn(divisions);
  const top = grid.angleOfRow(0);
  const bottom = grid.angleOfRow(divisions);

  for (const faceId of FACE_IDS) {
    const blocks = faceId === TOWN_FACE ? town : land;

    for (let line = 0; line <= divisions; line++) {
      const a = grid.angleOfColumn(line);
      const b = grid.angleOfRow(line);
      addEdge(blocks, faceId, { a, b: top }, { a, b: bottom });
      addEdge(blocks, faceId, { a: first, b }, { a: last, b });
    }

    // Halfway across every cell, in both directions: the lot lines.
    for (let cell = 0; cell < divisions; cell++) {
      const a = grid.angleOfColumn(cell) + step / 2;
      const b = grid.angleOfRow(cell) - step / 2;
      addEdge(lots, faceId, { a, b: top }, { a, b: bottom });
      addEdge(lots, faceId, { a: first, b }, { a: last, b });
    }
  }

  for (const [points, material] of [[land, LAND_LINE], [town, TOWN_LINE], [lots, LOT_LINE]]) {
    if (!points.length) continue;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.LineSegments(geometry, material));
  }
  return group;
}

function labelCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  return canvas;
}

function drawLabel(canvas, code) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(12, 16, 28, 0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ffdd33';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  ctx.fillStyle = '#ffdd33';
  ctx.font = 'bold 64px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(code, canvas.width / 2, canvas.height / 2);
}

// One peg and one label, reused as the player moves from block to block.
function createTag(group) {
  const peg = new THREE.Mesh(pegGeometry, PEG);
  const canvas = labelCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  label.scale.set(LABEL_WIDTH, LABEL_WIDTH / 2, 1);
  group.add(peg, label);

  return {
    show(marker) {
      peg.visible = true;
      label.visible = true;
      peg.position.copy(surfaceAt(marker.direction, 0.15));
      peg.quaternion.setFromUnitVectors(UP, marker.direction);
      label.position.copy(surfaceAt(marker.direction, LABEL_HEIGHT));
      drawLabel(canvas, marker.code);
      texture.needsUpdate = true;
    },
    hide() {
      peg.visible = false;
      label.visible = false;
    },
  };
}

export function createMarkerOverlay(worldPivot) {
  const group = new THREE.Group();
  group.name = 'markers';
  group.visible = false;
  worldPivot.add(group);

  const tags = [];
  let built = false;
  let labelled = null;
  let here = null;

  // The grid is the whole planet's worth of line work: build it the first time
  // it is asked for rather than on every start.
  function build() {
    if (built) return;
    built = true;
    group.add(gridLines());
    const span = LABEL_RING * 2 + 1;
    for (let n = 0; n < span * span * 4; n++) tags.push(createTag(group));
  }

  function label(cell) {
    labelled = `${cell.faceId},${cell.column},${cell.row}`;
    let tag = 0;
    for (let dr = -LABEL_RING; dr <= LABEL_RING; dr++) {
      for (let dc = -LABEL_RING; dc <= LABEL_RING; dc++) {
        const column = cell.column + dc;
        const row = cell.row + dr;
        // Neighbours that fall off the edge of a face belong to the next face
        // along; those are left unlabelled rather than guessed at.
        const here = column >= 0 && column < grid.divisions && row >= 0 && row < grid.divisions;
        for (const marker of here ? plotsOf({ faceId: cell.faceId, column, row }) : []) {
          tags[tag++].show(marker);
        }
        if (!here) for (let n = 0; n < 4; n++) tags[tag++].hide();
      }
    }
  }

  on('markers:toggle', () => {
    build();
    group.visible = !group.visible;
    emit('markers:visible', group.visible);
    if (!group.visible) {
      emit('markers:here', null);
      here = null;
      labelled = null;
    }
  });

  return {
    update() {
      if (!group.visible) return;
      const marker = markerUnderPlayer(worldPivot);
      if (marker && `${marker.faceId},${marker.column},${marker.row}` !== labelled) label(marker);

      const code = marker?.code ?? null;
      if (code === here) return;
      here = code;
      emit('markers:here', code);
    },
  };
}
