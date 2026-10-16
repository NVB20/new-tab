# Layout Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three fixed columns with one 12 × 12 canvas of widget copies that a Layout mode can drag, resize, add, duplicate and remove, with tile blocks as widgets.

**Architecture:** `prefs.layout` holds widget copies (type, cells, settings); `layout.js` is the pure geometry and conversion layer; `canvas.js` renders one frame per copy through a registry of per-type mounts that read their copy's settings; `edit-mode.js` (lazy) writes layout changes through the store. Old saved states convert once in `normalizeState`.

**Tech Stack:** Plain ES modules, no build step, `node --test`, CSS grid and container queries, Playwright's Chromium for visual checks.

Spec: `docs/superpowers/specs/2026-10-16-layout-mode-design.md`

## Global Constraints

- Work on `main` directly (the user asked); commit after every task; `npm test` green at each commit.
- Outside Layout mode the page must look as it does today after the conversion (flat widgets, no frames).
- Limits: Clock, Tasks, Notes max 1; Claude, Markets, GitHub, Tiles, Search bar max 5. Canvas 12 × 12.
- `prefs.search` keeps the engine switches and `mode` only; `prefs.github.token` is the one token; `notes` and `tasks` are untouched.
- Every widget mount is `mount(root, store, copy, ctx) → { destroy() }` and reads `copyById(store.get(), copy.id).settings`.
- No new dependencies. Pure modules touch no browser globals at import time.

---

### Task 1: `layout.js`: types, geometry, default layout, validation, mutations

**Files:**
- Create: `js/layout.js`
- Test: `test/layout.test.js`

**Interfaces:**
- Consumes: `uid`, `clamp` from `js/util.js`; `cleanMarketItems` from `js/feeds.js`.
- Produces: `COLS`, `ROWS`, `GITHUB_PARTS`, `TYPES`, `fits(layout, rect, ignoreId?)`, `firstFree(layout, w, h)`, `countOf(layout, type)`, `copyById(state, id)`, `stackOrder(widgets)`, `defaultPositions(types, side)`, `defaultLayout(old)`, `normalizeLayout(raw, state)`, `addCopy(layout, type, settings?, groups?)`, `duplicateCopy(layout, id, groups?)`, `removeCopy(layout, id)`, `moveCopy(layout, id, rect)`, `resetLayout(layout)`, `partsFromShow(show)`, `copyTitle(copy, groups)`.

- [ ] **Step 1: Write the failing tests** in `test/layout.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, ROWS, TYPES, GITHUB_PARTS, fits, firstFree, countOf, stackOrder, defaultLayout, normalizeLayout,
  addCopy, duplicateCopy, removeCopy, moveCopy, resetLayout, copyTitle,
} from '../js/layout.js';

const legacy = over => ({
  columns: 5,
  search: { enabled: true, row: 0 },
  widgets: {
    enabled: true, position: 'left',
    clock: { enabled: true, hour24: true, name: 'Niv', greeting: true, face: 'serif', colon: true },
    tasks: { enabled: true }, notes: { enabled: true }, claude: { enabled: false },
    markets: { enabled: true, items: ['BTC', 'USD/ILS'] },
    github: { enabled: true, user: 'octo', show: 'both' },
  },
  ...over,
});
const byType = layout => Object.fromEntries(layout.widgets.map(c => [c.type, c]));
const rect = c => [c.x, c.y, c.w, c.h];
const state = layout => ({ groups: [{ id: 'g1', title: 'Home' }, { id: 'g2', title: 'Work' }], prefs: { layout } });

test('the default conversion mirrors today\'s page', () => {
  const l = defaultLayout(legacy());
  const t = byType(l);
  assert.deepEqual(rect(t.clock), [0, 0, 3, 4]);
  assert.deepEqual(rect(t.tasks), [0, 4, 3, 4]);
  assert.deepEqual(rect(t.notes), [0, 8, 3, 4]);
  assert.deepEqual(rect(t.tiles), [3, 0, 6, 12]);
  assert.deepEqual(rect(t.markets), [9, 0, 3, 5]);
  assert.deepEqual(rect(t.github), [9, 5, 3, 7]);
  assert.equal(t.claude, undefined);
  assert.deepEqual(t.clock.settings, { hour24: true, name: 'Niv', greeting: true, face: 'serif', colon: true });
  assert.deepEqual(t.tiles.settings, { group: null, columns: 5, bar: 0 });
  assert.deepEqual(t.markets.settings, { items: ['BTC', 'USD/ILS'] });
  assert.deepEqual(t.github.settings, { user: 'octo', parts: GITHUB_PARTS });
  assert.ok(l.widgets.every(c => typeof c.id === 'string' && c.id));
});

test('clock on the right swaps the columns; a lone far widget takes the column', () => {
  const t = byType(defaultLayout(legacy({ widgets: { ...legacy().widgets, position: 'right', github: { enabled: false } } })));
  assert.deepEqual(rect(t.clock), [9, 0, 3, 4]);
  assert.deepEqual(rect(t.markets), [0, 0, 3, 12]);
  assert.deepEqual(rect(t.tiles), [3, 0, 6, 12]);
});

test('with Claude on the near column shrinks the tallest first; with widgets off only the tiles remain', () => {
  const on = byType(defaultLayout(legacy({ widgets: { ...legacy().widgets, claude: { enabled: true } } })));
  assert.equal(on.clock.h + on.tasks.h + on.notes.h + on.claude.h, 12);
  assert.equal(on.claude.h, 2);
  const off = defaultLayout(legacy({ widgets: { ...legacy().widgets, enabled: false } }));
  assert.deepEqual(off.widgets.map(c => c.type), ['tiles']);
  assert.deepEqual(rect(off.widgets[0]), [0, 0, 12, 12]);
});

test('the bar and GitHub Show convert', () => {
  const t = s => byType(defaultLayout(legacy(s)));
  assert.equal(t({ search: { enabled: false, row: 0 } }).tiles.settings.bar, null);
  assert.equal(t({ search: { enabled: true, row: 2 } }).tiles.settings.bar, 2);
  assert.equal(t({ search: { enabled: true, row: -1 } }).tiles.settings.bar, -1);
  const parts = show => t({ widgets: { ...legacy().widgets, github: { enabled: true, user: 'o', show } } }).github.settings.parts;
  assert.deepEqual(parts('commits'), ['heatmap', 'pulls', 'commits']);
  assert.deepEqual(parts('issues'), ['heatmap', 'pulls', 'issues']);
  assert.deepEqual(parts('both'), GITHUB_PARTS);
});

test('fits and firstFree respect the canvas and other copies', () => {
  const l = defaultLayout(legacy());
  assert.equal(fits(l, { x: 3, y: 0, w: 6, h: 12 }), false);
  assert.equal(fits(l, { x: 3, y: 0, w: 6, h: 12 }, byType(l).tiles.id), true);
  assert.equal(fits(l, { x: 10, y: 0, w: 3, h: 1 }), false);
  assert.equal(firstFree(l, 3, 1), null);
  removeCopy(l, byType(l).notes.id);
  assert.deepEqual(firstFree(l, 3, 1), { x: 0, y: 8, w: 3, h: 1 });
  assert.deepEqual(firstFree(l, 2, 2), { x: 0, y: 8, w: 2, h: 2 });
});

test('stackOrder reads top to bottom, then left to right', () => {
  const ids = stackOrder([{ id: 'b', x: 9, y: 0 }, { id: 'c', x: 0, y: 4 }, { id: 'a', x: 0, y: 0 }]);
  assert.deepEqual(ids, ['a', 'b', 'c']);
});

test('normalizeLayout drops junk, clamps, resolves overlaps and enforces limits', () => {
  const raw = { widgets: [
    { id: 'a', type: 'clock', x: -2, y: 0, w: 1, h: 1, settings: { face: 'nope', name: 7 } },
    { id: 'b', type: 'clock', x: 6, y: 6, w: 3, h: 3 },
    { id: 'c', type: 'markets', x: 0, y: 0, w: 3, h: 3, settings: { items: ['eth', 'bad!'] } },
    { id: 'd', type: 'tiles', x: 20, y: 20, w: 3, h: 3, settings: { group: 'g9', columns: 99, bar: 'x' } },
    { type: 'github', x: 9, y: 0, w: 3, h: 3, settings: { parts: ['commits', 'heatmap', 'junk'] } },
    { id: 'e', type: 'weather', x: 0, y: 0, w: 2, h: 2 },
    'junk',
  ] };
  const l = normalizeLayout(raw, state(raw));
  const t = byType(l);
  assert.deepEqual(l.widgets.map(c => c.type), ['clock', 'markets', 'tiles', 'github']);
  assert.deepEqual(rect(t.clock), [0, 0, 2, 2]);
  assert.deepEqual(t.clock.settings, { hour24: true, name: '', greeting: true, face: 'classic', colon: true });
  assert.deepEqual(rect(t.markets), [2, 0, 3, 3]);   // moved off the clock to the first free spot
  assert.deepEqual(t.markets.settings.items, ['ETH']);
  assert.deepEqual(rect(t.tiles), [9, 9, 3, 3]);
  assert.deepEqual(t.tiles.settings, { group: null, columns: 10, bar: null });
  assert.deepEqual(t.github.settings.parts, ['heatmap', 'commits']);
  assert.ok(t.github.id);
});

test('addCopy takes the default size, else the minimum, else refuses; duplicates copy settings', () => {
  const l = defaultLayout(legacy());
  assert.equal(addCopy(l, 'clock'), null);                     // limit 1
  assert.equal(addCopy(l, 'search'), null);                    // no room
  removeCopy(l, byType(l).notes.id);
  const bar = addCopy(l, 'search');
  assert.deepEqual(rect(bar), [0, 8, 3, 1]);                   // minimum size fits
  const m = duplicateCopy(l, byType(l).markets.id);
  assert.deepEqual(rect(m), [0, 9, 2, 3]);
  assert.deepEqual(m.settings, { items: ['BTC', 'USD/ILS'] });
  assert.notEqual(m.id, byType(l).markets.id);
  assert.equal(countOf(l, 'markets'), 2);
});

test('a new tiles copy is pinned to the first group no block shows', () => {
  const l = { cols: COLS, rows: ROWS, widgets: [{ id: 't', type: 'tiles', x: 0, y: 0, w: 3, h: 3, settings: { group: null, columns: 5, bar: null } }] };
  const groups = [{ id: 'g1' }, { id: 'g2' }];
  const a = addCopy(l, 'tiles', undefined, groups);
  assert.equal(a.settings.group, 'g1');
  const b = duplicateCopy(l, 't', groups);
  assert.equal(b.settings.group, 'g2');
  const c = addCopy(l, 'tiles', undefined, groups);
  assert.equal(c.settings.group, null);
});

test('moveCopy refuses overlaps, the edge and sizes under the minimum', () => {
  const l = defaultLayout(legacy());
  const id = byType(l).clock.id;
  assert.equal(moveCopy(l, id, { x: 3, y: 0, w: 3, h: 4 }), false);
  assert.equal(moveCopy(l, id, { x: 0, y: 0, w: 1, h: 4 }), false);
  assert.equal(moveCopy(l, id, { x: 0, y: 0, w: 3, h: 3 }), true);
  assert.deepEqual(rect(byType(l).clock), [0, 0, 3, 3]);
});

test('resetLayout keeps the first copy of each type and reports the rest', () => {
  const l = defaultLayout(legacy());
  removeCopy(l, byType(l).notes.id);
  moveCopy(l, byType(l).clock.id, { x: 0, y: 0, w: 2, h: 2 });
  const extra = addCopy(l, 'markets', { items: ['SOL'] });
  const removed = resetLayout(l);
  assert.deepEqual(removed.map(c => c.id), [extra.id]);
  const t = byType(l);
  assert.deepEqual(rect(t.clock), [0, 0, 3, 4]);
  assert.deepEqual(rect(t.tasks), [0, 4, 3, 8]);
  assert.deepEqual(t.clock.settings.face, 'serif');
  assert.equal(t.notes, undefined);
});

test('copyTitle names a copy for labels and Preferences', () => {
  const groups = [{ id: 'g1', title: 'Work' }];
  assert.equal(copyTitle({ type: 'tiles', settings: { group: 'g1' } }, groups), 'Tiles · Work');
  assert.equal(copyTitle({ type: 'tiles', settings: { group: null } }, groups), 'Tiles · follows the tabs');
  assert.equal(copyTitle({ type: 'github', settings: { parts: ['heatmap', 'commits'] } }, groups), 'GitHub · Map + Commits');
  assert.equal(copyTitle({ type: 'clock', settings: {} }, groups), 'Clock');
  assert.equal(TYPES.clock.max, 1);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- test/layout.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `js/layout.js`**

```js
// The page layout: widget copies on a 12 × 12 grid of cells, their sizes and limits, the default
// layout a saved state from before Layout mode converts to, and the moves Layout mode makes.
// Pure (unit-tested in Node).

