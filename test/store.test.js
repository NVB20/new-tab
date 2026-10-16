import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, deepMerge, normalizeState, createStore } from '../js/store.js';

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
  assert.equal(s.prefs.widgets.clock.colon, true);
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

test('the old switch that hid every widget becomes each widget switched off', () => {
  const w = normalizeState({ prefs: { widgets: { enabled: false, tasks: { enabled: true }, markets: { enabled: true } } } }).prefs.widgets;
  assert.equal(w.enabled, true);
  for (const name of ['clock', 'tasks', 'notes', 'markets', 'github']) assert.equal(w[name].enabled, false, name);
});

test('each widget keeps its own switch when the old master switch was on', () => {
  const w = normalizeState({ prefs: { widgets: { enabled: true, notes: { enabled: false } } } }).prefs.widgets;
  assert.equal(w.notes.enabled, false);
  assert.equal(w.clock.enabled, true);
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
    { id: 't', text: 'a', done: true, createdAt: 5, doneAt: 9 },
    { id: 'u', text: 'old task', done: false, createdAt: null, doneAt: null },
  ]);
  assert.deepEqual(s.taskHistory, [{ id: 'h', text: 'x', createdAt: 1, doneAt: 2, clearedAt: 3 }]);
  assert.deepEqual(s.taskStats, { '2026-10-16': 4 });
  assert.deepEqual(normalizeState(null).taskStats, {});
  assert.deepEqual(normalizeState(null).taskHistory, []);
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

test('store falls back to defaults when saved state is corrupt', async () => {
  const store = createStore(memoryAdapter({ state: 'not an object' }));
  await store.load();
  assert.equal(store.get().groups.length, 1);
});
