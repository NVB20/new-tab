import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, THEME_ACCENTS, deepMerge, normalizeState, createStore, setTheme } from '../js/store.js';

function memoryAdapter(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key) { return data[key]; },
    async set(key, value) { data[key] = value; },
  };
}

test('deepMerge keeps defaults for missing keys', () => {
  const out = deepMerge({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9 } });
  assert.deepEqual(out, { a: 1, b: { c: 9, d: 3 } });
});

test('deepMerge ignores a primitive where an object is expected', () => {
  const out = deepMerge({ b: { c: 2 } }, { b: 'oops' });
  assert.deepEqual(out, { b: { c: 2 } });
});

test('deepMerge does not mutate its inputs', () => {
  const base = { b: { c: 2 } };
  deepMerge(base, { b: { c: 3 } });
  assert.equal(base.b.c, 2);
});

const copies = s => Object.fromEntries(s.prefs.layout.widgets.map(c => [c.type, c]));

test('normalizeState(null) returns a usable default state', () => {
  const s = normalizeState(null);
  assert.equal(s.groups.length, 1);
  assert.equal(s.activeGroupId, s.groups[0].id);
  assert.deepEqual(s.tiles, []);
  const { layout, ...rest } = s.prefs;
  const { layout: nil, ...defaults } = DEFAULT_PREFS;
  assert.deepEqual(rest, defaults);
  assert.deepEqual(layout.widgets.map(c => c.type), ['clock', 'tasks', 'notes', 'markets', 'github', 'search', 'tiles']);
});

test('a saved state from before Layout mode converts to the same page, and loses the old keys', () => {
  const s = normalizeState({ prefs: {
    columns: 7,
    width: 900,
    search: { enabled: true, row: 1, google: true, claude: false, chatgpt: true, gemini: false, mode: 'chatgpt' },
    widgets: {
      enabled: true,
      position: 'right',
      clock: { enabled: true, name: 'Niv', face: 'dot' },
      notes: { enabled: false },
      markets: { enabled: true, coins: 'btc, doge', fx: false },
      github: { enabled: true, user: 'octo', show: 'issues', token: 'ghp_x' },
    },
  } });
  const c = copies(s);
  assert.deepEqual([c.clock.x, c.clock.settings.name, c.clock.settings.face, c.clock.settings.hour24], [9, 'Niv', 'dot', true]);
  assert.equal(c.notes, undefined);
  assert.deepEqual(c.markets.settings.items, ['BTC', 'DOGE']);
  assert.deepEqual(c.github.settings, { parts: ['heatmap', 'pulls', 'issues'] });
  assert.equal(s.prefs.github.user, 'octo');
  assert.deepEqual(c.tiles.settings, { group: null, columns: 7 });
  assert.deepEqual([c.search.x, c.search.y, c.search.w, c.search.h], [3, 0, 6, 1]);
  assert.deepEqual([c.tiles.y, c.tiles.h], [1, 11]);
  assert.equal(s.prefs.github.token, 'ghp_x');
  assert.deepEqual(s.prefs.search, { google: true, claude: false, chatgpt: true, gemini: false, mode: 'chatgpt' });
  for (const k of ['columns', 'width', 'widgets']) assert.equal(k in s.prefs, false, k);
});

test('a saved layout is kept and validated; notes and tasks are untouched', () => {
  const layout = { widgets: [{ id: 'k', type: 'notes', x: 0, y: 0, w: 2, h: 2, settings: {} }, { id: 'z', type: 'zzz' }] };
  const s = normalizeState({ notes: 'hello', tasks: [{ id: 't', text: 'a' }], prefs: { layout, github: { token: 'keep' } } });
  assert.deepEqual(s.prefs.layout.widgets.map(c => c.id), ['k']);
  assert.equal(s.notes, 'hello');
  assert.equal(s.tasks[0].text, 'a');
  assert.equal(s.prefs.github.token, 'keep');
});

test('normalizeState reassigns orphan tiles and drops tiles without url', () => {
  const s = normalizeState({
    groups: [{ id: 'g1', title: 'Home' }],
    tiles: [
      { id: 't1', groupId: 'missing', title: 'A', url: 'https://a.com' },
      { id: 't2', groupId: 'g1', title: 'B' },
    ],
    activeGroupId: 'nope',
  });
  assert.equal(s.tiles.length, 1);
  assert.equal(s.tiles[0].groupId, 'g1');
  assert.equal(s.activeGroupId, 'g1');
});

