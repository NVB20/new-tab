import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, ROWS, TYPES, GITHUB_PARTS, fits, firstFree, countOf, stackOrder, defaultLayout, normalizeLayout,
  addCopy, duplicateCopy, removeCopy, moveCopy, resetLayout, copyTitle,
} from '../js/layout.js';

const legacy = over => ({
  columns: 5,
  search: { enabled: true, row: 0 },
  widgets: {
    enabled: true,
    position: 'left',
    clock: { enabled: true, hour24: true, name: 'Niv', greeting: true, face: 'serif', colon: true },
    tasks: { enabled: true },
    notes: { enabled: true },
    claude: { enabled: false },
    markets: { enabled: true, items: ['BTC', 'USD/ILS'] },
    github: { enabled: true, user: 'octo', show: 'both' },
  },
  ...over,
});
const byType = layout => Object.fromEntries(layout.widgets.map(c => [c.type, c]));
const rect = c => [c.x, c.y, c.w, c.h];
const state = layout => ({ groups: [{ id: 'g1', title: 'Home' }, { id: 'g2', title: 'Work' }], prefs: { layout } });

test('the default conversion mirrors today\'s page', () => {
  const l = defaultLayout(legacy());
  const t = byType(l);
  assert.deepEqual(rect(t.clock), [0, 0, 3, 4]);
  assert.deepEqual(rect(t.tasks), [0, 4, 3, 4]);
  assert.deepEqual(rect(t.notes), [0, 8, 3, 4]);
  assert.deepEqual(rect(t.tiles), [3, 0, 6, 12]);
  assert.deepEqual(rect(t.markets), [9, 0, 3, 5]);
  assert.deepEqual(rect(t.github), [9, 5, 3, 7]);
  assert.equal(t.claude, undefined);
  assert.deepEqual(t.clock.settings, { hour24: true, name: 'Niv', greeting: true, face: 'serif', colon: true });
  assert.deepEqual(t.tiles.settings, { group: null, columns: 5, bar: 0 });
  assert.deepEqual(t.markets.settings, { items: ['BTC', 'USD/ILS'] });
  assert.deepEqual(t.github.settings, { user: 'octo', parts: GITHUB_PARTS });
  assert.ok(l.widgets.every(c => typeof c.id === 'string' && c.id));
  assert.equal(new Set(l.widgets.map(c => c.id)).size, l.widgets.length);
});

test('clock on the right swaps the columns; a lone far widget takes the column', () => {
  const t = byType(defaultLayout(legacy({ widgets: { ...legacy().widgets, position: 'right', github: { enabled: false } } })));
  assert.deepEqual(rect(t.clock), [9, 0, 3, 4]);
  assert.deepEqual(rect(t.markets), [0, 0, 3, 12]);
  assert.deepEqual(rect(t.tiles), [3, 0, 6, 12]);
});

test('with Claude on the near column shrinks the tallest first; with widgets off only the tiles remain', () => {
  const on = byType(defaultLayout(legacy({ widgets: { ...legacy().widgets, claude: { enabled: true } } })));
  assert.equal(on.clock.h + on.tasks.h + on.notes.h + on.claude.h, 12);
  assert.equal(on.claude.h, 2);
  assert.equal(on.claude.y, 10);
  const off = defaultLayout(legacy({ widgets: { ...legacy().widgets, enabled: false } }));
  assert.deepEqual(off.widgets.map(c => c.type), ['tiles']);
  assert.deepEqual(rect(off.widgets[0]), [0, 0, 12, 12]);
  const oneSide = byType(defaultLayout(legacy({ widgets: { ...legacy().widgets, markets: { enabled: false }, github: { enabled: false } } })));
  assert.deepEqual(rect(oneSide.tiles), [3, 0, 9, 12]);
});

test('the bar and GitHub Show convert', () => {
  const t = s => byType(defaultLayout(legacy(s)));
  assert.equal(t({ search: { enabled: false, row: 0 } }).tiles.settings.bar, null);
  assert.equal(t({ search: { enabled: true, row: 2 } }).tiles.settings.bar, 2);
  assert.equal(t({ search: { enabled: true, row: -1 } }).tiles.settings.bar, -1);
  assert.equal(t({ search: { enabled: true, row: 'x' } }).tiles.settings.bar, 0);
  const parts = show => t({ widgets: { ...legacy().widgets, github: { enabled: true, user: 'o', show } } }).github.settings.parts;
  assert.deepEqual(parts('commits'), ['heatmap', 'pulls', 'commits']);
  assert.deepEqual(parts('issues'), ['heatmap', 'pulls', 'issues']);
  assert.deepEqual(parts('both'), GITHUB_PARTS);
});

