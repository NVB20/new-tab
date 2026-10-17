// The page layout: widget copies on a 12 × 12 grid of cells, their sizes and limits, stacks (2–3
// copies sharing one spot), the default layout a saved state from before Layout mode converts to,
// and the moves Layout mode makes. Pure (unit-tested in Node).

import { uid, clamp } from './util.js';
import { cleanMarketItems } from './feeds.js';
import { cleanSports } from './sports.js';
import { siteUrl, siteDomain } from './website.js';
import { VIEWS as TASK_VIEWS } from './tasks.js';
import { SHOWS as MARVEL_SHOWS } from './marvel.js';
import { cleanWeather } from './weather.js';

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
    defaults: () => ({ view: 'all' }),
    clean: s => ({ view: TASK_VIEWS.includes(s.view) ? s.view : 'all' }),
  },
  notes: { label: 'Notes', icon: 'note', size: [3, 3], min: [2, 2], max: 1, prefs: null, defaults: () => ({}), clean: () => ({}) },
  claude: { label: 'Claude', icon: 'claude', size: [3, 2], min: [2, 2], max: 1, prefs: null, defaults: () => ({}), clean: () => ({}) },
  markets: {
    label: 'Markets', icon: 'trend', size: [3, 5], min: [2, 3], max: 3,
    defaults: () => ({ items: [...MARKET_ITEMS] }),
    clean: s => ({ items: cleanMarketItems(s.items) ?? [...MARKET_ITEMS] }),
  },
  // order: every part, as the copy lists them; parts: the ones shown, in that order.
  github: {
    label: 'GitHub', icon: 'branch', size: [3, 6], min: [3, 3], max: 3, prefs: 'github',
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
    label: 'Website', icon: 'globe', size: [4, 6], min: [2, 3], max: 2,
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
  // place: { name, region, country, lat, lon }, or null until one is chosen; unit: 'c' or 'f'.
  weather: {
    label: 'Weather', icon: 'cloud-sun', size: [3, 4], min: [2, 2], max: 3,
    defaults: () => cleanWeather({}),
    clean: s => cleanWeather(s),
  },
  // show: the countdown (an id in state.countdowns, see countdown.js) the copy shows, or 'next'
  // for whichever ends soonest. The countdowns are the page's, not the copy's.
  countdown: {
    label: 'Countdown', icon: 'hourglass', size: [3, 3], min: [2, 2], max: 3, prefs: null,
    defaults: () => ({ show: 'next' }),
    clean: s => ({ show: str(s.show, 'next').slice(0, 40) || 'next' }),
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

// Stacked copies count too.
export const countOf = (layout, type) => copiesOf(layout).filter(c => c.type === type).length;

// ---- stacks ----
// A stack is one entry in layout.widgets: 2–3 copies in one spot, one showing at a time.
//   { id, type: 'stack', x, y, w, h, front: <id of the copy showing>, items: [{ id, type, settings }, …] }
// Its copies have no place of their own. The search bar is never in one.

export const STACK_MAX = 3;
export const isStack = c => c?.type === 'stack';
// Every copy on a layout, stacked or not.
export const copiesOf = layout => layout.widgets.flatMap(c => (isStack(c) ? c.items : [c]));
export const stackOf = (layout, id) => layout.widgets.find(c => isStack(c) && c.items.some(it => it.id === id)) ?? null;
const placeless = ({ id, type, settings }) => ({ id, type, settings });
const membersOf = c => (isStack(c) ? c.items : [placeless(c)]);

// The smallest a copy or a stack can be, [w, h]: a stack is its biggest member's minimum, each way.
export function minOf(c) {
  if (!isStack(c)) return TYPES[c.type].min;
  return c.items.reduce(([w, h], it) => [Math.max(w, TYPES[it.type].min[0]), Math.max(h, TYPES[it.type].min[1])], [1, 1]);
}

// Why `id` (a copy or a stack) can't join `targetId`, or null when it can: 'search' (the search
// bar never stacks), 'full' (more than STACK_MAX copies), 'small' (the target's spot is under a
// member's minimum size) or 'missing'.
export function stackProblem(layout, id, targetId) {
  const a = layout.widgets.find(c => c.id === id);
  const b = layout.widgets.find(c => c.id === targetId);
  if (!a || !b || a === b) return 'missing';
  const items = [...membersOf(b), ...membersOf(a)];
  if (items.some(it => it.type === 'search')) return 'search';
  if (items.length > STACK_MAX) return 'full';
  const [w, h] = minOf({ type: 'stack', items });
  return b.w < w || b.h < h ? 'small' : null;
}

// `id` (a copy or a stack) joins `targetId` in the target's spot, and shows. Returns the stack, or
// null when it can't (stackProblem).
export function stackCopy(layout, id, targetId) {
  if (stackProblem(layout, id, targetId)) return null;
  const a = layout.widgets.find(c => c.id === id);
  const b = layout.widgets.find(c => c.id === targetId);
  const stack = isStack(b) ? b : { id: uid(), type: 'stack', x: b.x, y: b.y, w: b.w, h: b.h, front: b.id, items: membersOf(b) };
  stack.items.push(...membersOf(a));
  stack.front = isStack(a) ? a.front : a.id;
  layout.widgets = layout.widgets.filter(c => c !== a).map(c => (c === b ? stack : c));
  return stack;
}

// Copy `id` leaves its stack: the next one along shows if it was showing, and a stack of one is
// that copy again, in the stack's spot. Returns the copy (without a place), or null.
function leaveStack(layout, id) {
  const stack = stackOf(layout, id);
  if (!stack) return null;
  const i = stack.items.findIndex(it => it.id === id);
  const [copy] = stack.items.splice(i, 1);
  if (stack.front === id) stack.front = stack.items[Math.min(i, stack.items.length - 1)].id;
  if (stack.items.length === 1) {
    const [only] = stack.items;
    layout.widgets = layout.widgets.map(c => (c === stack ? { id: only.id, type: only.type, x: c.x, y: c.y, w: c.w, h: c.h, settings: only.settings } : c));
  }
  return copy;
}

// Takes a stacked copy out to the first spot that takes its default size, else its minimum.
// Returns the copy, or null when it isn't stacked or nothing fits.
export function unstackCopy(layout, id) {
  const copy = stackOf(layout, id)?.items.find(it => it.id === id);
  if (!copy) return null;
  const t = TYPES[copy.type];
  const spot = firstFree(layout, ...t.size) ?? firstFree(layout, ...t.min);
  if (!spot) return null;
  leaveStack(layout, id);
  const out = { id: copy.id, type: copy.type, ...spot, settings: copy.settings };
  layout.widgets.push(out);
  return out;
}

// Shows copy `id` in stack `stackId`. Returns whether anything changed.
export function setFront(layout, stackId, id) {
  const stack = layout.widgets.find(c => c.id === stackId);
  if (!isStack(stack) || stack.front === id || !stack.items.some(it => it.id === id)) return false;
  stack.front = id;
  return true;
}

// A copy or a stack with new ids (and front following its copy), for a copied layout.
function renewed(c) {
  if (!isStack(c)) return { ...structuredClone(c), id: uid() };
  const items = c.items.map(it => ({ ...structuredClone(it), id: uid() }));
  return { ...c, id: uid(), front: items[c.items.findIndex(it => it.id === c.front)]?.id ?? items[0].id, items };
}

// ---- tab layouts ----
// prefs.layout is the main layout; prefs.layouts holds the tabs (groups) that have their own.

export const allLayouts = state => [state.prefs.layout, ...Object.values(state.prefs.layouts ?? {})];
export const ownLayout = (state, groupId) => state.prefs.layouts?.[groupId] ?? null;
// The layout the page shows: the active tab's own, else the main one.
export const activeLayout = state => ownLayout(state, state.activeGroupId) ?? state.prefs.layout;
// A copy, stacked or not, or a stack, in any layout.
export const copyById = (state, id) => {
  for (const l of allLayouts(state)) {
    for (const c of l.widgets) {
      if (c.id === id) return c;
      const copy = isStack(c) && c.items.find(it => it.id === id);
      if (copy) return copy;
    }
  }
  return null;
};

// Gives a tab a layout of its own: a copy of the main one (with new ids) or an empty page.
// Returns it, or null when there's no such group.
export function giveOwnLayout(state, groupId, from = 'copy') {
  if (!state.groups.some(g => g.id === groupId)) return null;
  const main = state.prefs.layout;
  const layout = { cols: COLS, rows: ROWS, widgets: from === 'copy' ? main.widgets.map(renewed) : [] };
  state.prefs.layouts = { ...state.prefs.layouts, [groupId]: layout };
  return layout;
}

export function dropOwnLayout(state, groupId) {
  if (!ownLayout(state, groupId)) return false;
  delete state.prefs.layouts[groupId];
  return true;
}

// Every id on a layout: its copies, stacked or not, and its stacks.
const idsOf = layout => layout.widgets.flatMap(c => (isStack(c) ? [c.id, ...c.items.map(it => it.id)] : [c.id]));

// The groups' own layouts, each valid. A key that isn't a group goes, and an id (a copy's or a
// stack's) the main layout or an earlier tab already uses gets a new one, so copyById finds one
// per id. state.groups and state.prefs.layout must already be clean.
export function normalizeLayouts(raw, state) {
  const out = {};
  const seen = new Set(idsOf(state.prefs.layout));
  for (const g of state.groups) {
    if (!isObj(raw) || !isObj(raw[g.id])) continue;
    const layout = normalizeLayout(raw[g.id], state);
    for (const c of layout.widgets) {
      for (const it of isStack(c) ? [c, ...c.items] : [c]) {
        if (seen.has(it.id)) {
          const id = uid();
          if (it !== c && c.front === it.id) c.front = id;
          it.id = id;
        }
        seen.add(it.id);
      }
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
const NEAR = { clock: 4, weather: 4, countdown: 3, tasks: 4, notes: 4, claude: 2, marvel: 6 };
const FAR = { markets: 5, github: 7, sports: 5, website: 6 };   // the other column
// Types that came after both columns' minimums filled all 12 rows: one goes in the other column
// when its own is full, and is left out when both are. The first moves first, so Weather keeps
// its place under the clock longest.
const SPARE = ['countdown', 'weather'];
const fitsColumn = types => types.reduce((n, t) => n + TYPES[t].min[1], 0) <= ROWS;

// The types each column takes: a spare that doesn't fit in its own column moves to the other.
function columns(types) {
  const near = Object.keys(NEAR).filter(t => types.includes(t));
  const far = Object.keys(FAR).filter(t => types.includes(t));
  for (const [own, other] of [[near, far], [far, near]]) {
    for (const t of SPARE.filter(s => own.includes(s))) {
      if (fitsColumn(own)) break;
      own.splice(own.indexOf(t), 1);
      if (fitsColumn([...other, t])) other.push(t);
    }
  }
  return { near, far };
}

const HEIGHTS = { ...NEAR, ...FAR };

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
  const cols = columns(types);
  const near = column(cols.near.map(type => ({ type, h: HEIGHTS[type] })), false);
  const far = column(cols.far.map(type => ({ type, h: HEIGHTS[type] })), true);
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

// A stack's copies are each cleaned and counted against their type's limit. A search bar or a copy
// past STACK_MAX gets a spot of its own after the rest; a stack of one is that copy, in the
// stack's spot; an empty one goes; front is one of its copies.
export function normalizeLayout(raw, state) {
  const layout = { cols: COLS, rows: ROWS, widgets: [] };
  const ids = new Set();
  const ownId = id => {
    const out = str(id) && !ids.has(id) ? id : uid();
    ids.add(out);
    return out;
  };
  const settingsOf = c => TYPES[c.type].clean(isObj(c.settings) ? c.settings : {}, state);
  // Its saved place, else the first free spot of that size, else of the minimum size, or null.
  const place = (c, size, min) => {
    const w = clamp(int(c.w, size[0]), min[0], COLS);
    const h = clamp(int(c.h, size[1]), min[1], ROWS);
    const rect = { x: clamp(int(c.x, 0), 0, COLS - w), y: clamp(int(c.y, 0), 0, ROWS - h), w, h };
    return fits(layout, rect) ? rect : firstFree(layout, w, h) ?? firstFree(layout, ...min);
  };
  // Only the widget types this page has: a saved type such as 'constructor' isn't one.
  const typeOf = c => isObj(c) && typeof c.type === 'string' && Object.hasOwn(TYPES, c.type) && TYPES[c.type];
  const addPlain = (c, id = null) => {
    const t = typeOf(c);
    if (!t || countOf(layout, c.type) >= t.max) return null;
    const rect = place(c, t.size, t.min);
    if (!rect) return null;
    const copy = { id: id ?? ownId(c.id), type: c.type, ...rect, settings: settingsOf(c) };
    layout.widgets.push(copy);
    return copy;
  };
  const docked = [];   // tiles blocks that still carry a docked bar (an earlier version of this)
  const loose = [];    // copies a stack can't keep
  for (const c of Array.isArray(raw?.widgets) ? raw.widgets : []) {
    if (!isStack(c)) {
      const copy = addPlain(c);
      if (copy?.type === 'tiles' && Number.isInteger(c.settings?.bar)) docked.push({ copy, bottom: c.settings.bar === -1 });
      continue;
    }
    const items = [];
    for (const it of Array.isArray(c.items) ? c.items : []) {
      const t = typeOf(it);
      if (!t || countOf(layout, it.type) + items.filter(x => x.type === it.type).length >= t.max) continue;
      if (it.type === 'search' || items.length >= STACK_MAX) loose.push(it);
      else items.push({ id: ownId(it.id), type: it.type, settings: settingsOf(it) });
    }
    if (items.length === 1) addPlain({ ...items[0], x: c.x, y: c.y, w: c.w, h: c.h }, items[0].id);
    if (items.length < 2) continue;
    const size = items.reduce(([w, h], it) => [Math.max(w, TYPES[it.type].size[0]), Math.max(h, TYPES[it.type].size[1])], [1, 1]);
    const rect = place(c, size, minOf({ type: 'stack', items }));
    if (!rect) {
      loose.push(...items);
      continue;
    }
    const front = items.some(it => it.id === c.front) ? c.front : items[0].id;
    layout.widgets.push({ id: ownId(c.id), type: 'stack', ...rect, front, items });
  }
  for (const c of loose) addPlain(c);
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
  const shown = new Set(copiesOf(layout).filter(c => c.type === 'tiles').map(c => c.settings.group ?? activeGroupId));
  return groups.find(g => !shown.has(g.id))?.id ?? null;
}

// The copy a click on the tray would add, without an id and without adding it: the first spot
// that takes the type's default size, else its minimum size, with the type's default settings. A
// new tiles block is pinned to the first group no block shows, with columns to suit its width.
// Null when the type is at its limit or nothing fits.
// Room on a full page for a copy of `size` (else `min`, [w, h]): the biggest widget or stack that
// can spare it gives up its bottom rows, or else its right-hand columns, staying at least its own
// minimum. { spot, shrink: { id, w, h } } (the giver's new size), or null.
export function makeRoom(layout, size, min) {
  const givers = [...layout.widgets].sort((a, b) => b.w * b.h - a.w * a.h);
  for (const [w, h] of [size, min]) {
    for (const c of givers) {
      const [minW, minH] = minOf(c);
      if (c.w >= min[0] && c.h - h >= minH) {
        return { spot: { x: c.x, y: c.y + c.h - h, w: Math.min(w, c.w), h }, shrink: { id: c.id, w: c.w, h: c.h - h } };
      }
      if (c.h >= min[1] && c.w - w >= minW) {
        return { spot: { x: c.x + c.w - w, y: c.y, w, h: Math.min(h, c.h) }, shrink: { id: c.id, w: c.w - w, h: c.h } };
      }
    }
  }
  return null;
}

// What a tray click would add: { type, x, y, w, h, settings }, in a free spot of the default size,
// else the minimum, else in room another widget makes (then shrink says which, and to what), or
// null at the type's limit or when nothing can make room.
export function plannedCopy(layout, type, groups = [], activeGroupId = null) {
  const t = TYPES[type];
  if (!t || countOf(layout, type) >= t.max) return null;
  const free = firstFree(layout, ...t.size) ?? firstFree(layout, ...t.min);
  const room = free ? null : makeRoom(layout, t.size, t.min);
  const spot = free ?? room?.spot;
  if (!spot) return null;
  const settings = t.defaults();
  if (type === 'tiles') {
    settings.group = unshownGroup(layout, groups, activeGroupId);
    // Columns to suit the width it landed in: the default block is 6 wide with 5 columns.
    settings.columns = clamp(Math.round(spot.w * 5 / 6), 2, 10);
  }
  return { type, ...spot, settings, ...(room ? { shrink: room.shrink } : {}) };
}

// Adds the planned copy, with `settings` over the planned ones, shrinking the widget that makes
// room for it. Returns the copy, or null when the type is at its limit or nothing can make room.
export function addCopy(layout, type, settings, groups = [], activeGroupId = null) {
  const plan = plannedCopy(layout, type, groups, activeGroupId);
  if (!plan) return null;
  const { shrink, ...planned } = plan;
  if (shrink) Object.assign(layout.widgets.find(c => c.id === shrink.id), { w: shrink.w, h: shrink.h });
  const copy = { id: uid(), ...planned, settings: { ...planned.settings, ...(isObj(settings) ? structuredClone(settings) : {}) } };
  layout.widgets.push(copy);
  return copy;
}

// A copy with the same settings, in a spot of its own (a stacked one's too). A tiles block is
// pinned to the next group not shown yet and gets columns to suit its width.
export function duplicateCopy(layout, id, groups = [], activeGroupId = null) {
  const from = copiesOf(layout).find(c => c.id === id);
  if (!from) return null;
  const settings = structuredClone(from.settings);
  if (from.type === 'tiles') {
    delete settings.group;
    delete settings.columns;
  }
  return addCopy(layout, from.type, settings, groups, activeGroupId);
}

// Removes a copy (out of its stack, if it's in one) or a whole stack.
export function removeCopy(layout, id) {
  if (leaveStack(layout, id)) return true;
  const before = layout.widgets.length;
  layout.widgets = layout.widgets.filter(c => c.id !== id);
  return layout.widgets.length < before;
}

// Moves or resizes a copy or a stack when the result is inside the canvas, clear of the others and
// not under its minimum.
export function moveCopy(layout, id, rect) {
  const copy = layout.widgets.find(c => c.id === id);
  if (!copy) return false;
  const [minW, minH] = minOf(copy);
  const next = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  if (next.w < minW || next.h < minH || !fits(layout, next, id)) return false;
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
  for (const c of copiesOf(layout)) if (!first.has(c.type)) first.set(c.type, c);
  const near = layout.widgets.find(c => c.type in NEAR);
  const side = near && near.x >= COLS / 2 ? 'right' : 'left';
  const barAt = first.get('search')?.y === ROWS - 1 ? 'bottom' : 'top';
  return defaultPositions([...new Set(types)], side, barAt).map(p => {
    const own = first.get(p.type);
    return own ? { ...own, ...p } : { id: uid(), ...p, settings: TYPES[p.type].defaults() };
  });
}

// Whether the page is still in the places placeDefaults gives it: one copy per type, nothing moved,
// resized or stacked by hand.
export function atDefaultPlaces(layout) {
  if (layout.widgets.some(isStack)) return false;
  const types = layout.widgets.map(c => c.type);
  if (new Set(types).size !== types.length) return false;
  const want = placeDefaults(layout, types);
  return want.length === layout.widgets.length && want.every(p => {
    const c = layout.widgets.find(w => w.id === p.id);
    return c && c.x === p.x && c.y === p.y && c.w === p.w && c.h === p.h;
  });
}

// Back to the default places: the first copy of each type stays, with its settings, and stacks come
// apart; the clock column keeps its side. Returns the copies that were removed.
export function resetLayout(layout) {
  const kept = new Map();
  const all = copiesOf(layout);
  for (const c of all) if (!kept.has(c.type)) kept.set(c.type, c);
  const removed = all.filter(c => kept.get(c.type) !== c);
  const near = layout.widgets.find(c => c.type in NEAR);
  const side = near && near.x >= COLS / 2 ? 'right' : 'left';
  layout.widgets = defaultPositions([...kept.keys()], side).map(p => {
    const { id, type, settings } = kept.get(p.type);
    return { id, type, x: p.x, y: p.y, w: p.w, h: p.h, settings };
  });
  return removed;
}

// "Tiles · Work", "GitHub · Map + Commits", "Clock", "Stack · Markets, Sports": for frame labels
// and Preferences.
export function copyTitle(copy, groups = []) {
  if (isStack(copy)) return `Stack · ${copy.items.map(it => TYPES[it.type]?.label ?? it.type).join(', ')}`;
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
  if (copy.type === 'weather') return `${label} · ${copy.settings.place?.name ?? 'no place'}`;
  return label;
}
