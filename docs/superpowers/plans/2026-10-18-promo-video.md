# Promo Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command (`node promo/build.mjs`) records a 16-second, 1920×1080 promo video of the New
Tab extension. The text is built into the picture and an original beat comes from code.

**Architecture:**
- Playwright's Chromium loads the unpacked extension headless. The recorder seeds made-up state and
  widget caches into the extension's storage, so no widget touches the network.
- The recorder injects a virtual clock and an overlay, then captures each frame as a screenshot
  after stepping the clock 1/30 s.
- numpy writes the beat. The bundled ffmpeg from imageio-ffmpeg joins frames and beat into an MP4,
  checks it, and makes a contact sheet.

**Tech Stack:** Node 22 (built-in WebSocket and CDP, `node --test`), Python 3.13 with numpy and
imageio-ffmpeg (ffmpeg 7.1, already installed), Playwright's Chromium
(`%LOCALAPPDATA%\ms-playwright\chromium-*`), simple-icons@15.0.0 SVGs (CC0).

Spec: `docs/superpowers/specs/2026-10-18-promo-video-design.md`.

> **Revision 2 (2026-10-18, after the user chose the SaaS-film style in the GitHub theme with the
> blue accent).** The spec supersedes the numbers below: 22 s, 660 frames, and the shot list in its
> Timeline. This plan is being run inline by the same session, so the revised code goes straight
> into the files. These tasks change:
> - **Task 1.** The scenes become the spec's nine shots, with `stage`, `camera` keyframes,
>   `float`, `brackets`, `logo`, `curves` and typed cues.
>   - `timeline.mjs` also exports `CHAR_FRAMES` and `musicCues()` → `{ length, bpm, kickFrom,
>     breakAt, drop, cuts, typing }`.
>   - Tests: 660 frames, cues on beats except the typed line, and the cues match the shots.
> - **Task 2.** `buildState` also seeds `prefs.theme = 'github'` and `prefs.accent = '#2563eb'`.
> - **Task 3.**
>   - `music.py` becomes `render(cues)` with the airy arrangement in the spec, reading
>     `--cues <json>`.
>   - The tests get their cues from `musicCues()` through `node`, and check the kicks on the beat
>     grid, the drop on the end card, a tick on each typed character, and the length.
> - **Task 4.** `vclock` gets `step(ms)`, and animations are set by the virtual time elapsed since
>   first seen (any step size). Tested.
> - **Task 5.**
>   - `overlay.js` is rewritten for the new look.
>   - `record.mjs` captures `PROMO_SUB` (default 4) sub-frames per frame and blends each scene
>     with ffmpeg `tmix`.
>   - ffmpeg helpers move to `lib/ffmpeg.mjs`.
>   - Cursor keys may `hide`, and the drawn cursor is an arrow.
> - **Task 6.** `build.mjs` passes `musicCues()` to `music.py` and checks for 660 frames and 22 s.

## Global Constraints

**Output**
- `promo/out/new-tab-promo.mp4`: 1920×1080, 30 fps, H.264 (CRF 18), AAC 192 kbps.
- Exactly 16.000 s, which is 480 frames. `promo/out/` is gitignored.

**Timing and look**
- 120 BPM: a beat is 15 frames and a bar is 60 frames. Every cut, headline, click and drag starts on a beat.
- The page clock reads Tue 20 Oct 2026, 09:41 (local time) when the video starts.
- Headlines are Nunito 900, white, with the key word in the accent `#d97757`. They slam in from
  scale 1.35 to 1 over 180 ms with overshoot.
- Spotlight: the rest of the page dims to 55%.
- Each scene opens with a 150 ms zoom punch (1.06 to 1), except the Layout mode scene.
- Music is mastered to −14 LUFS (ffmpeg `loudnorm`) and fades out over the last 0.5 s. The picture
  fades to black over the same 0.5 s.

**Data and network**
- Every value on screen is made up: none of the user's tiles, names or tokens.
- Any http(s) request from the page fails the run.

**Scope**
- Nothing changes outside `promo/`, except one `.gitignore` line and the docs.
- No demo mode goes into the extension.

**Working rules**
- Work in the worktree `C:/Users/nivb4/OneDrive/Desktop/new-tab/.claude/worktrees/promo-video`
  (branch `promo-video`). Run every command from there.
- Inside the worktree, use plain single commands: no `cd` chains, no `$(...)` as a command.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Files

| File | Does |
| --- | --- |
| `promo/timeline.mjs` | The scenes as data: frames, headlines, pointer moves, clicks, drags, camera. Frame math. |
| `promo/lib/motion.mjs` | Easing and pointer paths. Shared by Node and the page (injected with `export` stripped). |
| `promo/fixtures/icons/*.svg` | simple-icons glyphs for the tiles. |
| `promo/fixtures/icons.mjs` | Tile logos as rounded-square SVG data URLs. |
| `promo/fixtures/state.mjs` | The demo page's saved state: tiles, folder, groups, layouts. |
| `promo/fixtures/cache.mjs` | Every widget cache entry, dated at the video clock. |
| `promo/music.py` | The beat, written as a WAV. |
| `promo/lib/vclock.js` | Injected clock: virtual `performance.now`, `Date`, timers and rAF, paused CSS animations. |
| `promo/lib/cdp.mjs` | CDP client, Chromium launch and stop, extension id, closing pages. |
| `promo/lib/overlay.js` | Injected layer: headlines, spotlight, camera, cursor, effects, fade. |
| `promo/record.mjs` | Seeds, opens and records each scene's frames. |
| `promo/build.mjs` | Music, then frames, then MP4, checks and contact sheet. |
| `promo/README.md` | How to run it. |
| `promo/test/*.test.mjs`, `promo/test/test_music.py` | Tests. |

---

### Task 1: Timeline and motion

**Files:**
- Create: `promo/timeline.mjs`, `promo/lib/motion.mjs`
- Test: `promo/test/timeline.test.mjs`, `promo/test/motion.test.mjs`
- Modify: `.gitignore` (append one line)

**Interfaces:**
- Produces:
  - `FPS` = 30, `BPM` = 120, `BEAT` = 15, `BAR` = 60.
  - `SCENES`: an array of scene objects (fields documented in the file).
  - `TOTAL_FRAMES` = 480.
  - `sceneStarts()`: returns the scenes, each with `start` (its first global frame).
  - From `motion.mjs`: `clamp01(v)`, `lerp(a, b, k)`, `easeOutCubic(k)`, `easeInOutCubic(k)`,
    `easeOutBack(k)`, and `pathAt(keys, f)` → `{ x, y }`.

- [ ] **Step 1: Write the failing tests**

`promo/test/motion.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeOutBack, easeInOutCubic, easeOutCubic, pathAt } from '../lib/motion.mjs';

test('eases start at 0 and end at 1', () => {
  for (const ease of [easeOutBack, easeInOutCubic, easeOutCubic]) {
    assert.equal(ease(0), 0);
    assert.ok(Math.abs(ease(1) - 1) < 1e-9);
  }
});

test('easeOutBack overshoots before it settles', () => {
  assert.ok(Math.max(...Array.from({ length: 21 }, (_, i) => easeOutBack(i / 20))) > 1.05);
});

test('eases hold outside 0..1', () => {
  assert.equal(easeOutCubic(-1), 0);
  assert.equal(easeOutCubic(2), 1);
});

test('pathAt holds before the first key and after the last, and eases between', () => {
  const keys = [{ f: 10, x: 0, y: 0 }, { f: 20, x: 100, y: 50 }];
  assert.deepEqual(pathAt(keys, 0), { x: 0, y: 0 });
  assert.deepEqual(pathAt(keys, 30), { x: 100, y: 50 });
  assert.deepEqual(pathAt(keys, 15), { x: 50, y: 25 });
});

test('pathAt copes with two keys on one frame', () => {
  assert.deepEqual(pathAt([{ f: 5, x: 0, y: 0 }, { f: 5, x: 9, y: 9 }, { f: 9, x: 9, y: 9 }], 7), { x: 9, y: 9 });
});
```

`promo/test/timeline.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, TOTAL_FRAMES, BEAT, BAR, FPS, sceneStarts } from '../timeline.mjs';

test('the video is 16 s at 30 fps', () => {
  assert.equal(TOTAL_FRAMES, 480);
  assert.equal(TOTAL_FRAMES / FPS, 16);
});

test('every cut lands on a beat, and every bar-long scene on a bar', () => {
  for (const s of sceneStarts()) {
    assert.equal(s.start % BEAT, 0, s.name);
    if (s.frames % BAR === 0) assert.equal(s.start % BAR, 0, s.name);
  }
});

test('headlines, clicks and drags start on beats, inside their scene', () => {
  for (const s of sceneStarts()) {
    for (const w of s.words) {
      assert.equal((s.start + w.f) % BEAT, 0, `${s.name}: ${w.text}`);
      assert.ok(w.f >= 0 && w.f < s.frames, `${s.name}: ${w.text}`);
    }
    for (const c of s.clicks ?? []) assert.equal(c % BEAT, 0, s.name);
    for (const d of s.drags ?? []) {
      assert.equal(d.from % BEAT, 0, s.name);
      assert.ok(d.to > d.from && d.to < s.frames, s.name);
    }
  }
});

test('the end card starts at 12 s, on the music\'s drop', () => {
  assert.equal(sceneStarts().find(s => s.name === 'end').start, 12 * FPS);
});

test('scene names are unique', () => {
  assert.equal(new Set(SCENES.map(s => s.name)).size, SCENES.length);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test "promo/test/*.test.mjs"`
Expected: FAIL, because `Cannot find module '.../promo/lib/motion.mjs'` and `.../promo/timeline.mjs`.

- [ ] **Step 3: Write `promo/lib/motion.mjs`**

```js
// Easing and pointer paths for the promo, used by the recorder (Node) and by the overlay in the page
// (record.mjs injects this file with its `export`s stripped, so keep to plain top-level
// declarations).

export const clamp01 = v => Math.min(1, Math.max(0, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeOutCubic = k => 1 - (1 - clamp01(k)) ** 3;

export function easeInOutCubic(k) {
  const x = clamp01(k);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
}

// Overshoots past 1 and settles back: the headline slam.
export function easeOutBack(k, s = 1.70158) {
  const x = clamp01(k) - 1;
  return 1 + (s + 1) * x ** 3 + s * x ** 2;
}

// The point at frame f along keys [{ f, x, y }] sorted by f: eased between neighbours, held before
// the first key and after the last.
export function pathAt(keys, f) {
  if (f <= keys[0].f) return { x: keys[0].x, y: keys[0].y };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (f > b.f) continue;
    const k = b.f === a.f ? 1 : easeInOutCubic((f - a.f) / (b.f - a.f));
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
  }
  const last = keys.at(-1);
  return { x: last.x, y: last.y };
}
```