import { uid, clamp } from './util.js';
import { cleanMarketItems } from './feeds.js';

export const COLS = 12;
export const ROWS = 12;
export const GITHUB_PARTS = ['heatmap', 'pulls', 'issues', 'commits'];
export const PART_LABELS = { heatmap: 'Map', pulls: 'PRs', issues: 'Issues', commits: 'Commits' };
const CLOCK_FACES = ['classic', 'stencil', 'rounded', 'serif', 'dot', 'stencil-line', 'rounded-line', 'serif-line'];
const MARKET_ITEMS = ['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS'];

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v, fallback) => (Number.isInteger(v) ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);

// size and min are [w, h] in cells; max is how many copies the page may hold. clean(settings,
// state) returns a full, valid settings object for the type.
export const TYPES = {
  clock: {
    label: 'Clock', icon: 'clock', size: [3, 4], min: [2, 2], max: 1,
    defaults: () => ({ hour24: true, name: '', greeting: true, face: 'classic', colon: true }),
    clean: s => ({
      hour24: bool(s.hour24, true), name: str(s.name), greeting: bool(s.greeting, true),
      face: CLOCK_FACES.includes(s.face) ? s.face : 'classic', colon: bool(s.colon, true),
    }),
  },
  tasks: { label: 'Tasks', icon: 'check-circle', size: [3, 4], min: [2, 3], max: 1, defaults: () => ({}), clean: () => ({}) },
  notes: { label: 'Notes', icon: 'note', size: [3, 3], min: [2, 2], max: 1, defaults: () => ({}), clean: () => ({}) },
  claude: { label: 'Claude', icon: 'claude', size: [3, 2], min: [2, 2], max: 5, defaults: () => ({}), clean: () => ({}) },
  markets: {
    label: 'Markets', icon: 'trend', size: [3, 5], min: [2, 3], max: 5,
    defaults: () => ({ items: [...MARKET_ITEMS] }),
    clean: s => ({ items: cleanMarketItems(s.items) ?? [...MARKET_ITEMS] }),
  },
  github: {
    label: 'GitHub', icon: 'branch', size: [3, 6], min: [3, 3], max: 5,
    defaults: () => ({ user: '', parts: [...GITHUB_PARTS] }),
    clean: s => ({ user: str(s.user), parts: Array.isArray(s.parts) ? GITHUB_PARTS.filter(p => s.parts.includes(p)) : [...GITHUB_PARTS] }),
  },
  tiles: {
    label: 'Tiles', icon: 'grid', size: [6, 6], min: [3, 3], max: 5,
    defaults: () => ({ group: null, columns: 5, bar: null }),
    clean: (s, state) => ({
      group: state?.groups?.some(g => g.id === s.group) ? s.group : null,
      columns: clamp(int(s.columns, 5), 2, 10),
      bar: Number.isInteger(s.bar) && s.bar >= -1 ? s.bar : null,
    }),
  },
  search: { label: 'Search bar', icon: 'search', size: [6, 1], min: [3, 1], max: 5, defaults: () => ({}), clean: () => ({}) },
};

