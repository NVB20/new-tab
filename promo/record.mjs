// Records the promo into promo/out/frames/NNNN.jpg. For each shot it seeds the demo page
// (fixtures/), opens the new tab on a held virtual clock (lib/vclock.js), then for every frame
// moves the pointer and, for each of its PROMO_SUB sub-frames (default 4), draws the overlay
// (lib/overlay.js), takes a screenshot and steps the clock; ffmpeg averages each frame's sub-frames
// into one (motion blur). The page may not touch the network: any http(s) request fails the run.
// node promo/record.mjs [--scene <name>]      PROMO_SUB=1 for quick, unblurred frames
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, connect, stop, extensionId, closePages, sleep } from './lib/cdp.mjs';
import { ffmpeg } from './lib/ffmpeg.mjs';
import { easeInOutCubic, lerp, pathAt } from './lib/motion.mjs';
import { FPS, sceneStarts } from './timeline.mjs';
import { buildState } from './fixtures/state.mjs';
import { buildCache } from './fixtures/cache.mjs';
import { iconMap } from './fixtures/icons.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const EXTENSION = join(HERE, '..');
export const OUT = join(HERE, 'out');
export const FRAMES = join(OUT, 'frames');
const SUBFRAMES = join(OUT, 'sub');
// What the page's clock reads as the video starts: Tue 20 Oct 2026, 09:41 local time.
export const EPOCH = new Date(2026, 9, 20, 9, 41, 0).getTime();
const SUB = Math.max(1, Number(process.env.PROMO_SUB ?? 4));
const PORT = 9479;
const SIZE = { width: 1920, height: 1080 };
// A widget is ready once it shows this (by its frame's data-type).
const MARKERS = { markets: '.mk-row', github: '.gh-heatmap-grid', sports: '.sp-list', weather: '.wx-now', tiles: '.tile' };

const lib = name => readFileSync(join(HERE, 'lib', name), 'utf8');
const pad = (n, width) => String(n).padStart(width, '0');

async function waitFor(page, expression, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await page.eval(expression).catch(() => false)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

// Writes the demo page into the extension's storage from one of its own pages that doesn't start
// the app. Every new tab is closed first: an open one would save its own state over this.
async function seed(cdp, extId, state) {
  await closePages(cdp);
  const { targetId } = await cdp.send('Target.createTarget', { url: `chrome-extension://${extId}/fonts/nunito-OFL.txt` });
  const page = await cdp.attach(targetId);
  await waitFor(page, `document.readyState === 'complete'`);
  const data = { state, cache: buildCache(EPOCH), icons: iconMap() };
  await page.eval(`(async ({ state, cache, icons }) => {
    localStorage.clear();
    for (const [key, entry] of Object.entries(cache)) localStorage.setItem('newtab:cache:' + key, JSON.stringify(entry));
    localStorage.setItem('newtab:state', JSON.stringify(state));
    localStorage.setItem('newtab:icon-copy', JSON.stringify(icons));
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ state, icons });
  })(${JSON.stringify(data)})`);
  await cdp.send('Target.closeTarget', { targetId });
}

// Waits until every widget shows its content and fonts and images are in; fails on a widget
// showing a note (an error or an empty state).
async function ready(page, scene) {
  const deadline = Date.now() + 20000;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.eval(`(() => {
      const markers = ${JSON.stringify(MARKERS)};
      const frames = [...document.querySelectorAll('#canvas .widget-frame')];
      return {
        frames: frames.length,
        waiting: frames.filter(f => markers[f.dataset.type] && !f.querySelector(markers[f.dataset.type])).map(f => f.dataset.type),
        notes: [...document.querySelectorAll('#canvas .widget-note')].filter(n => n.offsetParent).map(n => n.textContent.trim()),
        images: [...document.images].every(i => i.complete),
        fonts: document.fonts.status,
      };
    })()`).catch(() => null);
    if (last?.frames && !last.waiting.length && last.images && last.fonts === 'loaded') {
      if (last.notes.length) throw new Error(`Shot "${scene.name}": a widget shows "${last.notes.join('" and "')}"`);
      await sleep(800);   // entrance transitions run on real time until the clock is held
      return;
    }
    await sleep(200);
  }
  throw new Error(`Shot "${scene.name}" never got ready: ${JSON.stringify(last)}`);
}

