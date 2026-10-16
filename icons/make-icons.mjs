// Draws the tab icon: one continuous stroke tracing an "N", lit from mint to sky and ending in a
// bright cursor point, on a dark rounded tile. Writes icons/icon.svg, and with a Chrome or
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

// weight is the stroke width in the 128px drawing. Small renders get a heavier stroke, pulled
// inward so the N keeps the same outer extent, because 14/128 of 16px is under two pixels.
function draw(weight) {
  const inset = (weight - 14) / 2;
  const d = `M${38 + inset} ${94 - inset} V${34 + inset} L${90 - inset} ${94 - inset} V${34 + inset}`;
  const stroke = `fill="none" stroke="url(#line)" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
<defs>
  <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0d1419"/>
    <stop offset="1" stop-color="#06090c"/>
  </linearGradient>
  <linearGradient id="line" gradientUnits="userSpaceOnUse" x1="38" y1="94" x2="90" y2="34">
    <stop offset="0" stop-color="#2fd58f"/>
    <stop offset="1" stop-color="#4cc9ff"/>
  </linearGradient>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="6"/>
  </filter>
</defs>
<rect width="128" height="128" rx="28" fill="url(#tile)"/>
<path d="${d}" ${stroke} opacity="0.85" filter="url(#glow)"/>
<path d="${d}" ${stroke}/>
<circle cx="${90 - inset}" cy="${34 + inset}" r="${weight / 2}" fill="#ffffff"/>
<rect x="0.5" y="0.5" width="127" height="127" rx="27.5" fill="none" stroke="#ffffff" stroke-opacity="0.07"/>
</svg>
`;
}

const sizes = [[16, 20], [32, 17], [48, 14], [128, 14]];
writeFileSync(join(ICONS, 'icon.svg'), draw(14));
console.log('wrote icons/icon.svg');

const chrome = process.argv[2];
if (!chrome) {
  console.log('No browser given, PNGs not updated. Pass a Chrome or chrome-headless-shell binary to rasterize.');
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'new-tab-icons-'));
try {
  for (const [size, weight] of sizes) {
    writeFileSync(join(work, `${size}.svg`), draw(weight));
    const page = join(work, `${size}.html`);
    writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${size}.svg">`);
    const png = join(work, `${size}.png`);
    const run = spawnSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      `--user-data-dir=${join(work, 'profile')}`, '--default-background-color=00000000',
      '--force-device-scale-factor=1', `--window-size=${size},${size}`, `--screenshot=${png}`,
      pathToFileURL(page).href,
    ], { timeout: 60_000, stdio: 'pipe' });
    if (run.error) throw run.error;
    copyFileSync(png, join(ICONS, `icon-${size}.png`));
    console.log(`wrote icons/icon-${size}.png`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
