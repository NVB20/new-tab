// Pure maths for the ASCII background: glyph set, noise field, cursor falloff.
// No DOM access (unit-tested in Node).

export const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Deterministic pseudo-random number in [0, 1) for integer coordinates.
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = t => t * t * (3 - 2 * t);

export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Brightness of the resting glyph field: two octaves of noise with the low end cut off,
// so the field has blank gaps between denser patches.
export function density(x, y, seed = 0) {
  const n = valueNoise(x, y, seed) * 0.65 + valueNoise(x * 2.3, y * 2.3, seed + 7) * 0.35;
  return Math.min(1, Math.max(0, (n - 0.32) / 0.6));
}

// How strongly the cursor lights a cell at `distance` px: 1 under the cursor, 0 at `radius`.
export function falloff(distance, radius) {
  if (distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t;
}

export function level(value, levels) {
  return Math.max(0, Math.min(levels - 1, Math.round(value * (levels - 1))));
}
