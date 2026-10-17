# Widget Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Layout mode, hovering or focusing a tray chip opens a card above it with the widget's
name, size and count, a tagline, a sentence or two on what it does, and the real widget shrunk to
fit, while the canvas outlines the cells a click would fill.

**Architecture:** A pure `plannedCopy` in `layout.js` says what a click would add (and `addCopy`
uses it). A new `widget-preview.js` builds the card and mounts the real widget through a thin store
wrapper that shows it its own copy, drawn at true size and scaled with `transform`. `edit-mode.js`
drives it from delegated pointer/focus events on the chips and reuses its drag ghost for the
outline. Text lives in a new data module `widget-about.js`, which setup also reads.

**Tech Stack:** Plain ES modules in a Chrome extension page, no build step; `node --test` for pure
modules; Playwright's Chromium driven over CDP with Node 22's built-in `WebSocket` for browser checks.

**Spec:** `docs/superpowers/specs/2026-10-17-widget-preview-design.md`

## Global Constraints

- Work in the worktree `.claude/worktrees/widget-preview` (branch `widget-preview`); never edit main's checkout (other sessions have uncommitted work there).
- Match the codebase's style: two-space indent, single quotes, semicolons, `el()` from `ui.js` for DOM, comments that say why in plain sentences.
- Card timing: opens after **300 ms** hover; switches at once between chips while open; closes **150 ms** after leaving.
- Widget box: at most **400 × 240 px**, never enlarged; card at least **300px** wide; **14px** side padding; **12px** from window edges; **10px** above the tray.
- Card `z-index: 47` (tray 40, `.ob-card` 45, `.ob-toast` 46).
- Footer strings, exactly: `Only one ${label}, and it’s on the page` · `Up to ${max} ${label} widgets, all on the page` · `No room: shrink or remove a widget first`.
- Header size text: `${w} × ${h} · ${n} of ${max}`, or for single types `${w} × ${h} · On the page` / `${w} × ${h} · Not on the page`.
- `js/onboarding.js` must keep a literal `const WIDGETS = { type: …, }` object: `.claude/hooks/onboarding-check.mjs` reads its keys.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- A `feat` commit that adds a new `js/*.js` module must also touch `js/onboarding.js` or `docs/onboarding.md` (the commit hook denies it otherwise).

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `js/layout.js` | modify | `plannedCopy`; `addCopy` built on it |
| `test/layout.test.js` | modify | `plannedCopy` tests |
| `js/widget-about.js` | create | `ABOUT`: tagline and about per type |
| `test/widget-about.test.js` | create | `ABOUT` covers exactly `TYPES` |
| `js/onboarding.js` | modify | `WIDGETS` values from `ABOUT`; Arrange tip |
| `js/ui.js` | modify | `scaleOf(node)` |
| `js/clock-widget.js` | modify | scale-safe fit; `ctx.preview` skips the intro |
| `js/github-widget.js` | modify | scale-safe `fitCommits` |
| `js/widget-preview.js` | create | the card and the mounted widget |
| `js/edit-mode.js` | modify | chip events, ghost outline, `cellPitch`, `aria-disabled` chips |
| `css/newtab.css` | modify | card, preview frame overrides, `aria-disabled` chips |
| `docs/onboarding.md`, `README.md` | modify | mention the preview |

---

### Task 1: `plannedCopy` in layout.js

**Files:**
- Modify: `js/layout.js` (the `addCopy` function, around line 316–333)
- Test: `test/layout.test.js`

