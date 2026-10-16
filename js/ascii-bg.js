// Animated ASCII background in the style of the Claude Code app: faint streaks of letters that
// drift slowly, brighten softly around the mouse, and ripple outwards from a click on the page.
// Only cells whose look changed are redrawn, using a pre-rendered glyph atlas.

import { GLYPHS, hash2, streakField, streakBlend, streakSway, falloff, ringOffset, level } from './ascii-field.js';

const CHARSET = GLYPHS;
const FONT = '"Cascadia Mono", Consolas, "SF Mono", Menlo, monospace';
const FONT_SIZE = 10;
const CELL_W = 7;
const CELL_H = 14;
const FIELD_LEVELS = 6;
const GLOW_LEVELS = 8;
const BLUE_LEVELS = 8;
const GLOW_MIN = 0.1;           // below this a lit letter falls back to the resting field
const FIELD_MS = 100;          // how often the flowing field is recomputed
const FLOW_WHILE_ACTIVE = 0.3; // flow speed while the mouse moves or a ripple runs (idle = 1)
const FLOW_EASE_MS = 700;      // how gently the flow speeds up and slows down
const HOVER_RADIUS = 90;       // px around the cursor that brightens
const HOVER_DECAY_MS = 280;    // how fast hover light fades
const RIPPLE_DECAY_MS = 170;   // ripple light fades quickly behind the wave, so it reads as a ring
const IDLE_AFTER_MS = 2500;    // a still mouse stops lighting cells
const ACTIVE_FRAME_MS = 1000 / 40;
const IDLE_FRAME_MS = 1000 / 10;
const RIPPLE = { speed: 240, maxRadius: 480, thickness: 48 }; // px/s, px, px
// Clicks on these start no ripple.
const NO_RIPPLE = 'a, button, input, textarea, select, label, summary, dialog, .menu, .sidebar, .widgets';

// Resting letters are the theme's text colour at very low opacity, so they melt into the
// background; hover light makes them brighter and slightly cooler; the click ripple is blue
// (green in the GitHub theme).
const PALETTES = {
  dark: {
    ink: [250, 249, 245], field: [0.03, 0.12], glowTo: [196, 224, 244], glow: [0.06, 0.5],
    blueFrom: [25, 134, 194], blueTo: [150, 206, 242], blue: [0.14, 0.8],
  },
  light: {
    ink: [20, 20, 19], field: [0.04, 0.15], glowTo: [24, 92, 140], glow: [0.07, 0.55],
    blueFrom: [24, 120, 176], blueTo: [10, 82, 140], blue: [0.16, 0.8],
  },
  blue: {
    ink: [214, 228, 255], field: [0.03, 0.12], glowTo: [170, 205, 255], glow: [0.06, 0.5],
    blueFrom: [37, 99, 235], blueTo: [147, 197, 253], blue: [0.14, 0.8],
  },
  github: {
    ink: [230, 237, 243], field: [0.03, 0.12], glowTo: [175, 235, 185], glow: [0.06, 0.5],
    blueFrom: [35, 134, 54], blueTo: [86, 211, 100], blue: [0.14, 0.8],
  },
};

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = (c, alpha) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
const randomGlyph = () => Math.floor(Math.random() * GLYPHS.length);

