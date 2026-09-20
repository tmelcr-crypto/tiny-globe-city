import * as THREE from 'three';
import catalog from '../../src/data/catalog.json';
import propDefs from '../../src/data/props.json';
import buildingDefs from '../../src/data/buildings.json';
import vehicleDefs from '../../src/data/vehicles.json';
import npcDefs from '../../src/data/npcs.json';
import { createProp } from '../../src/entities/prop.js';
import { createBuilding } from '../../src/entities/building.js';
import { createTree } from '../../src/entities/tree.js';
import { createCar } from '../../src/entities/car.js';
import { createNpc } from '../../src/entities/npc.js';
import { createRng } from '../../src/core/rng.js';
import { partsFor } from './archetypes.js';

// Builds the asset catalogue page: every entry rendered twice, once in the
// reference style and once as the placeholder the game uses today.
//
// Entries the game already has a model for are rendered from that model, so
// the placeholder column is the real thing and not an approximation of it.

const SHOT = 320;          // pixels per render, square
const CARD_W = 640;        // the pair, side by side
const QUALITY = 0.74;

const STYLE_BG = '#efe6d4';
const GAME_BG = '#171d2b';

function fit(camera, object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(0.35, size.length() / 2);
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.12;
  const direction = new THREE.Vector3(0.82, 0.48, 1).normalize();
  camera.position.copy(centre).addScaledVector(direction, distance);
  camera.near = Math.max(0.05, distance - radius * 3);
  camera.far = distance + radius * 6;
  camera.updateProjectionMatrix();
  camera.lookAt(centre);
  return { box, size, centre, radius };
}

// One gradient ramp shared by every toon material: three flat bands, which is
// what gives the reference sheet its poster look.
function toonRamp() {
  const data = new Uint8Array([90, 150, 205, 255]);
  const ramp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  ramp.needsUpdate = true;
  return ramp;
}
const RAMP = toonRamp();

const warm = (hex) => {
  const color = new THREE.Color(hex);
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 });
  // Push towards the reference sheet: a little more saturated, a little lighter.
  return color.setHSL(hsl.h, Math.min(1, hsl.s * 1.25 + 0.06), Math.min(0.92, hsl.l * 0.96 + 0.06));
};

function restyle(object, treatment) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    const source = Array.isArray(child.material) ? child.material : [child.material];
    const swapped = source.map((material) => (treatment === 'style'
      ? new THREE.MeshToonMaterial({ color: warm(material.color.getHex()), gradientMap: RAMP })
      : new THREE.MeshStandardMaterial({ color: material.color.clone(), flatShading: true, roughness: 0.95 })));
    child.material = Array.isArray(child.material) ? swapped : swapped[0];
  });
}

// The reference sheet's models read as solid shapes with a dark edge. An
// inside-out copy of the model, scaled up a touch, gives that edge.
function outlineOf(object) {
  const outline = object.clone(true);
  outline.traverse((child) => {
    if (!child.isMesh) return;
    child.material = new THREE.MeshBasicMaterial({ color: 0x2a231c, side: THREE.BackSide });
  });
  return outline;
}

function lightsFor(scene, treatment) {
  if (treatment === 'style') {
    scene.add(new THREE.HemisphereLight(0xfff3dd, 0x8a6f52, 1.15));
    const key = new THREE.DirectionalLight(0xfff0d0, 1.5);
    key.position.set(4, 7, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc98a, 0.55);
    rim.position.set(-5, 2, -4);
    scene.add(rim);
  } else {
    scene.add(new THREE.HemisphereLight(0xbcd3ff, 0x2a3340, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    sun.position.set(5, 9, 4);
    scene.add(sun);
  }
}

function groundFor(radius, treatment) {
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.35, 40),
    new THREE.MeshBasicMaterial({ color: treatment === 'style' ? 0xdfd0b2 : 0x2b3547 })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -0.01;
  return disc;
}

// --- the models -------------------------------------------------------------

const byId = (list, id) => list.find((entry) => entry.id === id);

function gameModel(reference, rng) {
  const [kind, id] = reference.split(':');
  if (kind === 'prop') return createProp(byId(propDefs, id), rng);
  if (kind === 'building') return createBuilding(byId(buildingDefs, id), rng);
  if (kind === 'tree') return createTree(id, rng);
  if (kind === 'vehicle') return createCar(byId(vehicleDefs, id));
  if (kind === 'npc') return createNpc(byId(npcDefs, id));
  throw new Error(`catalogue: unknown game asset "${reference}"`);
}

function standIn(asset, rng) {
  const [, , archetype, size, colors] = asset;
  return createProp({ id: asset[0], parts: partsFor(archetype, size, colors) }, rng);
}

// --- rendering --------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(SHOT, SHOT, false);
renderer.setPixelRatio(1);

// Nothing in the catalogue is rendered twice, so everything is thrown away as
// soon as it has been drawn — six hundred assets otherwise fill the GPU.
function dispose(scene) {
  scene.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry.dispose();
    for (const material of [].concat(child.material)) material.dispose();
  });
}