**Interfaces:**
- Produces: `plannedCopy(layout, type, groups = [], activeGroupId = null)` → `{ type, x, y, w, h, settings } | null` (no `id`; doesn't change `layout`). `addCopy` keeps its signature and behaviour.

- [ ] **Step 1: Write the failing tests**

In `test/layout.test.js`, add `plannedCopy` to the import list from `'../js/layout.js'` (after `addCopy,`), then add these tests after the test named `'a new tiles copy is pinned to the first group no block shows; …'`:

```js
test('plannedCopy is what a tray click would add, without adding it', () => {
  const l = defaultLayout(legacy());
  assert.equal(plannedCopy(l, 'clock'), null);                 // limit 1
  assert.equal(plannedCopy(l, 'claude'), null);                // no room
  assert.equal(plannedCopy(l, 'weather'), null);
  removeCopy(l, byType(l).search.id);
  assert.deepEqual(plannedCopy(l, 'search'), { type: 'search', x: 3, y: 0, w: 6, h: 1, settings: {} });
  removeCopy(l, byType(l).notes.id);
  const m = plannedCopy(l, 'markets');
  assert.deepEqual(rect(m), [0, 8, 2, 3]);                     // where Notes was, at the minimum size
  assert.deepEqual(m.settings, { items: ['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS'] });
  assert.equal('id' in m, false);
  assert.equal(l.widgets.length, 5);                           // nothing was added
  const { id, ...added } = addCopy(l, 'markets');
  assert.equal(typeof id, 'string');
  assert.deepEqual(added, m);                                  // the click adds exactly the plan
});

test('plannedCopy pins a new tiles block and gives it columns for its width, as addCopy does', () => {
  const l = { cols: COLS, rows: ROWS, widgets: [{ id: 't', type: 'tiles', x: 0, y: 0, w: 3, h: 3, settings: { group: null, columns: 4 } }] };
  const groups = [{ id: 'g1' }, { id: 'g2' }];
  assert.deepEqual(plannedCopy(l, 'tiles', groups, 'g1'), { type: 'tiles', x: 3, y: 0, w: 6, h: 6, settings: { group: 'g2', columns: 5 } });
  assert.equal(plannedCopy(l, 'tiles').settings.group, null);  // no groups given: it follows the tabs
  const n = { cols: COLS, rows: ROWS, widgets: [{ id: 'big', type: 'tiles', x: 0, y: 0, w: 9, h: 12, settings: { group: null, columns: 5 } }] };
  assert.deepEqual(plannedCopy(n, 'tiles', groups, 'g1'), { type: 'tiles', x: 9, y: 0, w: 3, h: 3, settings: { group: 'g2', columns: 3 } });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/layout.test.js`
Expected: FAIL — `SyntaxError: The requested module '../js/layout.js' does not provide an export named 'plannedCopy'`.

- [ ] **Step 3: Implement**

In `js/layout.js`, replace the comment and body of `addCopy` (from `// Adds a copy at the first spot that takes its default size…` through the closing `}` of `addCopy`) with:

```js
// The copy a click on the tray would add, without an id and without adding it: the first spot
// that takes the type's default size, else its minimum size, with the type's default settings. A
// new tiles block is pinned to the first group no block shows, with columns to suit its width.
// Null when the type is at its limit or nothing fits.
export function plannedCopy(layout, type, groups = [], activeGroupId = null) {
  const t = TYPES[type];
  if (!t || countOf(layout, type) >= t.max) return null;
  const spot = firstFree(layout, ...t.size) ?? firstFree(layout, ...t.min);
  if (!spot) return null;
  const settings = t.defaults();
  if (type === 'tiles') {
    settings.group = unshownGroup(layout, groups, activeGroupId);
    // Columns to suit the width it landed in: the default block is 6 wide with 5 columns.
    settings.columns = clamp(Math.round(spot.w * 5 / 6), 2, 10);
  }
  return { type, ...spot, settings };
}

// Adds the planned copy, with `settings` over the planned ones. Returns the copy, or null when
// the type is at its limit or nothing fits.
export function addCopy(layout, type, settings, groups = [], activeGroupId = null) {
  const plan = plannedCopy(layout, type, groups, activeGroupId);
  if (!plan) return null;
  const copy = { id: uid(), ...plan, settings: { ...plan.settings, ...(isObj(settings) ? structuredClone(settings) : {}) } };
  layout.widgets.push(copy);
  return copy;
}
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, `# pass 273`, `# fail 0` (271 before plus the 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add js/layout.js test/layout.test.js
git commit -m "feat: layout.js plans the copy a tray click would add (plannedCopy); addCopy adds the plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `widget-about.js`, and setup reads its taglines from it

**Files:**
- Create: `js/widget-about.js`
- Create: `test/widget-about.test.js`
- Modify: `js/onboarding.js:34-39` (the `WIDGETS` object) and its imports

**Interfaces:**
- Produces: `ABOUT` — `{ [type]: { tagline: string, about: string } }` with exactly the keys of `TYPES`.

- [ ] **Step 1: Write the failing test**

Create `test/widget-about.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../js/layout.js';
import { ABOUT } from '../js/widget-about.js';

test('every widget type has a tagline and a few words on what it does, and no other type does', () => {
  assert.deepEqual(Object.keys(ABOUT).sort(), Object.keys(TYPES).sort());
  for (const [type, { tagline, about }] of Object.entries(ABOUT)) {
    assert.ok(typeof tagline === 'string' && tagline.trim(), `${type}: tagline`);
    assert.ok(typeof about === 'string' && about.trim(), `${type}: about`);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/widget-about.test.js`
Expected: FAIL — `Cannot find module …/js/widget-about.js`.

- [ ] **Step 3: Create `js/widget-about.js`**

```js
// What each widget type is, for the Layout mode tray's preview card and first-run setup: a
// tagline (one short line) and about (a sentence or two on what it does and what you can change).

export const ABOUT = {
  clock: {
    tagline: 'Time and a greeting',
    about: 'The time, the date and a greeting with your name. Pick a face with ✎, from a slim classic clock to big stencil digits; the time grows to fill its space.',
  },
  tasks: {
    tagline: 'To-dos with due dates',
    about: 'A to-do list with importance flags, due dates, repeats and subtasks, and Today, Upcoming and High views. Type “Call the bank !high tomorrow” and the flag and date are set for you.',
  },
  notes: {
    tagline: 'A scratch pad',
    about: 'A notes pad that saves as you type. Removing it keeps what you wrote for when you add it back.',
  },
  claude: {
    tagline: 'A box for long prompts',
    about: 'Room to write a long message; Enter sends it to a new chat on Claude, Shift+Enter starts a new line.',
  },
  markets: {
    tagline: 'Coins, indexes, currencies',
    about: 'Live prices with a line for the last few days: coins, SPY, QQQ, the Dow and currency pairs. Choose and order what it lists with ✎; each copy can list different things.',
  },
  github: {
    tagline: 'Your activity and PRs',
    about: 'Your stats, contribution map, open pull requests, review requests, issues, repos and latest commits, in the order you choose. Private repos need a token in Preferences → GitHub.',
  },
  sports: {
    tagline: 'Your teams’ games',
    about: 'Your NBA and NFL teams’ games, Messi’s matches and F1 sessions in one list by day, with live scores. Choose who to follow with ✎.',
  },
  tiles: {
    tagline: 'Your sites as tiles',
    about: 'Speed-dial tiles for the group tab you’re on, or pinned to one group. Each block has its own number of columns; drag a tile onto another block to move it there.',
  },
  search: {
    tagline: 'Google and AI chats',
    about: 'Search Google, or type a message that opens a new chat on Claude, ChatGPT or Gemini. Ctrl+Space puts the cursor in it from anywhere on the page.',
  },
  website: {
    tagline: 'Any site, live',
    about: 'Any site, live and signed in as you are, like your Pinterest feed. Give it an address and a zoom; Chrome asks once for access to the site.',
  },
  marvel: {
    tagline: 'The MCU in story order',
    about: 'Every MCU film, series, short and special in the order the story happens, with the next one to watch highlighted. Tick what you’ve watched as you go.',
  },
};
```

- [ ] **Step 4: Point setup's `WIDGETS` at `ABOUT`**

In `js/onboarding.js`, add after the line `import { spellWord, rippleFrom, motionAllowed } from './onboarding-fx.js';`:

```js
import { ABOUT } from './widget-about.js';
```

Replace the `WIDGETS` object (currently lines 34–39, from `const WIDGETS = {` to its `};`) with:

```js
// The widgets setup offers, in its order, with their taglines. Keep it a literal: the commit check
// (.claude/hooks/onboarding-check.mjs) reads these keys as the types setup offers.
const WIDGETS = {
  clock: ABOUT.clock.tagline, search: ABOUT.search.tagline, tasks: ABOUT.tasks.tagline,
  notes: ABOUT.notes.tagline, markets: ABOUT.markets.tagline, github: ABOUT.github.tagline,
  sports: ABOUT.sports.tagline, website: ABOUT.website.tagline, claude: ABOUT.claude.tagline,
  marvel: ABOUT.marvel.tagline,
};
```

- [ ] **Step 5: Check the hook still reads the keys**

Run:
```bash
node -e "const s=require('fs').readFileSync('js/onboarding.js','utf8');const a=s.indexOf('const WIDGETS = {');const b=s.slice(a,s.indexOf('\n};',a));console.log([...b.matchAll(/(?:^|[{\s,])([a-z][A-Za-z0-9]*):/g)].map(m=>m[1]).join(' '))"
```
Expected: `clock search tasks notes markets github sports website claude marvel`

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS, `# pass 274`, `# fail 0`.

- [ ] **Step 7: Commit** (touches `js/onboarding.js`, so the hook lets the new module through)

```bash
git add js/widget-about.js test/widget-about.test.js js/onboarding.js
git commit -m "feat: widget-about.js: a tagline and a few words on what each widget does; setup reads its taglines from there

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Widgets that measure stay right when drawn scaled

**Files:**
- Modify: `js/ui.js` (after `widgetEmpty`, around line 116)
- Modify: `js/clock-widget.js:4` (import), `:44` (signature), `:63-78` (`sizeFor`, `textWidth`), `:182-183` (intro)
- Modify: `js/github-widget.js:5` (import), `:82` (`fitCommits`)

**Interfaces:**
- Produces: `scaleOf(node)` → number (drawn width ÷ layout width; 1 when the node has no width). `mountClock(root, store, copy, ctx)` honours `ctx?.preview`.

These need a DOM, so they're checked in the browser in Task 5 (the clock's digits stay inside its frame in the preview).

- [ ] **Step 1: Add `scaleOf` to `js/ui.js`**

After the line `export const widgetEmpty = (...children) => el('p', { class: 'widget-empty' }, ...children);` add:

```js
// How much a node is drawn scaled by a transform on it or an ancestor (1 when it isn't):
// getBoundingClientRect measures drawn pixels, offsetWidth and clientWidth layout pixels.
export const scaleOf = node => (node.offsetWidth ? node.getBoundingClientRect().width / node.offsetWidth : 1);
```

- [ ] **Step 2: Make the clock's fit scale-safe and let the preview skip its intro**

In `js/clock-widget.js`:

Change `import { el, icon } from './ui.js';` to `import { el, icon, scaleOf } from './ui.js';`.

Change `export function mountClock(root, store, copy) {` to:

```js
// ctx.preview: drawn in the Layout mode tray's preview, which mounts it on every hover.
export function mountClock(root, store, copy, ctx) {
```

Replace `sizeFor` and `textWidth` (from `// The biggest font size at which the time fits width × height (0 if none).` through the `};` closing `textWidth`) with:

```js
  // The biggest font size at which the time fits width × height (0 if none). Rects are drawn
  // pixels, so they're divided by the widget's scale: the fit holds when it's drawn shrunk.
  function sizeFor(width, height) {
    if (width <= 0 || height <= 0) return 0;
    const k = scaleOf(section);
    let size = 100;
    for (let i = 0; i < 2; i++) {   // twice, as AM/PM keeps its own size while the digits scale
      probe.style.fontSize = `${size}px`;
      const box = probe.getBoundingClientRect();
      size *= Math.min(width * k / box.width, height * k / box.height);
    }
    return size;
  }
  const textWidth = node => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().width / scaleOf(section);
  };
```

Replace:

```js
  // A new tab builds its time out of a single point, then redraws it as plain text.
  playClockIntro(time, [date, greeting]).then(() => renderClock(true));
```

with:

```js
  // A new tab builds its time out of a single point, then redraws it as plain text. Not in the
  // tray's preview, where it would replay on every hover.
  if (!ctx?.preview) playClockIntro(time, [date, greeting]).then(() => renderClock(true));
```

- [ ] **Step 3: Make GitHub's commit fit scale-safe**

In `js/github-widget.js`, change `import { el, icon, svgEl, widgetSub, widgetEmpty } from './ui.js';` to `import { el, icon, svgEl, widgetSub, widgetEmpty, scaleOf } from './ui.js';`, and in `fitCommits` replace:

```js
      const bottom = i => rows[i].getBoundingClientRect().bottom;
```

with:

```js
      const k = scaleOf(section);   // rects are drawn pixels; scrollHeight is layout pixels
      const bottom = i => rows[i].getBoundingClientRect().bottom / k;
```

- [ ] **Step 4: Run all tests and a syntax check**

Run: `npm test` then `node --check js/ui.js && node --check js/clock-widget.js && node --check js/github-widget.js`
Expected: `# pass 274`, `# fail 0`; the checks print nothing.

- [ ] **Step 5: Commit**

```bash
git add js/ui.js js/clock-widget.js js/github-widget.js
git commit -m "fix: the clock's fit and GitHub's commit rows measure right when the widget is drawn scaled; a preview clock skips its intro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The preview card, wired into Layout mode's tray

**Files:**
- Create: `js/widget-preview.js`
- Modify: `js/edit-mode.js` (imports; tray chips in `renderTray`; `add`; new preview section; drag pitch; `exit`)
- Modify: `css/newtab.css` (tray chip `:disabled` rules around line 1506; new block after `.tray-right`)
- Modify: `js/onboarding.js` (Arrange tips), `docs/onboarding.md`, `README.md`

**Interfaces:**
- Consumes: `plannedCopy` (Task 1), `ABOUT` (Task 2), `mountClock(…, ctx)` with `ctx.preview` (Task 3), `WIDGETS` from `registry.js`, `activeLayout`, `countOf`, `TYPES`, `COLS`, `ROWS` from `layout.js`.
- Produces: `createPreview(store, ctx, { pitch })` → `{ show(chip, type) → plan | null, hide(), type }`, where `pitch()` → `{ x, y, gx, gy }`.

- [ ] **Step 1: Create `js/widget-preview.js`**

```js
// The Layout mode tray's preview: hovering or focusing a chip opens a card above it with what the
// widget is, what it does, and the real widget as a click would add it, drawn at its true size and
// shrunk to fit. Widgets draw nothing without their copy in a layout, so the preview's widget gets
// a store that shows it its own copy. It's destroyed when the card closes.

import { el, icon } from './ui.js';
import { WIDGETS } from './registry.js';
import { TYPES, COLS, ROWS, activeLayout, countOf, plannedCopy } from './layout.js';
import { ABOUT } from './widget-about.js';

const PREVIEW_ID = 'preview';
const BOX_W = 400;   // px: the widget is shrunk to fit this box, never enlarged
const BOX_H = 240;
const PAD = 14;      // px: the card's side padding
const MIN_W = 300;   // px: the card's narrowest
const EDGE = 12;     // px kept between the card and the window's edges
const LIFT = 10;     // px between the card and the tray's top edge
const ARROW = 16;    // px: the arrow stays this far inside the card's corners

// The real store, except that what the widget reads has `copy` in a layout of its own, where
// copyById finds it. A fresh shallow copy on every read, as the store changes its state in place.
// Writes go to the real store, where no layout has the copy.
function storeWithCopy(store, copy) {
  const view = s => ({ ...s, prefs: { ...s.prefs, layouts: { ...s.prefs.layouts, [PREVIEW_ID]: { cols: COLS, rows: ROWS, widgets: [copy] } } } });
  return {
    get: () => view(store.get()),
    subscribe: (fn, keys) => store.subscribe((s, changed) => fn(view(s), changed), keys),
    update: (fn, keys) => store.update(fn, keys),
  };
}

const sizeLabel = (copy, t, n) => `${copy.w} × ${copy.h} · ${t.max === 1 ? (n ? 'On the page' : 'Not on the page') : `${n} of ${t.max}`}`;

// Why the chip can't add right now, or '' when it can.
function whyNot(t, n, plan) {
  if (plan) return '';
  if (n >= t.max) return t.max === 1 ? `Only one ${t.label}, and it’s on the page` : `Up to ${t.max} ${t.label} widgets, all on the page`;
  return 'No room: shrink or remove a widget first';
}

// ctx: the canvas's, handed to the widget with preview: true. pitch(): the canvas's cell pitch
// and gaps in px, { x, y, gx, gy }.
export function createPreview(store, ctx, { pitch }) {
  const head = el('div', { class: 'wp-head' });
  const tagline = el('p', { class: 'wp-tagline' });
  const about = el('p', { class: 'wp-about' });
  const box = el('div', { class: 'wp-box' });
  const foot = el('p', { class: 'wp-foot' });
  const card = el('div', { class: 'widget-preview', id: 'widget-preview', role: 'tooltip' }, head, tagline, about, box, foot);
  let shown = null;   // { type, key, handle }

  function unmount() {
    try {
      shown?.handle?.destroy?.();
    } catch (err) {
      console.error(err);
    }
    box.replaceChildren();
  }

  // The widget for `copy`, laid out w × h px and drawn scaled by k. A widget that throws leaves
  // the box empty.
  function mount(copy, w, h, k) {
    const root = el('div', { class: 'widget-root' });
    const frame = el('section', { class: `widget-frame frame-${copy.type} preview-frame`, dataset: { type: copy.type }, inert: true }, root);
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.transform = `scale(${k})`;
    box.replaceChildren(frame);
    try {
      return WIDGETS[copy.type].mount(root, storeWithCopy(store, copy), { id: PREVIEW_ID, type: copy.type }, { ...ctx, preview: true });
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  function place(chip) {
    const r = chip.getBoundingClientRect();
    const top = chip.closest('.layout-tray')?.getBoundingClientRect().top ?? r.top;
    const w = card.offsetWidth;
    const centre = r.left + r.width / 2;
    const left = Math.min(Math.max(centre - w / 2, EDGE), innerWidth - EDGE - w);
    card.style.left = `${Math.round(left)}px`;
    card.style.bottom = `${Math.round(innerHeight - top + LIFT)}px`;
    card.style.setProperty('--arrow-x', `${Math.round(Math.min(Math.max(centre - left, ARROW), w - ARROW))}px`);
  }

  // Opens, or refreshes, the card for `type` above `chip`. Returns the copy a click would add, or
  // null when the chip can't add.
  function show(chip, type) {
    const t = TYPES[type];
    if (!t) return null;
    const s = store.get();
    const layout = activeLayout(s);
    const n = countOf(layout, type);
    const plan = plannedCopy(layout, type, s.groups, s.activeGroupId);
    const copy = { id: PREVIEW_ID, ...(plan ?? { type, x: 0, y: 0, w: t.size[0], h: t.size[1], settings: t.defaults() }) };
    const p = pitch();
    const w = Math.round(copy.w * p.x - p.gx);
    const h = Math.round(copy.h * p.y - p.gy);
    const k = Math.min(1, BOX_W / w, BOX_H / h);

    head.replaceChildren(icon(t.icon, 16), el('b', { text: t.label }), el('span', { class: 'wp-size', text: sizeLabel(copy, t, n) }));
    tagline.textContent = ABOUT[type].tagline;
    about.textContent = ABOUT[type].about;
    foot.textContent = whyNot(t, n, plan);
    foot.hidden = !foot.textContent;
    box.style.width = `${Math.round(w * k)}px`;
    box.style.height = `${Math.round(h * k)}px`;
    card.style.width = `${Math.max(MIN_W, Math.round(w * k) + 2 * PAD)}px`;
    if (!card.isConnected) document.body.append(card);

    // The same widget at the same size stays mounted: a widget that writes to the store as it
    // mounts redraws the tray, which shows the card again.
    const key = JSON.stringify([copy, w, h]);
    if (shown?.key !== key) {
      unmount();
      shown = { type, key, handle: null };
      shown.handle = mount(copy, w, h, k);
    }
    // A redraw while mounting replaces the chips; place the card on the new one.
    place(chip.isConnected ? chip : document.querySelector(`.tray-chip[data-type="${type}"]`) ?? chip);
    return plan;
  }

  function hide() {
    if (!shown) return;
    unmount();
    shown = null;
    card.remove();
  }

  return {
    show,
    hide,
    // The type shown, or null.
    get type() {
      return shown?.type ?? null;
    },
  };
}
```

- [ ] **Step 2: Wire it into `js/edit-mode.js`**

2a. Imports. Change the `layout.js` import to add `plannedCopy`:

```js
import {
  TYPES, COLS, ROWS, copyById, copyTitle, countOf, fits, firstFree, addCopy, duplicateCopy, removeCopy, moveCopy, resetLayout, prefsSection,
  swapPlan, swapCopy, activeLayout, ownLayout, plannedCopy,
} from './layout.js';
import { gridArea } from './canvas.js';
import { createPreview } from './widget-preview.js';
```

2b. Constants and the pitch helper. After `const DIRS = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];` add:

```js
const OPEN_MS = 300;    // hover before a chip's preview opens
const CLOSE_MS = 150;   // after leaving the chips before it closes, so cutting across doesn't flicker

// The canvas's cell pitch (a cell plus a gap) and gaps in px, from its size, padding and gaps.
function cellPitch(root) {
  const cs = getComputedStyle(root);
  const r = root.getBoundingClientRect();
  const gx = parseFloat(cs.columnGap);
  const gy = parseFloat(cs.rowGap);
  return {
    x: (r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + gx) / COLS,
    y: (r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) + gy) / ROWS,
    gx,
    gy,
  };
}
```

2c. Create the preview. Right after the `const tray = el('div', { class: 'layout-tray', … }` statement (ending `onclick: () => exit() })));`) add:

```js
  const preview = createPreview(store, ctx, { pitch: () => cellPitch(root) });