// ---- geometry ----

const inside = r => r.x >= 0 && r.y >= 0 && r.x + r.w <= COLS && r.y + r.h <= ROWS;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function fits(layout, rect, ignoreId = null) {
  return inside(rect) && !layout.widgets.some(o => o.id !== ignoreId && overlaps(rect, o));
}

// The first w × h spot, scanning rows top to bottom and left to right, or null.
export function firstFree(layout, w, h) {
  for (let y = 0; y <= ROWS - h; y++) {
    for (let x = 0; x <= COLS - w; x++) if (fits(layout, { x, y, w, h })) return { x, y, w, h };
  }
  return null;
}

export const countOf = (layout, type) => layout.widgets.filter(c => c.type === type).length;
export const copyById = (state, id) => state.prefs.layout.widgets.find(c => c.id === id) ?? null;

// Reading order for narrow windows and Tab: top to bottom, then left to right.
export const stackOrder = widgets => [...widgets].sort((a, b) => a.y - b.y || a.x - b.x).map(c => c.id);

// ---- default layout ----

const NEAR = { clock: 4, tasks: 4, notes: 4, claude: 2 };   // the clock column, top to bottom
const FAR = { markets: 5, github: 7 };                      // the other column

// Heights of a column sum to at most ROWS: the tallest shrinks first, never below its minimum.
// With fill, one widget alone takes the whole column.
function column(items, fill) {
  if (fill && items.length === 1) items[0].h = ROWS;
  let total = items.reduce((n, it) => n + it.h, 0);
  while (total > ROWS) {
    const tallest = items.reduce((a, b) => (b.h > a.h ? b : a));
    if (tallest.h <= TYPES[tallest.type].min[1]) break;
    tallest.h--;
    total--;
  }
  let y = 0;
  for (const it of items) {
    it.y = y;
    y += it.h;
  }
  return items;
}

// Where copies of the given types go: the clock column on `side`, Markets and GitHub opposite,
// the tiles block between them (or wider when a column is empty).
export function defaultPositions(types, side = 'left') {
  const near = column(Object.keys(NEAR).filter(t => types.includes(t)).map(type => ({ type, h: NEAR[type] })), false);
  const far = column(Object.keys(FAR).filter(t => types.includes(t)).map(type => ({ type, h: FAR[type] })), true);
  const right = side === 'right';
  const nearX = right ? 9 : 0;
  const farX = right ? 0 : 9;
  const leftUsed = (near.length && !right) || (far.length && right);
  const rightUsed = (near.length && right) || (far.length && !right);
  const out = [
    ...near.map(it => ({ type: it.type, x: nearX, y: it.y, w: 3, h: it.h })),
    ...far.map(it => ({ type: it.type, x: farX, y: it.y, w: 3, h: it.h })),
  ];
  if (types.includes('tiles')) out.push({ type: 'tiles', x: leftUsed ? 3 : 0, y: 0, w: 12 - (leftUsed ? 3 : 0) - (rightUsed ? 3 : 0), h: 12 });
  return out;
}

export const partsFromShow = show => (show === 'commits' ? ['heatmap', 'pulls', 'commits'] : show === 'issues' ? ['heatmap', 'pulls', 'issues'] : [...GITHUB_PARTS]);

// The layout a state from before Layout mode gets: the page it showed. `old` is the legacy prefs
// shape (widgets.*, search.enabled/row, columns) with every field present.
export function defaultLayout(old) {
  const w = old.widgets;
  const on = name => w.enabled !== false && w[name]?.enabled !== false;
  const types = [...Object.keys(NEAR), ...Object.keys(FAR)].filter(on);
  const settings = {
    clock: () => ({ hour24: w.clock.hour24, name: w.clock.name, greeting: w.clock.greeting, face: w.clock.face, colon: w.clock.colon }),
    markets: () => ({ items: [...w.markets.items] }),
    github: () => ({ user: w.github.user, parts: partsFromShow(w.github.show) }),
    tiles: () => ({
      group: null,
      columns: clamp(int(old.columns, 5), 2, 10),
      bar: old.search.enabled === false ? null : (Number.isInteger(old.search.row) && old.search.row >= -1 ? old.search.row : 0),
    }),
  };
  const widgets = defaultPositions([...types, 'tiles'], w.position).map(p => ({
    id: uid(), ...p, settings: settings[p.type] ? settings[p.type]() : {},
  }));
  return { cols: COLS, rows: ROWS, widgets };
}

// ---- validation ----

export function normalizeLayout(raw, state) {
  const layout = { cols: COLS, rows: ROWS, widgets: [] };
  const ids = new Set();
  for (const c of Array.isArray(raw?.widgets) ? raw.widgets : []) {
    const t = isObj(c) && TYPES[c.type];
    if (!t || countOf(layout, c.type) >= t.max) continue;
    const w = clamp(int(c.w, t.size[0]), t.min[0], COLS);
    const h = clamp(int(c.h, t.size[1]), t.min[1], ROWS);
    let rect = { x: clamp(int(c.x, 0), 0, COLS - w), y: clamp(int(c.y, 0), 0, ROWS - h), w, h };
    if (!fits(layout, rect)) rect = firstFree(layout, w, h) ?? firstFree(layout, ...t.min);
    if (!rect) continue;
    const id = str(c.id) && !ids.has(c.id) ? c.id : uid();
    ids.add(id);
    layout.widgets.push({ id, type: c.type, ...rect, settings: t.clean(isObj(c.settings) ? c.settings : {}, state) });
  }
  return layout;
}

// ---- what Layout mode does ----

// The first group no tiles block is pinned to, or null (follow the tabs).
function unshownGroup(layout, groups) {
  const shown = new Set(layout.widgets.filter(c => c.type === 'tiles').map(c => c.settings.group));
  return groups.find(g => !shown.has(g.id))?.id ?? null;
}

// Adds a copy at the first spot that takes its default size, else its minimum size. Returns the
// copy, or null when the type is at its limit or nothing fits.
export function addCopy(layout, type, settings, groups = []) {
  const t = TYPES[type];
  if (!t || countOf(layout, type) >= t.max) return null;
  const spot = firstFree(layout, ...t.size) ?? firstFree(layout, ...t.min);
  if (!spot) return null;
  const own = { ...t.defaults(), ...(isObj(settings) ? structuredClone(settings) : {}) };
  if (type === 'tiles' && !(isObj(settings) && 'group' in settings)) own.group = unshownGroup(layout, groups);
  const copy = { id: uid(), type, ...spot, settings: own };
  layout.widgets.push(copy);
  return copy;
}

// A copy with the same settings; a tiles block is pinned to the next group not shown yet.
export function duplicateCopy(layout, id, groups = []) {
  const from = layout.widgets.find(c => c.id === id);
  if (!from) return null;
  const settings = structuredClone(from.settings);
  if (from.type === 'tiles') delete settings.group;
  return addCopy(layout, from.type, settings, groups);
}

export function removeCopy(layout, id) {
  const before = layout.widgets.length;
  layout.widgets = layout.widgets.filter(c => c.id !== id);
  return layout.widgets.length < before;
}

// Moves or resizes a copy when the result is inside the canvas, clear of the others and not
// under the type's minimum.
export function moveCopy(layout, id, rect) {
  const copy = layout.widgets.find(c => c.id === id);
  if (!copy) return false;
  const t = TYPES[copy.type];
  const next = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  if (next.w < t.min[0] || next.h < t.min[1] || !fits(layout, next, id)) return false;
  Object.assign(copy, next);
  return true;
}

// Back to the default places: the first copy of each type stays, with its settings; the clock
// column keeps its side. Returns the copies that were removed.
export function resetLayout(layout) {
  const kept = new Map();
  for (const c of layout.widgets) if (!kept.has(c.type)) kept.set(c.type, c);
  const removed = layout.widgets.filter(c => kept.get(c.type) !== c);
  const near = [...kept.values()].find(c => c.type in NEAR);
  const side = near && near.x >= 6 ? 'right' : 'left';
  layout.widgets = defaultPositions([...kept.keys()], side).map(p => ({ ...kept.get(p.type), ...p }));
  return removed;
}