- [ ] **Step 4: Write `promo/timeline.mjs`**

```js
// The promo, scene by scene: 16 s at 30 fps, cut to a 120 BPM beat (a beat is 15 frames, a bar 60).

export const FPS = 30;
export const BPM = 120;
export const BEAT = (FPS * 60) / BPM;
export const BAR = 4 * BEAT;

const frame = type => `.widget-frame.frame-${type}`;
const copy = id => `.widget-frame[data-id="${id}"]`;

// Each scene: name; frames, its length. Optional:
//   group      the tab the page opens on (fixtures/state.mjs)
//   layoutMode opened in Layout mode
//   bare       only the letter background shows
//   still      no zoom punch on the cut
//   spot       selectors of what's lit, the first on the page wins; the rest dims
//   focus/zoom what the camera centres (default: the first spot) and how close
//   side       where the headline sits: 'left', 'right' or 'center'; the camera puts the subject
//              on the other side
//   words      headline cues { f, text, sub?, icon? }; *starred* text is in the accent colour
//   cursor     pointer keys { f, x, y } or { f, sel } (the centre of that element)
//   dot        draw the pointer (it moves the page's own hover and letter field either way)
//   clicks     frames that click where the pointer is
//   drags      { from, to, sel, by: [cols, rows] } or { from, to, sel, onto: selector }
//   fx         'sparklines' (Markets lines draw in) or 'heatmap' (the GitHub map fills in)
//   fadeOut    ends on black over the last 15 frames
export const SCENES = [
  {
    name: 'hook', frames: BAR, bare: true, side: 'center', dot: true,
    words: [{ f: BEAT, text: 'Your *new tab.*' }],
    cursor: [{ f: 0, x: 300, y: 820 }, { f: BEAT, x: 820, y: 560 }, { f: BAR - 1, x: 1650, y: 330 }],
    clicks: [BEAT],
  },
  {
    name: 'tiles', frames: BAR, side: 'left', dot: true,
    spot: ['.folder-dlg[open]', frame('tiles')],
    words: [{ f: 0, text: 'One *click.*' }],
    cursor: [{ f: 0, x: 1500, y: 930 }, { f: 12, sel: '.tile.tile-folder[data-id="f-ai"]' }],
    clicks: [BEAT],
  },
  {
    name: 'layout', frames: BAR, group: 'g-work', layoutMode: true, still: true, side: 'left', dot: true,
    words: [{ f: 0, text: '*Drag.*' }, { f: BEAT, text: '*Resize.*' }, { f: 2 * BEAT, text: '*Stack.*' }],
    drags: [
      { from: 0, to: 11, sel: copy('w2-weather'), by: [2, 4] },
      { from: BEAT, to: BEAT + 11, sel: `${copy('w2-weather')} > .frame-handle.e`, by: [2, 0] },
      { from: 2 * BEAT, to: 2 * BEAT + 13, sel: copy('w2-sports'), onto: copy('w2-weather') },
    ],
  },
  {
    name: 'markets', frames: BAR, spot: [frame('markets')], zoom: 1.35, side: 'right', fx: 'sparklines',
    words: [{ f: 0, text: 'Live *markets.*' }],
  },
  {
    name: 'github', frames: BAR, spot: [frame('github')], focus: `${frame('github')} .gh-heatmap`, zoom: 1.6,
    side: 'left', fx: 'heatmap',
    words: [{ f: 0, text: 'Your *GitHub.*' }],
  },
  { name: 'sports', frames: 2 * BEAT, spot: [frame('sports')], zoom: 1.45, side: 'right', words: [{ f: 0, text: '*Scores.*' }] },
  { name: 'weather', frames: 2 * BEAT, spot: [frame('weather')], zoom: 1.45, side: 'left', words: [{ f: 0, text: '*Weather.*' }] },
  {
    name: 'end', frames: 2 * BAR, bare: true, side: 'center', fadeOut: true,
    words: [{ f: 0, text: 'New Tab', icon: true }, { f: 2 * BEAT, text: '*Free for Chrome*', sub: true }],
    cursor: [{ f: 0, x: 260, y: 300 }, { f: BAR, x: 1000, y: 800 }, { f: 2 * BAR - 1, x: 1700, y: 420 }],
    clicks: [0],
  },
];

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0);

// The scenes with start, each one's first frame in the whole video.
export function sceneStarts() {
  let at = 0;
  return SCENES.map(s => {
    const start = at;
    at += s.frames;
    return { ...s, start };
  });
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test "promo/test/*.test.mjs"`
Expected: PASS, 10 tests.

- [ ] **Step 6: Ignore the output folder**

Append this line to `.gitignore` with the Edit tool:

```
# the promo video's frames, music and render (promo/build.mjs)
promo/out/
```

- [ ] **Step 7: Commit**

