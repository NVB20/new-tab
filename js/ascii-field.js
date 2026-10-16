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

// Brightness (0..1) of the resting field at cell (c, r) after t seconds. Two layers of noise
// stretched into streaks — one flat, one diagonal — blended region by region, then cut off
// high so most of the screen stays empty and each streak fades out at its ends.
export function streakField(c, r, t, seed = 0) {
  const flat = valueNoise(c / 14 + t * 0.02, r / 2.2, seed);
  const diagonal = valueNoise((c - r * 2.5) / 14 - t * 0.02, r / 6, seed + 5);
  const blend = smooth(Math.min(1, Math.max(0, (valueNoise(c / 80, r / 25, seed + 3) - 0.3) / 0.4)));
  const n = flat * (1 - blend) + diagonal * blend;
  return Math.min(1, Math.max(0, (n - 0.6) / 0.3));
}

// How strongly the cursor lights a cell at `distance` px: 1 under the cursor, 0 at `radius`.
export function falloff(distance, radius) {
  if (distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t;
}

// Where a cell at `distance` sits inside a ripple ring whose wavefront is at `radius`:
// 0 on the wavefront, 1 at the trailing edge `thickness` px behind it, -1 outside the ring.
export function ringOffset(distance, radius, thickness) {
  const behind = radius - distance;
  return behind < 0 || behind > thickness ? -1 : behind / thickness;
}

export function level(value, levels) {
  return Math.max(0, Math.min(levels - 1, Math.round(value * (levels - 1))));
}