test('fits and firstFree respect the canvas and other copies', () => {
  const l = defaultLayout(legacy());
  assert.equal(fits(l, { x: 3, y: 0, w: 6, h: 12 }), false);
  assert.equal(fits(l, { x: 3, y: 0, w: 6, h: 12 }, byType(l).tiles.id), true);
  assert.equal(fits(l, { x: 10, y: 0, w: 3, h: 1 }), false);
  assert.equal(fits(l, { x: -1, y: 0, w: 3, h: 1 }), false);
  assert.equal(firstFree(l, 3, 1), null);
  removeCopy(l, byType(l).notes.id);
  assert.deepEqual(firstFree(l, 3, 1), { x: 0, y: 8, w: 3, h: 1 });
  assert.deepEqual(firstFree(l, 2, 2), { x: 0, y: 8, w: 2, h: 2 });
  assert.equal(firstFree(l, 4, 4), null);
});

test('stackOrder reads top to bottom, then left to right', () => {
  const ids = stackOrder([{ id: 'b', x: 9, y: 0 }, { id: 'c', x: 0, y: 4 }, { id: 'a', x: 0, y: 0 }]);
  assert.deepEqual(ids, ['a', 'b', 'c']);
});

test('normalizeLayout drops junk, clamps, resolves overlaps and enforces limits', () => {
  const raw = { widgets: [
    { id: 'a', type: 'clock', x: -2, y: 0, w: 1, h: 1, settings: { face: 'nope', name: 7 } },
    { id: 'b', type: 'clock', x: 6, y: 6, w: 3, h: 3 },
    { id: 'c', type: 'markets', x: 0, y: 0, w: 3, h: 3, settings: { items: ['eth', 'bad!'] } },
    { id: 'd', type: 'tiles', x: 20, y: 20, w: 3, h: 3, settings: { group: 'g9', columns: 99, bar: 'x' } },
    { type: 'github', x: 9, y: 0, w: 3, h: 3, settings: { parts: ['commits', 'heatmap', 'junk'] } },
    { id: 'e', type: 'weather', x: 0, y: 0, w: 2, h: 2 },
    'junk',
  ] };
  const l = normalizeLayout(raw, state(raw));
  const t = byType(l);
  assert.deepEqual(l.widgets.map(c => c.type), ['clock', 'markets', 'tiles', 'github']);
  assert.deepEqual(rect(t.clock), [0, 0, 2, 2]);
  assert.deepEqual(t.clock.settings, { hour24: true, name: '', greeting: true, face: 'classic', colon: true });
  assert.deepEqual(rect(t.markets), [2, 0, 3, 3]);   // moved off the clock to the first free spot
  assert.deepEqual(t.markets.settings.items, ['ETH']);
  assert.deepEqual(rect(t.tiles), [9, 9, 3, 3]);
  assert.deepEqual(t.tiles.settings, { group: null, columns: 10, bar: null });
  assert.deepEqual(t.github.settings, { user: '', parts: ['heatmap', 'commits'] });
  assert.ok(t.github.id);
  assert.equal(l.cols, COLS);
  assert.equal(l.rows, ROWS);
});

test('normalizeLayout keeps a pinned group that exists and makes duplicate ids unique', () => {
  const raw = { widgets: [
    { id: 'same', type: 'tiles', x: 0, y: 0, w: 3, h: 3, settings: { group: 'g2', columns: 4, bar: -1 } },
    { id: 'same', type: 'notes', x: 3, y: 0, w: 3, h: 3 },
  ] };
  const l = normalizeLayout(raw, state(raw));
  assert.deepEqual(l.widgets[0].settings, { group: 'g2', columns: 4, bar: -1 });
  assert.equal(l.widgets[0].id, 'same');
  assert.notEqual(l.widgets[1].id, 'same');
});

test('addCopy takes the default size, else the minimum, else refuses; duplicates copy settings', () => {
  const l = defaultLayout(legacy());
  assert.equal(addCopy(l, 'clock'), null);                     // limit 1
  assert.equal(addCopy(l, 'search'), null);                    // no room
  assert.equal(addCopy(l, 'weather'), null);
  removeCopy(l, byType(l).notes.id);
  const bar = addCopy(l, 'search');
  assert.deepEqual(rect(bar), [0, 8, 3, 1]);                   // minimum size fits
  assert.deepEqual(bar.settings, {});
  const original = byType(l).markets.id;
  const m = duplicateCopy(l, original);
  assert.deepEqual(rect(m), [0, 9, 2, 3]);
  assert.deepEqual(m.settings, { items: ['BTC', 'USD/ILS'] });
  assert.notEqual(m.id, original);
  assert.equal(countOf(l, 'markets'), 2);
  assert.equal(duplicateCopy(l, 'nope'), null);
});

