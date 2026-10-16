// App state: defaults, validation, persistence and change notification.
// Touches no browser globals at import time (unit-tested in Node).

import { uid } from './util.js';
import { parseCoins, cleanMarketItems } from './feeds.js';

export const DEFAULT_PREFS = {
  theme: 'dark',
  columns: 5,
  spacing: 8,
  width: 720,
  centerVertically: true,
  showAddButton: true,
  compact: false,
  openInNewTab: false,
  accent: '#d97757',
  // style 'flat' shows icon and title straight on the background; 'card' uses color/textColor.
  // icons 'logo' uses each tile's own icon image; 'site' prefers Chrome's favicon for the site.
  tiles: { style: 'flat', icons: 'logo', radius: 10, showTitle: true, color: '#ffffff', textColor: '#202124' },
  // pattern 'ascii' is the animated letter field. An image (the upload when useUpload, else url)
  // covers it while showImage is on; picking a pattern turns showImage off and keeps the image.
  background: { pattern: 'ascii', motion: true, url: '', useUpload: false, showImage: true, blur: 0, dim: 0 },
  widgets: {
    enabled: true,   // always true: an old false is turned into every widget switched off on load
    position: 'left',
    // face: 'classic' | 'stencil' | 'rounded' | 'serif' | 'dot' (One UI style lock-screen clocks).
    clock: { enabled: true, hour24: true, name: '', greeting: true, face: 'classic' },
    tasks: { enabled: true },
    notes: { enabled: true },
    // Shown in the column opposite the clock. items are Bybit spot coins quoted in USDT ('BTC')
    // and ECB currency pairs ('EUR/ILS'), in display order.
    markets: { enabled: true, items: ['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS'] },
    // token is optional (read-only) and only adds private repos' commits and PRs; never exported in backups.
    github: { enabled: true, user: '', token: '' },
  },
  sidebar: { enabled: true },
};

const KEYS = ['groups', 'tiles', 'activeGroupId', 'tasks', 'taskHistory', 'taskStats', 'notes', 'prefs'];

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const time = v => (Number.isFinite(v) ? v : null);

export function defaultState() {
  const home = { id: uid(), title: 'Home' };
  return {
    version: 1,
    groups: [home],
    tiles: [],
    activeGroupId: home.id,
    tasks: [],
    taskHistory: [],   // finished tasks, kept for a week
    taskStats: {},     // { 'YYYY-MM-DD': tasks completed that day }, kept forever
    notes: '',
    prefs: structuredClone(DEFAULT_PREFS),
  };
}

// Values from `over` win when they have the same type as the default;
// nested objects merge, so prefs added in later versions get their default.
export function deepMerge(base, over) {
  const src = isObj(over) ? over : {};
  const out = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(src)])) {
    const b = base[k];
    const o = src[k];
    if (isObj(b)) out[k] = deepMerge(b, o);
    else if (o !== undefined && (b === undefined || typeof o === typeof b)) out[k] = isObj(o) ? structuredClone(o) : o;
    else out[k] = b;
  }
  return out;
}

