// Stand-in shapes for the asset catalogue.
//
// The catalogue lists far more assets than the game has models for, so every
// entry names an archetype — the rough shape of the thing — and the builder
// turns that into the same kind of part list that data/props.json uses. What
// you see in the catalogue is therefore built by the same code as the game's
// own props: nothing is drawn by hand for the page.
//
// size is [width, height, depth] in metres; colours are [main, second, accent].

const shade = (hex, amount) => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (channel) => Math.max(0, Math.min(255, Math.round(channel + 255 * amount)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`;
};

const box = (size, at, color) => ({ shape: 'box', size, at, color });
const cyl = ([r, h, bottom], at, color) => ({ shape: 'cylinder', size: [r, h, bottom ?? r], at, color });
const cone = (size, at, color) => ({ shape: 'cone', size, at, color });
const ball = (size, at, color) => ({ shape: 'sphere', size, at, color });

// Wheels for anything that rolls, lying on their side.
const wheels = (length, width, radius, color) => {
  const parts = [];
  for (const u of [-length / 2 + radius * 1.2, length / 2 - radius * 1.2]) {
    for (const w of [-width / 2, width / 2]) {
      parts.push({ shape: 'cylinder', size: [radius, 0.22], at: [u, radius, w], turn: [90, 0, 0], color });
    }
  }
  return parts;
};

const ARCHETYPES = {
  // --- buildings -----------------------------------------------------------
  house: ([w, h, d], [main, roof]) => [
    box([w, h, d], [0, h / 2, 0], main),
    { shape: 'cone', size: [Math.max(w, d) * 0.78, h * 0.55], at: [0, h + h * 0.27, 0], sides: 4, turn: [0, 45, 0], color: roof },
    box([w * 0.18, h * 0.42, 0.12], [0, h * 0.21, d / 2], shade(main, -0.3)),
  ],
  block: ([w, h, d], [main, roof]) => [
    box([w, h, d], [0, h / 2, 0], main),
    box([w * 1.04, h * 0.06, d * 1.04], [0, h, 0], roof),
    box([w * 0.8, h * 0.5, 0.1], [0, h * 0.6, d / 2], shade(main, 0.16)),
    box([w * 0.22, h * 0.3, 0.12], [0, h * 0.15, d / 2], shade(main, -0.32)),
  ],
  tower: ([w, h, d], [main, roof]) => [
    box([w, h * 0.72, d], [0, h * 0.36, 0], main),
    box([w * 0.74, h * 0.28, d * 0.74], [0, h * 0.86, 0], shade(main, 0.08)),
    box([w * 0.3, h * 0.06, d * 0.3], [0, h * 1.02, 0], roof),
  ],
  hall: ([w, h, d], [main, roof]) => [
    box([w, h, d], [0, h / 2, 0], main),
    { shape: 'cylinder', size: [d / 2, w], at: [0, h, 0], sides: 10, turn: [0, 0, 90], color: roof },
  ],
  spire: ([w, h, d], [main, roof]) => [
    box([w, h * 0.55, d], [0, h * 0.275, 0], main),
    box([w * 0.42, h * 0.85, d * 0.42], [-w * 0.22, h * 0.42, 0], shade(main, 0.06)),
    cone([w * 0.34, h * 0.4], [-w * 0.22, h * 1.05, 0], roof),
  ],
  shed: ([w, h, d], [main, roof]) => [
    box([w, h, d], [0, h / 2, 0], main),
    box([w * 1.1, h * 0.08, d * 1.15], [0, h + h * 0.04, 0], roof),
  ],
  // --- street furniture ----------------------------------------------------
  post: ([w, h], [main, accent]) => [
    cyl([w * 0.6, 0.16], [0, 0.08, 0], shade(main, -0.2)),
    cyl([w * 0.35, h], [0, h / 2, 0], main),
    ball([w * 0.42], [0, h + w * 0.2, 0], accent ?? main),
  ],
  lamp: ([w, h], [main, accent]) => [
    cyl([0.18, 0.22], [0, 0.11, 0], shade(main, -0.2)),
    cyl([w * 0.3, h, w * 0.42], [0, h / 2, 0], main),
    box([w * 1.1, h * 0.12, w * 1.1], [0, h + h * 0.06, 0], shade(main, 0.05)),
    box([w * 0.8, h * 0.09, w * 0.8], [0, h + h * 0.02, 0], accent ?? '#ffe9a8'),
  ],
  mast: ([w, h], [main, accent]) => [
    cyl([w * 0.28, h, w * 0.4], [0, h / 2, 0], main),
    box([w * 2.6, w * 0.22, w * 0.22], [w * 1.1, h * 0.92, 0], main),
    box([w * 0.5, w * 0.5, w * 0.3], [w * 2.2, h * 0.86, 0], accent ?? main),
  ],
  sign: ([w, h, d], [main, accent]) => [
    cyl([0.07, h], [0, h / 2, 0], shade(main, -0.35)),
    box([w, h * 0.3, d || 0.08], [0, h * 0.82, 0], main),
    box([w * 0.7, h * 0.12, 0.02], [0, h * 0.82, (d || 0.08) / 2], accent ?? '#ffffff'),
  ],
  bench: ([w, h, d], [main, accent]) => [
    box([w, 0.09, d], [0, h * 0.55, 0], main),
    box([w, h * 0.55, 0.09], [0, h * 0.82, -d / 2 + 0.05], main),
    box([0.09, h * 0.55, d * 0.9], [-w / 2 + 0.12, h * 0.28, 0], accent ?? shade(main, -0.35)),
    box([0.09, h * 0.55, d * 0.9], [w / 2 - 0.12, h * 0.28, 0], accent ?? shade(main, -0.35)),
  ],
  bin: ([w, h], [main, accent]) => [
    cyl([w / 2, h, w * 0.42], [0, h / 2, 0], main),
    cyl([w * 0.56, h * 0.09], [0, h, 0], accent ?? shade(main, -0.25)),
  ],
  bollard: ([w, h], [main]) => [
    cyl([w / 2, h], [0, h / 2, 0], main),
    ball([w * 0.56], [0, h, 0], shade(main, 0.05)),
  ],
  planter: ([w, h, d], [main, accent]) => [
    box([w, h, d], [0, h / 2, 0], main),
    box([w * 0.86, h * 0.12, d * 0.86], [0, h, 0], '#5a4632'),
    ball([Math.min(w, d) * 0.4], [0, h + Math.min(w, d) * 0.28, 0], accent ?? '#3f8b3f'),
  ],
  machine: ([w, h, d], [main, accent]) => [
    box([w, h, d], [0, h / 2, 0], main),
    box([w * 0.7, h * 0.32, 0.06], [0, h * 0.7, d / 2], accent ?? '#2c3138'),
    box([w * 0.5, h * 0.08, 0.05], [0, h * 0.42, d / 2], shade(main, -0.25)),
  ],
  cabinet: ([w, h, d], [main, accent]) => [
    box([w, h, d], [0, h / 2, 0], main),
    box([w * 1.06, h * 0.07, d * 1.06], [0, h, 0], accent ?? shade(main, -0.2)),
    box([w * 0.1, h * 0.7, 0.04], [w * 0.3, h * 0.5, d / 2], shade(main, -0.3)),
  ],
  kiosk: ([w, h, d], [main, accent]) => [
    box([w, h, d], [0, h / 2, 0], main),
    box([w * 1.12, h * 0.07, d * 1.14], [0, h + h * 0.03, 0], shade(main, -0.22)),
    box([w * 0.7, h * 0.42, 0.08], [0, h * 0.6, d / 2], '#9fc6d8'),
    box([w * 1.1, h * 0.18, d * 0.4], [0, h * 0.9, d * 0.62], accent ?? '#c8442e'),
  ],
  shelter: ([w, h, d], [main, accent]) => [
    box([w, h * 0.05, d], [0, h, 0], accent ?? shade(main, -0.2)),
    cyl([0.07, h], [-w / 2 + 0.2, h / 2, d / 2 - 0.15], main),
    cyl([0.07, h], [w / 2 - 0.2, h / 2, d / 2 - 0.15], main),
    box([w, h * 0.78, 0.07], [0, h * 0.46, -d / 2 + 0.1], '#9fc6d8'),
    box([w * 0.8, 0.08, d * 0.24], [0, h * 0.2, -d * 0.25], main),
  ],
  fountain: ([w, h], [main, accent]) => [
    cyl([w / 2, h * 0.36, w * 0.54], [0, h * 0.18, 0], main),
    cyl([w * 0.44, h * 0.1], [0, h * 0.38, 0], accent ?? '#3f7fa8'),
    cyl([w * 0.1, h * 0.7], [0, h * 0.7, 0], shade(main, 0.06)),
    cyl([w * 0.2, h * 0.12], [0, h * 1.02, 0], shade(main, 0.06)),
  ],
  statue: ([w, h], [main, accent]) => [
    box([w, h * 0.1, w], [0, h * 0.05, 0], shade(main, -0.12)),
    box([w * 0.66, h * 0.42, w * 0.66], [0, h * 0.31, 0], main),
    cyl([w * 0.2, h * 0.36], [0, h * 0.7, 0], accent ?? shade(main, -0.08)),
    ball([w * 0.17], [0, h * 0.93, 0], accent ?? shade(main, -0.08)),
  ],
  column: ([w, h], [main, accent]) => [
    cyl([w * 0.6, h * 0.08], [0, h * 0.04, 0], shade(main, -0.15)),
    cyl([w / 2, h * 0.86], [0, h * 0.5, 0], main),
    cyl([w * 0.6, h * 0.1], [0, h * 0.95, 0], accent ?? shade(main, -0.15)),
  ],
  // --- boundaries and surfaces --------------------------------------------
  wall: ([w, h, d], [main, accent]) => [
    box([w, h, d], [0, h / 2, 0], main),
    box([w, h * 0.09, d * 1.3], [0, h, 0], accent ?? shade(main, -0.14)),
  ],
  fence: ([w, h, d], [main]) => {
    const parts = [box([w, 0.07, d * 0.6], [0, h * 0.85, 0], main), box([w, 0.07, d * 0.6], [0, h * 0.45, 0], main)];
    const posts = Math.max(2, Math.round(w / 1.4));
    for (let i = 0; i <= posts; i++) {
      parts.push(box([0.09, h, d], [-w / 2 + (w * i) / posts, h / 2, 0], main));
    }
    return parts;
  },
  gate: ([w, h, d], [main, accent]) => [
    box([0.16, h, d], [-w / 2, h / 2, 0], accent ?? shade(main, -0.3)),
    box([0.16, h, d], [w / 2, h / 2, 0], accent ?? shade(main, -0.3)),
    box([w, h * 0.08, d * 0.7], [0, h, 0], main),
    box([w * 0.9, h * 0.7, 0.06], [0, h * 0.4, 0], main),
  ],
  surface: ([w, h, d], [main, accent]) => [
    box([w, Math.max(0.06, h), d], [0, Math.max(0.06, h) / 2, 0], main),
    box([w * 0.42, Math.max(0.06, h) + 0.02, d * 0.42], [w * 0.16, Math.max(0.06, h) / 2 + 0.01, d * 0.16], accent ?? shade(main, 0.08)),
  ],
  water: ([w, h, d], [main, accent]) => [
    box([w, 0.1, d], [0, 0.05, 0], main),
    box([w * 0.5, 0.04, d * 0.16], [-w * 0.1, 0.12, d * 0.2], accent ?? shade(main, 0.22)),
    box([w * 0.3, 0.04, d * 0.12], [w * 0.2, 0.12, -d * 0.2], accent ?? shade(main, 0.22)),
  ],
  // --- vegetation ----------------------------------------------------------
  tree_broad: ([w, h], [main, leaf]) => [
    cyl([w * 0.09, h * 0.45, w * 0.12], [0, h * 0.22, 0], main),
    ball([w * 0.5], [0, h * 0.68, 0], leaf ?? '#3f8b3f'),
    ball([w * 0.32], [w * 0.22, h * 0.52, w * 0.1], shade(leaf ?? '#3f8b3f', -0.05)),
  ],
  tree_conifer: ([w, h], [main, leaf]) => [
    cyl([w * 0.08, h * 0.22], [0, h * 0.11, 0], main),
    cone([w * 0.5, h * 0.5], [0, h * 0.42, 0], leaf ?? '#2f7d3a'),
    cone([w * 0.36, h * 0.4], [0, h * 0.72, 0], shade(leaf ?? '#2f7d3a', 0.04)),
  ],
  bush: ([w, h], [main]) => [
    ball([w * 0.42], [0, h * 0.45, 0], main),
    ball([w * 0.3], [w * 0.26, h * 0.3, 0], shade(main, -0.05)),
    ball([w * 0.26], [-w * 0.24, h * 0.32, w * 0.1], shade(main, 0.05)),
  ],
  hedge: ([w, h, d], [main]) => [
    box([w, h, d], [0, h / 2, 0], main),
    box([w * 0.98, h * 0.14, d * 0.98], [0, h, 0], shade(main, 0.06)),
  ],
  flowers: ([w, h], [main, accent]) => [
    box([w, h * 0.3, w], [0, h * 0.15, 0], '#5a4632'),
    ball([w * 0.16], [-w * 0.22, h * 0.5, 0], accent ?? main),
    ball([w * 0.16], [w * 0.2, h * 0.52, w * 0.15], main),
    ball([w * 0.14], [0, h * 0.48, -w * 0.2], accent ?? main),
  ],
  // --- moving things -------------------------------------------------------
  car: ([w, h, d], [main, accent]) => [
    box([w, h * 0.45, d], [0, h * 0.42, 0], main),
    box([w * 0.56, h * 0.36, d * 0.92], [-w * 0.05, h * 0.78, 0], accent ?? '#9fc6d8'),
    ...wheels(w, d, h * 0.2, '#22242a'),
  ],
  van: ([w, h, d], [main, accent]) => [
    box([w * 0.72, h * 0.7, d], [w * 0.12, h * 0.55, 0], main),
    box([w * 0.3, h * 0.42, d * 0.94], [-w * 0.35, h * 0.44, 0], accent ?? shade(main, -0.12)),
    ...wheels(w, d, h * 0.17, '#22242a'),
  ],
  tram: ([w, h, d], [main, accent]) => [
    box([w, h * 0.6, d], [0, h * 0.42, 0], main),
    box([w * 0.96, h * 0.2, d * 0.98], [0, h * 0.62, 0], accent ?? '#e9e6dd'),
    box([w * 0.86, h * 0.06, d * 0.7], [0, h * 0.76, 0], shade(main, -0.25)),
    ...wheels(w * 0.8, d * 0.8, h * 0.12, '#22242a'),
  ],
  bike: ([w, h], [main, accent]) => [
    { shape: 'cylinder', size: [h * 0.34, 0.07], at: [-w * 0.3, h * 0.34, 0], turn: [90, 0, 0], color: '#22242a' },
    { shape: 'cylinder', size: [h * 0.34, 0.07], at: [w * 0.3, h * 0.34, 0], turn: [90, 0, 0], color: '#22242a' },
    box([w * 0.7, 0.07, 0.07], [0, h * 0.52, 0], main),
    box([0.07, h * 0.3, 0.07], [w * 0.26, h * 0.62, 0], main),
    box([0.1, 0.07, w * 0.32], [w * 0.26, h * 0.78, 0], accent ?? main),
  ],
  boat: ([w, h, d], [main, accent]) => [
    box([w, h * 0.4, d], [0, h * 0.2, 0], main),
    box([w * 0.42, h * 0.4, d * 0.7], [w * 0.05, h * 0.55, 0], accent ?? '#e9e6dd'),
    box([w * 1.02, h * 0.08, d * 1.04], [0, h * 0.4, 0], shade(main, -0.18)),
  ],
  person: ([w, h], [main, accent]) => [
    cyl([w * 0.34, h * 0.42, w * 0.3], [0, h * 0.28, 0], main),
    box([w * 0.22, h * 0.2, w * 0.22], [-w * 0.12, h * 0.1, 0], accent ?? shade(main, -0.3)),
    box([w * 0.22, h * 0.2, w * 0.22], [w * 0.12, h * 0.1, 0], accent ?? shade(main, -0.3)),
    ball([w * 0.3], [0, h * 0.62, 0], '#d9a06b'),
    ball([w * 0.33], [0, h * 0.72, 0], accent ?? shade(main, -0.15)),
  ],
  animal: ([w, h], [main, accent]) => [
    box([w * 0.7, h * 0.4, w * 0.3], [0, h * 0.6, 0], main),
    ball([h * 0.22], [w * 0.4, h * 0.75, 0], accent ?? main),
    box([0.07, h * 0.45, 0.07], [-w * 0.26, h * 0.22, w * 0.1], shade(main, -0.2)),
    box([0.07, h * 0.45, 0.07], [w * 0.24, h * 0.22, -w * 0.1], shade(main, -0.2)),
  ],
  // --- works and infrastructure -------------------------------------------
  scaffold: ([w, h, d], [main, accent]) => {
    const parts = [];
    for (const u of [-w / 2, w / 2]) {
      for (const z of [-d / 2, d / 2]) parts.push(cyl([0.06, h], [u, h / 2, z], main));
    }
    for (const level of [0.35, 0.7, 1]) {
      parts.push(box([w * 1.05, 0.06, d], [0, h * level, 0], accent ?? shade(main, -0.2)));
    }
    return parts;
  },
  crane: ([w, h], [main, accent]) => [
    box([w * 0.4, h * 0.06, w * 0.4], [0, 0.03, 0], shade(main, -0.25)),
    box([w * 0.16, h, w * 0.16], [0, h / 2, 0], main),
    box([w, w * 0.14, w * 0.14], [w * 0.22, h, 0], accent ?? main),
    box([0.06, h * 0.22, 0.06], [w * 0.6, h * 0.88, 0], shade(main, -0.3)),
  ],
  pipe: ([w, h, d], [main]) => [
    { shape: 'cylinder', size: [Math.max(w, d) / 2, h], at: [0, Math.max(w, d) / 2, 0], turn: [0, 0, 90], color: main },
  ],
  pile: ([w, h], [main, accent]) => [
    cone([w / 2, h], [0, h / 2, 0], main),
    box([w * 0.5, h * 0.2, w * 0.4], [w * 0.3, h * 0.1, w * 0.2], accent ?? shade(main, -0.1)),
  ],
  crate: ([w, h, d], [main, accent]) => [
    box([w, h, d], [0, h / 2, 0], main),
    box([w * 1.02, h * 0.12, d * 0.2], [0, h * 0.7, 0], accent ?? shade(main, -0.2)),
    box([w * 0.2, h * 0.12, d * 1.02], [0, h * 0.3, 0], accent ?? shade(main, -0.2)),
  ],
  cone_marker: ([w, h], [main, accent]) => [
    box([w, h * 0.08, w], [0, h * 0.04, 0], accent ?? main),
    cone([w * 0.42, h], [0, h / 2, 0], main),
    cyl([w * 0.24, h * 0.14], [0, h * 0.55, 0], accent ?? '#ffffff'),
  ],
  bridge: ([w, h, d], [main, accent]) => [
    box([w, h * 0.18, d], [0, h * 0.9, 0], main),
    box([w, h * 0.12, d * 1.1], [0, h, 0], accent ?? shade(main, -0.15)),
    box([w * 0.12, h * 0.82, d * 0.8], [-w * 0.34, h * 0.41, 0], accent ?? shade(main, -0.1)),
    box([w * 0.12, h * 0.82, d * 0.8], [w * 0.34, h * 0.41, 0], accent ?? shade(main, -0.1)),
  ],

  // --- roof and facade details --------------------------------------------
  chimney: ([w, h, d], [main, accent]) => [
    box([w, h, d || w], [0, h / 2, 0], main),
    box([w * 1.25, h * 0.1, (d || w) * 1.25], [0, h, 0], accent ?? shade(main, -0.2)),
  ],
  dormer: ([w, h, d], [main, roof]) => [
    box([w, h * 0.6, d], [0, h * 0.3, 0], main),
    { shape: 'cone', size: [w * 0.75, h * 0.5], at: [0, h * 0.78, 0], sides: 4, turn: [0, 45, 0], color: roof ?? shade(main, -0.3) },
    box([w * 0.55, h * 0.32, 0.06], [0, h * 0.32, d / 2], '#9fc6d8'),
  ],
  balcony: ([w, h, d], [main, accent]) => [
    box([w, 0.1, d], [0, h, 0], main),
    box([w, h * 0.2, 0.06], [0, h + h * 0.1, d / 2], accent ?? shade(main, -0.25)),
    box([0.06, h * 0.2, d], [-w / 2, h + h * 0.1, 0], accent ?? shade(main, -0.25)),
    box([0.06, h * 0.2, d], [w / 2, h + h * 0.1, 0], accent ?? shade(main, -0.25)),
  ],
  awning: ([w, h, d], [main, accent]) => [
    box([w, h * 0.08, d], [0, h, 0], main),
    box([w, h * 0.3, 0.06], [0, h - h * 0.14, d / 2], accent ?? shade(main, -0.15)),
  ],
  panel: ([w, h, d], [main, accent]) => [
    box([w, h, d || 0.1], [0, h / 2, 0], main),
    box([w * 0.8, h * 0.6, (d || 0.1) + 0.02], [0, h * 0.55, 0], accent ?? shade(main, 0.12)),
  ],
};

export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES);

// The part list for a catalogue entry, ready for entities/prop.js to build.
export function partsFor(archetype, size, colors) {
  const build = ARCHETYPES[archetype];
  if (!build) throw new Error(`catalogue: unknown archetype "${archetype}"`);
  const [w = 1, h = 1, d = w] = size ?? [];
  return build([w, h, d], colors ?? ['#b9b2a4']);
}