```

2d. Chips. In `renderTray`, replace the chip-building lines:

```js
      const chip = el('button', { type: 'button', class: 'tray-chip', dataset: { type }, onclick: () => add(type) },
        icon('plus', 13), el('span', { text: t.label }), el('b', { text: t.max === 1 ? (n ? 'on' : 'off') : `${n}/${t.max}` }));
      chip.disabled = n >= t.max || !room;
      chip.title = n >= t.max ? limitTitle(t) : !room ? 'No room: shrink or remove a widget first' : `Add ${t.label}`;
      if (n < t.max && !room) roomless++;
      return chip;
    }));
    // Said in words, not only in tooltips: a new page fills every cell, so nothing can be added yet.
    full.hidden = !roomless || [...chips.children].some(c => !c.disabled);
    document.body.style.setProperty('--tray-h', `${tray.offsetHeight || 64}px`);
```

with:

```js
      const chip = el('button', { type: 'button', class: 'tray-chip', dataset: { type }, 'aria-describedby': 'widget-preview', onclick: () => add(type) },
        icon('plus', 13), el('span', { text: t.label }), el('b', { text: t.max === 1 ? (n ? 'on' : 'off') : `${n}/${t.max}` }));
      // Greyed out, but still hoverable and focusable so its preview can say why.
      chip.setAttribute('aria-disabled', String(n >= t.max || !room));
      if (n < t.max && !room) roomless++;
      return chip;
    }));
    // Said in words on the tray too: a new page fills every cell, so nothing can be added yet.
    full.hidden = !roomless || [...chips.children].some(c => c.getAttribute('aria-disabled') !== 'true');
    document.body.style.setProperty('--tray-h', `${tray.offsetHeight || 64}px`);
    // A redraw while the card is open: it follows its type to the new chip.
    const open = preview.type && chips.querySelector(`.tray-chip[data-type="${preview.type}"]`);
    if (open) showPreview(open);
