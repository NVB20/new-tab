// Setup's opening and ending on the ASCII background: the letters spell a word, and a ripple runs
// out from a point. Drawn on a canvas of their own laid over the background, on its grid (7 × 14 px
// cells rounded to device pixels, its font, the theme's hover light, as in ascii-bg.js), so the
// background itself doesn't need to know. The canvas exists only while something is playing.

import { GLYPHS } from './ascii-field.js';

const CELL_W = 7;
const CELL_H = 14;
const FONT = '"Cascadia Mono", Consolas, "SF Mono", Menlo, monospace';
const FONT_SIZE = 10;
// The hover light of ascii-bg.js's palettes, per theme.
const GLOW = { dark: [196, 224, 244], light: [24, 92, 140], blue: [170, 205, 255], github: [175, 235, 185] };
const RIPPLE = { speed: 0.32, reach: 520, thickness: 36 };   // px per ms, px, px

const clamp01 = n => Math.max(0, Math.min(1, n));
const ease = t => 1 - (1 - t) ** 3;
const randomGlyph = () => Math.floor(Math.random() * GLYPHS.length);
export const motionAllowed = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas = null;
let ctx = null;
let grid = null;
let frame = 0;
const jobs = new Set();

function surface() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'ob-fx';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.round(CELL_W * dpr) / dpr;
  const ch = Math.round(CELL_H * dpr) / dpr;
  grid = { cw, ch, cols: Math.ceil(innerWidth / cw), rows: Math.ceil(innerHeight / ch) };
  canvas.width = Math.ceil(innerWidth * dpr);
  canvas.height = Math.ceil(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `${FONT_SIZE}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}

function colours() {
  const root = document.documentElement;
  const [r, g, b] = GLOW[root.dataset.theme] ?? GLOW.dark;
  return { glow: `rgb(${r}, ${g}, ${b})`, ground: getComputedStyle(root).getPropertyValue('--bg').trim() || '#151515' };
}

// One lit letter: the field's own letter in that cell is covered first, so the two don't overlap.
function light(col, row, glyph, alpha, { glow, ground }) {
  const x = col * grid.cw;
  const y = row * grid.ch;
  ctx.globalAlpha = Math.min(1, alpha * 1.6);
  ctx.fillStyle = ground;
  ctx.fillRect(x, y, grid.cw, grid.ch);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = glow;
  ctx.fillText(GLYPHS[glyph], x + grid.cw / 2, y + grid.ch / 2 + 0.5);
}

function tick(now) {
  frame = 0;
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const job of jobs) {
    if (job.draw(now) !== false) continue;
    jobs.delete(job);
    job.done();
  }
  if (jobs.size) {
    frame = requestAnimationFrame(tick);
  } else {
    canvas.remove();
    canvas = ctx = grid = null;
  }
}

function play(draw) {
  surface();
  return new Promise(done => {
    jobs.add({ draw, done });
    if (!frame) frame = requestAnimationFrame(tick);
  });
}

// The cells a word covers, drawn squashed into a cols × rows image (cells are twice as tall as
// wide), each with its distance from the middle for the stagger.
function wordCells(word) {
  const { cols, rows, cw, ch } = grid;
  const mask = new OffscreenCanvas(cols, rows).getContext('2d', { willReadFrequently: true });
  const squash = cw / ch;
  const size = Math.min(300, innerWidth / 4.6) / cw;   // the word's height, in cell widths
  mask.setTransform(1, 0, 0, squash, 0, 0);
  mask.font = `800 ${size}px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`;
  mask.textAlign = 'center';
  mask.textBaseline = 'middle';
  mask.fillText(word, cols / 2, rows / 2 / squash);
  const data = mask.getImageData(0, 0, cols, rows).data;
  const cells = [];
  const half = Math.hypot(cols * cw, rows * ch) / 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (data[(row * cols + col) * 4 + 3] < 115) continue;
      const d = Math.hypot((col - cols / 2) * cw, (row - rows / 2) * ch) / half;
      cells.push({ col, row, d, glyph: randomGlyph() });
    }
  }
  return cells;
}

// The letters spell `word` from the middle outwards, hold it, and let it go. Resolves when done.
export function spellWord(word, { ms = 2100 } = {}) {
  if (!motionAllowed()) return Promise.resolve();
  surface();
  const cells = wordCells(word);
  const paint = colours();
  const start = performance.now();
  return play(now => {
    const t = (now - start) / ms;
    if (t >= 1) return false;
    for (const c of cells) {
      const a = ease(clamp01((t - c.d * 0.35) / 0.2)) * (1 - ease(clamp01((t - 0.8) / 0.2)));
      if (a < 0.02) continue;
      if (Math.random() < 0.03) c.glyph = randomGlyph();
      light(c.col, c.row, c.glyph, a, paint);
    }
    return true;
  });
}

// A ring of lit letters runs out from (x, y), as a click on the page does.
export function rippleFrom(x, y) {
  if (!motionAllowed()) return Promise.resolve();
  surface();
  const paint = colours();
  const glyphs = new Map();
  const start = performance.now();
  return play(now => {
    const radius = (now - start) * RIPPLE.speed;
    if (radius > RIPPLE.reach) return false;
    const fade = 1 - radius / RIPPLE.reach;
    const { cw, ch, cols, rows } = grid;
    const reach = radius + RIPPLE.thickness;
    const c0 = Math.max(0, Math.floor((x - reach) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((x + reach) / cw));
    const r0 = Math.max(0, Math.floor((y - reach) / ch));
    const r1 = Math.min(rows - 1, Math.ceil((y + reach) / ch));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const off = Math.abs(Math.hypot(col * cw + cw / 2 - x, row * ch + ch / 2 - y) - radius);
        if (off >= RIPPLE.thickness) continue;
        const key = row * cols + col;
        if (!glyphs.has(key)) glyphs.set(key, randomGlyph());
        light(col, row, glyphs.get(key), (1 - off / RIPPLE.thickness) * 0.85 * fade, paint);
      }
    }
    return true;
  });
}
