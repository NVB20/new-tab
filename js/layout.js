// The page layout: widget copies on a 12 × 12 grid of cells, their sizes and limits, the default
// layout a saved state from before Layout mode converts to, and the moves Layout mode makes.
// Pure (unit-tested in Node).

import { uid, clamp } from './util.js';
import { cleanMarketItems } from './feeds.js';
import { cleanSports } from './sports.js';
import { siteUrl, siteDomain } from './website.js';
import { VIEWS as TASK_VIEWS } from './tasks.js';
import { SHOWS as MARVEL_SHOWS } from './marvel.js';

export const COLS = 12;
export const ROWS = 12;
// What a GitHub copy can show, in the default order; each copy keeps its own order.
export const GITHUB_PARTS = ['stats', 'heatmap', 'pulls', 'reviews', 'issues', 'repos', 'commits'];
// The parts a new copy shows (and a copy saved before the others existed).
const GITHUB_SHOWN = ['heatmap', 'pulls', 'issues', 'commits'];
export const PART_LABELS = { stats: 'Stats', heatmap: 'Map', pulls: 'PRs', reviews: 'Reviews', issues: 'Issues', repos: 'Repos', commits: 'Commits' };
const CLOCK_FACES = ['classic', 'stencil', 'rounded', 'serif', 'dot', 'stencil-line', 'rounded-line', 'serif-line'];
const MARKET_ITEMS = ['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS'];

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v, fallback) => (Number.isInteger(v) ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);

// size and min are [w, h] in cells; max is how many copies the page may hold. clean(settings,
// state) returns a full, valid settings object for the type. A type's settings are the copy's own
// group under Preferences → Layout, unless prefs names another section (which holds the settings
// every copy shares, and for GitHub each copy's own group too) or is null (nothing to set).
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
  tasks: {
    label: 'Tasks', icon: 'check-circle', size: [3, 4], min: [2, 3], max: 1, prefs: null,
    defaults: () => ({ view: 'all', showDone: false }),
    clean: s => ({ view: TASK_VIEWS.includes(s.view) ? s.view : 'all', showDone: bool(s.showDone, false) }),
  },
  notes: { label: 'Notes', icon: 'note', size: [3, 3], min: [2, 2], max: 1, prefs: null, defaults: () => ({}), clean: () => ({}) },
  claude: { label: 'Claude', icon: 'claude', size: [3, 2], min: [2, 2], max: 5, prefs: null, defaults: () => ({}), clean: () => ({}) },
  markets: {
    label: 'Markets', icon: 'trend', size: [3, 5], min: [2, 3], max: 5,
    defaults: () => ({ items: [...MARKET_ITEMS] }),
    clean: s => ({ items: cleanMarketItems(s.items) ?? [...MARKET_ITEMS] }),
  },
  // order: every part, as the copy lists them; parts: the ones shown, in that order.
  github: {
    label: 'GitHub', icon: 'branch', size: [3, 6], min: [3, 3], max: 5, prefs: 'github',
    defaults: () => cleanGithubParts({}),
    clean: s => cleanGithubParts(s),
  },
  sports: {
    label: 'Sports', icon: 'trophy', size: [3, 5], min: [2, 3], max: 5,
    defaults: () => cleanSports({}),
    clean: s => cleanSports(s),
  },
  // group: a group id, or null to follow the tabs.
  tiles: {
    label: 'Tiles', icon: 'grid', size: [6, 6], min: [3, 3], max: 5,
    defaults: () => ({ group: null, columns: 5 }),
    clean: (s, state) => ({
      group: state?.groups?.some(g => g.id === s.group) ? s.group : null,
      columns: clamp(int(s.columns, 5), 2, 10),
    }),
  },
  // The one search bar on the page, a widget of its own.
  search: { label: 'Search bar', icon: 'search', size: [6, 1], min: [3, 1], max: 1, prefs: 'search', defaults: () => ({}), clean: () => ({}) },
  // url: the start address as typed ('' until one is set); zoom: the percent the site is drawn at.
  website: {
    label: 'Website', icon: 'globe', size: [4, 6], min: [2, 3], max: 5,
    defaults: () => ({ url: '', zoom: 100 }),
    clean: s => ({ url: str(s.url).slice(0, 2000), zoom: clamp(int(s.zoom, 100), 50, 100) }),
  },
  // show: 'all', 'studios' (no Marvel Television shows) or 'films' (see marvel.js). What's watched
  // is the page's (state.marvel), not the copy's.
  marvel: {
    label: 'Marvel', icon: 'shield', size: [3, 6], min: [2, 3], max: 1,
    defaults: () => ({ show: 'all', hideWatched: false }),
    clean: s => ({ show: MARVEL_SHOWS.includes(s.show) ? s.show : 'all', hideWatched: bool(s.hideWatched, false) }),
  },
};