test('normalizeState merges saved prefs over defaults', () => {
  const s = normalizeState({ prefs: { spacing: 12, columns: 7, widgets: { clock: { name: 'Niv' } } } });
  assert.equal(s.prefs.spacing, 12);
  assert.equal(copies(s).tiles.settings.columns, 7);
  assert.equal(copies(s).clock.settings.name, 'Niv');
  assert.equal(copies(s).clock.settings.hour24, true);
  assert.equal(s.prefs.accent, DEFAULT_PREFS.accent);
});

test('a GitHub copy’s own username becomes the one every copy shares', () => {
  const layout = users => ({ widgets: users.map((user, i) => ({ id: `g${i}`, type: 'github', x: i * 3, y: 0, w: 3, h: 3, settings: { user, parts: ['heatmap'] } })) });
  const s = normalizeState({ prefs: { layout: layout(['', ' octo ', 'other']) } });
  assert.equal(s.prefs.github.user, 'octo');
  assert.ok(s.prefs.layout.widgets.every(c => !('user' in c.settings)));
  assert.equal(normalizeState({ prefs: { layout: layout(['octo']), github: { user: 'mine' } } }).prefs.github.user, 'mine');
  assert.equal(normalizeState({ prefs: { layout: layout(['']) } }).prefs.github.user, '');
});

test('older saved prefs get the ASCII background and flat tiles by default', () => {
  const s = normalizeState({ prefs: { background: { blur: 4 }, tiles: { color: '#ffffff' } } });
  assert.equal(s.prefs.background.pattern, 'ascii');
  assert.equal(s.prefs.background.motion, true);
  assert.equal(s.prefs.background.blur, 4);
  assert.equal(s.prefs.tiles.style, 'flat');
  assert.equal(s.prefs.tiles.icons, 'logo');
  const c = copies(s);
  assert.deepEqual(c.markets.settings.items, ['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS']);
  assert.equal(c.clock.settings.face, 'classic');
  assert.equal(c.clock.settings.colon, true);
  assert.equal(s.prefs.github.user, '');
  assert.equal(s.prefs.tiles.color, '#ffffff');
});

test('Markets coins and USD/ILS switch from older versions become the item list', () => {
  const items = markets => copies(normalizeState({ prefs: { widgets: { markets } } })).markets?.settings.items;
  assert.deepEqual(items({ coins: 'btc, doge', fx: true }), ['BTC', 'DOGE', 'USD/ILS']);
  assert.equal(items({ coins: 'ETH', fx: false, enabled: false }), undefined);
  assert.deepEqual(items({ items: ['eur/ils', 'BTC', 'bad!'], coins: 'SOL' }), ['EUR/ILS', 'BTC']);
  assert.deepEqual(items({ items: [] }), []);
  assert.deepEqual(items({ items: 'BTC' }), ['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS']);
});

test('the old GitHub Show choice becomes the parts of the copy', () => {
  const parts = github => copies(normalizeState({ prefs: { widgets: { github } } })).github.settings.parts;
  assert.deepEqual(parts({ user: 'octo' }), ['heatmap', 'pulls', 'issues', 'commits']);
  assert.deepEqual(parts({ show: 'issues' }), ['heatmap', 'pulls', 'issues']);
  assert.deepEqual(parts({ show: 'commits' }), ['heatmap', 'pulls', 'commits']);
  assert.deepEqual(parts({ show: 'everything' }), ['heatmap', 'pulls', 'issues', 'commits']);
});

test('the old switch that hid every widget leaves only the tiles', () => {
  const s = normalizeState({ prefs: { widgets: { enabled: false, tasks: { enabled: true }, markets: { enabled: true } } } });
  assert.deepEqual(s.prefs.layout.widgets.map(c => c.type), ['search', 'tiles']);
});

test('each widget\'s own switch decides whether it has a copy', () => {
  const c = copies(normalizeState({ prefs: { widgets: { enabled: true, notes: { enabled: false } } } }));
  assert.equal(c.notes, undefined);
  assert.ok(c.clock);
});

test('saved backgrounds from before showImage keep showing their image', () => {
  const bg = normalizeState({ prefs: { background: { url: 'https://x/a.jpg' } } }).prefs.background;
  assert.equal(bg.showImage, true);
  assert.equal(bg.url, 'https://x/a.jpg');
});

