// Animated ASCII background: a dim field of letters that scrambles slowly and lights up blue
// around the mouse. Only cells whose look changed are redrawn, using a pre-rendered glyph atlas.

import { GLYPHS, hash2, density, falloff, level } from './ascii-field.js';

const FONT = '"Cascadia Mono", Consolas, "SF Mono", Menlo, monospace';
const FONT_SIZE = 12;
const CELL_W = 8.2;
const CELL_H = 14;
const GRAY_LEVELS = 8;
const BLUE_LEVELS = 10;
const RADIUS = 240;          // px around the cursor that lights up
const DECAY_MS = 650;        // how fast the glow fades behind the cursor
const IDLE_AFTER_MS = 2500;  // a still mouse stops lighting cells
const ACTIVE_FRAME_MS = 1000 / 40;
const IDLE_FRAME_MS = 1000 / 12;

const PALETTES = {
  dark: { gray: [255, 255, 255], grayAlpha: [0.035, 0.2], blueLow: [25, 134, 194], blueHigh: [170, 220, 248] },
  light: { gray: [20, 20, 19], grayAlpha: [0.05, 0.22], blueLow: [24, 120, 176], blueHigh: [8, 70, 120] },
};

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = (c, alpha) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
const randomGlyph = () => Math.floor(Math.random() * GLYPHS.length);