// "Tiles · Work", "GitHub · Map + Commits", "Clock": for frame labels and Preferences.
export function copyTitle(copy, groups = []) {
  const label = TYPES[copy.type]?.label ?? copy.type;
  if (copy.type === 'tiles') {
    const group = groups.find(g => g.id === copy.settings.group);
    return `${label} · ${group ? group.title : 'follows the tabs'}`;
  }
  if (copy.type === 'github') return `${label} · ${copy.settings.parts.map(p => PART_LABELS[p]).join(' + ') || 'nothing chosen'}`;
  return label;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass (the markets overlap test moves Markets to column 2: the clock takes 0–1 at the top, so the first 3 × 3 spot is x 2).

- [ ] **Step 5: Commit**

```bash
git add js/layout.js test/layout.test.js
git commit -m "feat: layout.js: widget copies on a 12x12 grid, default conversion, validation, moves"
```

---

### Task 2: store conversion, shared in-flight requests, unpinning on group delete, bar without `enabled`

**Files:**
- Modify: `js/store.js` (`DEFAULT_PREFS`, `LEGACY_PREFS`, `defaultState`, `normalizeState`)
- Modify: `js/net.js` (`feed`)
- Modify: `js/actions.js` (`deleteGroup`)
- Modify: `js/ask.js` (`activeMode`)
- Modify: `js/importer.js` (merge over the legacy defaults too)
- Test: `test/store.test.js`, `test/net.test.js`, `test/actions.test.js`, `test/ask.test.js`

**Interfaces:**
- Produces: `LEGACY_PREFS` export from `store.js`; `state.prefs.layout` always valid; `state.prefs.github.token`; `prefs.search` without `enabled`/`row`.

- [ ] **Step 1: Update and add tests**

`test/store.test.js`: replace the four tests that read `prefs.widgets.*` (older saved prefs, Markets coins, GitHub show, the two widgets-master-switch tests) with:

```js
import { defaultLayout, GITHUB_PARTS } from '../js/layout.js';
const copies = s => Object.fromEntries(s.prefs.layout.widgets.map(c => [c.type, c]));

test('normalizeState(null) returns a usable default state', () => {
  const s = normalizeState(null);
  assert.equal(s.groups.length, 1);
  assert.equal(s.activeGroupId, s.groups[0].id);
  assert.deepEqual(s.tiles, []);
  const { layout, ...rest } = s.prefs;
  const { layout: nil, ...defaults } = DEFAULT_PREFS;
  assert.deepEqual(rest, defaults);
  assert.deepEqual(layout.widgets.map(c => c.type), ['clock', 'tasks', 'notes', 'markets', 'github', 'tiles']);
});

test('a saved state from before Layout mode converts to the same page, and loses the old keys', () => {
  const s = normalizeState({ prefs: {
    columns: 7, width: 900,
    search: { enabled: true, row: 1, google: true, claude: false, chatgpt: true, gemini: false, mode: 'chatgpt' },
    widgets: {
      enabled: true, position: 'right',
      clock: { enabled: true, name: 'Niv', face: 'dot' }, notes: { enabled: false },
      markets: { enabled: true, coins: 'btc, doge', fx: false },
      github: { enabled: true, user: 'octo', show: 'issues', token: 'ghp_x' },
    },
  } });
  const c = copies(s);
  assert.deepEqual([c.clock.x, c.clock.settings.name, c.clock.settings.face], [9, 'Niv', 'dot']);
  assert.equal(c.notes, undefined);
  assert.deepEqual(c.markets.settings.items, ['BTC', 'DOGE']);
  assert.deepEqual(c.github.settings, { user: 'octo', parts: ['heatmap', 'pulls', 'issues'] });
  assert.deepEqual(c.tiles.settings, { group: null, columns: 7, bar: 1 });
  assert.equal(s.prefs.github.token, 'ghp_x');
  assert.deepEqual(s.prefs.search, { google: true, claude: false, chatgpt: true, gemini: false, mode: 'chatgpt' });
  for (const k of ['columns', 'width', 'widgets']) assert.equal(k in s.prefs, false, k);
});

test('the old switch that hid every widget leaves only the tiles', () => {
  const s = normalizeState({ prefs: { widgets: { enabled: false, tasks: { enabled: true } } } });
  assert.deepEqual(s.prefs.layout.widgets.map(c => c.type), ['tiles']);
});

test('a saved layout is kept and validated; notes and tasks are untouched', () => {
  const layout = { widgets: [{ id: 'k', type: 'notes', x: 0, y: 0, w: 2, h: 2, settings: {} }, { id: 'z', type: 'zzz' }] };
  const s = normalizeState({ notes: 'hello', tasks: [{ id: 't', text: 'a' }], prefs: { layout } });
  assert.deepEqual(s.prefs.layout.widgets.map(c => c.id), ['k']);
  assert.equal(s.notes, 'hello');
  assert.equal(s.tasks[0].text, 'a');
});
```

`test/net.test.js`: replace the last test with

```js
test('callers in this tab share a request in flight; an attempt started by another tab is not repeated', async () => {
  let calls = 0;
  let release;
  const slow = () => new Promise(resolve => { calls++; release = () => resolve({ v: 1 }); });
  const a = feed('k', HOUR, slow);
  const b = feed('k', HOUR, slow);
  assert.equal(calls, 1);
  release();
  assert.deepEqual((await a).data, { v: 1 });
  assert.deepEqual((await b).data, { v: 1 });

  memory.clear();
  memory.set('newtab:cache:j:attempt', JSON.stringify({ at: Date.now(), error: null }));
  const other = await feed('j', HOUR, slow);
  assert.equal(calls, 1);
  assert.equal(other.data, null);
});
```

`test/actions.test.js`: add

```js
test('deleteGroup unpins tiles blocks that showed the group', () => {
  const s = state();
  s.prefs = { layout: { widgets: [
    { id: 'w1', type: 'tiles', settings: { group: 'dev', columns: 5, bar: null } },
    { id: 'w2', type: 'tiles', settings: { group: 'home', columns: 5, bar: null } },
  ] } };
  deleteGroup(s, 'dev', 'delete');
  assert.deepEqual(s.prefs.layout.widgets.map(c => c.settings.group), [null, 'home']);
});
```

`test/ask.test.js`: in the `search` helper drop `enabled: true`; replace the `activeMode(search({ enabled: false }))` assertion with `assert.equal(activeMode(search({ google: false, claude: false })), null);`.

- [ ] **Step 2: Run the tests to see the new ones fail**

Run: `npm test`
Expected: the store, net, actions and ask tests above fail.

- [ ] **Step 3: Implement**

`js/store.js`:

```js
import { defaultLayout, normalizeLayout } from './layout.js';

export const DEFAULT_PREFS = {
  theme: 'dark',
  spacing: 8,
  centerVertically: true,
  showAddButton: true,
  compact: false,
  openInNewTab: false,
  accent: '#d97757',
  tiles: { style: 'flat', icons: 'logo', radius: 10, showTitle: true, color: '#ffffff', textColor: '#202124' },
  background: { pattern: 'ascii', motion: true, url: '', useUpload: false, showImage: true, blur: 0, dim: 0 },
  // Engines every search bar offers, docked in a tiles block or on its own; mode is where Enter goes.
  search: { google: true, claude: true, chatgpt: false, gemini: false, mode: 'google' },
  // One token for every GitHub copy; only adds private repos; never exported in backups.
  github: { token: '' },
  // Widget copies on the 12 × 12 canvas (see layout.js). null here: filled by defaultLayout.
  layout: null,
  sidebar: { enabled: true },
};

// Settings from before Layout mode, read only to convert a saved state (and by the Speed Dial 2
// importer, which produces this shape).
export const LEGACY_PREFS = {
  columns: 5,
  width: 720,
  search: { enabled: true, row: 0 },
  widgets: {
    enabled: true,
    position: 'left',
    clock: { enabled: true, hour24: true, name: '', greeting: true, face: 'classic', colon: true },
    tasks: { enabled: true },
    notes: { enabled: true },
    claude: { enabled: false },
    markets: { enabled: true, items: ['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS'] },
    github: { enabled: true, user: '', show: 'both', token: '' },
  },
};
```

`defaultState()`: `prefs: { ...structuredClone(DEFAULT_PREFS), layout: defaultLayout(LEGACY_PREFS) }`.

In `normalizeState`, replace the prefs block (from `s.prefs = deepMerge(...)` to the end of the widgets-enabled migration) with:

```js
  const rp = isObj(raw.prefs) ? raw.prefs : {};
  s.prefs = deepMerge(DEFAULT_PREFS, rp);
  if (isObj(rp.layout)) {
    s.prefs.layout = normalizeLayout(rp.layout, s);
  } else {
    // A state from before Layout mode: the page it showed becomes the layout.
    const old = deepMerge(LEGACY_PREFS, rp);
    old.widgets.markets.items = normalizeMarkets(rp.widgets?.markets).items;
    s.prefs.layout = defaultLayout(old);
    const token = rp.widgets?.github?.token;
    if (typeof token === 'string' && !s.prefs.github.token) s.prefs.github.token = token;
  }
  for (const k of ['columns', 'width', 'widgets']) delete s.prefs[k];
  delete s.prefs.search.enabled;
  delete s.prefs.search.row;
  return s;
```

Keep `normalizeMarkets` (it reads the old `coins`/`fx`); drop `GITHUB_SHOW`.

`js/net.js`, in `feed`, after the fresh-cache check:

```js
const inflight = new Map();   // key → the promise of a load running in this tab
...
  if (inflight.has(key)) return inflight.get(key);
  const attempt = readAttempt(key);
  if (attempt && now - attempt.at < ttlMs) { ...unchanged... }
  writeAttempt(key, null);
  const run = (async () => {
    try {
      const data = await load();
      if (data != null) store(key, data);
      return { data: data ?? hit?.data ?? null, at: Date.now() };
    } catch (error) {
      writeAttempt(key, error);
      return { data: hit?.data ?? null, at: hit?.at ?? 0, error };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
```

`js/actions.js` `deleteGroup`, before `return true`:

```js
  for (const c of s.prefs?.layout?.widgets ?? []) if (c.type === 'tiles' && c.settings.group === id) c.settings.group = null;
```

`js/ask.js`: `activeMode` drops the `enabled` line; update its comment ("null when no engine is on").

`js/importer.js`: `import { DEFAULT_PREFS, LEGACY_PREFS, deepMerge } from './store.js';` and `return deepMerge(deepMerge(DEFAULT_PREFS, LEGACY_PREFS), { ... })`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/store.js js/net.js js/actions.js js/ask.js js/importer.js test/
git commit -m "feat: saved states convert to a layout; shared requests in flight; deleting a group unpins its blocks"
```

---

### Task 3: widgets read their copy; registry; shared widget helpers

**Files:**
- Modify: `js/ui.js` (add `widgetHead`, `widgetSub`, `widgetEmpty`, `tileDrag`)
- Create: `js/clock-widget.js` (from `js/widgets.js`), `js/notes-widget.js` (Notes and Claude), `js/markets-widget.js`, `js/github-widget.js` (from `js/side-widgets.js`), `js/registry.js`
- Modify: `js/task-widget.js`, `js/grid.js`, `js/searchbar.js`
- Delete: `js/widgets.js`, `js/side-widgets.js`

**Interfaces:**
- Produces: every widget module exports `mount<Type>(root, store, copy, ctx) → { destroy() }`; `registry.js` exports `WIDGETS = { [type]: { ...TYPES[type], mount } }`; `CLOCK_FACES` moves to `clock-widget.js`; `ui.js` exports `tileDrag = { id: null, folder: false }`.
- `ctx = { openPrefs(section, anchor) }`.

- [ ] **Step 1: Shared helpers in `ui.js`**

```js
export const widgetHead = (iconName, text) => el('h2', { class: 'widget-head' }, icon(iconName, 18), el('span', { text }));
export const widgetSub = text => el('div', { class: 'widget-sub', text });
export const widgetEmpty = text => el('p', { class: 'widget-empty', text });
// The tile being dragged, shared by every tiles block: dataTransfer can't be read until the drop.
export const tileDrag = { id: null, folder: false };
```

- [ ] **Step 2: `clock-widget.js`**

Move `partOfDay`, `CLOCK_FACES`, `faceOf`, `faceClass`, `clockDigits` and the clock part of `mountWidgets` into `export function mountClock(root, store, copy)`. It reads `const c = () => copyById(store.get(), copy.id)?.settings ?? TYPES.clock.defaults()`; the face picker writes `store.update(s => { copyById(s, copy.id).settings.face = f.id; })`. `render` subscribes to `['prefs']` only; keep the interval id and the unsubscribe, and return `{ destroy() { clearInterval(timer); unsubscribe(); } }`. No `root.hidden` logic (a copy exists or it doesn't). The section root is `root` itself (`root.classList.add('widget', 'widget-clock')`).

- [ ] **Step 3: `notes-widget.js`**

`mountNotes(root, store)`: the textarea and the Notes heading, subscribed to `['notes']`; `mountClaude(root, store)`: the Claude box. Both return `{ destroy }` with their unsubscribes. `task-widget.js`: `mountTasks(store)` becomes `mountTasks(root, store)` appending into `root` and returning `{ destroy }` (clear its interval, unsubscribe).

- [ ] **Step 4: `markets-widget.js` and `github-widget.js`**

Split `side-widgets.js`. Markets: `items()` reads the copy's `settings.items`; `setItem` writes to the copy; `onPrefs` compares `JSON.stringify([items(), openInNewTab])`; the 30 s interval and visibilitychange listener are removed in `destroy`. Rows under 3 cells wide: `root.classList.toggle('narrow', copy.w < 3)` in `onPrefs` (`.widget-markets.narrow .mk-row` hides the sparkline column in CSS, Task 4).

GitHub: `g()` is the copy's settings; token is `store.get().prefs.github.token`; `renderGithub` builds parts in `GITHUB_PARTS` order: `heatmap` only when `parts.includes('heatmap')`; `pulls`, `issues`, `commits` each only when included; the activity fetch runs when any of the three lists is on, the calendar when the map is on. `parts` empty → `widgetEmpty('Nothing chosen. ')` with a link button "Choose what to show" → `ctx.openPrefs('layout', copy.id)`. `openGithubPrefs` and the ✎ go to `ctx.openPrefs('layout', copy.id)`. `onPrefs` compares `JSON.stringify([user, token, parts, openInNewTab])`; a change of `parts` alone redraws from `shownGithub` without fetching when the needed data is already there.

- [ ] **Step 5: `grid.js` → the tiles block**

`export function mountTiles(root, store, copy, ctx)`: builds

```html
<section class="widget widget-tiles">        ← root
  <h2 class="widget-head tiles-head" hidden>   ← pinned: icon + group title
  <div class="grid-wrap"><div class="searchbar" hidden></div><div class="grid"></div></div>
</section>
```

- `groupId()` = `settings.group ?? state.activeGroupId`. `render` uses it in `topLevel`. The add button and `openTileDialog(store, null, groupId())` default to it (give `openTileDialog` a third parameter `groupId`).
- `--cols` is set on `.grid-wrap` from `settings.columns`.
- The docked bar: `mountSearchBar(bar, store, { grid, copy })` once; `bar.hidden = settings.bar == null`; the bar's `place()` reads the row from the copy (`copyById(...).settings.bar`) and `saveSlot` writes it there.
- Drag: `dragstart` sets `tileDrag.id` and `tileDrag.folder`; `dragover`/`drop` read `tileDrag.id` instead of the local `dragId` (keep `canNest = !tileDrag.folder`); `dragend` clears `tileDrag`. A drop on the grid itself (no `.tile` target) when the dragged tile's group differs moves it: `store.update(s => moveTileToGroup(s, id, groupId()))`. A drop on a tile in another group's block: `moveTileToGroup` first, then `reorderTile`/`createFolder`/`addToFolder` as now.
- Subscribe to `['tiles', 'groups', 'activeGroupId', 'prefs']`; redraw when `tilePrefs(prefs)`, the copy's `group`/`columns`, or the group's title changes. Return `{ destroy }`.
- Empty block: `'No tiles in this group.'` plus `' Turn on the + button in Preferences to add some.'` only when the + button is off.

- [ ] **Step 6: `searchbar.js`**

`mountSearchBar(root, store, { grid, copy } = {})`. Free (no `grid`): no grip, no `place()`, no observer. Docked: as today, with the row read from and written to `copyById(store.get(), copy.id).settings.bar`. `render`: when `activeMode(search()) === null` the bar shows `widgetEmpty` text "No search engine is on." with a link button "Preferences" → `ctx.openPrefs('page')` (pass `ctx` in the options), and hides the input; never `root.hidden`. Ctrl+Space: `if (document.querySelector('.searchbar:not([hidden]) .sb-input') !== input) return;` so only the first bar in DOM order takes it. Return `{ destroy }` (remove the keydown listener, the observer, unsubscribe). Export `mountSearch(root, store, copy, ctx)` = `mountSearchBar(root.appendChild(el('div', { class: 'searchbar widget widget-search' })), store, { ctx })` for the registry.

- [ ] **Step 7: `registry.js`**

```js
import { TYPES } from './layout.js';
import { mountClock } from './clock-widget.js';
import { mountTasks } from './task-widget.js';
import { mountNotes, mountClaude } from './notes-widget.js';
import { mountMarkets } from './markets-widget.js';
import { mountGithub } from './github-widget.js';
import { mountTiles } from './grid.js';
import { mountSearch } from './searchbar.js';

const MOUNTS = { clock: mountClock, tasks: mountTasks, notes: mountNotes, claude: mountClaude, markets: mountMarkets, github: mountGithub, tiles: mountTiles, search: mountSearch };
export const WIDGETS = Object.fromEntries(Object.entries(TYPES).map(([type, t]) => [type, { ...t, mount: MOUNTS[type] }]));
```

- [ ] **Step 8: Run the tests and check imports**

Run: `npm test` and `node -e "import('./js/registry.js').catch(e => { console.error(e); process.exit(1); })"` is not possible (DOM imports), so instead: `node --check js/*.js` passes and `grep -rn "widgets.js\|side-widgets" js/ test/` finds nothing.

- [ ] **Step 9: Commit**

```bash
git add -A js/ test/
git commit -m "refactor: every widget mounts from its layout copy; registry; shared tile drag state"
```

---

### Task 4: the canvas renders the layout; Preferences gets Layout; old columns go

**Files:**
- Create: `js/canvas.js`
- Modify: `newtab.html`, `js/main.js`, `js/theme.js`, `js/prefs.js`, `css/newtab.css`

**Interfaces:**
- Produces: `mountCanvas(root, store, ctx) → { frames(): Map<id, HTMLElement>, onFrame(fn) }`; `setupPrefs(store, { enterLayoutMode })` returning `{ open(section, anchor) }`; frames are `<section class="widget-frame" data-id data-type style="grid-area: …; order: …">` holding the widget's root `<div class="widget-root">`.

- [ ] **Step 1: `canvas.js`**

```js
import { WIDGETS } from './registry.js';
import { stackOrder } from './layout.js';
import { el } from './ui.js';

const area = c => `${c.y + 1} / ${c.x + 1} / span ${c.h} / span ${c.w}`;

export function mountCanvas(root, store, ctx) {
  const mounted = new Map();   // id → { frame, handle, copy }
  const listeners = new Set();

  function sync() {
    const { widgets } = store.get().prefs.layout;
    const live = new Set(widgets.map(c => c.id));
    for (const [id, m] of mounted) {
      if (live.has(id)) continue;
      m.handle?.destroy?.();
      m.frame.remove();
      mounted.delete(id);
    }
    const order = stackOrder(widgets);
    for (const copy of widgets) {
      let m = mounted.get(copy.id);
      if (!m) {
        const inner = el('div', { class: 'widget-root' });
        const frame = el('section', { class: `widget-frame frame-${copy.type}`, dataset: { id: copy.id, type: copy.type }, 'aria-label': WIDGETS[copy.type].label }, inner);
        root.append(frame);
        m = { frame, handle: WIDGETS[copy.type].mount(inner, store, { id: copy.id, type: copy.type }, ctx), copy };
        mounted.set(copy.id, m);
        for (const fn of listeners) fn(frame, copy);
      }
      m.frame.style.gridArea = area(copy);
      m.frame.style.order = String(order.indexOf(copy.id));
      m.frame.dataset.w = copy.w;
      m.frame.dataset.h = copy.h;
    }
    // DOM order = reading order, so Tab and the narrow fallback follow it.
    for (const id of order) root.append(mounted.get(id).frame);
  }

  store.subscribe(sync, ['prefs']);
  sync();
  return { frames: () => new Map([...mounted].map(([id, m]) => [id, m.frame])), onFrame: fn => listeners.add(fn) };
}
```

(`root.append(existingChild)` moves it; the ghost and grid overlay that Layout mode adds are re-appended by Layout mode after the frames, see Task 5.)

- [ ] **Step 2: `newtab.html`**

Replace `<main class="layout">…</main>` with `<main id="canvas" class="canvas" aria-label="Page"></main>`. Add `<button id="btn-layout" class="icon-btn" type="button" title="Edit layout" aria-label="Edit layout"></button>` between the Jump and sidebar buttons.

- [ ] **Step 3: `main.js`**

Replace the four mounts with `const canvas = mountCanvas(document.getElementById('canvas'), store, ctx)` where `const ctx = { openPrefs: (id, anchor) => prefs().then(p => p.open(id, anchor)) }`. `prefs` is `lazy(() => import('./prefs.js').then(m => m.setupPrefs(store, { enterLayoutMode: () => layout().then(l => l.enter()) })))`. Add `const layout = lazy(() => import('./edit-mode.js').then(m => m.setupEditMode(store, canvas, ctx)))`, the button `['btn-layout', 'layout', () => layout().then(l => l.toggle())]`, and `canvas` root `contextmenu`: when `e.target === canvasRoot`, `e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Edit layout', icon: 'layout', action: () => layout().then(l => l.enter()) }])`. Keep `startIconCache(store)`.

- [ ] **Step 4: `theme.js`**

Remove `--cols`, `--width`, `widgets-right`, `widgets-off`.

- [ ] **Step 5: `prefs.js`**

- Imports: `CLOCK_FACES` from `./clock-widget.js`; `TYPES`, `copyTitle`, `resetLayout`, `GITHUB_PARTS`, `PART_LABELS`, `copyById` from `./layout.js`.
- `setupPrefs(store, { enterLayoutMode })`.
- Page → Search bar: `title('Search bar')`, the four engine toggles directly (no master switch), hint on the title row via `row('Engines', …)`? Keep it simple: four `toggle` rows, and a `pref-hint`-styled paragraph "Add a bar in Layout mode, or dock one in a tiles block" as `el('p', { class: 'pref-hint', text })`.
- Tiles: drop the Columns and Width sliders.
- Replace `widgets()` with `layout()`:

```js
function layout() {
  const s = store.get();
  const groups = s.groups;
  return [
    row('Layout', el('button', { type: 'button', class: 'btn', onclick: () => { dialog.close(); enterLayoutMode(); } }, icon('layout', 16), 'Edit layout'),
      'Drag, resize, add, duplicate and remove widgets on the page'),
    row('Reset layout', el('button', { type: 'button', class: 'btn', onclick: resetAllLayout }), 'Back to the default places, keeping each widget\'s settings'),
    ...s.prefs.layout.widgets.map(copy => group(copy.id, title(copyTitle(copy, groups)), ...copyRows(copy, groups))),
  ];
}
```

`copyRows(copy, groups)` per type (every path through `setCopy(copy.id, key, value)` = `store.update(s => { copyById(s, id).settings[key] = value; })`):
  - clock: `clockStyle(copy)` (rewritten to read/write the copy's `face`), 24-hour switch, Greeting row with the name box (as today, on the copy).
  - tiles: Group `<select>` (option `''` "Follow the tabs", then each group; `onchange` writes `value || null`), Columns slider 2–10 on the copy, Search bar `<select>`: `off`, `0` "Above the tiles", `-1` "Below the tiles", plus `n` "After row n" when `bar > 0` (selected). Hint: "Drag the bar's ⠿ to put it between rows".
  - github: Username text field on the copy; four switches (`PART_LABELS`, long labels "Activity map", "Pull requests", "Issues", "Commits") that add/remove the part keeping `GITHUB_PARTS` order; a row "Private repos" with a button "GitHub section" → `show('github')`.
  - markets: `row('Coins and pairs', …, 'Use ✎ on the widget to choose them')` with no control (a `span`).
  - tasks, notes, claude, search: `row('No settings', el('span'))`.
  `slider` and `switchFor` take explicit get/set so they can target a copy: add `sliderFor(label, value, min, max, set, opts)` and reuse `switchFor`.
- `github()`: token field, help, and the "GitHub widget" switch goes (copies are added in Layout mode); the section title becomes "Private repos" only.
- `resetAllLayout`: `const removed = resetLayout(structuredClone(layout))` to preview names; `confirmDialog(removed.length ? \`Reset the layout? ${removed.map(c => copyTitle(c, groups)).join(', ')} will be removed.\` : 'Reset the layout?')` then `store.update(s => resetLayout(s.prefs.layout))`; `redraw()`.
- Sections: `{ id: 'layout', label: 'Layout', icon: 'layout', build: layout }` replaces widgets; keep `github` with label "GitHub".
- `exportBackup`: `state.prefs.github.token = ''`.
- `importFile` (Speed Dial 2): keep the layout: `const layout = structuredClone(store.get().prefs.layout); const first = layout.widgets.find(c => c.type === 'tiles' && c.settings.group === null); if (first) first.settings.columns = imported.prefs.columns; store.replace({ ...imported, tasks, taskHistory, taskStats, notes, prefs: { ...imported.prefs, layout } });`
- `open(id, anchor)` unchanged (anchors are copy ids now).

- [ ] **Step 6: CSS**

Replace the `.layout`, `.grid-wrap` placement, `.widgets`, `.side-widgets` rules and the narrow-screen rules for them with:

```css
/* ---------- Canvas ---------- */
.canvas {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-template-rows: repeat(12, minmax(0, 1fr));
  gap: 12px;
  padding: 8px 24px 24px;
  height: calc(100vh - 56px);
  min-height: 560px;
}
.widget-frame { position: relative; min-width: 0; min-height: 0; display: flex; flex-direction: column; container-type: size; }
.widget-root { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.widget-root > .widget { flex: 1; min-height: 0; overflow: hidden auto; scrollbar-width: thin; }
body.has-wallpaper .widget-frame { text-shadow: 0 1px 8px rgb(0 0 0 / 0.55); }
.frame-search .widget-root { justify-content: center; }
.notes-input { flex: 1; min-height: 0; max-height: none; }
.widget-notes { display: flex; flex-direction: column; }
.widget-tiles { display: flex; flex-direction: column; }
.widget-tiles .grid-wrap { flex: 1; min-height: 0; overflow: hidden auto; scrollbar-width: thin; }
.grid-wrap { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); align-content: start; gap: var(--gap); }
body.center-v .grid-wrap { align-content: center; }
.tiles-head { margin-bottom: 10px; }
.widget-markets.narrow .mk-row { grid-template-columns: 50px 1fr 62px 15px; }
.widget-markets.narrow .mk-spark { display: none; }
```

Clock scaling (replace the fixed `--clock-size` values):

```css
.clock-time { font-size: min(var(--fit-w, 30) * 1cqw, var(--fit-h, 45) * 1cqh); }
.face-dot { --fit-w: 26; }
.face-stencil:not(.stacked) { --fit-w: 32; }
.face-rounded:not(.stacked) { --fit-w: 28; }
.face-serif:not(.stacked) { --fit-w: 30; }
.face-stencil.stacked { --fit-w: 55; --fit-h: 34; }
.face-rounded.stacked { --fit-w: 50; --fit-h: 34; }
.face-serif.stacked { --fit-w: 52; --fit-h: 36; }
@container (max-height: 160px) { .clock-date, .clock-greeting { display: none; } }
.clock-face-btn .clock-time { font-size: 15px; }
```

Narrow:

```css
@media (max-width: 900px) {
  .canvas { display: flex; flex-direction: column; height: auto; min-height: 0; gap: 24px; }
  .widget-frame { grid-area: auto !important; container-type: normal; }
  .widget-root > .widget, .widget-tiles .grid-wrap { overflow: visible; }
  …prefs rules unchanged…
}
```

- [ ] **Step 7: Check in the browser**

Serve the folder (`python -m http.server 5517`), open `http://127.0.0.1:5517/newtab.html` in Playwright's Chromium with a fresh profile: the page shows clock, tasks, notes left, the bar above the tiles, Markets and GitHub right. Then `localStorage` with `widgets.position: 'right'` and with every widget off. Fix what differs.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: one canvas renders the layout; Preferences gets a Layout section with a group per copy"
```

---

### Task 5: Layout mode

**Files:**
- Create: `js/edit-mode.js`
- Modify: `css/newtab.css`, `js/ascii-bg.js` (`NO_RIPPLE`), `js/ui.js` (icons `clock`, `copy`, `settings`)

**Interfaces:**
- Produces: `setupEditMode(store, canvas, ctx) → { enter(), exit(), toggle(), get active() }`.

- [ ] **Step 1: `edit-mode.js`**

Structure (all writes through `store.update` with `layout.js` helpers):

```js
import { el, icon, showMenu, confirmDialog, alertDialog } from './ui.js';
import { TYPES, copyById, copyTitle, countOf, fits, firstFree, addCopy, duplicateCopy, removeCopy, moveCopy, resetLayout, COLS, ROWS } from './layout.js';

const MIN_WIDTH = 900;
const DIRS = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];

