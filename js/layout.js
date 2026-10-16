// The page layout: widget copies on a 12 × 12 grid of cells, their sizes and limits, the default
// layout a saved state from before Layout mode converts to, and the moves Layout mode makes.
// Pure (unit-tested in Node).

import { uid, clamp } from './util.js';
import { cleanMarketItems } from './feeds.js';

export const COLS = 12;
export const ROWS = 12;
// What a GitHub copy can show, in the order the widget draws them.
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
      hour24: bool(s.hour24, true),
      name: str(s.name),
      greeting: bool(s.greeting, true),
      face: CLOCK_FACES.includes(s.face) ? s.face : 'classic',
      colon: bool(s.colon, true),
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
    clean: s => ({
      user: str(s.user),
      parts: Array.isArray(s.parts) ? GITHUB_PARTS.filter(p => s.parts.includes(p)) : [...GITHUB_PARTS],
    }),
  },
  // group: a group id, or null to follow the tabs. bar: how many rows of tiles are above the
  // docked search bar (-1 keeps it under them all), or null for no bar.
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
  const leftUsed = (near.length > 0 && !right) || (far.length > 0 && right);
  const rightUsed = (near.length > 0 && right) || (far.length > 0 && !right);
  const out = [
    ...near.map(it => ({ type: it.type, x: nearX, y: it.y, w: 3, h: it.h })),
    ...far.map(it => ({ type: it.type, x: farX, y: it.y, w: 3, h: it.h })),
  ];
  if (types.includes('tiles')) {
    out.push({ type: 'tiles', x: leftUsed ? 3 : 0, y: 0, w: COLS - (leftUsed ? 3 : 0) - (rightUsed ? 3 : 0), h: ROWS });
  }
  return out;
}

// The old GitHub Show choice as parts: the map and open PRs always came first.
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
  const side = near && near.x >= COLS / 2 ? 'right' : 'left';
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
