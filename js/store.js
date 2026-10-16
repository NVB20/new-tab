// App state: defaults, validation, persistence and change notification.
// Touches no browser globals at import time (unit-tested in Node).

import { uid } from './util.js';
import { parseCoins, cleanMarketItems } from './feeds.js';
import { isDay, PRIORITIES } from './tasks.js';

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
  // Bar among the tiles. Each engine has a switch; mode is the one Enter goes to. row is how many
  // rows of tiles are above the bar (-1 keeps it under all of them).
  search: { enabled: true, google: true, claude: true, chatgpt: false, gemini: false, mode: 'google', row: 0 },
  widgets: {
    enabled: true,   // always true: an old false is turned into every widget switched off on load
    position: 'left',
    // face: 'classic' | 'stencil' | 'rounded' | 'serif' | 'dot' (One UI style lock-screen clocks),
    // or 'stencil-line' | 'rounded-line' | 'serif-line' for those fonts on one line.
    // colon: one-line faces show "15:41", or "1541" without it.
    clock: { enabled: true, hour24: true, name: '', greeting: true, face: 'classic', colon: true },
    tasks: { enabled: true },
    notes: { enabled: true },
    // A box that sends a message to a new chat on claude.ai.
    claude: { enabled: false },
    // Shown in the column opposite the clock. items are Bybit spot coins quoted in USDT ('BTC')
    // and ECB currency pairs ('EUR/ILS'), in display order.
    markets: { enabled: true, items: ['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS'] },
    // show: which lists follow the open PRs, 'commits' | 'issues' | 'both'.
    // token is optional (read-only) and only adds private repos' commits, issues and PRs; never exported in backups.
    github: { enabled: true, user: '', token: '', show: 'both' },
  },
  sidebar: { enabled: true },
};

export const GITHUB_SHOW = ['commits', 'issues', 'both'];

// theme is 'auto' | 'light' | 'dark' | 'blue' | 'github'; these two bring their own accent.
export const THEME_ACCENTS = { blue: '#2563eb', github: '#238636' };
const themeAccent = theme => THEME_ACCENTS[theme] ?? DEFAULT_PREFS.accent;

// The accent follows the theme until the user picks a different one.
export function setTheme(prefs, theme) {
  if (prefs.accent === themeAccent(prefs.theme)) prefs.accent = themeAccent(theme);
  prefs.theme = theme;
}

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
  const used = new Set(tiles.map(t => t.folderId));
  s.tiles = tiles.filter(t => t.kind !== 'folder' || used.has(t.id));

  s.activeGroupId = ids.has(raw.activeGroupId) ? raw.activeGroupId : s.groups[0].id;
  s.tasks = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .filter(t => isObj(t) && typeof t.text === 'string')
    .map(t => ({
      id: str(t.id) || uid(),
      text: t.text,
      done: !!t.done,
      createdAt: time(t.createdAt),
      doneAt: t.done ? time(t.doneAt) : null,
      due: isDay(t.due) ? t.due : null,
      priority: PRIORITIES.includes(t.priority) ? t.priority : null,
    }));
  s.taskHistory = (Array.isArray(raw.taskHistory) ? raw.taskHistory : [])
    .filter(t => isObj(t) && typeof t.text === 'string' && Number.isFinite(t.clearedAt))
    .map(t => ({ id: str(t.id) || uid(), text: t.text, createdAt: time(t.createdAt), doneAt: time(t.doneAt), clearedAt: t.clearedAt }));
  s.taskStats = Object.fromEntries(Object.entries(isObj(raw.taskStats) ? raw.taskStats : {})
    .filter(([day, n]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isInteger(n) && n > 0));
  s.notes = str(raw.notes);
  s.prefs = deepMerge(DEFAULT_PREFS, raw.prefs);
  s.prefs.widgets.markets = normalizeMarkets(raw.prefs?.widgets?.markets);
  if (!GITHUB_SHOW.includes(s.prefs.widgets.github.show)) s.prefs.widgets.github.show = DEFAULT_PREFS.widgets.github.show;
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
  const local = {
    get(key) {
      const raw = localStorage.getItem('newtab:' + key);
      return raw == null ? undefined : JSON.parse(raw);
    },
    set(key, value) {
      localStorage.setItem('newtab:' + key, JSON.stringify(value));
    },
  };
  const area = globalThis.chrome?.storage?.local;
  if (!area) {
    return {
      get: async key => local.get(key),
      set: async (key, value) => local.set(key, value),
    };
  }
  return {
    get: async key => (await area.get(key))[key],
    set: (key, value) => area.set({ [key]: value }),
    // A copy of the state in localStorage, which reads synchronously, so a new tab can render
    // without waiting for chrome.storage. A failed write removes it rather than leave it stale.
    cached() {
      try {
        return local.get('state');
      } catch {
        return undefined;
      }
    },
    cache(value) {
      try {
        local.set('state', value);
      } catch {
        try {
          localStorage.removeItem('newtab:state');
        } catch {
          // storage unavailable; chrome.storage still has everything
        }
      }
    },
  };
}

export function createStore(adapter) {
  let state = defaultState();
  let wallpaper = '';
  let timer = null;
  let pending = null;
  let edited = false;
  const subs = new Set();

  const snapshot = () => Object.fromEntries(KEYS.map(k => [k, JSON.stringify(state[k])]));
  const readWallpaper = () => adapter.get('wallpaper').then(v => str(v), () => '');

  function notify(changed) {
    for (const sub of subs) {
      if (!sub.keys || sub.keys.some(k => changed.includes(k))) sub.fn(state, changed);
    }
  }

  function save() {
    adapter.cache?.(state);
    return adapter.set('state', state);
  }

  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      pending = save();
    }, 200);
  }

  // chrome.storage is the source of truth. If it disagrees with the localStorage copy the page
  // started from (only after a failed copy, or an older version of the extension saving), its
  // state replaces the copy, unless something was edited in the meantime.
  async function verify() {
    let fresh;
    try {
      fresh = await adapter.get('state');
    } catch {
      return;
    }
    if (fresh === undefined || edited) return;
    const next = normalizeState(fresh);
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    if (next.prefs.background.useUpload && !wallpaper) wallpaper = await readWallpaper();
    if (edited) return;
    state = next;
    adapter.cache?.(state);
    notify([...KEYS, 'wallpaper']);
  }

  return {
    // Resolves as soon as the state is known: straight away from the localStorage copy when
    // there is one (chrome.storage is then checked in the background). The wallpaper, a data
    // URL of up to a few MB, is only read when it is shown.
    async load() {
      const cached = adapter.cached?.();
      if (cached !== undefined) {
        state = normalizeState(cached);
        verify();
      } else {
        try {
          state = normalizeState(await adapter.get('state'));
          adapter.cache?.(state);
        } catch (err) {
          console.warn('Saved state unreadable, starting from defaults.', err);
          state = defaultState();
        }
      }
      wallpaper = state.prefs.background.useUpload ? await readWallpaper() : '';
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
      edited = true;
      scheduleSave();
      notify(changed);
    },

    replace(next) {
      state = normalizeState(next);
      edited = true;
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
        await save();
      } else if (pending) {
        await pending;
      }
    },
  };
}
