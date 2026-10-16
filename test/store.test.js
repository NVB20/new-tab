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

test('normalizeState(null) returns a usable default state', () => {
  const s = normalizeState(null);
  assert.equal(s.groups.length, 1);
  assert.equal(s.activeGroupId, s.groups[0].id);
  assert.deepEqual(s.tiles, []);
  assert.deepEqual(s.prefs, DEFAULT_PREFS);
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
  const s = normalizeState({ prefs: { columns: 7, widgets: { clock: { name: 'Niv' } } } });
  assert.equal(s.prefs.columns, 7);
  assert.equal(s.prefs.widgets.clock.name, 'Niv');
  assert.equal(s.prefs.widgets.clock.hour24, DEFAULT_PREFS.widgets.clock.hour24);
  assert.equal(s.prefs.accent, DEFAULT_PREFS.accent);
});

test('older saved prefs get the ASCII background and flat tiles by default', () => {
  const s = normalizeState({ prefs: { background: { blur: 4 }, tiles: { color: '#ffffff' } } });
  assert.equal(s.prefs.background.pattern, 'ascii');
  assert.equal(s.prefs.background.motion, true);
  assert.equal(s.prefs.background.blur, 4);
  assert.equal(s.prefs.tiles.style, 'flat');
  assert.equal(s.prefs.tiles.icons, 'logo');
  assert.deepEqual(s.prefs.widgets.markets.items, ['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS']);
  assert.equal(s.prefs.widgets.clock.face, 'classic');
  assert.equal(s.prefs.widgets.github.user, '');
  assert.equal(s.prefs.tiles.color, '#ffffff');
});

test('Markets coins and USD/ILS switch from older versions become the item list', () => {
  const items = prefs => normalizeState({ prefs: { widgets: { markets: prefs } } }).prefs.widgets.markets;
  assert.deepEqual(items({ coins: 'btc, doge', fx: true }), { enabled: true, items: ['BTC', 'DOGE', 'USD/ILS'] });
  assert.deepEqual(items({ coins: 'ETH', fx: false, enabled: false }), { enabled: false, items: ['ETH'] });
  assert.deepEqual(items({ items: ['eur/ils', 'BTC', 'bad!'], coins: 'SOL' }).items, ['EUR/ILS', 'BTC']);
  assert.deepEqual(items({ items: [] }).items, []);
  assert.deepEqual(items({ items: 'BTC' }).items, DEFAULT_PREFS.widgets.markets.items);
});

test('GitHub shows commits and issues unless the saved choice is a valid one', () => {
  const show = github => normalizeState({ prefs: { widgets: { github } } }).prefs.widgets.github.show;
  assert.equal(show({ user: 'octo' }), 'both');
  assert.equal(show({ show: 'issues' }), 'issues');
  assert.equal(show({ show: 'commits' }), 'commits');
  assert.equal(show({ show: 'everything' }), 'both');
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
