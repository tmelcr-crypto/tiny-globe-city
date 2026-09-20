import * as THREE from 'three';
import { on, emit } from '../core/events.js';
import { markerUnderPlayer, plotsOf, allBlocks, BLOCK_RANGE, REACH } from '../world/markers.js';
import { surfacePoint, cityBlocks, BLOCK } from '../world/city-plan.js';

// Planning overlay: the block and lot grid, drawn right around the planet, and
// a labelled peg on every plot near the player — so you can walk anywhere,
// read a code off the ground, and name that exact spot. Off by default,
// toggled with M or the on-screen button.
//
// The grid covers four hundred blocks, which is far too many to label at once:
// labels are a small pool that follows the player from block to block, while
// the lines themselves are two draw calls for the whole globe.

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
const LINE_STEP = 2;     // metres between samples, so lines follow the curve

const onGlobe = (u, v) => Math.hypot(u, v) <= REACH;

// A straight run on the flat map, sampled onto the globe as a chain of
// segments. Anything past the point opposite the player is off the planet, so
// the run simply stops there.
function addLine(points, from, to) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.u - from.u, to.v - from.v) / LINE_STEP));
  let previous = null;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const u = from.u + (to.u - from.u) * t;
    const v = from.v + (to.v - from.v) * t;
    if (!onGlobe(u, v)) { previous = null; continue; }
    const point = surfacePoint(u, v, LINE_LIFT);
    if (previous) points.push(previous, point);
    previous = point;
  }
}

function addOutline(points, centre, half) {
  const corners = [
    { u: centre.u - half, v: centre.v - half },
    { u: centre.u + half, v: centre.v - half },
    { u: centre.u + half, v: centre.v + half },
    { u: centre.u - half, v: centre.v + half },
  ];
  for (let i = 0; i < corners.length; i++) {
    addLine(points, corners[i], corners[(i + 1) % corners.length]);
  }
}

// Block outlines — bright through the town, dull out in the country — and the
// cross that splits each block into its four lots.
function gridLines() {
  const group = new THREE.Group();
  const town = [];
  const land = [];
  const lots = [];

  const inTown = new Set(cityBlocks().map((block) => `${block.i},${block.j}`));

  for (const block of allBlocks()) {
    addOutline(inTown.has(`${block.i},${block.j}`) ? town : land, block, BLOCK / 2);
    addLine(lots, { u: block.u - BLOCK / 2, v: block.v }, { u: block.u + BLOCK / 2, v: block.v });
    addLine(lots, { u: block.u, v: block.v - BLOCK / 2 }, { u: block.u, v: block.v + BLOCK / 2 });
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
      peg.position.copy(surfacePoint(marker.u, marker.v, 0.15));
      peg.quaternion.setFromUnitVectors(UP, peg.position.clone().normalize());
      label.position.copy(surfacePoint(marker.u, marker.v, LABEL_HEIGHT));
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

  // The grid is four hundred blocks of line work: build it the first time it
  // is asked for rather than on every start.
  function build() {
    if (built) return;
    built = true;
    group.add(gridLines());
    const span = LABEL_RING * 2 + 1;
    for (let n = 0; n < span * span * 4; n++) tags.push(createTag(group));
  }

  function label(i, j) {
    labelled = `${i},${j}`;
    let tag = 0;
    for (let dj = LABEL_RING; dj >= -LABEL_RING; dj--) {
      for (let di = -LABEL_RING; di <= LABEL_RING; di++) {
        const bi = i + di;
        const bj = j + dj;
        const inside = bi >= BLOCK_RANGE.minI && bi <= BLOCK_RANGE.maxI
          && bj >= BLOCK_RANGE.minJ && bj <= BLOCK_RANGE.maxJ;
        for (const marker of inside ? plotsOf(bi, bj) : []) {
          if (onGlobe(marker.u, marker.v)) tags[tag].show(marker);
          else tags[tag].hide();
          tag++;
        }
        if (!inside) for (let n = 0; n < 4; n++) tags[tag++].hide();
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
      if (marker && `${marker.i},${marker.j}` !== labelled) label(marker.i, marker.j);

      const code = marker?.code ?? null;
      if (code === here) return;
      here = code;
      emit('markers:here', code);
    },
  };
}
