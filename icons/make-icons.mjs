// Draws the tab icon: a 5 × 5 dot-matrix "N" in the accent colour on a dark rounded tile, lit the
// way the ASCII field lights up under the cursor. Writes icons/icon.svg, and with a Chrome or
// chrome-headless-shell binary on the command line also the PNGs Chrome needs (favicon sizes and
// the extension card). See docs/superpowers/specs/2026-10-16-tab-icon-design.md.
//
//   node icons/make-icons.mjs path/to/chrome-headless-shell.exe

import { mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICONS = dirname(fileURLToPath(import.meta.url));
const ACCENT = '#d97757';
const PITCH = 19;
const pos = i => 64 + (i - 2) * PITCH;
const isN = (c, r) => c === 0 || c === 4 || c === r;

// Lit dots get warmer and brighter towards the middle one, like the field under the cursor.
function shade(c, r) {
  const d = Math.hypot(c - 2, r - 2);
  if (d === 0) return '#f6c2a6';
  if (d < 1.5) return '#ea9a78';
  if (d < 2.1) return '#de8060';
  if (d < 2.5) return ACCENT;
  return '#cf6e4e';
}

function draw({ dotR, dimOpacity }) {
  const dim = [], lit = [], glow = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const at = `cx="${pos(c)}" cy="${pos(r)}" r="${dotR}"`;
      if (isN(c, r)) {
        lit.push(`  <circle ${at} fill="${shade(c, r)}"/>`);
        glow.push(`<circle ${at}/>`);
      } else {
        dim.push(`    <circle ${at}/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1f1e1c"/>
    <stop offset="1" stop-color="#121211"/>
  </linearGradient>
  <radialGradient id="halo">
    <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.42"/>
    <stop offset="0.5" stop-color="${ACCENT}" stop-opacity="0.12"/>
    <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
  </radialGradient>
  <filter id="bloom" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="5"/>
  </filter>
  <clipPath id="clip"><rect width="128" height="128" rx="28"/></clipPath>
</defs>
<rect width="128" height="128" rx="28" fill="url(#bg)"/>
<g clip-path="url(#clip)">
  <circle cx="64" cy="64" r="64" fill="url(#halo)"/>
  <g fill="#c2c0b6" fill-opacity="${dimOpacity}">
${dim.join('\n')}
  </g>
  <g fill="${ACCENT}" opacity="0.6" filter="url(#bloom)">${glow.join('')}</g>
${lit.join('\n')}
</g>
<rect x="0.5" y="0.5" width="127" height="127" rx="27.5" fill="none" stroke="#faf9f5" stroke-opacity="0.09"/>
</svg>
`;
}

const main = draw({ dotR: 8, dimOpacity: 0.13 });
// At 16px there is no room for gaps: bigger dots merge into strokes, and the unlit dots nearly go.
const small = draw({ dotR: 9, dimOpacity: 0.08 });
writeFileSync(join(ICONS, 'icon.svg'), main);
console.log('wrote icons/icon.svg');

const chrome = process.argv[2];
if (!chrome) {
  console.log('No browser given, PNGs not updated. Pass a Chrome or chrome-headless-shell binary to rasterize.');
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'new-tab-icons-'));
try {
  writeFileSync(join(work, 'main.svg'), main);
  writeFileSync(join(work, 'small.svg'), small);
  for (const [size, svg] of [[16, 'small'], [32, 'main'], [48, 'main'], [128, 'main']]) {
    const page = join(work, `${size}.html`);
    writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${svg}.svg">`);
    const png = join(work, `${size}.png`);
    const run = spawnSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      `--user-data-dir=${join(work, 'profile')}`, '--default-background-color=00000000',
      '--force-device-scale-factor=1', `--window-size=${size},${size}`, `--screenshot=${png}`,
      pathToFileURL(page).href,
    ], { timeout: 60_000, stdio: 'pipe' });
    if (run.status !== 0 && run.error) throw run.error;
    copyFileSync(png, join(ICONS, `icon-${size}.png`));
    console.log(`wrote icons/icon-${size}.png`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
