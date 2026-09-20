// Deterministic pseudo-randomness. The city is generated from a fixed seed, so
// the same map always produces exactly the same town — no reshuffling on reload.
// Pass one of these anywhere a model would otherwise reach for Math.random.

// mulberry32: small, fast, good enough spread for placing scenery.
export function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, [min, max]) {
  return min + rng() * (max - min);
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// entries: [[value, weight], ...]
export function weighted(rng, entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