function shoot(object, treatment) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(treatment === 'style' ? STYLE_BG : GAME_BG);
  restyle(object, treatment);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const framed = fit(camera, object);

  if (treatment === 'style') {
    // A constant-looking edge whatever the size of the thing being drawn.
    const grow = 1 + Math.min(0.06, 0.035 / Math.max(0.6, framed.radius) + 0.012);
    const outline = outlineOf(object);
    outline.scale.setScalar(grow);
    outline.position.sub(framed.centre.clone().multiplyScalar(grow - 1));
    scene.add(outline);
  }

  scene.add(object);
  scene.add(groundFor(framed.radius, treatment));
  lightsFor(scene, treatment);
  renderer.render(scene, camera);
  dispose(scene);
  return renderer.domElement;
}

const pair = document.createElement('canvas');
pair.width = CARD_W;
pair.height = SHOT;
const ctx = pair.getContext('2d');

function renderPair(asset, reference) {
  const seed = [...asset[0]].reduce((hash, ch) => Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);

  const target = standIn(asset, createRng(seed));
  ctx.drawImage(shoot(target, 'style'), 0, 0);

  const placeholder = reference ? gameModel(reference, createRng(seed)) : standIn(asset, createRng(seed));
  ctx.drawImage(shoot(placeholder, 'placeholder'), SHOT, 0);

  ctx.fillStyle = '#7b6a55';
  ctx.fillRect(SHOT - 1, 0, 2, SHOT);
  return pair.toDataURL('image/jpeg', QUALITY);
}

// --- the document -----------------------------------------------------------

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function card(asset, reference) {
  const [id, name, archetype, size, , prague] = asset;
  const node = el('article', 'card');
  const image = el('img');
  image.src = renderPair(asset, reference);
  image.alt = name;
  node.append(image);
  node.append(el('h3', null, name));
  const meta = el('p', 'meta');
  meta.append(el('code', null, id));
  meta.append(el('span', null, ` ${size.map((n) => `${n}`).join(' × ')} m · ${archetype}`));
  node.append(meta);
  node.append(el('p', 'note', prague));
  node.append(el('p', reference ? 'status built' : 'status planned',
    reference ? `in game now — ${reference}` : 'placeholder shown is a stand-in; not modelled yet'));
  return node;
}

async function coverImage() {
  const sheet = new Image();
  sheet.src = '/docs/art/mossbite-style-reference.png';
  await sheet.decode();
  const canvas = document.createElement('canvas');
  const width = 1000;
  canvas.width = width;
  canvas.height = Math.round((sheet.height / sheet.width) * width);
  canvas.getContext('2d').drawImage(sheet, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

async function build() {
  const root = document.getElementById('catalogue');
  const total = catalog.categories.reduce((sum, category) => sum + category.assets.length, 0);
  const builtCount = Object.keys(catalog.built).length;

  const cover = el('section', 'cover');
  cover.append(el('h1', null, catalog.title));
  cover.append(el('p', 'lead',
    `${total} assets across ${catalog.categories.length} categories, ${builtCount} of them already modelled in the game.`));
  const sheet = el('img', 'sheet');
  sheet.src = await coverImage();
  cover.append(sheet);
  cover.append(el('p', 'caption', `Style reference: ${catalog.reference.style}`));
  cover.append(el('h2', null, 'How to read a card'));
  cover.append(el('p', null,
    'Each card shows the same asset twice. Left: the shape treated the way the reference sheet treats it — '
    + 'flat bands of warm colour and a dark edge. Right: the placeholder standing in for it in the game today. '
    + 'Where the game already has the model, the right-hand render is that actual model, not an approximation.'));
  cover.append(el('h2', null, 'Where the list comes from'));
  cover.append(el('p', null, catalog.reference.sourcing));
  cover.append(el('p', null, catalog.reference.scale));
  cover.append(el('h2', null, 'Contents'));
  const contents = el('ul', 'contents');
  for (const category of catalog.categories) {
    contents.append(el('li', null, `${category.name} — ${category.assets.length}`));
  }
  cover.append(contents);
  cover.append(el('p', 'caption', `Generated ${new Date().toISOString().slice(0, 10)} · npm run catalog`));
  root.append(cover);

  for (const category of catalog.categories) {
    const section = el('section', 'category');
    section.append(el('h2', null, `${category.name} (${category.assets.length})`));
    section.append(el('p', 'intro', category.intro));
    const grid = el('div', 'grid');
    for (const asset of category.assets) grid.append(card(asset, catalog.built[asset[0]]));
    section.append(grid);
    root.append(section);
  }

  window.__catalogue = { assets: total, categories: catalog.categories.length, built: builtCount };
  document.body.dataset.ready = 'yes';
}

build();
