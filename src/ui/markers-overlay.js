import * as THREE from 'three';
import { on, emit } from '../core/events.js';
import { allMarkers, markerUnderPlayer, QUARTER } from '../world/markers.js';
import { surfacePoint, cityBlocks, BLOCK } from '../world/city-plan.js';

// Planning overlay: a labelled peg on every plot in the city, so you can walk
// around, read a code off the ground, and name that exact spot. Off by default,
// toggled with M.

const LABEL_HEIGHT = 6;   // metres above the ground, clear of houses' eaves
const LABEL_WIDTH = 3.5;  // metres wide — small enough that a near label doesn't fill the screen
const PEG_RADIUS = 0.6;

const PEG = new THREE.MeshBasicMaterial({ color: 0xffdd33 });
const pegGeometry = new THREE.CylinderGeometry(PEG_RADIUS, PEG_RADIUS, 0.25, 10);

const BLOCK_LINE = new THREE.LineBasicMaterial({ color: 0xffdd33 });
const LOT_LINE = new THREE.LineBasicMaterial({ color: 0x66d9ff });
const LINE_LIFT = 0.3;   // clear of the pavement so the lines read on any surface
const LINE_STEP = 2;     // metres between samples, so lines follow the curve

// A straight run on the flat map, sampled onto the globe.
function addLine(points, from, to) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.u - from.u, to.v - from.v) / LINE_STEP));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    points.push(surfacePoint(from.u + (to.u - from.u) * t, from.v + (to.v - from.v) * t, LINE_LIFT));
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

// Block outlines in yellow, the four lots inside each block in blue.
function gridLines() {
  const group = new THREE.Group();
  const blocks = [];
  const lots = [];

  for (const block of cityBlocks()) {
    addOutline(blocks, block, BLOCK / 2);
    // The cross that splits a block into lots A B / C D.
    addLine(lots, { u: block.u - BLOCK / 2, v: block.v }, { u: block.u + BLOCK / 2, v: block.v });
    addLine(lots, { u: block.u, v: block.v - BLOCK / 2 }, { u: block.u, v: block.v + BLOCK / 2 });
  }

  for (const [points, material] of [[blocks, BLOCK_LINE], [lots, LOT_LINE]]) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.LineSegments(geometry, material));
  }
  return group;
}

function labelTexture(code) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(12, 16, 28, 0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ffdd33';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  ctx.fillStyle = '#ffdd33';
  ctx.font = 'bold 72px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(code, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMarkerOverlay(worldPivot) {
  const group = new THREE.Group();
  group.name = 'markers';
  group.visible = false;

  for (const marker of allMarkers()) {
    const peg = new THREE.Mesh(pegGeometry, PEG);
    peg.position.copy(surfacePoint(marker.u, marker.v, 0.15));
    peg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), peg.position.clone().normalize());
    group.add(peg);

    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(marker.code), depthTest: false }));
    label.position.copy(surfacePoint(marker.u, marker.v, LABEL_HEIGHT));
    label.scale.set(LABEL_WIDTH, LABEL_WIDTH / 2, 1);
    group.add(label);
  }

  group.add(gridLines());
  worldPivot.add(group);

  let here = null;
  on('markers:toggle', () => {
    group.visible = !group.visible;
    emit('markers:visible', group.visible);
    if (!group.visible) emit('markers:here', null);
  });

  return {
    update() {
      if (!group.visible) return;
      const marker = markerUnderPlayer(worldPivot);
      const code = marker?.code ?? null;
      if (code === here) return;
      here = code;
      emit('markers:here', code);
    },
  };
}