// ---- GitHub parts ----

const knownParts = list => (Array.isArray(list) ? [...new Set(list)].filter(p => GITHUB_PARTS.includes(p)) : []);

// A copy's order and shown parts, whole and valid. A part the saved order lacks (it came later)
// goes in after its nearest predecessor in the default order.
export function cleanGithubParts(s) {
  const order = knownParts(s.order);
  GITHUB_PARTS.forEach((part, i) => {
    if (order.includes(part)) return;
    const before = GITHUB_PARTS.slice(0, i).findLast(p => order.includes(p));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, part);
  });
  const shown = Array.isArray(s.parts) ? knownParts(s.parts) : GITHUB_SHOWN;
  return { order, parts: order.filter(p => shown.includes(p)) };
}

// The settings with `part` one place up (-1) or down (1) the list; at an end, unchanged.
export function moveGithubPart(s, part, step) {
  const order = [...s.order];
  const i = order.indexOf(part);
  const j = i + step;
  if (i < 0 || j < 0 || j >= order.length) return cleanGithubParts(s);
  [order[i], order[j]] = [order[j], order[i]];
  return cleanGithubParts({ order, parts: s.parts });
}

// "Map + Commits", "Map + PRs + 3 more", "nothing chosen".
export function partsSummary(parts) {
  const names = parts.map(p => PART_LABELS[p]);
  return (names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : names).join(' + ') || 'nothing chosen';
}

export const showGithubPart = (s, part, on) => cleanGithubParts({ order: s.order, parts: on ? [...s.parts, part] : s.parts.filter(p => p !== part) });

// The Preferences section that holds a type's settings: 'layout' (the copy's own group), another
// section's id, or null.
export const prefsSection = type => (TYPES[type] && 'prefs' in TYPES[type] ? TYPES[type].prefs : 'layout');

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

// ---- tab layouts ----
// prefs.layout is the main layout; prefs.layouts holds the tabs (groups) that have their own.

export const allLayouts = state => [state.prefs.layout, ...Object.values(state.prefs.layouts ?? {})];
export const ownLayout = (state, groupId) => state.prefs.layouts?.[groupId] ?? null;
// The layout the page shows: the active tab's own, else the main one.
export const activeLayout = state => ownLayout(state, state.activeGroupId) ?? state.prefs.layout;
export const copyById = (state, id) => {
  for (const l of allLayouts(state)) {
    const copy = l.widgets.find(c => c.id === id);
    if (copy) return copy;
  }
  return null;
};

// Gives a tab a layout of its own: a copy of the main one (with new ids) or an empty page.
// Returns it, or null when there's no such group.
export function giveOwnLayout(state, groupId, from = 'copy') {
  if (!state.groups.some(g => g.id === groupId)) return null;
  const main = state.prefs.layout;
  const layout = { cols: COLS, rows: ROWS, widgets: from === 'copy' ? main.widgets.map(c => ({ ...structuredClone(c), id: uid() })) : [] };
  state.prefs.layouts = { ...state.prefs.layouts, [groupId]: layout };
  return layout;
}

export function dropOwnLayout(state, groupId) {
  if (!ownLayout(state, groupId)) return false;
  delete state.prefs.layouts[groupId];
  return true;
}

// The groups' own layouts, each valid. A key that isn't a group goes, and a copy id the main
// layout or an earlier tab already uses gets a new one, so copyById finds one copy per id.
// state.groups and state.prefs.layout must already be clean.
export function normalizeLayouts(raw, state) {
  const out = {};
  const seen = new Set(state.prefs.layout.widgets.map(c => c.id));
  for (const g of state.groups) {
    if (!isObj(raw) || !isObj(raw[g.id])) continue;
    const layout = normalizeLayout(raw[g.id], state);
    for (const c of layout.widgets) {
      if (seen.has(c.id)) c.id = uid();
      seen.add(c.id);
    }
    out[g.id] = layout;
  }
  return out;
}

// Reading order for narrow windows and Tab: top to bottom, then left to right.
export const stackOrder = widgets => [...widgets].sort((a, b) => a.y - b.y || a.x - b.x).map(c => c.id);

// ---- default layout ----