test('a new tiles copy is pinned to the first group no block shows; a block following the tabs shows the active one', () => {
  const l = { cols: COLS, rows: ROWS, widgets: [{ id: 't', type: 'tiles', x: 0, y: 0, w: 3, h: 3, settings: { group: null, columns: 4, bar: 0 } }] };
  const groups = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }];
  const a = addCopy(l, 'tiles', undefined, groups, 'g1');
  assert.equal(a.settings.group, 'g2');
  assert.deepEqual(rect(a), [3, 0, 6, 6]);
  assert.equal(a.settings.columns, 5);   // columns suit the width: 6 wide → 5
  const b = duplicateCopy(l, 't', groups, 'g1');
  assert.equal(b.settings.group, 'g3');
  assert.equal(b.settings.bar, null);    // a duplicate block starts without a bar
  const c = addCopy(l, 'tiles', undefined, groups, 'g1');
  assert.equal(c.settings.group, null);
  // A narrow spot gets fewer columns.
  const n = { cols: COLS, rows: ROWS, widgets: [{ id: 'big', type: 'tiles', x: 0, y: 0, w: 9, h: 12, settings: { group: null, columns: 5, bar: null } }] };
  const d = addCopy(n, 'tiles', undefined, groups, 'g1');
  assert.deepEqual(rect(d), [9, 0, 3, 3]);
  assert.equal(d.settings.columns, 3);
});

test('moveCopy refuses overlaps, the edge and sizes under the minimum', () => {
  const l = defaultLayout(legacy());
  const id = byType(l).clock.id;
  assert.equal(moveCopy(l, id, { x: 3, y: 0, w: 3, h: 4 }), false);
  assert.equal(moveCopy(l, id, { x: 0, y: 0, w: 1, h: 4 }), false);
  assert.equal(moveCopy(l, id, { x: 0, y: 9, w: 3, h: 4 }), false);
  assert.equal(moveCopy(l, 'nope', { x: 0, y: 0, w: 3, h: 3 }), false);
  assert.equal(moveCopy(l, id, { x: 0, y: 0, w: 3, h: 3 }), true);
  assert.deepEqual(rect(byType(l).clock), [0, 0, 3, 3]);
  assert.equal(moveCopy(l, id, { x: 0, y: 1, w: 3, h: 3 }), true);
});

test('resetLayout keeps the first copy of each type and reports the rest', () => {
  const l = defaultLayout(legacy());
  removeCopy(l, byType(l).notes.id);
  moveCopy(l, byType(l).clock.id, { x: 0, y: 0, w: 2, h: 2 });
  const extra = addCopy(l, 'markets', { items: ['SOL'] });
  const removed = resetLayout(l);
  assert.deepEqual(removed.map(c => c.id), [extra.id]);
  const t = byType(l);
  assert.deepEqual(rect(t.clock), [0, 0, 3, 4]);
  assert.deepEqual(rect(t.tasks), [0, 4, 3, 4]);
  assert.deepEqual(rect(t.tiles), [3, 0, 6, 12]);
  assert.equal(t.clock.settings.face, 'serif');
  assert.equal(t.notes, undefined);
  assert.equal(l.widgets.length, 5);
});

test('resetLayout keeps the clock column on the side it was', () => {
  const l = defaultLayout(legacy({ widgets: { ...legacy().widgets, position: 'right' } }));
  resetLayout(l);
  assert.equal(byType(l).clock.x, 9);
  assert.equal(byType(l).markets.x, 0);
});

test('copyTitle names a copy for labels and Preferences', () => {
  const groups = [{ id: 'g1', title: 'Work' }];
  assert.equal(copyTitle({ type: 'tiles', settings: { group: 'g1' } }, groups), 'Tiles · Work');
  assert.equal(copyTitle({ type: 'tiles', settings: { group: null } }, groups), 'Tiles · follows the tabs');
  assert.equal(copyTitle({ type: 'github', settings: { parts: ['heatmap', 'commits'] } }, groups), 'GitHub · Map + Commits');
  assert.equal(copyTitle({ type: 'github', settings: { parts: [] } }, groups), 'GitHub · nothing chosen');
  assert.equal(copyTitle({ type: 'clock', settings: {} }, groups), 'Clock');
  assert.equal(TYPES.clock.max, 1);
  assert.equal(TYPES.tiles.max, 5);
});