async function click(page, sel) {
  const p = await page.eval(`(() => {
    const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1 });
}

// Where the shot's pointer is at each frame, sent to the page as real mouse events, so hovers,
// Layout mode's drags and the letter field all react. step(f) returns { x, y, down }, or null when
// the shot has no pointer or it has gone.
class Pointer {
  constructor(page, scene) {
    this.page = page;
    this.scene = scene;
    this.keys = null;   // the cursor keys, selectors resolved to points
    this.at = null;     // the last position sent
    this.drag = null;   // the running drag's start and end points
    this.glide = null;  // keys from the last drop to where the next drag starts
  }

  async point(sel) {
    const p = await this.page.eval(`(() => {
      const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!p) throw new Error(`Shot "${this.scene.name}": nothing on the page matches ${sel}`);
    return p;
  }

  // One grid cell in screen pixels, as js/edit-mode.js's cellPitch measures it.
  pitch() {
    return this.page.eval(`(() => {
      const root = document.getElementById('canvas');
      const cs = getComputedStyle(root);
      const r = root.getBoundingClientRect();
      return {
        x: (r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + parseFloat(cs.columnGap)) / 12,
        y: (r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) + parseFloat(cs.rowGap)) / 12,
      };
    })()`);
  }

  send(type, p, down) {
    return this.page.send('Input.dispatchMouseEvent', {
      type, x: p.x, y: p.y,
      button: type === 'mouseMoved' && !down ? 'none' : 'left',
      buttons: down ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
    });
  }

  async step(f) {
    const { cursor, drags = [], clicks = [] } = this.scene;
    if (!cursor && !drags.length) return null;
    if (cursor?.some(k => k.hide && f >= k.f)) return null;
    let pos;
    let down = false;
    const d = drags.find(x => f >= x.from && f <= x.to);
    if (d) {
      if (f === d.from) {
        const start = await this.point(d.sel);
        let end;
        if (d.onto) {
          end = await this.point(d.onto);
        } else {
          const cell = await this.pitch();
          end = { x: start.x + d.by[0] * cell.x, y: start.y + d.by[1] * cell.y };
        }
        this.drag = { start, end };
        if (!this.at || this.at.x !== start.x || this.at.y !== start.y) await this.send('mouseMoved', start, false);
        await this.send('mousePressed', start, true);
      }
      const k = easeInOutCubic((f - d.from) / (d.to - d.from));
      pos = { x: lerp(this.drag.start.x, this.drag.end.x, k), y: lerp(this.drag.start.y, this.drag.end.y, k) };
      await this.send('mouseMoved', pos, true);
      down = true;
      if (f === d.to) {
        await this.send('mouseReleased', pos, false);
        down = false;
        this.glide = null;
      }
    } else {
      const coming = drags.find(x => x.from > f);
      if (coming) {
        // Between drags: glide to where the next one starts (its widget may have moved).
        if (!this.glide) {
          const to = await this.point(coming.sel);
          this.glide = [{ f: f - 1, ...(this.at ?? to) }, { f: coming.from, ...to }];
        }
        pos = pathAt(this.glide, f);
      } else if (cursor) {
        this.keys ??= await Promise.all(cursor.map(async k => ({ f: k.f, ...(k.sel ? await this.point(k.sel) : { x: k.x, y: k.y }) })));
        pos = pathAt(this.keys, f);
      } else {
        pos = this.at;
      }
      if (pos && (!this.at || pos.x !== this.at.x || pos.y !== this.at.y)) await this.send('mouseMoved', pos, false);
    }
    if (pos && clicks.includes(f)) {
      await this.send('mousePressed', pos, true);
      await this.send('mouseReleased', pos, false);
    }
    this.at = pos;
    return pos ? { x: pos.x, y: pos.y, down } : null;
  }
}

// Averages each frame's sub-frames (written as sub/NNNNN.jpg, from 0) into frames/NNNN.jpg from
// the shot's first frame.
function blend(scene) {
  ffmpeg(['-y', '-loglevel', 'error', '-framerate', String(FPS * SUB), '-start_number', '0', '-i', join(SUBFRAMES, '%05d.jpg'),
    '-vf', `tmix=frames=${SUB},select='eq(mod(n,${SUB}),${SUB - 1})'`, '-fps_mode', 'passthrough', '-q:v', '2',
    '-start_number', String(scene.start), join(FRAMES, '%04d.jpg')]);
  const made = readdirSync(FRAMES).filter(n => n.endsWith('.jpg') && Number(n.slice(0, 4)) >= scene.start && Number(n.slice(0, 4)) < scene.start + scene.frames).length;
  if (made !== scene.frames) throw new Error(`Shot "${scene.name}": blending made ${made} frames, expected ${scene.frames}`);
}

async function recordScene(cdp, extId, scene, { vclock, overlay }) {
  await seed(cdp, extId, buildState({ activeGroup: scene.group }));
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const page = await cdp.attach(targetId);
  const asked = new Set();
  page.on('Fetch.requestPaused', p => {
    asked.add(p.request.url);
    page.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: 'http*' }] });
  await page.send('Page.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: vclock });
  await page.send('Emulation.setDeviceMetricsOverride', { ...SIZE, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: 'chrome://newtab/' });
  await ready(page, scene);
  if (scene.layoutMode) {
    await click(page, '#btn-layout');
    await sleep(600);
  }
  await page.eval(overlay);
  await page.eval('__vclock.hold()');
  await page.eval(`__promo.setup(${JSON.stringify(scene)})`);
  rmSync(SUBFRAMES, { recursive: true, force: true });
  mkdirSync(SUBFRAMES, { recursive: true });
  const pointer = new Pointer(page, scene);
  for (let f = 0; f < scene.frames; f++) {
    const at = await pointer.step(f);
    for (let s = 0; s < SUB; s++) {
      await page.eval(`__promo.render(${f + s / SUB}, ${JSON.stringify(at)})`);
      const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      const file = SUB === 1 ? join(FRAMES, `${pad(scene.start + f, 4)}.jpg`) : join(SUBFRAMES, `${pad(f * SUB + s, 5)}.jpg`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      await page.eval(`__vclock.step(${1000 / FPS / SUB})`);
    }
  }
  await cdp.send('Target.closeTarget', { targetId });
  if (asked.size) throw new Error(`Shot "${scene.name}" asked the network for (give it a cache entry in fixtures/cache.mjs):\n  ${[...asked].join('\n  ')}`);
  if (SUB > 1) blend(scene);
  rmSync(SUBFRAMES, { recursive: true, force: true });
  console.log(`${scene.name}: frames ${scene.start}–${scene.start + scene.frames - 1}`);
}

export async function record({ only = null } = {}) {
  const scenes = sceneStarts().filter(s => !only || s.name === only);
  if (!scenes.length) throw new Error(`No shot named "${only}" in timeline.mjs`);
  if (!only) rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  const profile = join(OUT, 'profile');
  // A Chromium that just closed may hold the profile for a moment longer on Windows.
  rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  const { proc, wsUrl } = await launch({ ext: EXTENSION, profile, port: PORT, ...SIZE });
  const cdp = await connect(wsUrl);
  try {
    const extId = await extensionId(cdp, 'New Tab');
    const scripts = {
      vclock: lib('vclock.js').replace('__EPOCH__', String(EPOCH)),
      overlay: `${lib('motion.mjs').replace(/^export /gm, '')}\n${lib('overlay.js')}`,
    };
    for (const scene of scenes) await recordScene(cdp, extId, scene, scripts);
  } finally {
    cdp.close();
    await stop(proc);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--scene');
  await record({ only: i > 0 ? process.argv[i + 1] : null });
}