```

2e. `add`. Replace the whole `add` function with:

```js
  function add(type) {
    const s = store.get();
    if (!plannedCopy(activeLayout(s), type, s.groups, s.activeGroupId)) return;   // a greyed-out chip
    hidePreview();
    let copy = null;
    store.update(st => { copy = addCopy(activeLayout(st), type, undefined, st.groups, st.activeGroupId); });
    if (copy) focusFrame(copy.id);
  }
```

2f. The preview section. Insert before the line `  // ---- drag and resize ----`:

```js
  // ---- the preview: hovering or focusing a chip shows its widget and where it would go ----
  // Delegated on the chips' container, which keeps its listeners when renderTray replaces the
  // chips. The card opens after a short hover, switches at once between chips while open, and
  // closes a moment after the pointer leaves them.

  let openTimer = 0;
  let closeTimer = 0;

  function showPreview(chip) {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    const plan = preview.show(chip, chip.dataset.type);
    ghost.classList.remove('bad');
    ghost.hidden = !plan;
    if (plan) ghost.style.gridArea = gridArea(plan);
  }

  function hidePreview() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if (preview.type === null) return;
    preview.hide();
    ghost.hidden = true;
  }

  chips.addEventListener('pointerover', e => {
    const chip = e.target.closest('.tray-chip');
    if (!chip) return;
    clearTimeout(closeTimer);
    if (preview.type === chip.dataset.type) return;
    clearTimeout(openTimer);
    if (preview.type !== null) showPreview(chip);
    else openTimer = setTimeout(() => showPreview(chip), OPEN_MS);
  });
  chips.addEventListener('pointerout', e => {
    const chip = e.target.closest('.tray-chip');
    if (!chip || chip.contains(e.relatedTarget)) return;
    clearTimeout(openTimer);
    closeTimer = setTimeout(hidePreview, CLOSE_MS);
  });
  // Keyboard focus only: the focus a click leaves on a chip doesn't open it.
  chips.addEventListener('focusin', e => {
    const chip = e.target.closest('.tray-chip');
    if (chip?.matches(':focus-visible')) showPreview(chip);
  });
  chips.addEventListener('focusout', hidePreview);
```