export function setupEditMode(store, canvas, ctx) {
  const root = document.getElementById('canvas');
  let active = false;
  let snapshot = null;
  const layout = () => store.get().prefs.layout;
  const groups = () => store.get().groups;

  // overlay: the cell outlines; ghost: where a drag or resize will land
  const overlay = el('div', { class: 'canvas-cells', 'aria-hidden': 'true' }, Array.from({ length: COLS * ROWS }, () => el('div', { class: 'canvas-cell' })));
  const ghost = el('div', { class: 'canvas-ghost', 'aria-hidden': 'true' });
  const tray = el('div', { class: 'layout-tray', role: 'toolbar', 'aria-label': 'Layout mode' }, …chips, Reset, Cancel, Done…);

  function decorate(frame, copy) { … label, tools (settings/duplicate/remove), 8 handles; frame.tabIndex = 0 … }
  function strip(frame) { … remove them; tabIndex = -1 … }
  function refresh() { … update labels and the duplicate buttons' disabled state and the tray chips from the current layout … }

  function enter() {
    if (innerWidth < MIN_WIDTH) { alertDialog('Layout mode needs a window at least 900px wide.'); return; }
    if (active) return;
    active = true;
    snapshot = structuredClone(layout());
    document.body.classList.add('layout-editing');
    root.append(overlay, ghost);
    document.body.append(tray);
    for (const [id, frame] of canvas.frames()) decorate(frame, copyById(store.get(), id));
    refresh();
  }
  function exit({ restore = false } = {}) { … if restore: store.update(s => { s.prefs.layout = snapshot; }); strip all; remove overlay/ghost/tray; class off … }
  canvas.onFrame((frame, copy) => { if (active) decorate(frame, copy); });
  store.subscribe(() => { if (active) { refresh(); root.append(overlay, ghost); } }, ['prefs', 'groups']);
  …pointer, keyboard, tray handlers…
  return { enter, exit, toggle: () => (active ? exit() : enter()), get active() { return active; } };
}
```

Pointer drag/resize (on `root`, `pointerdown`, only while active, button 0, target inside a `.widget-frame`, not inside `.frame-tools`):

```js
const frame = e.target.closest('.widget-frame');
const handle = e.target.closest('.frame-handle');
const copy = copyById(store.get(), frame.dataset.id);
const dir = handle ? handle.dataset.dir : 'move';
const cs = getComputedStyle(root);
const r = root.getBoundingClientRect();
const padX = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight), padT = parseFloat(cs.paddingTop), padB = parseFloat(cs.paddingBottom);
const gap = parseFloat(cs.columnGap) || 0, rowGap = parseFloat(cs.rowGap) || 0;
const pitchX = (r.width - padX - padR + gap) / COLS;
const pitchY = (r.height - padT - padB + rowGap) / ROWS;
const start = { px: e.clientX, py: e.clientY, x: copy.x, y: copy.y, w: copy.w, h: copy.h };
const min = TYPES[copy.type].min;
let target = { ...rectOf(start) }; let valid = true;
frame.setPointerCapture(e.pointerId); frame.classList.add('lifted'); ghost.hidden = false;
move: dc = Math.round(dx / pitchX), dr = Math.round(dy / pitchY);
  'move' → target = { x: start.x + dc, y: start.y + dr, w, h }; frame.style.transform = `translate(${dx}px, ${dy}px)`;
  else → as the model: e/s grow, w/n move the edge, clamped to min and the canvas; frame.style.gridArea = area(target);
  valid = fits(layout(), target, copy.id) && target.w >= min[0] && target.h >= min[1];
  ghost.style.gridArea = area(target); ghost.classList.toggle('bad', !valid);