test('normalizeState keeps task timestamps, history and daily counts, dropping junk', () => {
  const s = normalizeState({
    tasks: [{ id: 't', text: 'a', done: true, createdAt: 5, doneAt: 9 }, { id: 'u', text: 'old task' }],
    taskHistory: [{ id: 'h', text: 'x', createdAt: 1, doneAt: 2, clearedAt: 3 }, { text: 'no times' }, 'junk'],
    taskStats: { '2026-10-16': 4, '2026-10-15': -1, nonsense: 2, '2026-10-14': 'x' },
  });
  assert.deepEqual(s.tasks, [
    { id: 't', text: 'a', done: true, createdAt: 5, doneAt: 9, due: null, priority: null },
    { id: 'u', text: 'old task', done: false, createdAt: null, doneAt: null, due: null, priority: null },
  ]);
  assert.deepEqual(s.taskHistory, [{ id: 'h', text: 'x', createdAt: 1, doneAt: 2, clearedAt: 3 }]);
  assert.deepEqual(s.taskStats, { '2026-10-16': 4 });
  assert.deepEqual(normalizeState(null).taskStats, {});
  assert.deepEqual(normalizeState(null).taskHistory, []);
});

test('normalizeState keeps valid due dates and priorities and drops invalid ones', () => {
  const s = normalizeState({
    tasks: [
      { id: 'a', text: 'a', due: '2026-10-20', priority: 'high' },
      { id: 'b', text: 'b', due: 'tomorrow', priority: 'urgent' },
      { id: 'c', text: 'c', due: 20261020, priority: 1 },
    ],
  });
  assert.deepEqual(s.tasks.map(t => [t.due, t.priority]), [['2026-10-20', 'high'], [null, null], [null, null]]);
});

test('normalizeState keeps folders and their tiles, and repairs broken folder links', () => {
  const s = normalizeState({
    groups: [{ id: 'g1', title: 'Home' }],
    tiles: [
      { id: 'f', groupId: 'g1', kind: 'folder', title: 'Work' },
      { id: 'a', groupId: 'g1', title: 'A', url: 'https://a.com', folderId: 'f' },
      { id: 'b', groupId: 'g1', title: 'B', url: 'https://b.com', folderId: 'gone' },
      { id: 'empty', groupId: 'g1', kind: 'folder', title: 'Empty' },
    ],
  });
  assert.deepEqual(s.tiles.map(t => [t.id, t.kind ?? '', t.folderId ?? '']), [['f', 'folder', ''], ['a', '', 'f'], ['b', '', '']]);
});

test('switching theme brings its accent unless the user picked another one', () => {
  const p = structuredClone(DEFAULT_PREFS);
  setTheme(p, 'github');
  assert.equal(p.theme, 'github');
  assert.equal(p.accent, THEME_ACCENTS.github);
  setTheme(p, 'blue');
  assert.equal(p.accent, THEME_ACCENTS.blue);
  setTheme(p, 'light');
  assert.equal(p.accent, DEFAULT_PREFS.accent);
  p.accent = '#8b5cf6';
  setTheme(p, 'github');
  assert.equal(p.accent, '#8b5cf6');
});

test('store notifies only subscribers whose keys changed', async () => {
  const store = createStore(memoryAdapter());
  await store.load();
  const calls = { tiles: 0, notes: 0, all: 0 };
  store.subscribe(() => calls.tiles++, ['tiles']);
  store.subscribe(() => calls.notes++, ['notes']);
  store.subscribe(() => calls.all++);
  store.update(s => { s.notes = 'hello'; });
  assert.deepEqual(calls, { tiles: 0, notes: 1, all: 1 });
});

test('store persists after flush and reloads', async () => {
  const adapter = memoryAdapter();
  const a = createStore(adapter);
  await a.load();
  a.update(s => { s.notes = 'saved'; });
  await a.flush();
  const b = createStore(adapter);
  await b.load();
  assert.equal(b.get().notes, 'saved');
});

test('store wallpaper is stored under its own key', async () => {
  const adapter = memoryAdapter();
  const store = createStore(adapter);
  await store.load();
  let hits = 0;
  store.subscribe(() => hits++, ['wallpaper']);
  await store.setWallpaper('data:image/png;base64,AAAA');
  assert.equal(adapter.data.wallpaper, 'data:image/png;base64,AAAA');
  assert.equal(store.wallpaper, 'data:image/png;base64,AAAA');
  assert.equal(hits, 1);
});