2g. The drag. In the `root.addEventListener('pointerdown', …)` handler, change its first line from

```js
    if (!active || e.button !== 0) return;
```

to

```js
    if (!active || e.button !== 0) return;
    hidePreview();   // before the drag takes the ghost over
```

and replace the four pitch lines

```js
    const cs = getComputedStyle(root);
    const r = root.getBoundingClientRect();
    const pitchX = (r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + parseFloat(cs.columnGap)) / COLS;
    const pitchY = (r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) + parseFloat(cs.rowGap)) / ROWS;
```

with

```js
    const { x: pitchX, y: pitchY } = cellPitch(root);
```

2h. Leaving. In `exit`, insert `    hidePreview();` immediately before the line `    overlay.remove();`.

- [ ] **Step 3: Check nothing else in the page grabs every `.widget-frame`**

Run: `grep -n "widget-frame" js/*.js`
Expected: only `js/canvas.js`, `js/edit-mode.js`, `js/widget-preview.js`, and `js/ascii-bg.js` (its `NO_RIPPLE` selector, harmless for the card). Queries in `edit-mode.js` are scoped to the canvas (`root`) or the frames map. If anything else iterates `document.querySelectorAll('.widget-frame')`, scope it to `.canvas > .widget-frame` and note it in the commit.

