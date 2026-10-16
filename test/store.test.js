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
  assert.equal(s.prefs.tiles.color, '#ffffff');
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