up (lostpointercapture): transform '', ghost hidden, lifted off; if valid && changed → store.update(s => moveCopy(s.prefs.layout, copy.id, target)); else frame.style.gridArea = area(copy) (revert).
```

Keyboard on `root` (`keydown`, active, target `.widget-frame`): arrows move by one cell (Shift resizes), `d`/`D` duplicates, `Delete`/`Backspace` removes, `Escape` exits. Toolbar: settings → `ctx.openPrefs('layout', id)`; duplicate → `store.update(s => duplicateCopy(s.prefs.layout, id, s.groups))`, alert "No room: shrink or remove a widget first." when it returns null and the type is under its limit; remove → `store.update(s => removeCopy(s.prefs.layout, id))`. Tray chips: `store.update(s => addCopy(s.prefs.layout, type, undefined, s.groups))` with the same no-room alert; chip text `${label} ${max === 1 ? (n ? 'on' : 'off') : `${n}/${max}`}`, disabled at the limit or when neither size fits. Reset: as in Preferences (`confirmDialog` naming removed copies). Cancel → `exit({ restore: true })`. Done → `exit()`. Global `keydown` Escape while active, no dialog open and not typing → `exit()`. `resize` while active under 900px → `exit()`.

- [ ] **Step 2: Icons** in `ui.js`: `clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'`, `copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>'`, `settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'`.

