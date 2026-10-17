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

// How much cell (c, r) uses diagonal rather than flat streaks (0..1); doesn't change over time.
export function streakBlend(c, r, seed = 0) {
  return smooth(Math.min(1, Math.max(0, (valueNoise(c / 80, r / 25, seed + 3) - 0.3) / 0.4)));
}

// Vertical sway (in rows) of column c after t seconds.
export const streakSway = (c, t) => Math.sin(c / 16 + t * 0.9) * 0.9;

// Brightness (0..1) of the resting field at cell (c, r) after t seconds of flow. Two layers of
// noise stretched into streaks — one flat, one diagonal — blended region by region, then cut off
// high so most of the screen stays empty and each streak fades out at its ends. The streaks
// flow sideways (flat ones one way, diagonal ones the other) and sway on a slow sine wave.
// blend and sway can be passed in precomputed: blend never changes, sway is the same for a column.
export function streakField(c, r, t, seed = 0, blend = streakBlend(c, r, seed), sway = streakSway(c, t)) {
  const rw = r + sway;
  const flat = valueNoise(c / 14 + t * 0.25, rw / 2.2, seed);
  const diagonal = valueNoise((c - rw * 2.5) / 14 - t * 0.18, rw / 6, seed + 5);
  const n = flat * (1 - blend) + diagonal * blend;
  return Math.min(1, Math.max(0, (n - 0.6) / 0.3));
}

// The hashes of the noise lattice over [x0, x1] × [y0, y1], so valueNoise can be read many
// times in that area without hashing each corner again.
function lattice(x0, x1, y0, y1, seed) {
  const w = x1 - x0 + 1;
  const data = new Float64Array(w * (y1 - y0 + 1));
  for (let y = y0, k = 0; y <= y1; y++) for (let x = x0; x <= x1; x++, k++) data[k] = hash2(x, y, seed);
  return { x0, y0, w, data };
}

// valueNoise(x, y) read from a lattice that covers the point: the same value.
function latticeNoise(l, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const k = (yi - l.y0) * l.w + (xi - l.x0);
  const a = l.data[k];
  const b = l.data[k + 1];
  const c = l.data[k + l.w];
  const d = l.data[k + l.w + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// streakField for every cell of a cols × rows grid (row by row into out), with blend per cell
// and sway per column. The same values, from two small lattices hashed once per call instead of
// eight hashes per cell.
export function streakGrid(cols, rows, t, seed, blend, sway, out) {
  let lo = Infinity, hi = -Infinity;
  for (let c = 0; c < cols; c++) {
    if (sway[c] < lo) lo = sway[c];
    if (sway[c] > hi) hi = sway[c];
  }
  const rwLo = lo, rwHi = rows - 1 + hi;
  // One cell of margin on every side, so rounding at the edges can't step outside.
  const flat = lattice(
    Math.floor(t * 0.25) - 1, Math.floor((cols - 1) / 14 + t * 0.25) + 2,
    Math.floor(rwLo / 2.2) - 1, Math.floor(rwHi / 2.2) + 2, seed,
  );
  const diagonal = lattice(
    Math.floor(-rwHi * 2.5 / 14 - t * 0.18) - 1, Math.floor((cols - 1 - rwLo * 2.5) / 14 - t * 0.18) + 2,
    Math.floor(rwLo / 6) - 1, Math.floor(rwHi / 6) + 2, seed + 5,
  );
  for (let r = 0, i = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++, i++) {
      const rw = r + sway[c];
      const f = latticeNoise(flat, c / 14 + t * 0.25, rw / 2.2);
      const d = latticeNoise(diagonal, (c - rw * 2.5) / 14 - t * 0.18, rw / 6);
      const n = f * (1 - blend[i]) + d * blend[i];
      out[i] = Math.min(1, Math.max(0, (n - 0.6) / 0.3));
    }
  }
  return out;
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