export function mountAsciiBackground(canvas, store) {
  const ctx = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const seed = Math.floor(Math.random() * 1e6);

  let cols = 0, rows = 0, cw = 0, ch = 0, cwPx = 0, chPx = 0;
  let chars, base, glow, fadeMs, blue, drawn, blend, sway;
  let atlas = null;
  let mode = null;
  let enabled = false;
  let motion = false;
  let pointer = null;
  let lastMove = 0;
  let lastFrame = 0;
  let lastField = 0;
  let flowTime = 0;   // seconds of flow so far, advanced faster while idle
  let flowSpeed = 1;
  let raf = 0;
  const active = new Set();
  const ripples = [];

  function buildAtlas(dpr) {
    const p = PALETTES[mode];
    atlas = document.createElement('canvas');
    atlas.width = CHARSET.length * cwPx;
    atlas.height = (FIELD_LEVELS + GLOW_LEVELS + BLUE_LEVELS) * chPx;
    const g = atlas.getContext('2d');
    g.font = `${FONT_SIZE * dpr}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const row = (index, style) => {
      g.fillStyle = style;
      for (let i = 0; i < CHARSET.length; i++) g.fillText(CHARSET[i], i * cwPx + cwPx / 2, index * chPx + chPx / 2);
    };
    const [f0, f1] = p.field;
    for (let l = 0; l < FIELD_LEVELS; l++) row(l, rgba(p.ink, f0 + (f1 - f0) * (l / (FIELD_LEVELS - 1))));
    const [g0, g1] = p.glow;
    for (let l = 0; l < GLOW_LEVELS; l++) {
      const t = l / (GLOW_LEVELS - 1);
      row(FIELD_LEVELS + l, rgba(mix(p.ink, p.glowTo, t * t), g0 + (g1 - g0) * t));
    }
    const [b0, b1] = p.blue;
    for (let l = 0; l < BLUE_LEVELS; l++) {
      const t = l / (BLUE_LEVELS - 1);
      row(FIELD_LEVELS + GLOW_LEVELS + l, rgba(mix(p.blueFrom, p.blueTo, t * t), b0 + (b1 - b0) * t));
    }
  }

  // Atlas row for a cell: a blue (ripple) or glow (hover) level while lit, else a field level,
  // or -1 for blank.
  function rowFor(i) {
    if (glow[i] >= GLOW_MIN) {
      return blue[i]
        ? FIELD_LEVELS + GLOW_LEVELS + level(glow[i], BLUE_LEVELS)
        : FIELD_LEVELS + level(glow[i], GLOW_LEVELS);
    }
    return base[i] > 0 ? level(base[i], FIELD_LEVELS) : -1;
  }

  function drawCell(i) {
    const row = rowFor(i);
    const glyph = chars[i];
    const code = row < 0 ? -1 : row * 64 + glyph;
    if (drawn[i] === code) return;
    drawn[i] = code;
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    ctx.clearRect(x, y, cw, ch);
    if (row >= 0) ctx.drawImage(atlas, glyph * cwPx, row * chPx, cwPx, chPx, x, y, cw, ch);
  }

  // Recomputes the flowing streaks; letters that newly appear get a fresh glyph.
  function updateField() {
    const t = motion ? flowTime : 0;
    for (let c = 0; c < cols; c++) sway[c] = streakSway(c, t);
    for (let r = 0, i = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        const v = streakField(c, r, t, seed, blend[i], sway[c]);
        if (base[i] === 0 && v > 0) chars[i] = randomGlyph();
        base[i] = v;
        drawCell(i);
      }
    }
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
    fadeMs = new Float32Array(n);
    blue = new Uint8Array(n);
    drawn = new Int16Array(n).fill(-2);
    blend = new Float32Array(n);
    sway = new Float32Array(cols);
    active.clear();
    ripples.length = 0;
    for (let i = 0; i < n; i++) {
      chars[i] = Math.floor(hash2(i % cols, Math.floor(i / cols), seed) * GLYPHS.length);
      blend[i] = streakBlend(i % cols, Math.floor(i / cols), seed);
    }
    buildAtlas(dpr);
    updateField();
  }

  function light(i, strength, decayMs, isBlue = 0) {
    if (strength <= glow[i]) return;
    glow[i] = strength;
    fadeMs[i] = decayMs;
    blue[i] = isBlue;
    active.add(i);
  }

  // A soft, sparse brightening around the cursor.
  function lightAroundPointer() {
    const { x, y } = pointer;
    const c0 = Math.max(0, Math.floor((x - HOVER_RADIUS) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((x + HOVER_RADIUS) / cw));
    const r0 = Math.max(0, Math.floor((y - HOVER_RADIUS) / ch));
    const r1 = Math.min(rows - 1, Math.ceil((y + HOVER_RADIUS) / ch));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const f = falloff(Math.hypot(c * cw + cw / 2 - x, r * ch + ch / 2 - y), HOVER_RADIUS);
        if (f <= 0 || Math.random() > 0.15 + 0.5 * f) continue;
        light(r * cols + c, f * (0.3 + 0.4 * Math.random()), HOVER_DECAY_MS);
      }
    }
  }

  // One soft wave: letters inside the moving band brighten (strongest mid-band) and a few
  // change as it passes; it fades out as it spreads.
  function drawRipple(cx, cy, radius) {
    if (radius <= 0 || radius > RIPPLE.maxRadius) return;
    const inner = Math.max(0, radius - RIPPLE.thickness);
    const fade = 1 - radius / RIPPLE.maxRadius;
    const r0 = Math.max(0, Math.floor((cy - radius) / ch));
    const r1 = Math.min(rows - 1, Math.ceil((cy + radius) / ch));
    for (let r = r0; r <= r1; r++) {
      const dy = r * ch + ch / 2 - cy;
      if (Math.abs(dy) > radius) continue;
      const xOuter = Math.sqrt(radius * radius - dy * dy);
      const xInner = inner > Math.abs(dy) ? Math.sqrt(inner * inner - dy * dy) : 0;
      for (const [from, to] of [[cx - xOuter, cx - xInner], [cx + xInner, cx + xOuter]]) {
        const c0 = Math.max(0, Math.floor(from / cw));
        const c1 = Math.min(cols - 1, Math.ceil(to / cw));
        for (let c = c0; c <= c1; c++) {
          const off = ringOffset(Math.hypot(c * cw + cw / 2 - cx, dy), radius, RIPPLE.thickness);
          if (off < 0) continue;
          const i = r * cols + c;
          const strength = Math.sin(Math.PI * off) * fade * (0.55 + 0.25 * Math.random());
          light(i, strength, RIPPLE_DECAY_MS, 1);
          if (Math.random() < strength * 0.12) chars[i] = randomGlyph();
        }
      }
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (pointer && now - lastMove > IDLE_AFTER_MS) pointer = null;
    const busy = pointer || ripples.length || active.size > 40;
    if (now - lastFrame < (busy ? ACTIVE_FRAME_MS : IDLE_FRAME_MS)) return;
    const dt = Math.min(120, now - lastFrame);
    lastFrame = now;

    // The waves flow freely while nothing is happening and calm down during interaction.
    const targetSpeed = pointer || ripples.length ? FLOW_WHILE_ACTIVE : 1;
    flowSpeed += (targetSpeed - flowSpeed) * Math.min(1, dt / FLOW_EASE_MS);
    flowTime += (dt / 1000) * flowSpeed;

    if (now - lastField >= FIELD_MS) {
      lastField = now;
      updateField();
      // Now and then a single visible letter changes.
      const i = Math.floor(Math.random() * cols * rows);
      if (base[i] > 0) {
        chars[i] = randomGlyph();
        drawCell(i);
      }
    }

    if (pointer) lightAroundPointer();
    for (let k = ripples.length - 1; k >= 0; k--) {
      const radius = ((now - ripples[k].start) / 1000) * RIPPLE.speed;
      if (radius > RIPPLE.maxRadius) ripples.splice(k, 1);
      else drawRipple(ripples[k].x, ripples[k].y, radius);
    }

    for (const i of active) {
      glow[i] *= Math.exp(-dt / fadeMs[i]);
      if (glow[i] < GLOW_MIN) {
        glow[i] = 0;
        active.delete(i);
      }
      drawCell(i);
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
    const theme = document.documentElement.dataset.theme;
    const nextMode = theme in PALETTES ? theme : 'dark';

    canvas.hidden = !want;
    document.body.classList.toggle('has-pattern', want);
    if (!want) {
      stop();
      enabled = false;
      return;
    }
    const nextMotion = p.background.motion && !reducedMotion.matches;
    const changed = !enabled || nextMode !== mode || nextMotion !== motion;
    enabled = true;
    mode = nextMode;
    motion = nextMotion;
    if (changed) layout();
    if (motion) {
      start();
    } else {
      stop();
      pointer = null;
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
  document.addEventListener('pointerdown', e => {
    if (!motion || e.button !== 0 || e.target.closest?.(NO_RIPPLE)) return;
    ripples.push({ x: e.clientX, y: e.clientY, start: performance.now() });
    if (ripples.length > 4) ripples.shift();
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