- [ ] **Step 4: CSS**

In `css/newtab.css`, replace

```css
.tray-chip:disabled { opacity: 0.4; cursor: default; }
.tray-chip:disabled:hover { border-color: var(--border); }
```

with

```css
.tray-chip[aria-disabled="true"] { opacity: 0.4; cursor: default; }
.tray-chip[aria-disabled="true"]:hover { border-color: var(--border); }
```

After the line `.tray-right { margin-left: auto; display: flex; gap: 6px; }` add:

```css
/* The tray's preview card (widget-preview.js): above the chip, the real widget shrunk inside. */
.widget-preview {
  position: fixed;
  z-index: 47;   /* over the tray, setup's card docked above it, and setup's toast */
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
  padding: 12px 14px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  pointer-events: none;
  animation: wp-rise 0.12s ease-out;
}
.widget-preview::after {
  content: '';
  position: absolute;
  top: 100%;
  left: var(--arrow-x, 50%);
  width: 10px;
  height: 10px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  translate: -50% -50%;
  rotate: 45deg;
}
@keyframes wp-rise { from { opacity: 0; translate: 0 4px; } }
.wp-head { display: flex; align-items: center; gap: 7px; font-size: 13.5px; }
.wp-head .icon { flex: none; color: var(--accent); }
.wp-size { margin-left: auto; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.wp-tagline { margin: 2px 0 0; font-size: 13px; font-weight: 600; }
.wp-about { margin: 0; color: var(--muted); font-size: 12.5px; line-height: 1.45; }
.wp-box { position: relative; align-self: center; margin-top: 4px; overflow: hidden; border-radius: 10px; outline: 1px solid var(--border); background: var(--bg); }
.wp-foot { margin: 2px 0 0; color: var(--muted); font-size: 11.5px; }
/* Over Layout mode's, the wallpaper's and setup's frame rules: the widget as it sits on the page. */
.widget-preview .widget-frame.preview-frame {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  outline: none;
  border-radius: 0;
  background: var(--bg);
  cursor: default;
  opacity: 1;
  text-shadow: none;
  transition: none;
}
.widget-preview .preview-frame .widget-root { opacity: 1; }
```

In the existing block

```css
@media (prefers-reduced-motion: reduce) {
  body.layout-editing .widget-frame { transition: none; }
}
```

add a line inside it so it reads:

```css
@media (prefers-reduced-motion: reduce) {
  body.layout-editing .widget-frame { transition: none; }
  .widget-preview { animation: none; }
}
```

- [ ] **Step 5: Setup's Arrange tip, docs/onboarding.md, README**

`js/onboarding.js`, in `arrange()`, change `['The tray', ' adds']` to `['The tray', ' adds; hover a widget there to preview it']`.

`docs/onboarding.md`: in the experience table, change the Arrange row's "What the user does" cell from `Drags, resizes, swaps, removes, adds from the tray` to `Drags, resizes, swaps, removes, adds from the tray (hovering a chip previews its widget)`. In "What setup covers", change `| Layout mode: drag, resize, swap, remove, the tray | Arrange, Moves |` to `| Layout mode: drag, resize, swap, remove, the tray and its previews | Arrange, Moves |`.

`README.md`, in the Layout mode section's **The tray** bullet, replace

```
  chip is greyed out at the limit or when nothing fits; a new page fills every cell, and the tray
  then says so. **Reset layout** puts one copy of each widget back in its default place, keeping
  its settings.
```

with

```
  chip is greyed out at the limit or when nothing fits; a new page fills every cell, and the tray
  then says so. Hover a chip, or Tab to it, for a card with what the widget does and the real
  widget as it would look, while an outline shows the cells it would take; a greyed-out chip's
  card says why. **Reset layout** puts one copy of each widget back in its default place, keeping
  its settings.
```

- [ ] **Step 6: Tests and syntax**

Run: `npm test` then `node --check js/widget-preview.js && node --check js/edit-mode.js && node --check js/onboarding.js`
Expected: `# pass 274`, `# fail 0`; the checks print nothing.

- [ ] **Step 7: Commit** (touches `js/onboarding.js` and `docs/onboarding.md`, so the hook lets the new module through)

```bash
git add js/widget-preview.js js/edit-mode.js css/newtab.css js/onboarding.js docs/onboarding.md README.md
git commit -m "feat: Layout mode: hover or focus a tray chip for a card with the live widget, what it does, and an outline where it would go

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Browser check

**Files:**
- Create (scratchpad, not the repo): `C:\Users\nivb4\AppData\Local\Temp\claude\c--Users-nivb4-OneDrive-Desktop-new-tab\86522bce-5b43-4278-907e-ad4082925a2e\scratchpad\check-preview.mjs`

Ports: pick an HTTP port and a CDP port nobody uses (`netstat -ano | grep -E ':(5563|9349) '` prints nothing for the defaults below; pick others if it does).

- [ ] **Step 1: Start the static server from the worktree** (background)

Run (background): `python -m http.server 5563 --bind 127.0.0.1` with the worktree as the working directory.
Expected: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5563/newtab.html` prints `200`.