export function normalizeState(raw) {
  const s = defaultState();
  if (!isObj(raw)) return s;

  const groups = (Array.isArray(raw.groups) ? raw.groups : [])
    .filter(g => isObj(g) && typeof g.id === 'string')
    .map(g => ({ id: g.id, title: str(g.title, 'Group') }));
  if (groups.length) s.groups = groups;
  const ids = new Set(s.groups.map(g => g.id));

  const tiles = (Array.isArray(raw.tiles) ? raw.tiles : [])
    .filter(t => isObj(t) && (t.kind === 'folder' || (typeof t.url === 'string' && t.url)))
    .map(t => ({
      id: str(t.id) || uid(),
      groupId: ids.has(t.groupId) ? t.groupId : s.groups[0].id,
      title: str(t.title),
      url: t.kind === 'folder' ? '' : t.url,
      icon: str(t.icon),
      ...(t.kind === 'folder' ? { kind: 'folder' } : {}),
      ...(typeof t.folderId === 'string' ? { folderId: t.folderId } : {}),
    }));
  // A tile may only point at an existing folder in its own group; empty folders are dropped.
  const folders = new Map(tiles.filter(t => t.kind === 'folder').map(t => [t.id, t]));
  for (const t of tiles) {
    if (t.folderId && (t.kind === 'folder' || folders.get(t.folderId)?.groupId !== t.groupId)) delete t.folderId;
  }
  s.tiles = tiles.filter(t => t.kind !== 'folder' || tiles.some(c => c.folderId === t.id));

  s.activeGroupId = ids.has(raw.activeGroupId) ? raw.activeGroupId : s.groups[0].id;
  s.tasks = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .filter(t => isObj(t) && typeof t.text === 'string')
    .map(t => ({ id: str(t.id) || uid(), text: t.text, done: !!t.done, createdAt: time(t.createdAt), doneAt: t.done ? time(t.doneAt) : null }));
  s.taskHistory = (Array.isArray(raw.taskHistory) ? raw.taskHistory : [])
    .filter(t => isObj(t) && typeof t.text === 'string' && Number.isFinite(t.clearedAt))
    .map(t => ({ id: str(t.id) || uid(), text: t.text, createdAt: time(t.createdAt), doneAt: time(t.doneAt), clearedAt: t.clearedAt }));
  s.taskStats = Object.fromEntries(Object.entries(isObj(raw.taskStats) ? raw.taskStats : {})
    .filter(([day, n]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isInteger(n) && n > 0));
  s.notes = str(raw.notes);
  s.prefs = deepMerge(DEFAULT_PREFS, raw.prefs);
  s.prefs.widgets.markets = normalizeMarkets(raw.prefs?.widgets?.markets);
  // Older versions had one switch that hid every widget; it becomes each widget switched off.
  if (!s.prefs.widgets.enabled) {
    for (const w of Object.values(s.prefs.widgets)) if (isObj(w)) w.enabled = false;
    s.prefs.widgets.enabled = true;
  }
  return s;
}

// Older versions kept a coins text and a USD/ILS switch; those become the item list.
function normalizeMarkets(raw) {
  const m = isObj(raw) ? raw : {};
  const legacy = typeof m.coins === 'string' ? [...parseCoins(m.coins), ...(m.fx === false ? [] : ['USD/ILS'])] : null;
  return {
    enabled: typeof m.enabled === 'boolean' ? m.enabled : DEFAULT_PREFS.widgets.markets.enabled,
    items: cleanMarketItems(m.items) ?? legacy ?? [...DEFAULT_PREFS.widgets.markets.items],
  };
}

export function pickAdapter() {
  const area = globalThis.chrome?.storage?.local;
  if (area) {
    return {
      get: async key => (await area.get(key))[key],
      set: (key, value) => area.set({ [key]: value }),
    };
  }
  return {
    async get(key) {
      const raw = localStorage.getItem('newtab:' + key);
      return raw == null ? undefined : JSON.parse(raw);
    },
    async set(key, value) {
      localStorage.setItem('newtab:' + key, JSON.stringify(value));
    },
  };
}

export function createStore(adapter) {
  let state = defaultState();
  let wallpaper = '';
  let timer = null;
  let pending = null;
  const subs = new Set();

  const snapshot = () => Object.fromEntries(KEYS.map(k => [k, JSON.stringify(state[k])]));

  function notify(changed) {
    for (const sub of subs) {
      if (!sub.keys || sub.keys.some(k => changed.includes(k))) sub.fn(state, changed);
    }
  }

  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      pending = adapter.set('state', state);
    }, 200);
  }

  return {
    async load() {
      try {
        state = normalizeState(await adapter.get('state'));
      } catch (err) {
        console.warn('Saved state unreadable, starting from defaults.', err);
        state = defaultState();
      }
      try {
        wallpaper = str(await adapter.get('wallpaper'));
      } catch {
        wallpaper = '';
      }
      return state;
    },

    get: () => state,

    get wallpaper() {
      return wallpaper;
    },

    // Mutate state inside fn; subscribers to the top-level keys that changed are notified.
    update(fn) {
      const before = snapshot();
      fn(state);
      const after = snapshot();
      const changed = KEYS.filter(k => before[k] !== after[k]);
      if (!changed.length) return;
      scheduleSave();
      notify(changed);
    },

    replace(next) {
      state = normalizeState(next);
      scheduleSave();
      notify([...KEYS]);
    },

    async setWallpaper(dataUrl) {
      await adapter.set('wallpaper', dataUrl || '');
      wallpaper = dataUrl || '';
      notify(['wallpaper']);
    },

    // keys: top-level state keys (plus 'wallpaper') to listen to; omit for every change.
    subscribe(fn, keys) {
      const sub = { fn, keys };
      subs.add(sub);
      return () => subs.delete(sub);
    },

    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        await adapter.set('state', state);
      } else if (pending) {
        await pending;
      }
    },
  };
}