export function mountAsciiBackground(canvas, store) {
  const ctx = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const seed = Math.floor(Math.random() * 1e6);

  let cols = 0, rows = 0, cw = 0, ch = 0, cwPx = 0, chPx = 0;
  let chars, base, glow, drawn;
  let atlas = null;
  let mode = null;
  let enabled = false;
  let motion = false;
  let pointer = null;
  let lastMove = 0;
  let lastFrame = 0;
  let raf = 0;
  const active = new Set();

  function buildAtlas(dpr) {
    const p = PALETTES[mode];
    atlas = document.createElement('canvas');
    atlas.width = GLYPHS.length * cwPx;
    atlas.height = (GRAY_LEVELS + BLUE_LEVELS) * chPx;
    const g = atlas.getContext('2d');
    g.font = `${FONT_SIZE * dpr}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const row = (index, style) => {
      g.fillStyle = style;
      for (let i = 0; i < GLYPHS.length; i++) g.fillText(GLYPHS[i], i * cwPx + cwPx / 2, index * chPx + chPx / 2);
    };
    for (let l = 0; l < GRAY_LEVELS; l++) {
      const [lo, hi] = p.grayAlpha;
      row(l, rgba(p.gray, lo + (hi - lo) * (l / (GRAY_LEVELS - 1))));
    }
    for (let l = 0; l < BLUE_LEVELS; l++) {
      const t = (l + 1) / BLUE_LEVELS;
      row(GRAY_LEVELS + l, rgba(mix(p.blueLow, p.blueHigh, t * t * t), 0.3 + 0.7 * t));
    }
  }

  // Atlas row for a cell: a blue level while it glows, else a grey level from the resting field.
  function rowFor(i) {
    if (glow[i] >= 0.05) return GRAY_LEVELS + level(glow[i], BLUE_LEVELS);
    return base[i] > 0 ? level(base[i], GRAY_LEVELS) : -1;
  }

  function drawCell(i) {
    const row = rowFor(i);
    const code = row < 0 ? -1 : row * 64 + chars[i];
    if (drawn[i] === code) return;
    drawn[i] = code;
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    ctx.clearRect(x, y, cw, ch);
    if (row >= 0) ctx.drawImage(atlas, chars[i] * cwPx, row * chPx, cwPx, chPx, x, y, cw, ch);
  }

  function drawAll() {
    for (let i = 0; i < cols * rows; i++) drawCell(i);
  }

  function layout() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cwPx = Math.round(CELL_W * dpr);
    chPx = Math.round(CELL_H * dpr);
    cw = cwPx / dpr;
    ch = chPx / dpr;
    cols = Math.ceil(innerWidth / cw);
    rows = Math.ceil(innerHeight / ch);
    canvas.width = Math.ceil(innerWidth * dpr);
    canvas.height = Math.ceil(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = cols * rows;
    chars = new Uint8Array(n);
    base = new Float32Array(n);
    glow = new Float32Array(n);
    drawn = new Int16Array(n).fill(-2);
    active.clear();
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      // Slightly dimmer towards the edges of the screen.
      const dx = c / cols - 0.5;
      const dy = r / rows - 0.5;
      const vignette = 1 - Math.min(1, (dx * dx + dy * dy) * 1.6);
      chars[i] = Math.floor(hash2(c, r, seed) * GLYPHS.length);
      base[i] = density(c / 22, r / 11, seed) * (0.45 + 0.55 * vignette);
    }
    buildAtlas(dpr);
    drawAll();
  }

  function lightAroundPointer() {
    const { x, y } = pointer;
    const c0 = Math.max(0, Math.floor((x - RADIUS) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((x + RADIUS) / cw));
    const r0 = Math.max(0, Math.floor((y - RADIUS) / ch));
    const r1 = Math.min(rows - 1, Math.ceil((y + RADIUS) / ch));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const f = falloff(Math.hypot(c * cw + cw / 2 - x, r * ch + ch / 2 - y), RADIUS) * (0.65 + 0.35 * Math.random());
        if (f <= 0) continue;
        const i = r * cols + c;
        if (f > glow[i]) {
          glow[i] = f;
          active.add(i);
        }
        if (Math.random() < f * 0.3) chars[i] = randomGlyph();
      }
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (pointer && now - lastMove > IDLE_AFTER_MS) pointer = null;
    const busy = pointer || active.size > 40;
    if (now - lastFrame < (busy ? ACTIVE_FRAME_MS : IDLE_FRAME_MS)) return;
    const dt = Math.min(120, now - lastFrame);
    lastFrame = now;

    if (pointer) lightAroundPointer();

    const keep = Math.exp(-dt / DECAY_MS);
    for (const i of active) {
      glow[i] *= keep;
      if (glow[i] < 0.05) {
        glow[i] = 0;
        active.delete(i);
      }
      drawCell(i);
    }

    // Resting shimmer: a few letters change, and now and then one flashes blue.
    const n = cols * rows;
    for (let k = Math.ceil(n * 0.002); k > 0; k--) {
      const i = Math.floor(Math.random() * n);
      chars[i] = randomGlyph();
      drawCell(i);
    }
    if (Math.random() < 0.35) {
      const i = Math.floor(Math.random() * n);
      if (base[i] > 0.15) {
        glow[i] = Math.max(glow[i], 0.35 + Math.random() * 0.45);
        active.add(i);
      }
    }
  }

  function start() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function sync() {
    const p = store.get().prefs;
    const wallpaper = p.background.useUpload ? store.wallpaper : p.background.url;
    const want = p.background.pattern === 'ascii' && !wallpaper;
    const nextMode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

    canvas.hidden = !want;
    document.body.classList.toggle('has-pattern', want);
    if (!want) {
      stop();
      enabled = false;
      return;
    }
    if (!enabled || nextMode !== mode) {
      enabled = true;
      mode = nextMode;
      layout();
    }
    motion = p.background.motion && !reducedMotion.matches;
    if (motion) {
      start();
    } else {
      stop();
      pointer = null;
      for (const i of active) glow[i] = 0;
      active.clear();
      drawAll();
    }
  }

  addEventListener('pointermove', e => {
    if (!motion) return;
    pointer = { x: e.clientX, y: e.clientY };
    lastMove = performance.now();
  }, { passive: true });
  document.addEventListener('pointerout', e => {
    if (!e.relatedTarget) pointer = null;
  });

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (enabled) layout(); }, 150);
  });

  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  reducedMotion.addEventListener('change', sync);
  store.subscribe(sync, ['prefs', 'wallpaper']);
  sync();
}