- [ ] **Step 2: Write the check script**

```js
// Checks the Layout mode tray preview in Playwright's Chromium over CDP, against the static
// preview server. Usage: node check-preview.mjs <http-port> <cdp-port> <out-dir>
// Prints one line per check (ok / FAIL) and writes screenshots to <out-dir>.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [, , HTTP, CDP, OUT] = process.argv;
const CHROME = 'C:/Users/nivb4/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const URL = `http://127.0.0.1:${HTTP}/newtab.html`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${OUT}/profile`, '--no-first-run', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
let targets = [];
for (let i = 0; i < 50 && !targets.length; i++) {
  await sleep(200);
  try { targets = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).filter(t => t.type === 'page'); } catch {}
}
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const waiting = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params = {}) => new Promise(r => {
  const id = ++seq;
  waiting.set(id, r);
  ws.send(JSON.stringify({ id, method, params }));
}).then(m => { if (m.error) throw new Error(`${method}: ${m.error.message}`); return m.result; });
const js = async body => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
const press = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
const click = async (x, y) => { await move(x, y); await press('mousePressed', x, y); await press('mouseReleased', x, y); };
const key = async (k, code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
};
const shot = async name => writeFileSync(`${OUT}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const load = async () => { await send('Page.navigate', { url: URL }); await sleep(1800); };
// Runs `body` on the saved state `s` in the page, saves it and reloads.
const seed = async body => {
  await sleep(400);   // the store saves 200 ms after a change
  await js(`const s = JSON.parse(localStorage.getItem('newtab:state') || '{}'); ${body}; localStorage.setItem('newtab:state', JSON.stringify(s));`);
  await load();
};
const enterLayout = async () => { await js(`document.getElementById('btn-layout').click();`); await sleep(400); };
const away = async () => { await move(800, 300); await sleep(300); };
const chipAt = type => js(`const r = document.querySelector('.tray-chip[data-type="${type}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
const hover = async (type, wait = 450) => { const c = await chipAt(type); await move(c.x, c.y); await sleep(wait); return c; };
const frames = () => js(`return document.querySelectorAll('.canvas > .widget-frame').length;`);
const card = () => js(`
  const card = document.querySelector('.widget-preview');
  if (!card) return null;
  const r = card.getBoundingClientRect();
  const box = card.querySelector('.wp-box').getBoundingClientRect();
  const frame = card.querySelector('.preview-frame');
  const foot = card.querySelector('.wp-foot');
  const ghost = document.querySelector('.canvas-ghost:not(.other)');
  const time = frame?.querySelector('.clock-time:not(.clock-probe)')?.getBoundingClientRect();
  const fr = frame?.getBoundingClientRect();
  return {
    type: frame?.dataset.type ?? null,
    head: card.querySelector('.wp-head').textContent,
    tagline: card.querySelector('.wp-tagline').textContent,
    about: card.querySelector('.wp-about').textContent,
    foot: foot.hidden ? '' : foot.textContent,
    inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    box: [Math.round(box.width), Math.round(box.height)],
    opacity: frame ? [getComputedStyle(frame).opacity, getComputedStyle(frame.querySelector('.widget-root')).opacity] : [],
    inert: frame?.inert ?? false,
    content: frame?.querySelector('.widget-root').childElementCount ?? 0,
    text: frame ? frame.innerText.trim().replace(/\\s+/g, ' ').slice(0, 70) : '',
    ghost: ghost && !ghost.hidden ? ghost.style.gridArea : null,
    z: getComputedStyle(card).zIndex,
    clockInside: time ? time.left >= fr.left - 1 && time.right <= fr.right + 1 && time.top >= fr.top - 1 && time.bottom <= fr.bottom + 1 : null,
  };`);

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setUserAgentOverride', { userAgent: UA });
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

// A set-up default page: every cell taken.
await load();
await seed(`s.onboarding = { done: true, step: 'done' }`);
await enterLayout();
check('Layout mode opens', await js(`return document.body.classList.contains('layout-editing');`));
const types = await js(`return [...document.querySelectorAll('.tray-chip')].map(c => c.dataset.type);`);
check('one chip per type', types.length === 11, types.join(' '));

// 1. Every chip: nothing at 150 ms, then the card with its live widget.
for (const type of types) {
  await away();
  await hover(type, 150);
  const early = await card();
  await sleep(350);
  const c = await card();
  check(`${type}: waits before opening`, early === null);
  check(`${type}: opens with its widget`, c?.type === type && c.content > 0, c ? `${c.head} | ${c.text}` : 'no card');
  if (!c) continue;
  check(`${type}: tagline and about`, c.tagline.length > 0 && c.about.length > 0);
  check(`${type}: fits 400 × 240`, c.box[0] <= 400 && c.box[1] <= 240, c.box.join(' × '));
  check(`${type}: full opacity and inert`, c.opacity.every(o => o === '1') && c.inert, c.opacity.join(', '));
  check(`${type}: inside the window`, c.inside);
  if (type === 'clock') check('clock: the time fits its frame', c.clockInside === true);
  await shot(`chip-${type}`);
}

// 2. A full page: no room, no outline; switching is immediate; a greyed-out chip adds nothing.
await away();
await hover('markets');
let c = await card();
check('full page: No room footer, no outline', c?.foot === 'No room: shrink or remove a widget first' && c.ghost === null, c?.foot);
check('card z-index 47', c?.z === '47', c?.z);
const clockChip = await hover('clock', 40);
c = await card();
check('moving to another chip switches at once', c?.type === 'clock');
check('clock at its limit says so', c?.foot === 'Only one Clock, and it’s on the page' && c.head.endsWith('On the page'), `${c?.head} | ${c?.foot}`);
let n = await frames();
await click(clockChip.x, clockChip.y);
await sleep(300);
check('a greyed-out chip adds nothing', (await frames()) === n);

// 3. With room: the outline sits on the planned cells and the click fills them.
await away();
await js(`document.querySelector('.canvas > .frame-notes .frame-remove').click();`);
await sleep(300);
const claudeChip = await hover('claude');
c = await card();
check('with room: outline, no footer', !!c?.ghost && c.foot === '', `${c?.ghost} | ${c?.head}`);
await shot('claude-with-room');
await click(claudeChip.x, claudeChip.y);
await sleep(400);
const placed = await js(`const f = [...document.querySelectorAll('.canvas > .frame-claude')].at(-1); return f ? f.style.gridArea : null;`);
check('the click fills the outlined cells', placed === c?.ghost, `${placed} vs ${c?.ghost}`);
check('the click closes the card', (await card()) === null);

// 4. Leaving closes after a moment; a press on the canvas closes at once.
await away();
await hover('markets');
await move(800, 300);
await sleep(60);
check('leaving keeps the card a moment', (await card()) !== null);
await sleep(200);
check('then closes it', (await card()) === null);
await hover('markets');
const fr = await js(`const r = document.querySelector('.canvas > .frame-markets').getBoundingClientRect(); return { x: r.left + 30, y: r.top + 30 };`);
await move(fr.x, fr.y);
await press('mousePressed', fr.x, fr.y);
check('a press on the canvas closes it at once', (await card()) === null);
await press('mouseReleased', fr.x, fr.y);
await sleep(200);

// 5. Keyboard: Tab onto a chip opens its card; blur closes it.
await away();
await js(`document.querySelector('.tray-chip[data-type="github"]').focus();`);
await sleep(80);
check('focus left by a pointer stays quiet', (await card()) === null);
await key('Tab', 'Tab', 9);
await sleep(120);
check('Tab to a chip opens its card', (await card())?.type === 'sports');
await js(`document.activeElement.blur();`);
await sleep(80);
check('blur closes it', (await card()) === null);

// 6. The first and last chips keep the card inside the window.
for (const type of [types[0], types.at(-1)]) {
  await away();
  await hover(type);
  check(`${type}: card inside the window`, (await card())?.inside === true);
}

// 7. A tab with its own, empty layout: counts and outline follow it. Light theme.
await away();
await js(`document.querySelector('.layout-tray .btn-primary').click();`);   // Done
await seed(`s.prefs.layouts = { ...s.prefs.layouts, [s.activeGroupId]: { cols: 12, rows: 12, widgets: [] } }; s.prefs.theme = 'light'`);
await enterLayout();
await hover('markets');
c = await card();
check('own layout: count and outline from it', c?.head.endsWith('0 of 5') && c.ghost === '1 / 1 / span 5 / span 3', `${c?.head} | ${c?.ghost}`);
await shot('own-layout-light');

// 8. Setup's Arrange step: the card sits over setup's card.
await away();
await js(`document.querySelector('.layout-tray .btn-primary').click();`);
await seed(`s.onboarding = { done: false, step: 'arrange' }; s.prefs.theme = 'dark'`);
await sleep(800);
if (!(await js(`return document.body.classList.contains('layout-editing');`))) await enterLayout();
await hover('sports');
c = await card();
const ob = await js(`const o = document.querySelector('.ob-card'); return o && !o.hidden ? getComputedStyle(o).zIndex : null;`);
check('Arrange: card over setup\'s card', c !== null && ob !== null && Number(c.z) > Number(ob), `card ${c?.z}, setup ${ob}`);
await shot('arrange-step');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
ws.close();
chrome.kill();
process.exit(failures ? 1 : 0);
```

- [ ] **Step 3: Run it**

Run: `node C:\Users\nivb4\AppData\Local\Temp\claude\c--Users-nivb4-OneDrive-Desktop-new-tab\86522bce-5b43-4278-907e-ad4082925a2e\scratchpad\check-preview.mjs 5563 9349 C:\Users\nivb4\AppData\Local\Temp\claude\c--Users-nivb4-OneDrive-Desktop-new-tab\86522bce-5b43-4278-907e-ad4082925a2e\scratchpad\preview-run`
Expected: every line `ok`, last line `all passed`.

If a check fails, debug it with superpowers:systematic-debugging before changing code. A check can be wrong too (headless focus heuristics, timing): fix whichever is wrong and say which in the commit.

- [ ] **Step 4: Look at the screenshots**

Read `chip-clock.png`, `chip-markets.png`, `chip-tiles.png`, `chip-search.png`, `chip-marvel.png`, `claude-with-room.png`, `own-layout-light.png` and `arrange-step.png` in the run folder. Check:
- the widget in the card looks like the one on the canvas, only smaller, undimmed and without a dashed outline;
- the arrow points at the hovered chip;
- the outline sits on the canvas cells in `claude-with-room.png` and `own-layout-light.png`;
- the card covers setup's card in `arrange-step.png`.

Fix anything that looks wrong (CSS in `css/newtab.css`), re-run Step 3, and commit any fixes:

```bash
git add css/newtab.css js/widget-preview.js js/edit-mode.js
git commit -m "fix: widget preview: <what the screenshots showed>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Clean up**

Stop the server: kill `python3.13.exe` processes whose command line contains `http.server 5563`, and `chrome.exe` processes whose command line contains `preview-run\profile`.

---

### Task 6: Land on main

- [ ] **Step 1: Merge main into the branch and re-test**

Run: `git merge main` (in the worktree). Resolve conflicts if another session's work landed in `layout.js`, `edit-mode.js`, `css/newtab.css` or `onboarding.js` (widget stacks: `copiesOf`, stack entries; `plannedCopy` only uses `firstFree`, `countOf` and `TYPES`, so it composes). If `TYPES` gained a type, add it to `ABOUT`.
Then: `npm test` (expect all pass) and re-run the Task 5 check (expect `all passed`).

- [ ] **Step 2: Fast-forward main**

Leave the worktree (ExitWorktree, keep). If main's checkout has uncommitted edits to any file this branch changes (`git status --porcelain -- js/layout.js js/edit-mode.js js/onboarding.js js/ui.js js/clock-widget.js js/github-widget.js css/newtab.css README.md docs/onboarding.md test/layout.test.js`), don't touch them: tell the user and wait. Otherwise run `git merge --ff-only widget-preview` in main's checkout and tell the peer sessions (widget-stacks) that main moved.
