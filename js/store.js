// App state: defaults, validation, persistence and change notification.
// Touches no browser globals at import time (unit-tested in Node).

import { uid } from './util.js';
import { parseCoins, cleanMarketItems } from './feeds.js';
import { isDay, PRIORITIES, REPEATS } from './tasks.js';
import { defaultLayout, normalizeLayout } from './layout.js';

export const DEFAULT_PREFS = {
  theme: 'dark',
  spacing: 8,
  showAddButton: true,
  compact: false,
  openInNewTab: false,
  accent: '#d97757',
  // style 'flat' shows icon and title straight on the background; 'card' uses color/textColor.
  // icons 'logo' uses each tile's own icon image; 'site' prefers Chrome's favicon for the site.
  tiles: { style: 'flat', icons: 'logo', radius: 10, showTitle: true, color: '#ffffff', textColor: '#202124' },
  // pattern 'ascii' is the animated letter field. An image (the upload when useUpload, else url)
  // covers it while showImage is on; picking a pattern turns showImage off and keeps the image.
  // pattern 'none' is a plain fill: color.light under the light theme, color.dark under the others
  // (text keeps the theme's colour), or the theme's own background when that is ''.
  background: { pattern: 'ascii', motion: true, color: { dark: '', light: '' }, url: '', useUpload: false, showImage: true, blur: 0, dim: 0 },
  // The engines the search bar offers; mode is the one Enter goes to.
  search: { google: true, claude: true, chatgpt: false, gemini: false, mode: 'google' },
  // One username and one token for every GitHub widget. The token is optional (read-only), only
  // adds private repos' commits, issues and PRs, and is never exported in backups.
  github: { user: '', token: '' },
  // The widget copies on the 12 × 12 canvas (see layout.js). null here: defaultState and
  // normalizeState fill it in.
  layout: null,
  sidebar: { enabled: true },
};

// Settings from before Layout mode. Read only to convert a saved state (and produced by the
// Speed Dial 2 importer): each widget's switch and settings, and which side the clock was on.
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
    prefs: { ...structuredClone(DEFAULT_PREFS), layout: defaultLayout(LEGACY_PREFS) },
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
      repeat: REPEATS.includes(t.repeat) && isDay(t.due) ? t.repeat : null,
      subtasks: (Array.isArray(t.subtasks) ? t.subtasks : [])
        .filter(st => isObj(st) && typeof st.text === 'string' && st.text.trim())
        .map(st => ({ id: str(st.id) || uid(), text: st.text, done: !!st.done })),
    }));
  s.taskHistory = (Array.isArray(raw.taskHistory) ? raw.taskHistory : [])
    .filter(t => isObj(t) && typeof t.text === 'string' && Number.isFinite(t.clearedAt))
    .map(t => ({ id: str(t.id) || uid(), text: t.text, createdAt: time(t.createdAt), doneAt: time(t.doneAt), clearedAt: t.clearedAt }));
  s.taskStats = Object.fromEntries(Object.entries(isObj(raw.taskStats) ? raw.taskStats : {})
    .filter(([day, n]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isInteger(n) && n > 0));
  s.notes = str(raw.notes);
  const rp = isObj(raw.prefs) ? raw.prefs : {};
  s.prefs = deepMerge(DEFAULT_PREFS, rp);
  if (isObj(rp.layout)) {
    s.prefs.layout = normalizeLayout(rp.layout, s);
  } else {
    // A state from before Layout mode: the page it showed becomes the layout.
    const old = deepMerge(LEGACY_PREFS, rp);
    old.widgets.markets.items = legacyMarketItems(rp.widgets?.markets);
    s.prefs.layout = defaultLayout(old);
    const token = rp.widgets?.github?.token;
    if (typeof token === 'string' && !s.prefs.github.token) s.prefs.github.token = token;
  }
  // The username was each GitHub copy's own setting (or the old widget's) before they shared one.
  const copies = Array.isArray(rp.layout?.widgets) ? rp.layout.widgets : [];
  const user = [...copies.map(c => c?.settings?.user), rp.widgets?.github?.user].find(u => typeof u === 'string' && u.trim());
  if (user && !s.prefs.github.user.trim()) s.prefs.github.user = user.trim();
  for (const k of ['columns', 'width', 'widgets', 'centerVertically']) delete s.prefs[k];
  delete s.prefs.search.enabled;
  delete s.prefs.search.row;
  return s;
}

// The Markets items of a state from before Layout mode. Older still kept a coins text and a
// USD/ILS switch; those become the item list.
function legacyMarketItems(raw) {
  const m = isObj(raw) ? raw : {};
  const legacy = typeof m.coins === 'string' ? [...parseCoins(m.coins), ...(m.fx === false ? [] : ['USD/ILS'])] : null;
  return cleanMarketItems(m.items) ?? legacy ?? [...LEGACY_PREFS.widgets.markets.items];
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
  let wallpaper = null;   // the uploaded wallpaper; null until it has been read
  let wallpaperRead = null;
  let timer = null;
  let pending = null;
  let edited = false;
  const subs = new Set();

  const snapshot = keys => Object.fromEntries(keys.map(k => [k, JSON.stringify(state[k])]));

  function notify(changed) {
    for (const sub of subs) {
      if (!sub.keys || sub.keys.some(k => changed.includes(k))) sub.fn(state, changed);
    }
  }

  // The wallpaper, a data URL of up to a few MB, is read once, in the background: the page shows
  // without it and subscribers to 'wallpaper' hear when it's there.
  function readWallpaper() {
    wallpaperRead ??= adapter.get('wallpaper').then(v => str(v), () => '').then(v => {
      if (wallpaper === null) {
        wallpaper = v;
        notify(['wallpaper']);
      }
      return wallpaper;
    });
    return wallpaperRead;
  }

  // Only an uploaded wallpaper that is shown is read without being asked for.
  function readWallpaperIfShown() {
    const b = state.prefs.background;
    if (b.useUpload && b.showImage && wallpaper === null) readWallpaper();
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
    state = next;
    adapter.cache?.(state);
    notify([...KEYS]);
    readWallpaperIfShown();
  }

  return {
    // Resolves as soon as the state is known: straight away from the localStorage copy when
    // there is one (chrome.storage is then checked in the background). The wallpaper isn't
    // waited for.
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
      readWallpaperIfShown();
      return state;
    },

    get: () => state,

    // The uploaded wallpaper: null while it hasn't been read (see readWallpaper), else a data
    // URL or ''.
    get wallpaper() {
      return wallpaper;
    },

    // The uploaded wallpaper, read now if it wasn't yet (a backup needs it even when hidden).
    loadWallpaper: () => (wallpaper !== null ? Promise.resolve(wallpaper) : readWallpaper()),

    // Mutate state inside fn; subscribers to the top-level keys that changed are notified.
    // keys: the top-level keys fn changes, when known, so only those are compared (each is
    // serialized before and after; the whole state is costly on every keystroke).
    update(fn, keys = KEYS) {
      const before = snapshot(keys);
      fn(state);
      const after = snapshot(keys);
      const changed = keys.filter(k => before[k] !== after[k]);
      if (!changed.length) return;
      edited = true;
      scheduleSave();
      notify(changed);
      if (changed.includes('prefs')) readWallpaperIfShown();
    },

    replace(next) {
      state = normalizeState(next);
      edited = true;
      scheduleSave();
      notify([...KEYS]);
      readWallpaperIfShown();
    },

    async setWallpaper(dataUrl) {
      await adapter.set('wallpaper', dataUrl || '');
      wallpaper = dataUrl || '';
      wallpaperRead = Promise.resolve(wallpaper);
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