```bash
git add promo/timeline.mjs promo/lib/motion.mjs promo/test/timeline.test.mjs promo/test/motion.test.mjs .gitignore
git commit -m "feat: promo: the video's timeline on a 120 BPM grid, and easing for the overlay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Demo fixtures (state, logos, widget caches)

**Files:**
- Create: `promo/fixtures/icons/<slug>.svg` (13 files, downloaded), `promo/fixtures/icons.mjs`,
  `promo/fixtures/state.mjs`, `promo/fixtures/cache.mjs`
- Test: `promo/test/fixtures.test.mjs`

**Interfaces:**
- Consumes (the app's own pure modules, safe to import in Node):
  - `normalizeState` from `js/store.js`
  - `scoreboards` from `js/sports.js`
  - `placeKey` from `js/weather.js`
  - `fxCurrencies` from `js/feeds.js`
- Produces:
  - `iconMap()` → `{ [iconUrl]: dataUrl }`, and `iconUrl(slug)`.
  - `buildState({ activeGroup? })` → a normalized state. Also exports `USER`, `PLACE`, `MARKETS`,
    `FOLLOW`, `HOME` (`'g-home'`) and `WORK` (`'g-work'`).
  - `buildCache(epoch)` → `{ [key without 'newtab:cache:']: { at, data, via? } }`.

These cache formats were captured from the live widgets on 2026-10-18, by running the extension and
reading `newtab:cache:*`:
- `ticker:BTCUSDT` → `{ price, change }` (change is a fraction).
- `kline:BTCUSDT` → 24 closing prices.
- `cnbc:quotes:GOLD,QQQ,SPY` (ids sorted) → `{ '@GC.1': { price, change, name, time }, QQQ: …, SPY: … }`.
- `cnbc:session:SPY` → about 39 prices.
- `fx:EUR:ILS,USD` → `{ base: 'EUR', rates: { 'YYYY-MM-DD': { ILS, USD } } }`.
- `github-stats:<user>` → `{ followers, repos, stars }`.
- `github-cal:<user>` → `{ total, days: [{ date, level, count }] × 371 }`.
- `github-v8:<user>:public` → `{ commits: [{ sha, message, repo, url, at, private }], repos: [{ repo, url, at, private }], pulls: [{ title, number, url, repo, updatedAt, draft }], reviews, issues, tokenInfo: null }`.
- Sports keys:
  - `sports-v1:team:nba:13`, `sports-v1:soccer:20232:next` and `…:last` → events
    `{ id, sport, league, tag, start, timeValid, state, detail, off, home, away, tv, url }`, where
    `home` and `away` are `{ id, abbr, name, logo, score, winner }`.
  - `sports-v1:f1:season` → `{ id, sport: 'f1', tag, session, season, round, title, start, timeValid, minutes, state, url }`.
  - `sports-v1:live:<path>:<ET day>` → the live events.
- `weather-v1:32.08,34.78` → `{ offset, now: { at, temp, feels, humidity, wind, code, isDay }, hours: [{ at, temp, code, rain, isDay }], days: [{ date, code, max, min, rain, sunrise, sunset }] }`.

- [ ] **Step 1: Download the logos (simple-icons 15.0.0, CC0)**

Run each of these, one per command:
```bash
mkdir -p promo/fixtures/icons
curl -sfL -o promo/fixtures/icons/github.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/github.svg
curl -sfL -o promo/fixtures/icons/youtube.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/youtube.svg
curl -sfL -o promo/fixtures/icons/gmail.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/gmail.svg
curl -sfL -o promo/fixtures/icons/notion.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/notion.svg
curl -sfL -o promo/fixtures/icons/figma.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/figma.svg
curl -sfL -o promo/fixtures/icons/reddit.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/reddit.svg
curl -sfL -o promo/fixtures/icons/spotify.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/spotify.svg
curl -sfL -o promo/fixtures/icons/netflix.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/netflix.svg
curl -sfL -o promo/fixtures/icons/linear.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/linear.svg
curl -sfL -o promo/fixtures/icons/claude.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/claude.svg
curl -sfL -o promo/fixtures/icons/openai.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/openai.svg
curl -sfL -o promo/fixtures/icons/googlegemini.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/googlegemini.svg
curl -sfL -o promo/fixtures/icons/perplexity.svg https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/perplexity.svg
```
Check: `grep -c '<path d=' promo/fixtures/icons/*.svg` prints `1` or more for each of the 13 files.

- [ ] **Step 2: Write the failing test** (`promo/test/fixtures.test.mjs`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildState, WORK, USER } from '../fixtures/state.mjs';
import { buildCache } from '../fixtures/cache.mjs';
import { iconMap } from '../fixtures/icons.mjs';
import { scoreboards } from '../../js/sports.js';

const EPOCH = new Date(2026, 9, 20, 9, 41).getTime();

test('the demo state keeps every widget and tile through normalizing', () => {
  const s = buildState();
  assert.deepEqual(s.prefs.layout.widgets.map(w => w.id).sort(),
    ['w-clock', 'w-github', 'w-markets', 'w-search', 'w-sports', 'w-tiles', 'w-weather']);
  assert.deepEqual(s.prefs.layouts[WORK].widgets.map(w => w.id).sort(),
    ['w2-clock', 'w2-markets', 'w2-search', 'w2-sports', 'w2-weather']);
  assert.equal(s.tiles.length, 14);
  assert.equal(s.tiles.filter(t => t.folderId === 'f-ai').length, 4);
  assert.equal(s.prefs.github.user, USER);
  assert.equal(s.onboarding.done, true);
  assert.equal(s.groups[0].id, s.activeGroupId);
});

test('the layout scene opens on Work', () => {
  assert.equal(buildState({ activeGroup: WORK }).activeGroupId, WORK);
});

test('every tile logo has a saved image', () => {
  const icons = iconMap();
  for (const t of buildState().tiles.filter(t => t.kind !== 'folder')) {
    assert.match(icons[t.icon] ?? '', /^data:image\/svg\+xml;base64,/, t.title);
  }
});

test('every cache entry is dated at the video clock', () => {
  for (const [key, entry] of Object.entries(buildCache(EPOCH))) assert.equal(entry.at, EPOCH, key);
});

test('markets all go up', () => {
  const c = buildCache(EPOCH);
  for (const coin of ['BTC', 'ETH', 'SOL']) {
    assert.ok(c[`ticker:${coin}USDT`].data.change > 0, coin);
    const line = c[`kline:${coin}USDT`].data;
    assert.equal(line.length, 24);
    assert.ok(line.at(-1) > line[0], coin);
  }
  for (const id of ['SPY', 'QQQ', 'GOLD']) {
    const line = c[`cnbc:session:${id}`].data;
    assert.ok(line.at(-1) > line[0], id);
  }
  for (const q of Object.values(c['cnbc:quotes:GOLD,QQQ,SPY'].data)) assert.ok(q.change > 0, q.name);
  const days = Object.values(c['fx:EUR:ILS,USD'].data.rates);
  assert.equal(days.length, 10);
  assert.ok(days.at(-1).ILS > days[0].ILS);
});

test('the contribution map is a full year ending today', () => {
  const cal = buildCache(EPOCH)[`github-cal:${USER}`].data;
  assert.equal(cal.days.length, 371);
  assert.equal(cal.days.at(-1).date, '2026-10-20');
  assert.equal(cal.total, cal.days.reduce((n, d) => n + d.count, 0));
  assert.ok(cal.days.filter(d => d.level >= 3).length > 100);
});

test('a Lakers game is live and its scoreboard is saved', () => {
  const c = buildCache(EPOCH);
  const events = c['sports-v1:team:nba:13'].data;
  const live = events.find(e => e.state === 'in');
  assert.ok(live);
  const boards = scoreboards(events, EPOCH);
  assert.equal(boards.length, 1);
  assert.ok(c[`sports-v1:live:${boards[0].path}:${boards[0].day}`].data.some(e => e.id === live.id));
});

test('the weather starts this hour and has a week', () => {
  const wx = buildCache(EPOCH)['weather-v1:32.08,34.78'].data;
  assert.ok(wx.now.at <= EPOCH && EPOCH - wx.now.at < 3600e3);
  assert.equal(wx.hours[0].at, wx.now.at);
  assert.equal(wx.days.length, 7);
  assert.equal(wx.days[0].date, '2026-10-20');
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --test promo/test/fixtures.test.mjs`
Expected: FAIL with `Cannot find module '.../promo/fixtures/state.mjs'`.

- [ ] **Step 4: Write `promo/fixtures/icons.mjs`**

```js
// The tiles' logos: a simple-icons glyph (simple-icons@15.0.0, CC0, in ./icons) in white on the
// brand's colour, as a rounded square like an app icon. Saved under made-up links, so the page
// shows them from its icon store and never fetches them.
import { readFileSync } from 'node:fs';

export const LOGOS = {
  github: '#24292f', youtube: '#ff0000', gmail: '#ea4335', notion: '#191919', figma: '#f24e1e',
  reddit: '#ff4500', spotify: '#1db954', netflix: '#e50914', linear: '#5e6ad2', claude: '#d97757',
  openai: '#10a37f', googlegemini: '#8e75b2', perplexity: '#1f8a99',
};

export const iconUrl = slug => `https://promo.invalid/icons/${slug}.svg`;

export function badge(slug, color) {
  const svg = readFileSync(new URL(`./icons/${slug}.svg`, import.meta.url), 'utf8');
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map(m => `<path d="${m[1]}"/>`).join('');
  const out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    + `<rect width="64" height="64" rx="15" fill="${color}"/>`
    + `<g transform="translate(16 16) scale(1.3333)" fill="#fff">${paths}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(out).toString('base64')}`;
}

export const iconMap = () => Object.fromEntries(Object.entries(LOGOS).map(([slug, color]) => [iconUrl(slug), badge(slug, color)]));
```

- [ ] **Step 5: Write `promo/fixtures/state.mjs`**

```js
// The demo page's saved state: tiles for well-known sites with an AI folder, and every widget the
// video shows. Home is the page most scenes show; Work has room to move widgets for the Layout mode
// scene.
import { normalizeState } from '../../js/store.js';
import { iconUrl } from './icons.mjs';

export const USER = 'alexdev';
export const PLACE = { name: 'Tel Aviv', region: 'Tel Aviv District', country: 'Israel', lat: 32.08, lon: 34.78 };
export const MARKETS = ['#Crypto', 'BTC', 'ETH', 'SOL', '#Stocks', 'SPY', 'QQQ', 'GOLD', 'USD/ILS'];
export const FOLLOW = ['nba:13', 'soccer:20232', 'f1'];
export const HOME = 'g-home';
export const WORK = 'g-work';

const SITES = [
  ['github', 'GitHub', 'https://github.com/'],
  ['youtube', 'YouTube', 'https://www.youtube.com/'],
  ['gmail', 'Gmail', 'https://mail.google.com/'],
  ['notion', 'Notion', 'https://www.notion.so/'],
  ['figma', 'Figma', 'https://www.figma.com/'],
  ['reddit', 'Reddit', 'https://www.reddit.com/'],
  ['spotify', 'Spotify', 'https://open.spotify.com/'],
  ['netflix', 'Netflix', 'https://www.netflix.com/'],
  ['linear', 'Linear', 'https://linear.app/'],
];
const AI = [
  ['claude', 'Claude', 'https://claude.ai/'],
  ['openai', 'ChatGPT', 'https://chatgpt.com/'],
  ['googlegemini', 'Gemini', 'https://gemini.google.com/'],
  ['perplexity', 'Perplexity', 'https://www.perplexity.ai/'],
];

const SETTINGS = {
  clock: { hour24: true, name: 'Alex', greeting: true, face: 'classic', colon: true },
  markets: { items: MARKETS },
  github: { parts: ['stats', 'heatmap', 'pulls', 'commits'] },
  sports: { follow: FOLLOW },
  weather: { place: PLACE, unit: 'c' },
  tiles: { group: null, columns: 5 },
  search: {},
};

const tile = ([slug, title, url], extra = {}) => ({ id: `t-${slug}`, groupId: HOME, title, url, icon: iconUrl(slug), ...extra });
const widget = (id, type, x, y, w, h) => ({ id, type, x, y, w, h, settings: SETTINGS[type] });

// activeGroup: the tab the page opens on.
export function buildState({ activeGroup = HOME } = {}) {
  return normalizeState({
    version: 1,
    groups: [{ id: HOME, title: 'Home' }, { id: WORK, title: 'Work' }],
    tiles: [
      ...SITES.map(site => tile(site)),
      { id: 'f-ai', groupId: HOME, title: 'AI', url: '', icon: '', kind: 'folder' },
      ...AI.map(site => tile(site, { folderId: 'f-ai' })),
    ],
    activeGroupId: activeGroup,
    onboarding: { done: true, step: 'done' },
    prefs: {
      github: { user: USER, token: '' },
      layout: {
        cols: 12, rows: 12, widgets: [
          widget('w-clock', 'clock', 0, 0, 3, 4),
          widget('w-markets', 'markets', 0, 4, 3, 8),
          widget('w-search', 'search', 3, 0, 6, 1),
          widget('w-tiles', 'tiles', 3, 1, 6, 5),
          widget('w-sports', 'sports', 3, 6, 3, 6),
          widget('w-weather', 'weather', 6, 6, 3, 6),
          widget('w-github', 'github', 9, 0, 3, 12),
        ],
      },
      layouts: {
        [WORK]: {
          cols: 12, rows: 12, widgets: [
            widget('w2-search', 'search', 3, 0, 6, 1),
            widget('w2-clock', 'clock', 0, 0, 3, 4),
            widget('w2-weather', 'weather', 3, 2, 3, 4),
            widget('w2-sports', 'sports', 9, 0, 3, 6),
            widget('w2-markets', 'markets', 0, 5, 3, 7),
          ],
        },
      },
    },
  });
}
```

- [ ] **Step 6: Write `promo/fixtures/cache.mjs`**

```js
// What each widget finds in its cache (localStorage 'newtab:cache:<key>' as { at, data, via }) on
// the demo page, dated at the video's clock, so nothing is stale and no widget asks the network.
// The shapes are the widgets' own parsed data (js/markets-widget.js, github-widget.js,
// sports-widget.js, weather-widget.js); the values are made up.
import { scoreboards } from '../../js/sports.js';
import { placeKey } from '../../js/weather.js';
import { fxCurrencies } from '../../js/feeds.js';
import { USER, PLACE, MARKETS } from './state.mjs';

const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// The same pseudo-random numbers every build, so the lines and the map never change.
export function random(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

// n values climbing from start to end, wobbling by up to ±wobble (a fraction) on the way.
export function climb(start, end, n, seed, wobble = 0.004) {
  const r = random(seed);
  return Array.from({ length: n }, (_, i) => {
    const k = i / (n - 1);
    const v = start + (end - start) * (0.6 * k + 0.4 * k * k);
    return i === 0 || i === n - 1 ? v : v * (1 + (r() - 0.5) * 2 * wobble);
  });
}

const two = n => String(n).padStart(2, '0');
const localDay = ms => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const round = (v, digits) => Number(v.toFixed(digits));

// ---- Markets ----

// coin: [24 h ago, now, decimals]
const COINS = { BTC: [94180, 98420.5, 1], ETH: [3726.1, 3912.4, 2], SOL: [199.4, 214.6, 2], XRP: [2.33, 2.41, 4] };
// id: [CNBC symbol, name, at the open, now]
const CNBC = {
  GOLD: ['@GC.1', "Gold COMEX (Dec'26)", 4171.2, 4212.3],
  QQQ: ['QQQ', 'Invesco QQQ Trust', 706.4, 718.6],
  SPY: ['SPY', 'SPDR S&P 500 ETF Trust', 762.1, 771.4],
};

function markets(epoch) {
  const out = {};
  let seed = 1;
  for (const [coin, [from, to, digits]] of Object.entries(COINS)) {
    out[`ticker:${coin}USDT`] = { data: { price: to, change: round(to / from - 1, 4) }, via: 'Bybit' };
    out[`kline:${coin}USDT`] = { data: climb(from, to, 24, seed++).map(v => round(v, digits)), via: 'Bybit' };
  }
  const quotes = {};
  for (const [id, [symbol, name, from, to]] of Object.entries(CNBC)) {
    quotes[symbol] = { price: to, change: round(to / from - 1, 4), name, time: '4:00 PM EDT' };
    out[`cnbc:session:${id}`] = { data: climb(from, to, 39, seed++).map(v => round(v, 2)), via: 'CNBC' };
  }
  out[`cnbc:quotes:${Object.keys(CNBC).sort().join(',')}`] = { data: quotes, via: 'CNBC' };

  // The ten weekdays before today: the shekel weakens a little against the euro, the dollar holds.
  const days = [];
  for (let ms = epoch - DAY; days.length < 10; ms -= DAY) {
    if (![0, 6].includes(new Date(ms).getDay())) days.unshift(ms);
  }
  const ils = climb(3.402, 3.471, days.length, 41, 0.002);
  const rates = Object.fromEntries(days.map((ms, i) => [new Date(ms).toISOString().slice(0, 10), { ILS: round(ils[i], 4), USD: 1.1203 }]));
  out[`fx:EUR:${fxCurrencies(MARKETS).join(',')}`] = { data: { base: 'EUR', rates }, via: 'Frankfurter' };
  return out;
}

// ---- GitHub ----

const REPO = `${USER}/new-tab`;
const gh = path => `https://github.com/${path}`;
// [sha, message, minutes ago]
const COMMITS = [
  ['a41c9e2', 'Weather: the week ahead with sunrise and sunset', 18],
  ['9d03b7f', 'Markets: commodities from CNBC with sparklines', 47],
  ['5be1d20', 'Layout mode: stack up to three widgets in one spot', 95],
  ['e7720aa', 'Sports: live scores for the teams you follow', 160],
  ['31c8f4b', 'ASCII background: a ripple where you click', 260],
  ['c90e615', 'Tiles: drop one on another to make a folder', 420],
  ['7fa2d93', 'GitHub: contribution map and open pull requests', 610],
  ['04be7c1', 'Search bar: Google or Claude from the same box', 900],
];
// [title, number, minutes ago]
const PULLS = [
  ['Countdown widget with alarms', 128, 35],
  ['Weather: °F and up to three cities', 126, 140],
  ['Markets: group coins under your own headings', 121, 300],
];

function calendar(epoch) {
  const r = random(2026);
  const days = [];
  for (let i = 370; i >= 0; i--) {
    const ms = epoch - i * DAY;
    const weekend = [0, 6].includes(new Date(ms).getDay());
    const count = weekend ? (r() < 0.5 ? 0 : Math.floor(r() * 4)) : (r() < 0.1 ? 0 : 1 + Math.floor(r() * 9));
    const level = count === 0 ? 0 : count < 3 ? 1 : count < 5 ? 2 : count < 7 ? 3 : 4;
    days.push({ date: localDay(ms), level, count });
  }
  return { total: days.reduce((n, d) => n + d.count, 0), days };
}

function github(epoch) {
  return {
    [`github-stats:${USER}`]: { data: { followers: 1284, repos: 42, stars: 3910 } },
    [`github-cal:${USER}`]: { data: calendar(epoch), via: 'GitHub' },
    [`github-v8:${USER}:public`]: {
      data: {
        commits: COMMITS.map(([sha, message, ago]) => ({ sha, message, repo: REPO, url: gh(`${REPO}/commit/${sha}`), at: epoch - ago * MIN, private: false })),
        repos: [
          { repo: REPO, url: gh(REPO), at: epoch - 18 * MIN, private: false },
          { repo: `${USER}/ascii-field`, url: gh(`${USER}/ascii-field`), at: epoch - 2 * DAY, private: false },
          { repo: `${USER}/dotfiles`, url: gh(`${USER}/dotfiles`), at: epoch - 5 * DAY, private: false },
        ],
        pulls: PULLS.map(([title, number, ago]) => ({ title, number, url: gh(`${REPO}/pull/${number}`), repo: REPO, updatedAt: epoch - ago * MIN, draft: false })),
        reviews: [],
        issues: [],
        tokenInfo: null,
      },
    },
  };
}

// ---- Sports ----

const side = (id, abbr, name, score = null, winner = false) => ({ id, abbr, name, logo: '', score, winner });
const game = ({ id, sport, league, tag, start, state, detail = '', home, away, tv }) => ({
  id, sport, league, tag, start, timeValid: true, state, detail, off: null, home, away, tv,
  url: `https://www.espn.com/${sport === 'soccer' ? 'soccer/match' : `${sport}/game`}/_/gameId/${id}`,
});
const f1 = (round, gp, session, label, start, minutes) => ({
  id: `f1:2026-${round}-${label.replace(/\W/g, '')}`, sport: 'f1', tag: 'F1', session, season: '2026', round,
  title: `${gp} · ${label}`, start, timeValid: true, minutes, state: 'pre', url: 'https://www.formula1.com/en/racing/2026',
});

function sports(epoch) {
  const lakers = (score = null) => side('13', 'LAL', 'Los Angeles Lakers', score, false);
  const live = game({
    id: '401910001', sport: 'nba', league: 'nba', tag: 'NBA', start: epoch - 100 * MIN, state: 'in', detail: 'Q4 2:14',
    home: lakers('108'), away: side('9', 'GS', 'Golden State Warriors', '104'), tv: 'ESPN',
  });
  const nba = [
    live,
    game({ id: '401910002', sport: 'nba', league: 'nba', tag: 'NBA', start: epoch + 2 * DAY + 10 * HOUR, state: 'pre', home: lakers(), away: side('12', 'LAC', 'LA Clippers'), tv: 'TNT' }),
    game({ id: '401910003', sport: 'nba', league: 'nba', tag: 'NBA', start: epoch + 4 * DAY + 11 * HOUR, state: 'pre', home: side('25', 'OKC', 'Oklahoma City Thunder'), away: lakers(), tv: 'ESPN' }),
  ];
  const miami = (score = null, winner = false) => side('20232', 'MIA', 'Inter Miami CF', score, winner);
  const next = [
    game({ id: '761900', sport: 'soccer', league: 'usa.1', tag: 'MLS', start: epoch + 9 * HOUR + 49 * MIN, state: 'pre', home: miami(), away: side('17606', 'NYC', 'New York City FC'), tv: 'Apple TV' }),
  ];
  const last = [
    game({ id: '761899', sport: 'soccer', league: 'usa.1', tag: 'MLS', start: epoch - DAY - 2 * HOUR, state: 'post', detail: 'FT', home: side('18267', 'ORL', 'Orlando City SC', '1'), away: miami('3', true), tv: 'Apple TV' }),
  ];
  const season = [
    f1(20, 'Mexico City GP', 'qualifying', 'Qualifying', epoch + 4 * DAY + 13 * HOUR, 60),
    f1(20, 'Mexico City GP', 'race', 'Race', epoch + 5 * DAY + 12 * HOUR, 120),
  ];
  const out = {
    'sports-v1:team:nba:13': { data: nba, via: 'ESPN' },
    'sports-v1:soccer:20232:next': { data: next, via: 'ESPN' },
    'sports-v1:soccer:20232:last': { data: last, via: 'ESPN' },
    'sports-v1:f1:season': { data: season, via: 'Jolpica' },
  };
  // The live game's scoreboard, which the widget reads for the score.
  for (const b of scoreboards(nba, epoch)) out[`sports-v1:live:${b.path}:${b.day}`] = { data: [live], via: 'ESPN' };
  return out;
}

// ---- Weather ----

function weather(epoch) {
  const hour0 = Math.floor(epoch / HOUR) * HOUR;
  // About 15° before dawn to 27° mid-afternoon.
  const tempAt = ms => {
    const d = new Date(ms);
    return 21 + 6 * Math.sin(((d.getHours() + d.getMinutes() / 60 - 9) / 24) * 2 * Math.PI);
  };
  const isDay = ms => {
    const h = new Date(ms).getHours();
    return h >= 7 && h < 18;
  };
  const hours = Array.from({ length: 48 }, (_, i) => {
    const at = hour0 + i * HOUR;
    return { at, temp: round(tempAt(at), 1), code: isDay(at) ? (i % 7 === 3 ? 2 : i % 3 === 0 ? 1 : 0) : 0, rain: null, isDay: isDay(at) };
  });
  const days = [1, 0, 0, 2, 0, 1, 0].map((code, i) => {
    const midnight = new Date(epoch + i * DAY);
    midnight.setHours(0, 0, 0, 0);
    const m = midnight.getTime();
    return { date: localDay(m), code, max: 27 + (i % 3), min: 18 + (i % 2), rain: null, sunrise: m + 6 * HOUR + (47 + i) * MIN, sunset: m + 17 * HOUR + (54 - i) * MIN };
  });
  const now = { at: hour0, temp: round(tempAt(epoch), 1), feels: round(tempAt(epoch) + 0.8, 1), humidity: 58, wind: 11.2, code: 0, isDay: true };
  return { [`weather-v1:${placeKey(PLACE)}`]: { data: { offset: 3 * 3600, now, hours, days }, via: 'Open-Meteo' } };
}

// Every entry, keyed without the 'newtab:cache:' prefix.
export function buildCache(epoch) {
  const entries = { ...markets(epoch), ...github(epoch), ...sports(epoch), ...weather(epoch) };
  return Object.fromEntries(Object.entries(entries).map(([key, e]) => [key, { at: epoch, ...e }]));
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `node --test "promo/test/*.test.mjs"`
Expected: PASS, 18 tests.

If `the demo state keeps every widget` fails on Work, `normalizeLayout` moved or dropped a copy
that overlaps another. Compare the rectangles in `buildState` with the Work layout in the spec's
Timeline (search 3,0,6×1; clock 0,0,3×4; weather 3,2,3×4; sports 9,0,3×6; markets 0,5,3×7) and fix
the overlap.

- [ ] **Step 8: Commit**

```bash
git add promo/fixtures promo/test/fixtures.test.mjs
git commit -m "feat: promo: the demo page and every widget's cache, made up and dated at the video clock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The beat

**Files:**
- Create: `promo/music.py`
- Test: `promo/test/test_music.py`

**Interfaces:**
- Produces:
  - `python promo/music.py --out <wav>` writes 16 s of 44.1 kHz 16-bit stereo.
  - Module functions: `render()` → an `(705600, 2)` float array, `kick_times()` → seconds,
    `band(x, low, high)`, and `write_wav(path, mix)`.

- [ ] **Step 1: Write the failing test** (`promo/test/test_music.py`)

```python
import importlib.util
import pathlib
import unittest

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('music', HERE.parent / 'music.py')
music = importlib.util.module_from_spec(spec)
spec.loader.exec_module(music)


class MusicTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mix = music.render()

    def test_exactly_sixteen_seconds_of_stereo(self):
        self.assertEqual(self.mix.shape, (16 * music.SR, 2))

    def test_peaks_at_minus_one_dbfs(self):
        self.assertAlmostEqual(float(np.max(np.abs(self.mix))), 0.89, places=3)

    def test_kicks_land_on_the_video_beats(self):
        # A beat is 15 frames at 30 fps; the drop is the end card's first frame (360).
        times = music.kick_times()
        self.assertEqual(len(times), 25)
        for at in times:
            self.assertAlmostEqual(at * 30 % 15, 0)
        self.assertEqual(times[-1] * 30, 360)

    def test_each_kick_is_heard(self):
        low = music.band(self.mix.mean(axis=1), high=150)
        sr = music.SR
        for at in music.kick_times()[1:24]:
            i = int(at * sr)
            after = np.sqrt(np.mean(low[i:i + int(0.05 * sr)] ** 2))
            before = np.sqrt(np.mean(low[i - int(0.06 * sr):i - int(0.01 * sr)] ** 2))
            self.assertGreater(after, 1.5 * before, f'kick at {at} s')

    def test_ends_in_silence(self):
        self.assertLess(float(np.max(np.abs(self.mix[-10:]))), 0.01)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run it to see it fail**

Run: `python -m unittest discover -s promo/test -p "test_*.py"`
Expected: ERROR, `FileNotFoundError` for `promo/music.py`.

- [ ] **Step 3: Write `promo/music.py`**

```python
"""The promo's beat: 16 s at 120 BPM, 44.1 kHz stereo, written as a 16-bit WAV.

Bars 1-6 drive: a kick on every beat, off-beat hats, claps on 2 and 4, and a saw bass on
A-F-C-G that ducks under the kick. Bar 6 rises into a crash and sub drop at 12 s, where the end
card lands; bars 7-8 ring out on a pad and fade to silence at 16 s. Seeded, so every build
sounds the same.
"""
import argparse
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM            # 0.5 s, 15 video frames
LENGTH = 16.0
DROP = 12.0                # the end card
DRIVE_BEATS = 24           # bars 1-6
ROOTS = [55.0, 43.65, 65.41, 49.0]   # A1, F1, C2, G1: one bar each


def seconds(n):
    return np.arange(int(round(n * SR))) / SR


def place(track, sound, at, gain=1.0):
    i = int(round(at * SR))
    n = min(len(sound), len(track) - i)
    if n > 0:
        track[i:i + n] += gain * sound[:n]


def band(x, low=None, high=None):
    """Keeps the frequencies between low and high (Hz), with soft edges."""
    spectrum = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    gain = np.ones_like(f)
    if low:
        gain *= 1 / (1 + (low / np.maximum(f, 1e-6)) ** 4)
    if high:
        gain *= 1 / (1 + (f / high) ** 4)
    return np.fft.irfft(spectrum * gain, len(x))


def noise(rng, n):
    return rng.uniform(-1, 1, int(round(n * SR)))


def kick():
    t = seconds(0.45)
    freq = 45 + 110 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.13)


def hat(rng):
    t = seconds(0.06)
    return band(noise(rng, 0.06), low=7000) * np.exp(-t / 0.012)


def clap(rng):
    t = seconds(0.3)
    env = sum(np.where(t >= k * 0.011, np.exp(-(t - k * 0.011) / 0.006), 0) for k in range(3))
    env = env + 0.6 * np.where(t >= 0.022, np.exp(-(t - 0.022) / 0.09), 0)
    return band(noise(rng, 0.3), low=900, high=5000) * env


def saw(freq, n, detune=0.0):
    t = seconds(n)
    return 2 * ((t * freq * (1 + detune)) % 1) - 1


def kick_times():
    """When the kicks land: every beat of bars 1-6, then the drop."""
    return [i * BEAT for i in range(DRIVE_BEATS)] + [DROP]


def render():
    """The mix as an (n, 2) float array in -1..1."""
    rng = np.random.default_rng(7)
    n = int(LENGTH * SR)
    drums, bass, hats_l, hats_r, fx, pad_l, pad_r = (np.zeros(n) for _ in range(7))

    k = kick()
    for at in kick_times():
        place(drums, k, at, 1.0 if at < DROP else 1.2)
    for i in range(DRIVE_BEATS):
        place(hats_l, hat(rng), i * BEAT + BEAT / 2, 0.35)
        place(hats_r, hat(rng), i * BEAT + BEAT / 2, 0.45)
        if i >= 20:   # bar 6: sixteenths into the drop
            place(hats_l, hat(rng), i * BEAT + BEAT / 4, 0.25)
            place(hats_r, hat(rng), i * BEAT + 3 * BEAT / 4, 0.25)
        if i >= 4 and i % 4 in (1, 3):   # claps from bar 2
            place(drums, clap(rng), i * BEAT, 0.5)

    # Bass: eighth notes on each bar's root, ducking under every kick.
    for i in range(DRIVE_BEATS * 2):
        root = ROOTS[(i // 8) % 4]
        note = (saw(root, 0.22) + 0.5 * saw(root * 2, 0.22)) * np.exp(-seconds(0.22) / 0.12)
        place(bass, note, i * BEAT / 2, 0.5)
    bass = band(bass, high=700)
    t = seconds(LENGTH)
    since_kick = np.full(n, 10.0)
    for at in kick_times()[:DRIVE_BEATS]:
        m = t >= at
        since_kick[m] = np.minimum(since_kick[m], t[m] - at)
    bass *= 1 - 0.75 * np.exp(-since_kick / 0.09)
    bass[t >= DROP] = 0

    # Riser through bar 6, then the hit: crash and sub drop.
    rise = seconds(2.0)
    ramp = (rise / rise[-1]) ** 2
    sweep = np.sin(2 * np.pi * np.cumsum(300 * 8 ** (rise / rise[-1])) / SR)
    place(fx, band(noise(rng, 2.0), low=2000) * ramp * 0.35 + sweep * ramp * 0.12, DROP - 2.0)
    place(fx, band(noise(rng, 3.0), low=4500) * np.exp(-seconds(3.0) / 0.7), DROP, 0.55)
    sub_t = seconds(2.0)
    sub = np.sin(2 * np.pi * np.cumsum(35 + 35 * np.exp(-sub_t / 0.4)) / SR) * np.exp(-sub_t / 0.8)
    place(fx, sub, DROP, 0.8)

    # Pad over the end card: A minor, detuned apart on each side.
    hold = LENGTH - DROP
    env = np.minimum(1, seconds(hold) / 0.03) * np.linspace(1, 0.15, int(hold * SR))
    for freq in (110.0, 130.81, 164.81, 220.0):
        place(pad_l, saw(freq, hold, -0.003) * env, DROP, 0.09)
        place(pad_r, saw(freq, hold, 0.003) * env, DROP, 0.09)
    pad_l, pad_r = band(pad_l, high=1800), band(pad_r, high=1800)

    core = drums + bass + fx
    mix = np.stack([core + hats_l + pad_l, core + hats_r + pad_r], axis=1)
    mix = np.tanh(1.1 * mix) / np.tanh(1.1)
    mix *= np.clip((LENGTH - t) / 0.5, 0, 1)[:, None]
    return mix * (0.89 / np.max(np.abs(mix)))


def write_wav(path, mix):
    data = (np.clip(mix, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    write_wav(args.out, render())
    print(f'{args.out}: {LENGTH:.0f} s at {BPM} BPM')


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `python -m unittest discover -s promo/test -p "test_*.py"`
Expected: `Ran 5 tests ... OK`.

- [ ] **Step 5: Listen once**

Run: `python promo/music.py --out promo/out/music.wav`
Expected: `promo/out/music.wav: 16 s at 120 BPM`. Tell the controller the path so the user can play
it. Don't judge taste here; that happens in Task 6.

- [ ] **Step 6: Commit**

```bash
git add promo/music.py promo/test/test_music.py
git commit -m "feat: promo: a 16 s, 120 BPM beat in numpy, its kicks on the video's beat grid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Virtual clock and CDP plumbing

**Files:**
- Create: `promo/lib/vclock.js`, `promo/lib/cdp.mjs`
- Test: `promo/test/vclock.test.mjs`

**Interfaces:**
- `vclock.js`: a classic script with the `__EPOCH__` placeholder (replaced by ms since 1970). It
  defines `window.__vclock = { hold(), frame() → vnow, now }`.
- `cdp.mjs` produces:
  - `sleep(ms)`, `chromePath()`
  - `launch({ ext, profile, port, width, height })` → `{ proc, wsUrl }`
  - `stop(proc)`
  - `connect(wsUrl)` → `{ send, on, attach(targetId) → session, close }`, where a session has
    `{ id, send(method, params), on(event, fn) → off, eval(expression) → value }`
  - `extensionId(cdp, name)`, `closePages(cdp)`

A trial on 2026-10-18 shows why the clock is needed. CDP virtual time
(`Emulation.setVirtualTimePolicy`) steps JS time but not CSS animations, and screenshots hang once
animations are paused. This injected clock, plus pausing every animation and setting its time,
gave 60 distinct frames, each exactly 1/30 s apart.

- [ ] **Step 1: Write the failing test** (`promo/test/vclock.test.mjs`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const EPOCH = Date.UTC(2026, 9, 20, 6, 41);
const SOURCE = readFileSync(new URL('../lib/vclock.js', import.meta.url), 'utf8').replace('__EPOCH__', String(EPOCH));

// A bare page: the clock script run in its own global, then held.
function page(animations = []) {
  const ctx = {
    performance: { now: () => 0 }, document: { getAnimations: () => animations },
    Date, console, setTimeout, setInterval, clearTimeout, clearInterval,
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  ctx.__vclock.hold();
  return ctx;
}

test('a frame moves performance.now and Date by 1/30 s', () => {
  const p = page();
  const t0 = p.performance.now();
  p.__vclock.frame();
  assert.ok(Math.abs(p.performance.now() - t0 - 1000 / 30) < 1e-9);
  assert.equal(p.Date.now(), EPOCH + p.performance.now());
  assert.equal(new p.Date().getTime(), EPOCH + p.performance.now());
  assert.equal(new p.Date(0).getTime(), 0);
});

test('timers wait for the frames that reach them', () => {
  const p = page();
  let fired = 0;
  p.setTimeout(() => fired++, 100);
  p.__vclock.frame();
  p.__vclock.frame();
  assert.equal(fired, 0);
  p.__vclock.frame();
  p.__vclock.frame();
  assert.equal(fired, 1);
});

test('intervals repeat until cleared', () => {
  const p = page();
  let fired = 0;
  const id = p.setInterval(() => fired++, 50);
  for (let i = 0; i < 4; i++) p.__vclock.frame();
  assert.equal(fired, 2);
  p.clearInterval(id);
  for (let i = 0; i < 4; i++) p.__vclock.frame();
  assert.equal(fired, 2);
});

test('animation frames run every 1/60 s with the virtual time', () => {
  const p = page();
  const seen = [];
  const tick = t => {
    seen.push(t);
    p.requestAnimationFrame(tick);
  };
  p.requestAnimationFrame(tick);
  p.__vclock.frame();
  assert.equal(seen.length, 2);
  assert.ok(Math.abs(seen[1] - seen[0] - 1000 / 60) < 1e-9);
});

test('CSS animations are paused and set to the frame time', () => {
  const anim = { currentTime: 250, paused: false, pause() { this.paused = true; } };
  const p = page([anim]);
  p.__vclock.frame();
  p.__vclock.frame();
  assert.equal(anim.paused, true);
  assert.ok(Math.abs(anim.currentTime - (250 + 2000 / 30)) < 1e-9);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test promo/test/vclock.test.mjs`
Expected: FAIL with `ENOENT ... promo/lib/vclock.js`.

- [ ] **Step 3: Write `promo/lib/vclock.js`**

```js
// Injected before the page's own scripts (Page.addScriptToEvaluateOnNewDocument). The page's
// clocks (performance.now, Date, setTimeout/setInterval, requestAnimationFrame) run on a virtual
// time that follows real time until __vclock.hold(); from then on only __vclock.frame() moves it,
// 1/30 s at a time. Every CSS/Web animation is then paused and set to match, so a captured frame
// looks the same however long it took. __EPOCH__ is what Date.now() reads at virtual time 0.
(() => {
  const EPOCH = Number('__EPOCH__');
  const FPS = 30;
  const native = {
    setTimeout: window.setTimeout.bind(window),
    now: performance.now.bind(performance),
  };
  const OrigDate = Date;
  let vnow = 0;
  let held = false;
  const timers = new Map();   // id → { at, fn, args, every }
  let nextTimer = 1;
  let rafs = new Map();
  let nextRaf = 1;

  function runDue() {
    for (;;) {
      let due = null;
      for (const [id, t] of timers) if (t.at <= vnow && (!due || t.at < due[1].at)) due = [id, t];
      if (!due) return;
      const [id, t] = due;
      if (t.every != null) t.at += Math.max(1, t.every);
      else timers.delete(id);
      try {
        if (typeof t.fn === 'function') t.fn(...t.args);
        else (0, eval)(String(t.fn));
      } catch (e) {
        console.error(e);
      }
    }
  }

  function runRafs() {
    const list = rafs;
    rafs = new Map();
    for (const fn of list.values()) {
      try {
        fn(vnow);
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Moves the clock on in display frames (1/60 s), running what falls due on the way.
  function advance(ms) {
    const end = vnow + ms;
    while (vnow < end) {
      vnow = Math.min(end, vnow + 1000 / 60);
      runDue();
      runRafs();
    }
  }

  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextTimer++;
    timers.set(id, { at: vnow + Math.max(0, Number(ms) || 0), fn, args });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = nextTimer++;
    const every = Math.max(0, Number(ms) || 0);
    timers.set(id, { at: vnow + every, fn, args, every });
    return id;
  };
  window.clearTimeout = id => { timers.delete(id); };
  window.clearInterval = id => { timers.delete(id); };
  window.requestAnimationFrame = fn => {
    const id = nextRaf++;
    rafs.set(id, fn);
    return id;
  };
  window.cancelAnimationFrame = id => { rafs.delete(id); };
  Object.defineProperty(performance, 'now', { value: () => vnow, configurable: true });
  class VDate extends OrigDate {
    constructor(...a) {
      if (a.length === 0) super(EPOCH + vnow);
      else super(...a);
    }
    static now() {
      return EPOCH + vnow;
    }
  }
  window.Date = VDate;

  // Real time drives the clock until hold().
  let last = native.now();
  const pump = () => {
    if (held) return;
    const t = native.now();
    advance(t - last);
    last = t;
    native.setTimeout(pump, 16);
  };
  native.setTimeout(pump, 16);

  const seen = new Map();   // animation → { frame, base }: when it was first seen, at what time
  let frameNo = 0;
  function syncAnimations() {
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) seen.set(a, { frame: frameNo, base: a.currentTime ?? 0 });
      const s = seen.get(a);
      a.pause();
      a.currentTime = s.base + ((frameNo - s.frame) * 1000) / FPS;
    }
  }

  window.__vclock = {
    hold() {
      held = true;
      syncAnimations();
    },
    frame() {
      frameNo++;
      advance(1000 / FPS);
      syncAnimations();
      return vnow;
    },
    get now() {
      return vnow;
    },
  };
})();
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test promo/test/vclock.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write `promo/lib/cdp.mjs`**

```js
// A small Chrome DevTools Protocol client over Node 22's built-in WebSocket (flat sessions), and
// Playwright's Chromium launched headless with the unpacked extension (branded Chrome ignores
// --load-extension).
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// PROMO_CHROME if set, else the newest Chromium Playwright installed.
export function chromePath() {
  if (process.env.PROMO_CHROME) return process.env.PROMO_CHROME;
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  let dirs = [];
  try {
    dirs = readdirSync(root).filter(d => /^chromium-\d+$/.test(d));
  } catch {
    // no Playwright browsers at all
  }
  dirs.sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  if (!dirs.length) throw new Error(`No Playwright Chromium in ${root}: run npx playwright install chromium, or set PROMO_CHROME`);
  return join(root, dirs[0], 'chrome-win64', 'chrome.exe');
}

// Ends Chromium and its child processes (on Windows they'd otherwise keep the profile locked).
export async function stop(proc) {
  if (proc.exitCode != null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(proc.pid)], { stdio: 'ignore' });
  else proc.kill();
  await sleep(300);
}

export async function launch({ ext, profile, port, width, height }) {
  const proc = spawn(chromePath(), [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--load-extension=${ext}`, `--disable-extensions-except=${ext}`,
    `--window-size=${width},${height}`, '--force-device-scale-factor=1', '--force-color-profile=srgb',
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      return { proc, wsUrl: version.webSocketDebuggerUrl };
    } catch {
      await sleep(100);
    }
  }
  await stop(proc);
  throw new Error(`Chromium didn't open port ${port}`);
}

export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let next = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, method } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const on = fn => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const session = sessionId => ({
    id: sessionId,
    send: (method, params) => send(method, params, sessionId),
    on: (method, fn) => on(msg => {
      if (msg.sessionId === sessionId && msg.method === method) fn(msg.params);
    }),
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
  });
  const attach = async targetId => session((await send('Target.attachToTarget', { targetId, flatten: true })).sessionId);
  return { send, on, attach, close: () => ws.close() };
}

// The unpacked extension's id, read from its service worker (Chromium also runs a component
// extension with a background.js of its own, so match the manifest's name).
export async function extensionId(cdp, name) {
  for (let i = 0; i < 50; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    for (const t of targetInfos.filter(x => x.type === 'service_worker' && x.url.endsWith('/background.js'))) {
      const worker = await cdp.attach(t.targetId);
      if (await worker.eval('chrome.runtime.getManifest().name') === name) return worker.eval('chrome.runtime.id');
    }
    await sleep(100);
  }
  throw new Error(`The "${name}" extension didn't start`);
}

export async function closePages(cdp) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  for (const t of targetInfos.filter(x => x.type === 'page')) await cdp.send('Target.closeTarget', { targetId: t.targetId });
}
```

- [ ] **Step 6: Smoke-test the plumbing**

Write `promo/out/smoke.mjs` (in the ignored folder):

```js
import { launch, connect, stop, extensionId } from '../lib/cdp.mjs';
const { proc, wsUrl } = await launch({ ext: new URL('../..', import.meta.url).pathname.slice(1), profile: new URL('./smoke-profile', import.meta.url).pathname.slice(1), port: 9479, width: 1920, height: 1080 });
const cdp = await connect(wsUrl);
try { console.log('extension id', await extensionId(cdp, 'New Tab')); } finally { cdp.close(); await stop(proc); }
```

Run: `node promo/out/smoke.mjs`
Expected: `extension id <32 letters>`. Then delete `promo/out/smoke.mjs` and `promo/out/smoke-profile`.

- [ ] **Step 7: Commit**

```bash
git add promo/lib/vclock.js promo/lib/cdp.mjs promo/test/vclock.test.mjs
git commit -m "feat: promo: a virtual clock for frame-exact capture, and a CDP client that loads the extension

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Overlay and recorder

**Files:**
- Create: `promo/lib/overlay.js`, `promo/record.mjs`

**Interfaces:**
- Consumes: everything from Tasks 1, 2 and 4.
- Produces:
  - `overlay.js`: `window.__promo = { setup(scene), render(f, pointer) }`, where `pointer` is
    `{ x, y, down }` or `null`.
  - `record.mjs`: `record({ only })` writes `promo/out/frames/NNNN.jpg` for the scenes asked for.
    It also exports `OUT`, `FRAMES` and `EPOCH`. CLI: `node promo/record.mjs [--scene <name>]`.

These selectors come from the app:
- Widget frames are `section.widget-frame.frame-<type>[data-id][data-type]` inside `main#canvas`.
- The Layout mode button is `#btn-layout`. Layout handles are `.frame-handle.<n|s|e|w|…>`.
- The folder tile is `.tile.tile-folder[data-id]`, and the folder dialog is `dialog.dlg.folder-dlg`.
- Markets lines are `.mk-spark polyline`. Heatmap cells are `.gh-heatmap-grid rect`.
- The cell pitch is `(width − padding + gap) / 12`, the same as `cellPitch` in `js/edit-mode.js`.

- [ ] **Step 1: Write `promo/lib/overlay.js`**

```js
// The video's own layer over the new tab page: headline words, the spotlight, the camera, the
// pointer and the effects. record.mjs injects it after lib/motion.mjs (clamp01, lerp,
// easeOutCubic, easeOutBack). Every frame is drawn from the scene and the frame number alone.
(() => {
  const FPS = 30;
  const ms = f => (f * 1000) / FPS;
  const PUNCH = 0.06;        // the cut's zoom punch: scale 1.06 → 1 …
  const PUNCH_MS = 150;      // … over 150 ms
  const SLAM_MS = 180;       // a headline cue: scale 1.35 → 1 with overshoot
  const RIPPLE_MS = 400;
  const SPOT_FRAMES = 6;     // the spotlight's move to a new subject

  const STYLE = `
    #promo { position: fixed; inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none;
      margin: 0; padding: 0; border: 0; background: transparent; overflow: visible; pointer-events: none;
      color: #fff; font-family: Nunito, system-ui, sans-serif; }
    #promo .spot { position: absolute; border-radius: 16px; box-shadow: 0 0 0 200vmax rgb(0 0 0 / 0.55); }
    #promo .head { position: absolute; top: 50%; display: flex; flex-wrap: wrap; align-items: baseline;
      gap: 0 0.26em; max-width: 44vw; font-size: 124px; font-weight: 900; line-height: 1.04;
      letter-spacing: -0.02em; text-shadow: 0 6px 40px rgb(0 0 0 / 0.55); }
    #promo .head::before { content: ''; position: absolute; inset: -80px -120px; z-index: -1;
      background: radial-gradient(closest-side, rgb(0 0 0 / 0.55), transparent); }
    #promo .head.left { left: 110px; transform: translateY(-50%); }
    #promo .head.right { right: 110px; transform: translateY(-50%); justify-content: flex-end; text-align: right; }
    #promo .head.center { left: 50%; transform: translate(-50%, -50%); justify-content: center;
      text-align: center; max-width: 84vw; }
    #promo .word { display: inline-block; opacity: 0; transform-origin: 50% 60%; }
    #promo .word em { font-style: normal; color: var(--promo-accent); }
    #promo .word.sub { flex-basis: 100%; margin-top: 22px; font-size: 56px; font-weight: 800; letter-spacing: 0; }
    #promo .word.icon { flex-basis: 100%; display: flex; flex-direction: column; align-items: center; gap: 18px; }
    #promo .word.icon img { width: 168px; height: 168px; }
    #promo .cursor { position: absolute; left: 0; top: 0; width: 22px; height: 22px; margin: -11px 0 0 -11px;
      border-radius: 50%; background: #fff; box-shadow: 0 0 0 3px rgb(0 0 0 / 0.35), 0 4px 14px rgb(0 0 0 / 0.5); }
    #promo .ripple { position: absolute; left: 0; top: 0; border-radius: 50%; border: 3px solid var(--promo-accent); }
    #promo .black { position: absolute; inset: 0; background: #000; opacity: 0; }
    html.promo-bare body > :not(#bg):not(#ascii):not(#promo) { opacity: 0 !important; pointer-events: none !important; }
  `;

  let scene = null;
  let root = null;
  let spot = null;
  let cursor = null;
  let ripple = null;
  let black = null;
  let words = [];
  let camera = null;
  let polylines = [];
  let cells = [];
  let spotOn = null;      // the element lit
  let spotRect = null;
  let spotFrom = null;    // { rect, f }: where a move to a new subject started
  let rippleAt = null;    // { x, y, f } of the latest click
  const raised = new WeakSet();

  const add = cls => {
    const n = document.createElement('div');
    n.className = cls;
    root.append(n);
    return n;
  };

  // "Your *new tab.*" → text with the starred part in <em>.
  function markup(node, text) {
    for (const part of text.split(/(\*[^*]+\*)/).filter(Boolean)) {
      if (part.startsWith('*')) {
        const em = document.createElement('em');
        em.textContent = part.slice(1, -1);
        node.append(em);
      } else {
        node.append(part);
      }
    }
  }

  // The camera maps a page point p to P + z·(p − C): C is the subject's centre, P where it should
  // sit (away from the headline). Measured once, before anything moves.
  function measureCamera() {
    const W = innerWidth;
    const H = innerHeight;
    const movers = [...document.querySelectorAll('header.topbar, main#canvas')].map(el => ({ el, box: el.getBoundingClientRect() }));
    let C = { x: W / 2, y: H / 2 };
    let P = C;
    if (scene.zoom) {
      const sel = scene.focus ?? scene.spot?.[0];
      const subject = document.querySelector(sel);
      if (!subject) throw new Error(`No camera subject on the page: ${sel}`);
      const b = subject.getBoundingClientRect();
      C = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      P = { x: scene.side === 'left' ? W * 0.68 : scene.side === 'right' ? W * 0.32 : W / 2, y: H / 2 };
    }
    camera = { C, P, zoom: scene.zoom ?? 1, movers };
  }

  function setup(s) {
    scene = s;
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
    if (s.bare) document.documentElement.classList.add('promo-bare');
    root = document.createElement('div');
    root.id = 'promo';
    root.popover = 'manual';
    root.style.setProperty('--promo-accent', getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d97757');
    spot = add('spot');
    const head = add(`head ${s.side ?? 'center'}`);
    words = s.words.map(w => {
      const node = document.createElement('span');
      node.className = `word${w.sub ? ' sub' : ''}${w.icon ? ' icon' : ''}`;
      if (w.icon) {
        const img = document.createElement('img');
        img.src = chrome.runtime.getURL('icons/icon-128.png');
        img.alt = '';
        const label = document.createElement('span');
        markup(label, w.text);
        node.append(img, label);
      } else {
        markup(node, w.text);
      }
      head.append(node);
      return { ...w, node };
    });
    ripple = add('ripple');
    cursor = add('cursor');
    black = add('black');
    document.body.append(root);
    root.showPopover();
    measureCamera();
    if (s.fx === 'sparklines') {
      polylines = [...document.querySelectorAll('.frame-markets .mk-spark polyline')];
      for (const p of polylines) {
        p.setAttribute('pathLength', '1');
        p.style.strokeDasharray = '1';
      }
    }
    if (s.fx === 'heatmap') {
      const rects = [...document.querySelectorAll('.frame-github .gh-heatmap-grid rect')];
      const xs = [...new Set(rects.map(r => Number(r.getAttribute('x'))))].sort((a, b) => a - b);
      cells = rects.map(r => ({ r, col: xs.indexOf(Number(r.getAttribute('x'))) }));
    }
  }

  // A dialog the scene opens (the folder) joins the top layer above this one: show this again so
  // the headline stays on top.
  function raiseOverDialogs() {
    for (const d of document.querySelectorAll('dialog[open]')) {
      if (raised.has(d)) continue;
      raised.add(d);
      root.hidePopover();
      root.showPopover();
    }
  }

  function moveCamera(t) {
    if (scene.bare) return;
    const punch = scene.still ? 1 : 1 + PUNCH * (1 - easeOutCubic(t / PUNCH_MS));
    const z = camera.zoom * punch;
    for (const { el, box } of camera.movers) {
      const tx = camera.P.x + z * (box.left - camera.C.x) - box.left;
      const ty = camera.P.y + z * (box.top - camera.C.y) - box.top;
      el.style.transformOrigin = '0 0';
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
    }
  }

  function moveSpot(f) {
    const target = (scene.spot ?? []).map(sel => document.querySelector(sel)).find(Boolean);
    if (!target) {
      spot.style.display = 'none';
      return;
    }
    const b = target.getBoundingClientRect();
    const want = { x: b.left - 10, y: b.top - 10, w: b.width + 20, h: b.height + 20 };
    if (target !== spotOn) {
      spotFrom = spotRect ? { rect: spotRect, f } : null;
      spotOn = target;
    }
    const k = spotFrom ? easeOutCubic((f - spotFrom.f) / SPOT_FRAMES) : 1;
    spotRect = k >= 1 ? want : {
      x: lerp(spotFrom.rect.x, want.x, k), y: lerp(spotFrom.rect.y, want.y, k),
      w: lerp(spotFrom.rect.w, want.w, k), h: lerp(spotFrom.rect.h, want.h, k),
    };
    Object.assign(spot.style, { display: '', left: `${spotRect.x}px`, top: `${spotRect.y}px`, width: `${spotRect.w}px`, height: `${spotRect.h}px` });
  }

  function render(f, pointer) {
    const t = ms(f);
    raiseOverDialogs();
    moveCamera(t);
    moveSpot(f);
    polylines.forEach((p, i) => {
      p.style.strokeDashoffset = String(1 - easeOutCubic((f - 2 * i) / 18));
    });
    for (const { r, col } of cells) r.style.opacity = String(clamp01((f - col * 0.55) / 5));
    for (const w of words) {
      const k = (t - ms(w.f)) / SLAM_MS;
      w.node.style.opacity = k < 0 ? '0' : String(clamp01(k * 1.6));
      w.node.style.transform = k < 0 ? '' : `scale(${lerp(1.35, 1, easeOutBack(k))})`;
    }
    const drawn = pointer && scene.dot;
    cursor.style.display = drawn ? '' : 'none';
    if (drawn) cursor.style.transform = `translate(${pointer.x}px, ${pointer.y}px) scale(${pointer.down ? 0.82 : 1})`;
    if (pointer && (scene.clicks ?? []).includes(f)) rippleAt = { x: pointer.x, y: pointer.y, f };
    const rk = rippleAt ? (t - ms(rippleAt.f)) / RIPPLE_MS : 1;
    if (scene.dot && rk < 1) {
      const size = 20 + 120 * easeOutCubic(rk);
      Object.assign(ripple.style, {
        display: '', width: `${size}px`, height: `${size}px`, opacity: String(1 - rk),
        transform: `translate(${rippleAt.x - size / 2}px, ${rippleAt.y - size / 2}px)`,
      });
    } else {
      ripple.style.display = 'none';
    }
    black.style.opacity = scene.fadeOut ? String(clamp01((f - (scene.frames - 15)) / 14)) : '0';
  }

  window.__promo = { setup, render };
})();
```

- [ ] **Step 2: Write `promo/record.mjs`**

```js
// Records the promo frame by frame into promo/out/frames/NNNN.jpg. For each scene it seeds the demo
// page (fixtures/), opens the new tab on a held virtual clock (lib/vclock.js), then for every frame
// moves the pointer, draws the overlay (lib/overlay.js), takes a screenshot and steps the clock. The
// page may not touch the network: any http(s) request fails the run.
// node promo/record.mjs [--scene <name>]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, connect, stop, extensionId, closePages, sleep } from './lib/cdp.mjs';
import { easeInOutCubic, lerp, pathAt } from './lib/motion.mjs';
import { sceneStarts } from './timeline.mjs';
import { buildState } from './fixtures/state.mjs';
import { buildCache } from './fixtures/cache.mjs';
import { iconMap } from './fixtures/icons.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const EXTENSION = join(HERE, '..');
export const OUT = join(HERE, 'out');
export const FRAMES = join(OUT, 'frames');
// What the page's clock reads as the video starts: Tue 20 Oct 2026, 09:41 local time.
export const EPOCH = new Date(2026, 9, 20, 9, 41, 0).getTime();
const PORT = 9479;
const SIZE = { width: 1920, height: 1080 };
// A widget is ready once it shows this (by its frame's data-type).
const MARKERS = { markets: '.mk-row', github: '.gh-heatmap-grid', sports: '.sp-list', weather: '.wx-now', tiles: '.tile' };

const lib = name => readFileSync(join(HERE, 'lib', name), 'utf8');

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

// Waits until every widget shows its content, fonts and images are in, and fails on a widget
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
      if (last.notes.length) throw new Error(`Scene "${scene.name}": a widget shows "${last.notes.join('" and "')}"`);
      await sleep(800);   // entrance transitions run on real time until the clock is held
      return;
    }
    await sleep(200);
  }
  throw new Error(`Scene "${scene.name}" never got ready: ${JSON.stringify(last)}`);
}

async function click(page, sel) {
  const p = await page.eval(`(() => {
    const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', buttons: 1, clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', buttons: 0, clickCount: 1 });
}

// Where the scene's pointer is at each frame, sent to the page as real mouse events, so hovers,
// clicks, Layout mode's drags and the letter field all react. step(f) returns { x, y, down } or
// null when the scene has no pointer.
class Pointer {
  constructor(page, scene) {
    this.page = page;
    this.scene = scene;
    this.keys = null;   // the cursor keys, selectors resolved to points
    this.at = null;     // the last position sent
    this.drag = null;   // the running drag with its start and end points
    this.glide = null;  // keys from the last drop to where the next drag starts
  }

  async point(sel) {
    const p = await this.page.eval(`(() => {
      const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!p) throw new Error(`Scene "${this.scene.name}": nothing on the page matches ${sel}`);
    return p;
  }

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
          const pitch = await this.pitch();
          end = { x: start.x + d.by[0] * pitch.x, y: start.y + d.by[1] * pitch.y };
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
  const pointer = new Pointer(page, scene);
  for (let f = 0; f < scene.frames; f++) {
    const at = await pointer.step(f);
    await page.eval(`__promo.render(${f}, ${JSON.stringify(at)})`);
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    writeFileSync(join(FRAMES, `${String(scene.start + f).padStart(4, '0')}.jpg`), Buffer.from(data, 'base64'));
    await page.eval('__vclock.frame()');
  }
  await cdp.send('Target.closeTarget', { targetId });
  if (asked.size) throw new Error(`Scene "${scene.name}" asked the network for (give it a cache entry in fixtures/cache.mjs):\n  ${[...asked].join('\n  ')}`);
  console.log(`${scene.name}: frames ${scene.start}–${scene.start + scene.frames - 1}`);
}

export async function record({ only = null } = {}) {
  const scenes = sceneStarts().filter(s => !only || s.name === only);
  if (!scenes.length) throw new Error(`No scene named "${only}" in timeline.mjs`);
  if (!only) rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  const profile = join(OUT, 'profile');
  rmSync(profile, { recursive: true, force: true });
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
```

- [ ] **Step 3: Record the Markets scene and look at it**

Run: `node promo/record.mjs --scene markets`
Expected: `markets: frames 180–239`.

Read `promo/out/frames/0180.jpg`, `0190.jpg` and `0239.jpg` with the Read tool. Check:
- The Markets widget is zoomed and centred left of the middle. The rest is dimmed.
- The headline "Live markets." is on the right, with "markets." in orange.
- In 0180 the sparklines are drawing in. By 0239 they are complete and green, and every price
  change is positive.

- [ ] **Step 4: Record and check each remaining scene**

Record one scene per command, `node promo/record.mjs --scene <name>`, and read the listed frames
for each:

| Scene | Frames to read | What has to be there |
| --- | --- | --- |
| `hook` | 0000, 0020, 0059 | Only the letter background. "Your new tab." in the centre from 0015. The dot cursor sweeps; letters light around it. |
| `tiles` | 0060, 0075, 0090, 0119 | Tiles show brand logos (no globes). The dot reaches the AI folder at 0072. The folder dialog is open and lit from about 0078. "One click." stays readable on the left. |
| `layout` | 0120, 0131, 0146, 0163, 0179 | Layout mode grid on the Work tab. Weather moves down-right (0131), widens (0146), and Sports drops onto it as a stack (0163). "Drag. Resize. Stack." builds up on the left. |
| `github` | 0240, 0255, 0299 | The heatmap is zoomed on the right and fills from left to right. Stats show `1,284 followers`. "Your GitHub." on the left. |
| `sports` | 0300, 0329 | A live `LAL 108 – 104 GS` row with `Q4 2:14`. "Scores." on the right. |
| `weather` | 0330, 0359 | Tel Aviv, sunny, about 22°, hours from 10:00. "Weather." on the left. |
| `end` | 0360, 0390, 0420, 0479 | The icon and "New Tab" slam in at 0360. "Free for Chrome" arrives at 0390. Letters light where the pointer moves. 0479 is black. |

If a scene fails with `asked the network for …`, add that URL's cache entry to
`fixtures/cache.mjs` with a test in `fixtures.test.mjs`, rerun the tests, then re-record.

If a scene fails with `nothing on the page matches …` or `never got ready`, read the error. Look
for the element in the app's code under `js/` and fix the selector in `timeline.mjs` or
`MARKERS`.

If a drag misses (the layout frames don't show the move), print `await pointer.pitch()` and the
`.widget-frame` rects before the drag, and correct `by`.

- [ ] **Step 5: Commit**

```bash
git add promo/lib/overlay.js promo/record.mjs
git commit -m "feat: promo: record each scene frame by frame with headlines, spotlight, camera and pointer drawn in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Assembly, checks and the full run

**Files:**
- Create: `promo/build.mjs`, `promo/README.md`

**Interfaces:**
- Consumes: `record`, `OUT` and `FRAMES` from `record.mjs`; `FPS`, `TOTAL_FRAMES` and
  `sceneStarts` from `timeline.mjs`; `promo/music.py`.
- Produces: `promo/out/new-tab-promo.mp4` and `promo/out/contact.png`.

- [ ] **Step 1: Write `promo/build.mjs`**

```js
// Builds promo/out/new-tab-promo.mp4: the beat (music.py), the frames (record.mjs), then one
// H.264 + AAC file, checked, and a contact sheet with one frame per scene (promo/out/contact.png).
// node promo/build.mjs [--scene <name>]   (--scene re-records that scene only)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { record, OUT, FRAMES } from './record.mjs';
import { FPS, TOTAL_FRAMES, sceneStarts } from './timeline.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MP4 = join(OUT, 'new-tab-promo.mp4');
const WAV = join(OUT, 'music.wav');
const CONTACT = join(OUT, 'contact.png');
// The ffmpeg imageio-ffmpeg ships (Playwright's own can't add audio).
const FFMPEG = execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();

// ffmpeg's report (it writes to stderr); a failure throws unless check is off.
function ffmpeg(args, { check = true } = {}) {
  const r = spawnSync(FFMPEG, ['-hide_banner', ...args], { encoding: 'utf8' });
  if (check && r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
  return r.stderr;
}

const i = process.argv.indexOf('--scene');
const only = i > 0 ? process.argv[i + 1] : null;
mkdirSync(OUT, { recursive: true });
execFileSync('python', [join(HERE, 'music.py'), '--out', WAV], { stdio: 'inherit' });
await record({ only });

const frames = readdirSync(FRAMES).filter(f => f.endsWith('.jpg')).length;
if (frames !== TOTAL_FRAMES) throw new Error(`${frames} frames in ${FRAMES}, expected ${TOTAL_FRAMES}: record every scene once without --scene`);

ffmpeg(['-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-start_number', '0', '-i', join(FRAMES, '%04d.jpg'),
  '-i', WAV,
  '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-ar', '44100',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k',
  '-t', String(TOTAL_FRAMES / FPS), '-movflags', '+faststart', MP4]);

// The spec's checks: 16 s, 480 frames, 1920×1080 H.264, an AAC track.
const info = ffmpeg(['-i', MP4], { check: false });
const [, h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(info) ?? [];
const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s);
const counted = Number([...ffmpeg(['-i', MP4, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-']).matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1]);
const problems = [
  !(Math.abs(seconds - TOTAL_FRAMES / FPS) <= 0.05) && `lasts ${seconds} s`,
  counted !== TOTAL_FRAMES && `has ${counted} frames`,
  !/Video: h264.*1920x1080/.test(info) && 'is not 1920×1080 H.264',
  !/Audio: aac/.test(info) && 'has no AAC audio',
].filter(Boolean);
if (problems.length) throw new Error(`${MP4} ${problems.join(', ')}`);

const picks = sceneStarts().map(sc => `eq(n,${sc.start + Math.floor(sc.frames / 2)})`).join('+');
ffmpeg(['-y', '-loglevel', 'error', '-start_number', '0', '-i', join(FRAMES, '%04d.jpg'),
  '-vf', `select='${picks}',scale=480:270,tile=4x2`, '-fps_mode', 'passthrough', '-frames:v', '1', CONTACT]);
console.log(`${MP4}: ${seconds.toFixed(2)} s, ${counted} frames\n${CONTACT}`);
```

- [ ] **Step 2: Write `promo/README.md`**

```md
# Promo video

`node promo/build.mjs` makes `promo/out/new-tab-promo.mp4` (16 s, 1920×1080, with its own beat)
and `promo/out/contact.png` (one frame per scene). `node promo/build.mjs --scene <name>` re-records
one scene (names in `timeline.mjs`) and rebuilds the video from the frames already there.

It needs Playwright's Chromium (`npx playwright install chromium`) and Python with numpy and
imageio-ffmpeg (`pip install numpy imageio-ffmpeg`). Everything on screen is made up: the page
comes from `fixtures/`, and recording fails if the page asks the network for anything.
```

- [ ] **Step 3: Run the full build**

Run: `node promo/build.mjs` (allow 5 minutes).
Expected: eight `<scene>: frames …` lines, then `…new-tab-promo.mp4: 16.0x s, 480 frames` and the
contact sheet path. There should be no error.

- [ ] **Step 4: Review the result**

- Read `promo/out/contact.png`. It has eight tiles in scene order, each with its headline, and
  nothing blank or broken.
- Run all the tests: `node --test` (the whole repo, including the extension's own tests) and
  `python -m unittest discover -s promo/test -p "test_*.py"`. Both pass.
- Hand the controller the full path of `promo/out/new-tab-promo.mp4`, so the user can watch and
  listen.

- [ ] **Step 5: Commit**

```bash
git add promo/build.mjs promo/README.md
git commit -m "feat: promo: build the MP4 from the frames and the beat, checked, with a contact sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Land on main

- [ ] **Step 1: Bring main in and re-test**

In the worktree, run these as separate commands:
1. `git merge main`
2. `node --test`
3. `python -m unittest discover -s promo/test -p "test_*.py"`

Both test runs should pass.

- [ ] **Step 2: Fast-forward main**

From main's checkout (`C:/Users/nivb4/OneDrive/Desktop/new-tab`), run:
`git merge --ff-only promo-video`

If main has uncommitted edits by another session in `.gitignore`, wait for them to commit before
merging. Don't touch their files.

- [ ] **Step 3: Tell the user**

Give the user the video's full path and the contact sheet's path. Nothing changed in the
extension itself, so it needs no reload.