// The clock column, top to bottom. Marvel goes here: the other column's four minimums already
// take all 12 rows.
const NEAR = { clock: 4, tasks: 4, notes: 4, claude: 2, marvel: 6 };
const FAR = { markets: 5, github: 7, sports: 5, website: 6 };   // the other column

// Heights of a column sum to at most ROWS: the tallest that is above its minimum shrinks first.
// With fill, one widget alone takes the whole column.
function column(items, fill) {
  if (fill && items.length === 1) items[0].h = ROWS;
  let total = items.reduce((n, it) => n + it.h, 0);
  while (total > ROWS) {
    const tallest = items.filter(it => it.h > TYPES[it.type].min[1]).reduce((a, b) => (!a || b.h > a.h ? b : a), null);
    if (!tallest) break;
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

// Where copies of the given types go: the clock column on `side`, Markets, GitHub and Sports opposite,
// and between them the search bar (one row, at the top or the bottom) over the tiles block, which
// is wider when a column is empty.
export function defaultPositions(types, side = 'left', barAt = 'top') {
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
  const x = leftUsed ? 3 : 0;
  const w = COLS - (leftUsed ? 3 : 0) - (rightUsed ? 3 : 0);
  const bar = types.includes('search');
  if (bar) out.push({ type: 'search', x, y: barAt === 'bottom' ? ROWS - 1 : 0, w, h: 1 });
  if (types.includes('tiles')) out.push({ type: 'tiles', x, y: bar && barAt !== 'bottom' ? 1 : 0, w, h: bar ? ROWS - 1 : ROWS });
  return out;
}

// The old GitHub Show choice as parts: the map and open PRs always came first.
export const partsFromShow = show => (show === 'commits' ? ['heatmap', 'pulls', 'commits'] : show === 'issues' ? ['heatmap', 'pulls', 'issues'] : [...GITHUB_SHOWN]);

// The layout a state from before Layout mode gets: the page it showed. `old` is the legacy prefs
// shape (widgets.*, search.enabled/row, columns) with every field present.
export function defaultLayout(old) {
  const w = old.widgets;
  const on = name => w.enabled !== false && w[name]?.enabled !== false;
  // Sports and Marvel came after Layout mode: an old page never had them.
  const types = ['clock', 'tasks', 'notes', 'claude', 'markets', 'github'].filter(on);
  const settings = {
    clock: () => ({ hour24: w.clock.hour24, name: w.clock.name, greeting: w.clock.greeting, face: w.clock.face, colon: w.clock.colon }),
    markets: () => ({ items: [...w.markets.items] }),
    github: () => cleanGithubParts({ parts: partsFromShow(w.github.show) }),
    tiles: () => ({ group: null, columns: clamp(int(old.columns, 5), 2, 10) }),
  };
  // The bar used to sit among the tiles; a bar under them all (-1) stays at the bottom.
  if (old.search.enabled !== false) types.push('search');
  const widgets = defaultPositions([...types, 'tiles'], w.position, old.search.row === -1 ? 'bottom' : 'top').map(p => ({
    id: uid(), ...p, settings: settings[p.type] ? settings[p.type]() : TYPES[p.type].defaults(),
  }));
  return { cols: COLS, rows: ROWS, widgets };
}

// ---- validation ----

export function normalizeLayout(raw, state) {
  const layout = { cols: COLS, rows: ROWS, widgets: [] };
  const ids = new Set();
  const docked = [];   // tiles blocks that still carry a docked bar (an earlier version of this)
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
    const copy = { id, type: c.type, ...rect, settings: t.clean(isObj(c.settings) ? c.settings : {}, state) };
    layout.widgets.push(copy);
    if (c.type === 'tiles' && Number.isInteger(c.settings?.bar)) docked.push({ copy, bottom: c.settings.bar === -1 });
  }
  // A bar docked in a block becomes the page's bar: one row off the top (or bottom) of the block.
  for (const { copy, bottom } of docked) {
    if (countOf(layout, 'search') >= TYPES.search.max) break;
    if (copy.h <= TYPES.tiles.min[1]) continue;
    const bar = { id: uid(), type: 'search', x: copy.x, y: bottom ? copy.y + copy.h - 1 : copy.y, w: copy.w, h: 1, settings: {} };
    copy.h -= 1;
    if (!bottom) copy.y += 1;
    layout.widgets.push(bar);
  }
  return layout;
}

// ---- what Layout mode does ----

// The first group no tiles block shows (a block that follows the tabs shows the active group),
// or null (follow the tabs).
function unshownGroup(layout, groups, activeGroupId) {
  const shown = new Set(layout.widgets.filter(c => c.type === 'tiles').map(c => c.settings.group ?? activeGroupId));
  return groups.find(g => !shown.has(g.id))?.id ?? null;
}

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

// A copy with the same settings. A tiles block is pinned to the next group not shown yet and gets
// columns to suit its width.
export function duplicateCopy(layout, id, groups = [], activeGroupId = null) {
  const from = layout.widgets.find(c => c.id === id);
  if (!from) return null;
  const settings = structuredClone(from.settings);
  if (from.type === 'tiles') {
    delete settings.group;
    delete settings.columns;
  }
  return addCopy(layout, from.type, settings, groups, activeGroupId);
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

// A drop on a taken spot that can trade places: the spot overlaps exactly one other copy and both
// fit after the trade. Neighbours in a column (same x and width) or a row (same y and height) swap
// order; any other pair trades corners, the dragged copy taking the spot and the other the dragged
// copy's old corner, each keeping its size. Returns { a: the dragged copy's rect, b: { id, rect } }
// or null.
export function swapPlan(layout, id, rect) {
  const a = layout.widgets.find(c => c.id === id);
  if (!a || !inside(rect)) return null;
  const hit = layout.widgets.filter(c => c.id !== id && overlaps(rect, c));
  if (hit.length !== 1) return null;
  const b = hit[0];
  let na;
  let nb;
  if (a.x === b.x && a.w === b.w && (a.y + a.h === b.y || b.y + b.h === a.y)) {
    const top = Math.min(a.y, b.y);
    nb = { x: b.x, y: a.y < b.y ? top : top + a.h, w: b.w, h: b.h };
    na = { x: a.x, y: a.y < b.y ? top + b.h : top, w: a.w, h: a.h };
  } else if (a.y === b.y && a.h === b.h && (a.x + a.w === b.x || b.x + b.w === a.x)) {
    const left = Math.min(a.x, b.x);
    nb = { x: a.x < b.x ? left : left + a.w, y: b.y, w: b.w, h: b.h };
    na = { x: a.x < b.x ? left + b.w : left, y: a.y, w: a.w, h: a.h };
  } else {
    na = { x: rect.x, y: rect.y, w: a.w, h: a.h };
    nb = { x: a.x, y: a.y, w: b.w, h: b.h };
  }
  const clear = r => inside(r) && !layout.widgets.some(c => c.id !== a.id && c.id !== b.id && overlaps(r, c));
  if (!clear(na) || !clear(nb) || overlaps(na, nb)) return null;
  return { a: na, b: { id: b.id, ...nb } };
}

export function swapCopy(layout, id, rect) {
  const plan = swapPlan(layout, id, rect);
  if (!plan) return false;
  const { id: otherId, ...other } = plan.b;
  Object.assign(layout.widgets.find(c => c.id === id), plan.a);
  Object.assign(layout.widgets.find(c => c.id === otherId), other);
  return true;
}

// The given types in their default places, one copy each: a copy already on the page keeps its id
// and settings (the first of its type), a new one gets its type's defaults. The clock column stays
// on its side and the search bar at the bottom if it was there. For setup's Widgets step.
export function placeDefaults(layout, types) {
  const first = new Map();
  for (const c of layout.widgets) if (!first.has(c.type)) first.set(c.type, c);
  const near = layout.widgets.find(c => c.type in NEAR);
  const side = near && near.x >= COLS / 2 ? 'right' : 'left';
  const barAt = first.get('search')?.y === ROWS - 1 ? 'bottom' : 'top';
  return defaultPositions([...new Set(types)], side, barAt).map(p => {
    const own = first.get(p.type);
    return own ? { ...own, ...p } : { id: uid(), ...p, settings: TYPES[p.type].defaults() };
  });
}

// Whether the page is still in the places placeDefaults gives it: one copy per type, nothing moved
// or resized by hand.
export function atDefaultPlaces(layout) {
  const types = layout.widgets.map(c => c.type);
  if (new Set(types).size !== types.length) return false;
  const want = placeDefaults(layout, types);
  return want.length === layout.widgets.length && want.every(p => {
    const c = layout.widgets.find(w => w.id === p.id);
    return c && c.x === p.x && c.y === p.y && c.w === p.w && c.h === p.h;
  });
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
  if (copy.type === 'github') return `${label} · ${partsSummary(copy.settings.parts)}`;
  if (copy.type === 'website') {
    const url = siteUrl(copy.settings.url);
    return `${label} · ${url ? siteDomain(url) : 'no address'}`;
  }
  return label;
}