test('store reads the wallpaper only when it is shown', async () => {
  const adapter = memoryAdapter({ wallpaper: 'data:image/png;base64,AAAA' });
  const reads = [];
  const get = adapter.get;
  adapter.get = key => { reads.push(key); return get(key); };
  await createStore(adapter).load();
  assert.deepEqual(reads, ['state']);

  adapter.data.state = { prefs: { background: { useUpload: true } } };
  reads.length = 0;
  const store = createStore(adapter);
  await store.load();
  assert.deepEqual(reads, ['state', 'wallpaper']);
  assert.equal(store.wallpaper, 'data:image/png;base64,AAAA');
});

// Like the extension's adapter: chrome.storage plus a synchronous localStorage copy of the state.
function cachingAdapter(initial = {}, copy = undefined) {
  const adapter = memoryAdapter(initial);
  adapter.copy = copy;
  adapter.cached = () => adapter.copy;
  adapter.cache = value => { adapter.copy = structuredClone(value); };
  return adapter;
}

const settle = () => new Promise(resolve => setTimeout(resolve));

test('store loads from the localStorage copy without waiting for chrome.storage', async () => {
  const adapter = cachingAdapter({}, { notes: 'from copy' });
  adapter.get = () => new Promise(() => {});   // chrome.storage never answers
  const store = createStore(adapter);
  await store.load();
  assert.equal(store.get().notes, 'from copy');
});

test('store keeps the localStorage copy in step with chrome.storage', async () => {
  const adapter = cachingAdapter({ state: { notes: 'saved' } });
  const store = createStore(adapter);
  await store.load();
  assert.equal(adapter.copy.notes, 'saved');   // copied on the first load without one
  store.update(s => { s.notes = 'edited'; });
  await store.flush();
  assert.equal(adapter.copy.notes, 'edited');
  assert.equal(adapter.data.state.notes, 'edited');
});

test('store takes chrome.storage over a stale localStorage copy', async () => {
  const adapter = cachingAdapter({ state: { notes: 'newer' } }, { notes: 'stale' });
  const store = createStore(adapter);
  let calls = 0;
  store.subscribe(() => calls++, ['notes']);
  await store.load();
  await settle();
  assert.equal(store.get().notes, 'newer');
  assert.equal(adapter.copy.notes, 'newer');
  assert.equal(calls, 1);
});

test('store changes nothing when the localStorage copy matches chrome.storage', async () => {
  const saved = normalizeState({ notes: 'same' });
  const store = createStore(cachingAdapter({ state: saved }, structuredClone(saved)));
  let calls = 0;
  store.subscribe(() => calls++);
  await store.load();
  await settle();
  assert.equal(calls, 0);
});

test('store keeps an edit made before chrome.storage answers', async () => {
  const adapter = cachingAdapter({ state: { notes: 'newer' } }, { notes: 'stale' });
  const get = adapter.get;
  let answer;
  adapter.get = key => (key === 'state' ? new Promise(resolve => { answer = () => resolve(get(key)); }) : get(key));
  const store = createStore(adapter);
  await store.load();
  store.update(s => { s.notes = 'typed'; });
  answer();
  await settle();
  assert.equal(store.get().notes, 'typed');
});

test('store falls back to defaults when saved state is corrupt', async () => {
  const store = createStore(memoryAdapter({ state: 'not an object' }));
  await store.load();
  assert.equal(store.get().groups.length, 1);
});

test('a saved state from before the search bar gets the bar with Google and Claude on top, and no Claude widget', () => {
  const s = normalizeState({ prefs: { widgets: { tasks: { enabled: false } } } });
  assert.deepEqual(s.prefs.search, { google: true, claude: true, chatgpt: false, gemini: false, mode: 'google' });
  assert.deepEqual([copies(s).search.y, copies(s).search.h], [0, 1]);
  assert.equal(copies(s).claude, undefined);
  assert.equal(copies(s).tasks, undefined);
});

test('a saved bar from before ChatGPT and Gemini keeps its settings and gets the new ones off', () => {
  const s = normalizeState({ prefs: { search: { enabled: true, google: false, claude: true, mode: 'claude' } } });
  assert.deepEqual(s.prefs.search, { google: false, claude: true, chatgpt: false, gemini: false, mode: 'claude' });
});