- [ ] **Step 3: `ascii-bg.js`**: add `.layout-editing .canvas` to `NO_RIPPLE`.

- [ ] **Step 4: CSS**

```css
/* ---------- Layout mode ---------- */
.canvas-cells { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: repeat(12, minmax(0, 1fr)); gap: 12px; padding: 8px 24px 24px; pointer-events: none; }
.canvas { position: relative; }
.canvas-cell { border: 1px dashed color-mix(in srgb, var(--text) 12%, transparent); border-radius: 8px; }
.canvas-ghost { z-index: 5; border: 2px solid var(--accent); border-radius: 14px; background: var(--accent-soft); pointer-events: none; }
.canvas-ghost.bad { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 16%, transparent); }
body.layout-editing .widget-frame { outline: 1.5px dashed color-mix(in srgb, var(--text) 38%, transparent); outline-offset: 2px; border-radius: 12px; background: color-mix(in srgb, var(--surface) 70%, transparent); cursor: grab; transition: outline-color 0.15s, box-shadow 0.15s; }
body.layout-editing .widget-frame:focus-visible { outline: 2px solid var(--accent); }
body.layout-editing .widget-root { pointer-events: none; opacity: 0.72; }
.widget-frame.lifted { z-index: 6; cursor: grabbing; box-shadow: var(--shadow); outline-color: var(--accent); background: var(--surface); }
.frame-label { position: absolute; bottom: 6px; left: 9px; z-index: 2; padding: 2px 7px; border-radius: 6px; background: var(--surface-2); font-size: 11px; font-weight: 600; color: var(--muted); pointer-events: none; white-space: nowrap; max-width: calc(100% - 24px); overflow: hidden; text-overflow: ellipsis; }
.frame-tools { position: absolute; top: 4px; right: 4px; z-index: 3; display: flex; gap: 1px; padding: 2px; border-radius: 8px; background: var(--surface-2); }
.frame-tools .icon-btn { width: 24px; height: 24px; border-radius: 6px; }
.frame-tools .icon-btn:disabled { opacity: 0.35; cursor: default; }
.frame-tools .frame-remove:hover { color: var(--danger); }
.frame-handle { position: absolute; z-index: 3; touch-action: none; }
.frame-handle.n, .frame-handle.s { left: 14px; right: 14px; height: 8px; cursor: ns-resize; }
.frame-handle.e, .frame-handle.w { top: 14px; bottom: 14px; width: 8px; cursor: ew-resize; }
.frame-handle.n { top: -4px; } .frame-handle.s { bottom: -4px; } .frame-handle.e { right: -4px; } .frame-handle.w { left: -4px; }
.frame-handle.nw, .frame-handle.ne, .frame-handle.sw, .frame-handle.se { width: 12px; height: 12px; border: 2px solid var(--accent); border-radius: 3px; background: var(--bg); }
.frame-handle.nw { top: -5px; left: -5px; cursor: nwse-resize; } .frame-handle.se { bottom: -5px; right: -5px; cursor: nwse-resize; }
.frame-handle.ne { top: -5px; right: -5px; cursor: nesw-resize; } .frame-handle.sw { bottom: -5px; left: -5px; cursor: nesw-resize; }
.layout-tray { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow); }
.tray-label { font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.tray-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tray-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px 5px 8px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-2); color: var(--text); font-size: 12.5px; }
.tray-chip b { font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
.tray-chip:hover { border-color: var(--muted); }
.tray-chip:disabled { opacity: 0.4; cursor: default; }
.tray-right { margin-left: auto; display: flex; gap: 6px; }
body.layout-editing .canvas { padding-bottom: 72px; }
#btn-layout[aria-pressed="true"] { color: var(--accent); background: var(--accent-soft); }
@media (prefers-reduced-motion: reduce) { body.layout-editing .widget-frame { transition: none; } }
```

- [ ] **Step 5: Browser check**: every drop position and resize direction, the red refusal, Cancel, D/Delete/arrows, the tray, the limits, Reset. Then commit.

```bash
git add -A
git commit -m "feat: Layout mode: drag, resize, add, duplicate and remove widgets on the canvas"
```

---

### Task 6: README and the final check in the extension

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**: "What's on the page" gets a **Layout mode** row; a new "Layout mode" section (entering, dragging, red refusal, toolbar, tray, limits, keyboard, reset); "Markets ... sits in the column opposite the clock" → "wherever you put it"; the Search bar section says a bar can sit in a tiles block (between rows, as before) or anywhere on its own; "Everything else → Preferences" mentions Layout; the setup prompt: the GitHub section holds the token, each GitHub widget's username and parts are under Preferences → Layout (the ✎ on the widget opens them).

- [ ] **Step 2: Load the unpacked extension in Playwright's Chromium with a profile that has the old saved state** (write it to `chrome.storage.local` first) and check the conversion, then Layout mode end to end. Fix and commit:

```bash
git add -A
git commit -m "docs: README for Layout mode"
```
