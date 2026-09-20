import * as THREE from 'three';
import { GLOBE_RADIUS } from './planet.js';
import { elevation, SEA_LEVEL, carveStreets } from './terrain.js';
import { streetProfiles, settleStructures } from './city-plan.js';
import { biomeMix } from './biome.js';

export { GLOBE_RADIUS };

// Detail of the land mesh. An icosahedron subdivides evenly, unlike a
// latitude/longitude sphere which crowds its triangles at the poles — and the
// player stands on one of those poles.
const SUBDIVISIONS = 110;

// How the ground is coloured: first by what kind of country it is — the map
// says where the desert, the forest and the beaches are (see biome.js) — and
// then by height and steepness, which put sand along the water, bare rock on
// anything steep and snow on the tops.
const SHORE = new THREE.Color(0xcdbb8a);
const ROCK = new THREE.Color(0x7c7b73);
const SNOW = new THREE.Color(0xe9edf0);
const WATER = new THREE.Color(0x2b6b96);

// Each kind of country has a colour low down and another high up, so a forest
// darkens as it climbs and the desert bleaches out over the dunes.
const COUNTRY = {
  city:    [new THREE.Color(0x5f8a4e), new THREE.Color(0x77935f)],
  beach:   [new THREE.Color(0xe0cd9c), new THREE.Color(0xc9b483)],
  desert:  [new THREE.Color(0xc8a86a), new THREE.Color(0xd9c091)],
  forest:  [new THREE.Color(0x36682f), new THREE.Color(0x2c5730)],
  meadow:  [new THREE.Color(0x63a052), new THREE.Color(0x7aa961)],
};
// Deserts do not get snow lines and beaches do not get alpine rock.
const BARE = { city: 1, beach: 0.5, desert: 0.7, forest: 1, meadow: 1 };
const FROST = { city: 1, beach: 0.2, desert: 0.15, forest: 1, meadow: 1 };

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _colour = new THREE.Color();

const _low = new THREE.Color();
const _high = new THREE.Color();

function groundColour(height, steepness, mix, target) {
  // The country's own colour: every kind that reaches this point, by share.
  _low.setRGB(0, 0, 0);
  _high.setRGB(0, 0, 0);
  let bare = 0;
  let frost = 0;
  for (const [biome, share] of Object.entries(mix)) {
    const [low, high] = COUNTRY[biome] ?? COUNTRY.meadow;
    _low.r += low.r * share; _low.g += low.g * share; _low.b += low.b * share;
    _high.r += high.r * share; _high.g += high.g * share; _high.b += high.b * share;
    bare += (BARE[biome] ?? 1) * share;
    frost += (FROST[biome] ?? 1) * share;
  }

  target.copy(_low).lerp(_high, Math.min(1, Math.max(0, height) / 22));
  // Sand where the water laps, whatever the country behind it is.
  if (height < 1.5) target.lerp(SHORE, 1 - Math.max(0, height) / 1.5);
  if (steepness > 0.34) target.lerp(ROCK, Math.min(1, (steepness - 0.34) / 0.5) * bare);
  if (height > 26) target.lerp(SNOW, Math.min(1, (height - 26) / 16) * frost);
  return target;
}

// The land: a sphere pushed in and out by the height field, coloured per face.
// Built here rather than in terrain.js so that module stays pure maths.
function createLand(elevation, seaLevel) {
  const geometry = new THREE.IcosahedronGeometry(GLOBE_RADIUS, SUBDIVISIONS).toNonIndexed();
  const position = geometry.getAttribute('position');
  const colours = new Float32Array(position.count * 3);

  for (let v = 0; v < position.count; v++) {
    _a.fromBufferAttribute(position, v).normalize();
    const height = Math.max(elevation(_a), seaLevel - 2.5);
    _a.multiplyScalar(GLOBE_RADIUS + height);
    position.setXYZ(v, _a.x, _a.y, _a.z);
  }

  // One colour per triangle, from its own height and tilt — flat shading, so a
  // face is one facet anyway.
  for (let t = 0; t < position.count; t += 3) {
    _a.fromBufferAttribute(position, t);
    _b.fromBufferAttribute(position, t + 1);
    _c.fromBufferAttribute(position, t + 2);
    const height = (_a.length() + _b.length() + _c.length()) / 3 - GLOBE_RADIUS;

    _normal.copy(_b).sub(_a).cross(_c.clone().sub(_a)).normalize();
    _b.add(_c).add(_a).normalize();          // the direction this face sits at
    const steepness = Math.tan(Math.acos(Math.min(1, Math.abs(_normal.dot(_b)))));

    if (height < seaLevel) _colour.copy(WATER).lerp(SHORE, Math.max(0, 1 + (height - seaLevel) / 6));
    else groundColour(height, steepness, biomeMix(_b), _colour);

    for (let n = 0; n < 3; n++) {
      colours[(t + n) * 3] = _colour.r;
      colours[(t + n) * 3 + 1] = _colour.g;
      colours[(t + n) * 3 + 2] = _colour.b;
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const land = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true,
  }));
  land.name = 'land';
  return land;
}

// The sea: one shell at sea level. Every hollow the land makes below it fills
// by itself, which is where the ponds, the lakes and the rivers come from.
function createSea(seaLevel) {
  const sea = new THREE.Mesh(
    new THREE.IcosahedronGeometry(GLOBE_RADIUS + seaLevel, 48),
    new THREE.MeshStandardMaterial({
      color: 0x2f74a3, flatShading: true, transparent: true, opacity: 0.86,
      roughness: 0.25, metalness: 0.1,
    })
  );
  sea.name = 'sea';
  return sea;
}

// Returns worldPivot: a Group that holds the globe and all world objects.
// Buildings, cars, trees and NPCs are added separately by world/spawner.js.
export function createGlobe() {
  // The streets shape the land before the land is built: their cuttings and
  // embankments are part of the ground, not something laid on top of it.
  carveStreets(streetProfiles());
  // ...and again, now that each street can see what its neighbours did to the
  // ground: a hill cut away by the road alongside is no longer worth
  // tunnelling, and a hollow filled in by the embankment next door needs no
  // bridge. Each pass settles a few more, and the third finds almost nothing.
  carveStreets(settleStructures());
  carveStreets(settleStructures());

  const pivot = new THREE.Group();
  pivot.add(createLand(elevation, SEA_LEVEL));
  pivot.add(createSea(SEA_LEVEL));
  return pivot;
}
