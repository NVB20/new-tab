import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, ROWS, TYPES, GITHUB_PARTS, fits, firstFree, countOf, stackOrder, defaultLayout, normalizeLayout,
  addCopy, plannedCopy, duplicateCopy, removeCopy, moveCopy, resetLayout, copyTitle, prefsSection,
  placeDefaults, atDefaultPlaces, swapPlan, swapCopy,
  cleanGithubParts, moveGithubPart, showGithubPart,
  copyById, allLayouts, ownLayout, activeLayout, giveOwnLayout, dropOwnLayout, normalizeLayouts,
  isStack, copiesOf, minOf, stackOf, stackProblem, stackCopy, unstackCopy, setFront,
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
  assert.deepEqual(rect(t.search), [3, 0, 6, 1]);
  assert.deepEqual(rect(t.tiles), [3, 1, 6, 11]);
  assert.deepEqual(rect(t.markets), [9, 0, 3, 5]);
  assert.deepEqual(rect(t.github), [9, 5, 3, 7]);
  assert.equal(t.claude, undefined);
  assert.deepEqual(t.clock.settings, { hour24: true, name: 'Niv', greeting: true, face: 'serif', colon: true });
  assert.deepEqual(t.tiles.settings, { group: null, columns: 5 });
  assert.deepEqual(t.search.settings, {});
  assert.deepEqual(t.tasks.settings, { view: 'all' });
  assert.deepEqual(t.markets.settings, { items: ['BTC', 'USD/ILS'] });
  assert.deepEqual(t.github.settings, { order: GITHUB_PARTS, parts: ['heatmap', 'pulls', 'issues', 'commits'] });
  assert.ok(l.widgets.every(c => typeof c.id === 'string' && c.id));
  assert.equal(new Set(l.widgets.map(c => c.id)).size, l.widgets.length);
});

test('clock on the right swaps the columns; a lone far widget takes the column', () => {
  const t = byType(defaultLayout(legacy({ widgets: { ...legacy().widgets, position: 'right', github: { enabled: false } } })));
  assert.deepEqual(rect(t.clock), [9, 0, 3, 4]);
  assert.deepEqual(rect(t.markets), [0, 0, 3, 12]);
  assert.deepEqual(rect(t.tiles), [3, 1, 6, 11]);
});

test('with Claude on the near column shrinks the tallest first; with widgets off only the tiles remain', () => {
  const on = byType(defaultLayout(legacy({ widgets: { ...legacy().widgets, claude: { enabled: true } } })));
  assert.equal(on.clock.h + on.tasks.h + on.notes.h + on.claude.h, 12);
  assert.equal(on.claude.h, 2);
  assert.equal(on.claude.y, 10);
  const off = defaultLayout(legacy({ widgets: { ...legacy().widgets, enabled: false } }));
  assert.deepEqual(off.widgets.map(c => c.type), ['search', 'tiles']);
  assert.deepEqual(rect(off.widgets[0]), [0, 0, 12, 1]);
  assert.deepEqual(rect(off.widgets[1]), [0, 1, 12, 11]);
  const oneSide = byType(defaultLayout(legacy({ widgets: { ...legacy().widgets, markets: { enabled: false }, github: { enabled: false } } })));
  assert.deepEqual(rect(oneSide.tiles), [3, 1, 9, 11]);
  assert.deepEqual(rect(oneSide.search), [3, 0, 9, 1]);
});

test('the bar and GitHub Show convert', () => {
  const t = s => byType(defaultLayout(legacy(s)));
  const off = t({ search: { enabled: false, row: 0 } });
  assert.equal(off.search, undefined);
  assert.deepEqual(rect(off.tiles), [3, 0, 6, 12]);
  assert.deepEqual(rect(t({ search: { enabled: true, row: 2 } }).search), [3, 0, 6, 1]);   // a bar between the rows goes to the top
  const bottom = t({ search: { enabled: true, row: -1 } });
  assert.deepEqual(rect(bottom.search), [3, 11, 6, 1]);
  assert.deepEqual(rect(bottom.tiles), [3, 0, 6, 11]);
  const parts = show => t({ widgets: { ...legacy().widgets, github: { enabled: true, user: 'o', show } } }).github.settings.parts;
  assert.deepEqual(parts('commits'), ['heatmap', 'pulls', 'commits']);
  assert.deepEqual(parts('issues'), ['heatmap', 'pulls', 'issues']);
  assert.deepEqual(parts('both'), ['heatmap', 'pulls', 'issues', 'commits']);
});

test('fits and firstFree respect the canvas and other copies', () => {
  const l = defaultLayout(legacy());
  assert.equal(fits(l, { x: 3, y: 1, w: 6, h: 11 }), false);
  assert.equal(fits(l, { x: 3, y: 1, w: 6, h: 11 }, byType(l).tiles.id), true);
  assert.equal(fits(l, { x: 3, y: 0, w: 6, h: 12 }, byType(l).tiles.id), false);   // the bar's row
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
    { id: 'e', type: 'horoscope', x: 0, y: 0, w: 2, h: 2 },
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
  assert.deepEqual(t.tiles.settings, { group: null, columns: 10 });
  assert.deepEqual(t.github.settings, { order: GITHUB_PARTS, parts: ['heatmap', 'commits'] });
  assert.ok(t.github.id);
  assert.equal(l.cols, COLS);
  assert.equal(l.rows, ROWS);
});

test('normalizeLayout keeps a pinned group that exists and makes duplicate ids unique', () => {
  const raw = { widgets: [
    { id: 'same', type: 'tiles', x: 0, y: 0, w: 3, h: 3, settings: { group: 'g2', columns: 4 } },
    { id: 'same', type: 'notes', x: 3, y: 0, w: 3, h: 3 },
  ] };
  const l = normalizeLayout(raw, state(raw));
  assert.deepEqual(l.widgets[0].settings, { group: 'g2', columns: 4 });
  assert.equal(l.widgets[0].id, 'same');
  assert.notEqual(l.widgets[1].id, 'same');
});

test('a bar still docked in a block (an earlier layout) becomes the page\'s bar, one row off the block', () => {
  const top = normalizeLayout({ widgets: [{ id: 't', type: 'tiles', x: 3, y: 0, w: 6, h: 12, settings: { group: null, columns: 5, bar: 2 } }] }, state());
  assert.deepEqual(top.widgets.map(c => [c.type, ...rect(c)]), [['tiles', 3, 1, 6, 11], ['search', 3, 0, 6, 1]]);
  assert.deepEqual(top.widgets[0].settings, { group: null, columns: 5 });
  const bottom = normalizeLayout({ widgets: [{ id: 't', type: 'tiles', x: 0, y: 0, w: 6, h: 6, settings: { bar: -1 } }] }, state());
  assert.deepEqual(bottom.widgets.map(c => [c.type, ...rect(c)]), [['tiles', 0, 0, 6, 5], ['search', 0, 5, 6, 1]]);
  // A block at its minimum height keeps its rows; a page that already has a bar gets no second one.
  const tiny = normalizeLayout({ widgets: [{ id: 't', type: 'tiles', x: 0, y: 0, w: 3, h: 3, settings: { bar: 0 } }] }, state());
  assert.deepEqual(tiny.widgets.map(c => c.type), ['tiles']);
  const has = normalizeLayout({ widgets: [
    { id: 's', type: 'search', x: 0, y: 11, w: 6, h: 1 },
    { id: 't', type: 'tiles', x: 0, y: 0, w: 6, h: 11, settings: { bar: 0 } },
  ] }, state());
  assert.deepEqual(has.widgets.map(c => c.type), ['search', 'tiles']);
  assert.deepEqual(rect(has.widgets[1]), [0, 0, 6, 11]);
});

test('addCopy takes the default size, else the minimum; duplicates copy settings', () => {
  const l = defaultLayout(legacy());
  assert.equal(addCopy(l, 'clock'), null);                     // limit 1
  assert.equal(addCopy(l, 'search'), null);                    // limit 1 too
  assert.equal(addCopy(l, 'horoscope'), null);                 // no such type
  removeCopy(l, byType(l).search.id);
  const bar = addCopy(l, 'search');
  assert.deepEqual(rect(bar), [3, 0, 6, 1]);                   // the default size fits where the bar was
  assert.deepEqual(bar.settings, {});
  removeCopy(l, byType(l).notes.id);
  const original = byType(l).markets.id;
  const m = duplicateCopy(l, original);
  assert.deepEqual(rect(m), [0, 8, 2, 3]);                     // where Notes was, at the minimum size
  assert.deepEqual(m.settings, { items: ['BTC', 'USD/ILS'] });
  assert.notEqual(m.id, original);
  assert.equal(countOf(l, 'markets'), 2);
  assert.equal(duplicateCopy(l, 'nope'), null);
});

test('a page holds up to 2 Websites, 3 GitHub, 3 Markets and 1 Claude; a saved page keeps that many', () => {
  for (const [type, max] of [['website', 2], ['github', 3], ['markets', 3], ['claude', 1]]) {
    assert.equal(TYPES[type].max, max, type);
    const l = { cols: COLS, rows: ROWS, widgets: [] };
    for (let i = 0; i < max; i++) assert.ok(addCopy(l, type), type);
    assert.equal(addCopy(l, type), null, type);
    const saved = { widgets: Array.from({ length: 5 }, (_, i) => ({ type, x: 0, y: 0, settings: {}, id: `${type}${i}` })) };
    assert.equal(countOf(normalizeLayout(saved), type), max, type);
  }
});

test('a new tiles copy is pinned to the first group no block shows; a block following the tabs shows the active one', () => {
  const l = { cols: COLS, rows: ROWS, widgets: [{ id: 't', type: 'tiles', x: 0, y: 0, w: 3, h: 3, settings: { group: null, columns: 4 } }] };
  const groups = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }];
  const a = addCopy(l, 'tiles', undefined, groups, 'g1');
  assert.equal(a.settings.group, 'g2');
  assert.deepEqual(rect(a), [3, 0, 6, 6]);
  assert.equal(a.settings.columns, 5);   // columns suit the width: 6 wide → 5
  const b = duplicateCopy(l, 't', groups, 'g1');
  assert.equal(b.settings.group, 'g3');
  const c = addCopy(l, 'tiles', undefined, groups, 'g1');
  assert.equal(c.settings.group, null);
  // A narrow spot gets fewer columns.
  const n = { cols: COLS, rows: ROWS, widgets: [{ id: 'big', type: 'tiles', x: 0, y: 0, w: 9, h: 12, settings: { group: null, columns: 5 } }] };
  const d = addCopy(n, 'tiles', undefined, groups, 'g1');
  assert.deepEqual(rect(d), [9, 0, 3, 3]);
  assert.equal(d.settings.columns, 3);
});

test('plannedCopy is what a tray click would add, without adding it', () => {
  const l = defaultLayout(legacy());
  assert.equal(plannedCopy(l, 'clock'), null);                 // limit 1
  assert.equal(plannedCopy(l, 'horoscope'), null);             // no such type
  removeCopy(l, byType(l).search.id);
  assert.deepEqual(plannedCopy(l, 'search'), { type: 'search', x: 3, y: 0, w: 6, h: 1, settings: {} });
  removeCopy(l, byType(l).notes.id);
  const m = plannedCopy(l, 'markets');
  assert.deepEqual(rect(m), [0, 8, 2, 3]);                     // where Notes was, at the minimum size
  assert.deepEqual(m.settings, { items: ['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS'] });
  assert.equal('id' in m, false);
  assert.equal(l.widgets.length, 5);                           // nothing was added
  const { id, ...added } = addCopy(l, 'markets');
  assert.equal(typeof id, 'string');
  assert.deepEqual(added, m);                                  // the click adds exactly the plan
});

test('on a full page the biggest widget gives up its bottom rows, else its right-hand columns', () => {
  const l = defaultLayout(legacy());
  const tiles = byType(l).tiles;
  assert.deepEqual(rect(tiles), [3, 1, 6, 11]);
  assert.equal(firstFree(l, 2, 2), null);                      // every cell is taken
  const plan = plannedCopy(l, 'weather');
  assert.deepEqual(rect(plan), [3, 8, 3, 4]);                  // the default size, under the tiles
  assert.deepEqual(plan.shrink, { id: tiles.id, w: 6, h: 7 });
  assert.deepEqual(rect(tiles), [3, 1, 6, 11]);                // a plan changes nothing
  const weather = addCopy(l, 'weather');
  assert.deepEqual(rect(weather), [3, 8, 3, 4]);
  assert.equal('shrink' in weather, false);
  assert.deepEqual(rect(tiles), [3, 1, 6, 7]);
  // The cells beside it are free now: the next one fits there without shrinking anything.
  const sports = plannedCopy(l, 'sports');
  assert.deepEqual([rect(sports), sports.shrink], [[6, 8, 2, 3], undefined]);   // at its minimum
  // A widget too short to give rows up gives columns.
  const tall = { cols: COLS, rows: ROWS, widgets: [
    { id: 'a', type: 'tiles', x: 0, y: 0, w: 9, h: 3, settings: {} },
    { id: 'b', type: 'markets', x: 9, y: 0, w: 3, h: 3, settings: {} },
    { id: 'c', type: 'tiles', x: 0, y: 3, w: 12, h: 9, settings: {} },
  ] };
  assert.deepEqual(rect(plannedCopy(tall, 'weather')), [0, 8, 3, 4]);   // c: 12 × 9, the biggest, gets shorter
  const thin = { cols: COLS, rows: ROWS, widgets: [{ id: 'a', type: 'tiles', x: 0, y: 0, w: 12, h: 12, settings: {} }] };
  thin.widgets[0].h = 3;
  thin.widgets.push({ id: 'b', type: 'tiles', x: 0, y: 3, w: 12, h: 3, settings: {} }, { id: 'c', type: 'tiles', x: 0, y: 6, w: 12, h: 3, settings: {} },
    { id: 'd', type: 'tiles', x: 0, y: 9, w: 12, h: 3, settings: {} });
  const side = plannedCopy(thin, 'weather');
  assert.deepEqual([rect(side), side.shrink], [[9, 0, 3, 3], { id: 'a', w: 9, h: 3 }]);
});

test('nothing goes under its minimum to make room: with every widget at its smallest, the chip refuses', () => {
  const l = { cols: COLS, rows: ROWS, widgets: [] };
  for (let y = 0; y < ROWS; y += 3) for (let x = 0; x < COLS; x += 3) l.widgets.push({ id: `t${x}-${y}`, type: 'tiles', x, y, w: 3, h: 3, settings: {} });
  assert.equal(plannedCopy(l, 'weather'), null);
  assert.equal(addCopy(l, 'weather'), null);
  assert.ok(l.widgets.every(c => c.w === 3 && c.h === 3));
});

test('plannedCopy pins a new tiles block and gives it columns for its width, as addCopy does', () => {
  const l = { cols: COLS, rows: ROWS, widgets: [{ id: 't', type: 'tiles', x: 0, y: 0, w: 3, h: 3, settings: { group: null, columns: 4 } }] };
  const groups = [{ id: 'g1' }, { id: 'g2' }];
  assert.deepEqual(plannedCopy(l, 'tiles', groups, 'g1'), { type: 'tiles', x: 3, y: 0, w: 6, h: 6, settings: { group: 'g2', columns: 5 } });
  assert.equal(plannedCopy(l, 'tiles').settings.group, null);  // no groups given: it follows the tabs
  const n = { cols: COLS, rows: ROWS, widgets: [{ id: 'big', type: 'tiles', x: 0, y: 0, w: 9, h: 12, settings: { group: null, columns: 5 } }] };
  assert.deepEqual(plannedCopy(n, 'tiles', groups, 'g1'), { type: 'tiles', x: 9, y: 0, w: 3, h: 3, settings: { group: 'g2', columns: 3 } });
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
  assert.deepEqual(rect(t.search), [3, 0, 6, 1]);
  assert.deepEqual(rect(t.tiles), [3, 1, 6, 11]);
  assert.equal(t.clock.settings.face, 'serif');
  assert.equal(t.notes, undefined);
  assert.equal(l.widgets.length, 6);
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
  assert.equal(copyTitle({ type: 'github', settings: { parts: ['stats', 'heatmap', 'repos'] } }, groups), 'GitHub · Stats + Map + Repos');
  assert.equal(copyTitle({ type: 'github', settings: { parts: ['commits', 'heatmap', 'pulls', 'reviews', 'issues'] } }, groups), 'GitHub · Commits + Map + 3 more');
  assert.equal(copyTitle({ type: 'clock', settings: {} }, groups), 'Clock');
  assert.equal(copyTitle({ type: 'website', settings: { url: 'https://www.pinterest.com/ideas/' } }, groups), 'Website · pinterest.com');
  assert.equal(copyTitle({ type: 'website', settings: { url: '' } }, groups), 'Website · no address');
  assert.equal(copyTitle({ type: 'website', settings: { url: 'javascript:alert(1)' } }, groups), 'Website · no address');
  assert.equal(TYPES.clock.max, 1);
  assert.equal(TYPES.tiles.max, 5);
});

test('a Website copy keeps its address and a zoom from 50 to 100 percent', () => {
  const clean = s => normalizeLayout({ widgets: [{ type: 'website', x: 0, y: 0, settings: s }] }).widgets[0].settings;
  assert.deepEqual(clean(undefined), { url: '', zoom: 100 });
  assert.deepEqual(clean({ url: 'pinterest.com', zoom: 65 }), { url: 'pinterest.com', zoom: 65 });
  assert.equal(clean({ zoom: 10 }).zoom, 50);
  assert.equal(clean({ zoom: 400 }).zoom, 100);
  assert.equal(clean({ zoom: '80' }).zoom, 100);
  assert.equal(clean({ url: 42 }).url, '');
  assert.equal(clean({ url: 'x'.repeat(3000) }).url.length, 2000);
  assert.equal(TYPES.website.max, 2);
});

test('prefsSection says where Preferences keeps a type’s settings', () => {
  for (const type of ['clock', 'markets', 'tiles', 'website']) assert.equal(prefsSection(type), 'layout', type);
  assert.equal(prefsSection('search'), 'search');
  assert.equal(prefsSection('github'), 'github');
  for (const type of ['tasks', 'notes', 'claude']) assert.equal(prefsSection(type), null, type);
  assert.equal(prefsSection('weather'), 'layout');   // an unknown type falls back to its own group
});

test('Tasks: a view, cleaned to a valid one; the old Finished fold setting is dropped', () => {
  assert.deepEqual(TYPES.tasks.defaults(), { view: 'all' });
  assert.deepEqual(TYPES.tasks.clean({}), { view: 'all' });
  assert.deepEqual(TYPES.tasks.clean({ view: 'upcoming', showDone: true }), { view: 'upcoming' });
  assert.deepEqual(TYPES.tasks.clean({ view: 'someday' }), { view: 'all' });
});

test('Sports: its own settings, never added to an old page, kept by Reset layout under Markets and GitHub', () => {
  assert.deepEqual(TYPES.sports.defaults(), { follow: ['soccer:20232', 'soccer:202', 'f1'], f1Sessions: ['sprint', 'qualifying', 'race'], edited: false });
  assert.deepEqual(TYPES.sports.clean({ follow: ['nba:13', 'junk'] }).follow, ['nba:13']);
  assert.equal(TYPES.sports.max, 5);
  assert.equal(prefsSection('sports'), 'layout');
  const l = defaultLayout(legacy());
  assert.equal(byType(l).sports, undefined);
  removeCopy(l, byType(l).notes.id);
  const sports = addCopy(l, 'sports');
  assert.deepEqual(rect(sports), [0, 8, 2, 3]);   // only its minimum fits where Notes was
  resetLayout(l);
  const t = byType(l);
  assert.deepEqual(rect(t.markets), [9, 0, 3, 4]);
  assert.deepEqual(rect(t.github), [9, 4, 3, 4]);
  assert.deepEqual(rect(t.sports), [9, 8, 3, 4]);
  assert.equal(t.sports.id, sports.id);
});

test('a GitHub copy keeps every part in its own order, and which of them it shows', () => {
  const all = ['stats', 'heatmap', 'pulls', 'reviews', 'issues', 'repos', 'commits'];
  assert.deepEqual(GITHUB_PARTS, all);
  // A new copy: the default order, the four parts the widget always had.
  assert.deepEqual(TYPES.github.defaults(), { order: all, parts: ['heatmap', 'pulls', 'issues', 'commits'] });
  // Saved before there was an order: the shown parts stay, in the default order.
  assert.deepEqual(cleanGithubParts({ parts: ['commits', 'heatmap'] }), { order: all, parts: ['heatmap', 'commits'] });
  // A saved order is kept; shown parts follow it; unknown and repeated parts go.
  const order = ['commits', 'repos', 'heatmap', 'stats', 'pulls', 'reviews', 'issues'];
  assert.deepEqual(cleanGithubParts({ order: [...order, 'junk', 'commits'], parts: ['heatmap', 'commits', 'junk', 'heatmap'] }),
    { order, parts: ['commits', 'heatmap'] });
  assert.deepEqual(cleanGithubParts({ order, parts: [] }), { order, parts: [] });
  assert.deepEqual(cleanGithubParts({ order, parts: 'heatmap' }).parts, ['commits', 'heatmap', 'pulls', 'issues']);
  // Parts missing from a saved order go in after their nearest predecessor in the default order.
  assert.deepEqual(cleanGithubParts({ order: ['commits', 'heatmap', 'issues', 'pulls'] }).order,
    ['stats', 'commits', 'heatmap', 'issues', 'repos', 'pulls', 'reviews']);
});

test('moveGithubPart moves a part one place, shown or not, and stops at the ends', () => {
  const s = cleanGithubParts({});
  const up = moveGithubPart(s, 'commits', -1);
  assert.deepEqual(up.order, ['stats', 'heatmap', 'pulls', 'reviews', 'issues', 'commits', 'repos']);
  assert.deepEqual(up.parts, ['heatmap', 'pulls', 'issues', 'commits']);
  const down = moveGithubPart(s, 'heatmap', 1);
  assert.deepEqual(down.parts, ['pulls', 'heatmap', 'issues', 'commits']);
  assert.deepEqual(moveGithubPart(s, 'stats', -1), s);
  assert.deepEqual(moveGithubPart(s, 'commits', 1), s);
  assert.deepEqual(moveGithubPart(s, 'junk', 1), s);
  assert.deepEqual(s, cleanGithubParts({}));   // the settings passed in are left as they were
});

test('showGithubPart switches a part on in its place, or off', () => {
  const s = cleanGithubParts({});
  assert.deepEqual(showGithubPart(s, 'repos', true).parts, ['heatmap', 'pulls', 'issues', 'repos', 'commits']);
  assert.deepEqual(showGithubPart(s, 'stats', true).parts, ['stats', 'heatmap', 'pulls', 'issues', 'commits']);
  assert.deepEqual(showGithubPart(s, 'heatmap', false).parts, ['pulls', 'issues', 'commits']);
  assert.deepEqual(showGithubPart(s, 'heatmap', true), s);
  assert.deepEqual(showGithubPart(s, 'junk', true), s);
  assert.deepEqual(showGithubPart(s, 'repos', false).order, s.order);
});

test('Website has a default place in the far column', () => {
  const l = { cols: COLS, rows: ROWS, widgets: [] };
  l.widgets = placeDefaults(l, ['clock', 'markets', 'website', 'search', 'tiles']);
  assert.deepEqual(rect(byType(l).website), [9, 5, 3, 6]);
});

test('Marvel: one copy, its own settings, never on an old page, last in the clock column', () => {
  assert.equal(TYPES.marvel.max, 1);
  assert.equal(prefsSection('marvel'), 'layout');
  assert.deepEqual(TYPES.marvel.defaults(), { show: 'all', hideWatched: false });
  assert.deepEqual(TYPES.marvel.clean({ show: 'films', hideWatched: true }), { show: 'films', hideWatched: true });
  assert.deepEqual(TYPES.marvel.clean({ show: 'junk', hideWatched: 'yes' }), { show: 'all', hideWatched: false });
  assert.equal(byType(defaultLayout(legacy())).marvel, undefined);
  const l = { cols: COLS, rows: ROWS, widgets: [] };
  l.widgets = placeDefaults(l, ['clock', 'marvel', 'tiles']);
  assert.deepEqual(rect(byType(l).marvel), [0, 4, 3, 6]);
  // With the whole clock column it shrinks to its minimum, and the column still fits.
  l.widgets = placeDefaults(l, ['clock', 'tasks', 'notes', 'claude', 'marvel', 'tiles']);
  const t = byType(l);
  assert.deepEqual(rect(t.marvel), [0, 9, 3, 3]);
  assert.ok(l.widgets.every(c => c.y + c.h <= ROWS));
  assert.ok(atDefaultPlaces(l));
});

test('Weather: up to three copies, a city each, never on an old page, under the clock', () => {
  assert.equal(TYPES.weather.max, 3);
  assert.equal(prefsSection('weather'), 'layout');
  assert.deepEqual(TYPES.weather.defaults(), { place: null, unit: 'c' });
  assert.equal(byType(defaultLayout(legacy())).weather, undefined);
  assert.equal(copyTitle({ type: 'weather', settings: { place: null } }), 'Weather · no place');
  assert.equal(copyTitle({ type: 'weather', settings: { place: { name: 'Oslo' } } }), 'Weather · Oslo');
  const l = { cols: COLS, rows: ROWS, widgets: [] };
  l.widgets = placeDefaults(l, ['clock', 'weather', 'tasks', 'tiles']);
  const t = byType(l);
  assert.deepEqual(rect(t.weather), [0, 4, 3, 4]);
  assert.deepEqual(rect(t.tasks), [0, 8, 3, 4]);
  assert.ok(atDefaultPlaces(l));
});

test('Weather goes in the far column when the clock column is full, and is left out when both are', () => {
  const near = ['clock', 'tasks', 'notes', 'claude', 'marvel'];
  const far = ['markets', 'github', 'sports', 'website'];
  const l = { cols: COLS, rows: ROWS, widgets: [] };
  l.widgets = placeDefaults(l, [...near, 'weather', 'markets', 'tiles']);
  let t = byType(l);
  assert.equal(t.weather.x, 9);
  assert.deepEqual(rect(t.marvel), [0, 9, 3, 3]);   // the clock column as it was
  assert.ok(l.widgets.every(c => c.y + c.h <= ROWS));
  assert.ok(atDefaultPlaces(l));
  l.widgets = placeDefaults(l, [...near, ...far, 'weather', 'tiles']);
  t = byType(l);
  assert.equal(t.weather, undefined);
  assert.deepEqual(Object.keys(t).sort(), [...near, ...far, 'tiles'].sort());
  assert.ok(l.widgets.every(c => c.y + c.h <= ROWS));
});

test('Economic calendar: up to three copies, markets and levels each, never on an old page, under Markets', () => {
  assert.equal(TYPES.econ.max, 3);
  assert.equal(prefsSection('econ'), 'layout');
  assert.deepEqual(TYPES.econ.defaults(), { levels: ['high', 'medium'], markets: ['US', 'EU', 'IL'] });
  assert.deepEqual(TYPES.econ.clean({ levels: ['low'], markets: [] }), { levels: ['low'], markets: ['US', 'EU', 'IL'] });
  assert.equal(byType(defaultLayout(legacy())).econ, undefined);
  assert.equal(copyTitle({ type: 'econ', settings: { levels: ['high'], markets: ['US', 'IL'] } }), 'Economic calendar · US, IL');
  const l = { cols: COLS, rows: ROWS, widgets: [] };
  l.widgets = placeDefaults(l, ['clock', 'markets', 'econ', 'github', 'tiles']);
  const t = byType(l);
  assert.equal(t.econ.x, 9);
  assert.equal(t.econ.y, t.markets.y + t.markets.h);
  assert.ok(t.github.y > t.econ.y);
  assert.ok(l.widgets.every(c => c.y + c.h <= ROWS));
  assert.ok(atDefaultPlaces(l));
});

test('The Economic calendar goes in the clock column when the far one is full, and is left out when both are', () => {
  const near = ['clock', 'tasks', 'notes', 'claude', 'marvel'];
  const far = ['markets', 'github', 'sports', 'website'];
  const l = { cols: COLS, rows: ROWS, widgets: [] };
  l.widgets = placeDefaults(l, ['clock', ...far, 'econ', 'tiles']);
  let t = byType(l);
  assert.equal(t.econ.x, 0);
  assert.ok(l.widgets.every(c => c.y + c.h <= ROWS));
  assert.ok(atDefaultPlaces(l));
  l.widgets = placeDefaults(l, [...near, ...far, 'econ', 'tiles']);
  t = byType(l);
  assert.equal(t.econ, undefined);
  assert.deepEqual(Object.keys(t).sort(), [...near, ...far, 'tiles'].sort());
});

test('Countdown: up to three copies, one countdown each (Next up to start), never on an old page, under the clock', () => {
  assert.equal(TYPES.countdown.max, 3);
  assert.equal(prefsSection('countdown'), null);
  assert.deepEqual(TYPES.countdown.defaults(), { show: 'next' });
  assert.deepEqual(TYPES.countdown.clean({ show: 'abc' }), { show: 'abc' });
  assert.deepEqual(TYPES.countdown.clean({ show: 4 }), { show: 'next' });
  assert.equal(byType(defaultLayout(legacy())).countdown, undefined);
  const l = { cols: COLS, rows: ROWS, widgets: [] };
  l.widgets = placeDefaults(l, ['clock', 'countdown', 'tasks', 'tiles']);
  const t = byType(l);
  assert.deepEqual(rect(t.countdown), [0, 4, 3, 3]);
  assert.deepEqual(rect(t.tasks), [0, 7, 3, 4]);
  assert.ok(atDefaultPlaces(l));
});

test('Countdown moves to the far column before Weather does, and is left out when both columns are full', () => {
  const l = { cols: COLS, rows: ROWS, widgets: [] };
  l.widgets = placeDefaults(l, ['clock', 'weather', 'countdown', 'tasks', 'notes', 'claude', 'marvel', 'markets', 'tiles']);
  let t = byType(l);
  assert.equal(t.countdown.x, 9);
  assert.equal(t.weather.x, 9);   // the clock column's minimums still sum past 12 without it
  assert.ok(l.widgets.every(c => c.y + c.h <= ROWS));
  l.widgets = placeDefaults(l, ['clock', 'weather', 'countdown', 'tasks', 'markets', 'tiles']);
  t = byType(l);
  assert.equal(t.countdown.x, 0);   // room for all four under the clock
  assert.equal(t.weather.x, 0);
  l.widgets = placeDefaults(l, ['clock', 'tasks', 'notes', 'claude', 'marvel', 'markets', 'github', 'sports', 'website', 'countdown', 'tiles']);
  assert.equal(byType(l).countdown, undefined);
  assert.ok(l.widgets.every(c => c.y + c.h <= ROWS));
});

test('placeDefaults puts the given types in their default places, keeping copies already there', () => {
  const l = defaultLayout(legacy());
  const clock = byType(l).clock;
  moveCopy(l, clock.id, { x: 0, y: 0, w: 2, h: 2 });
  l.widgets = placeDefaults(l, ['clock', 'website', 'tiles']);
  const t = byType(l);
  assert.equal(t.clock.id, clock.id);
  assert.equal(t.clock.settings.name, 'Niv');
  assert.deepEqual(rect(t.clock), [0, 0, 3, 4]);
  assert.deepEqual(rect(t.website), [9, 0, 3, 12]);
  assert.deepEqual(t.website.settings, { url: '', zoom: 100 });
  assert.deepEqual(rect(t.tiles), [3, 0, 6, 12]);
  assert.equal(l.widgets.length, 3);
});

test('placeDefaults keeps the clock column’s side and a search bar at the bottom', () => {
  const l = defaultLayout(legacy({ search: { enabled: true, row: -1 }, widgets: { ...legacy().widgets, position: 'right' } }));
  l.widgets = placeDefaults(l, ['clock', 'search', 'tiles']);
  assert.equal(byType(l).clock.x, 9);
  assert.deepEqual(rect(byType(l).search), [0, 11, 9, 1]);
});

test('atDefaultPlaces tells a page in its default places from one arranged by hand', () => {
  const l = defaultLayout(legacy());
  assert.equal(atDefaultPlaces(l), true);
  moveCopy(l, byType(l).clock.id, { x: 0, y: 0, w: 3, h: 3 });
  assert.equal(atDefaultPlaces(l), false);
  l.widgets = placeDefaults(l, l.widgets.map(c => c.type));
  assert.equal(atDefaultPlaces(l), true);
});

test('a drop on a column neighbour swaps their order', () => {
  const l = defaultLayout(legacy());
  const t = byType(l);
  const drop = { x: 9, y: 2, w: 3, h: 5 };
  assert.equal(moveCopy(l, t.markets.id, drop), false);
  assert.deepEqual(swapPlan(l, t.markets.id, drop), { a: { x: 9, y: 7, w: 3, h: 5 }, b: { id: t.github.id, x: 9, y: 0, w: 3, h: 7 } });
  assert.equal(swapCopy(l, t.markets.id, drop), true);
  assert.deepEqual(rect(byType(l).github), [9, 0, 3, 7]);
  assert.deepEqual(rect(byType(l).markets), [9, 7, 3, 5]);
});

test('row neighbours swap order; other pairs trade corners, each keeping its size', () => {
  const row = { cols: COLS, rows: ROWS, widgets: [
    { id: 'a', type: 'notes', x: 0, y: 0, w: 3, h: 3, settings: {} },
    { id: 'b', type: 'claude', x: 3, y: 0, w: 4, h: 3, settings: {} },
  ] };
  assert.equal(swapCopy(row, 'a', { x: 2, y: 0, w: 3, h: 3 }), true);
  assert.deepEqual(row.widgets.map(rect), [[4, 0, 3, 3], [0, 0, 4, 3]]);
  const apart = { cols: COLS, rows: ROWS, widgets: [
    { id: 'a', type: 'notes', x: 0, y: 0, w: 3, h: 3, settings: {} },
    { id: 'b', type: 'claude', x: 6, y: 6, w: 3, h: 3, settings: {} },
  ] };
  assert.equal(swapCopy(apart, 'a', { x: 5, y: 5, w: 3, h: 3 }), true);
  assert.deepEqual(apart.widgets.map(rect), [[5, 5, 3, 3], [0, 0, 3, 3]]);
});

test('swapPlan refuses drops on two copies, off the canvas, or trades that don’t fit', () => {
  const l = defaultLayout(legacy());
  const t = byType(l);
  assert.equal(swapPlan(l, t.clock.id, { x: 2, y: 0, w: 3, h: 4 }), null);
  assert.equal(swapPlan(l, t.markets.id, { x: 10, y: 0, w: 3, h: 5 }), null);
  const tight = { cols: COLS, rows: ROWS, widgets: [
    { id: 'a', type: 'notes', x: 0, y: 0, w: 2, h: 2, settings: {} },
    { id: 'b', type: 'website', x: 6, y: 0, w: 6, h: 12, settings: {} },
  ] };
  assert.equal(swapPlan(tight, 'a', { x: 5, y: 0, w: 2, h: 2 }), null);
  assert.equal(swapCopy(tight, 'a', { x: 5, y: 0, w: 2, h: 2 }), false);
});

// ---- tab layouts ----

const tabs = () => {
  const s = state(defaultLayout(legacy()));
  s.activeGroupId = 'g1';
  s.prefs.layouts = {};
  return s;
};

test('a tab shows the main layout until it has its own', () => {
  const s = tabs();
  assert.equal(activeLayout(s), s.prefs.layout);
  assert.equal(ownLayout(s, 'g2'), null);
  const own = giveOwnLayout(s, 'g2', 'empty');
  assert.deepEqual(own, { cols: COLS, rows: ROWS, widgets: [] });
  assert.equal(activeLayout(s), s.prefs.layout);   // g1 is still the active tab
  s.activeGroupId = 'g2';
  assert.equal(activeLayout(s), own);
  assert.deepEqual(allLayouts(s), [s.prefs.layout, own]);
  assert.equal(dropOwnLayout(s, 'g2'), true);
  assert.equal(activeLayout(s), s.prefs.layout);
  assert.equal(dropOwnLayout(s, 'g2'), false);
  assert.equal(giveOwnLayout(s, 'nope'), null);
});

test('an own layout copied from the main one gets new ids; copyById finds copies in any layout', () => {
  const s = tabs();
  const own = giveOwnLayout(s, 'g2', 'copy');
  const main = s.prefs.layout.widgets;
  assert.deepEqual(own.widgets.map(c => [c.type, c.x, c.y, c.w, c.h]), main.map(c => [c.type, c.x, c.y, c.w, c.h]));
  assert.deepEqual(own.widgets.map(c => c.settings), main.map(c => c.settings));
  assert.ok(own.widgets.every(c => !main.some(m => m.id === c.id)));
  own.widgets[0].settings.name = 'changed';
  assert.notEqual(main[0].settings.name, 'changed');   // a deep copy
  own.widgets = own.widgets.filter(c => c.type !== 'notes');   // the copy is as full as the main page
  const marvel = addCopy(own, 'marvel');
  assert.equal(copyById(s, marvel.id), marvel);
  assert.equal(copyById(s, main[0].id), main[0]);
  assert.equal(copyById(s, 'nope'), null);
  // Limits count per layout: the main page can have its own Marvel too, but only one.
  s.prefs.layout.widgets = [];
  assert.ok(addCopy(s.prefs.layout, 'marvel'));
  assert.equal(addCopy(s.prefs.layout, 'marvel'), null);
});

test('normalizeLayouts keeps the layouts of groups that exist, valid, with ids no other layout uses', () => {
  const s = tabs();
  const taken = s.prefs.layout.widgets[0].id;
  const out = normalizeLayouts({
    g2: { widgets: [{ id: taken, type: 'marvel', x: 0, y: 0, w: 12, h: 12 }, { id: 'm2', type: 'marvel', x: 0, y: 0 }, { type: 'junk' }] },
    gone: { widgets: [{ type: 'clock' }] },
    g1: 'not a layout',
  }, s);
  assert.deepEqual(Object.keys(out), ['g2']);
  assert.equal(out.g2.widgets.length, 1);   // one Marvel per layout
  assert.notEqual(out.g2.widgets[0].id, taken);
  assert.deepEqual(rect(out.g2.widgets[0]), [0, 0, 12, 12]);
  assert.deepEqual(normalizeLayouts(undefined, s), {});
});

// ---- stacks ----

const page = () => ({
  cols: COLS, rows: ROWS, widgets: [
    { id: 'm', type: 'markets', x: 0, y: 0, w: 3, h: 5, settings: { items: ['BTC'] } },
    { id: 's', type: 'sports', x: 3, y: 0, w: 3, h: 5, settings: TYPES.sports.defaults() },
    { id: 'g', type: 'github', x: 6, y: 0, w: 3, h: 6, settings: TYPES.github.defaults() },
    { id: 'w', type: 'website', x: 9, y: 0, w: 3, h: 6, settings: { url: 'pinterest.com', zoom: 100 } },
    { id: 'c', type: 'claude', x: 0, y: 5, w: 3, h: 2, settings: {} },
    { id: 'b', type: 'search', x: 3, y: 5, w: 6, h: 1, settings: {} },
  ],
});

test('a widget dropped on another makes a stack in the target’s spot, showing what joined', () => {
  const l = page();
  const st = stackCopy(l, 's', 'm');
  assert.equal(isStack(st), true);
  assert.deepEqual(rect(st), [0, 0, 3, 5]);
  assert.deepEqual(st.items.map(c => c.id), ['m', 's']);
  assert.ok(st.items.every(c => !('x' in c)));   // stacked copies have no place of their own
  assert.equal(st.front, 's');
  assert.equal(l.widgets.some(c => c.id === 's' || c.id === 'm'), false);
  assert.ok(fits(l, { x: 3, y: 0, w: 3, h: 5 }));   // Sports' old spot is free
  assert.deepEqual(copiesOf(l).map(c => c.id).sort(), ['b', 'c', 'g', 'm', 's', 'w']);
  assert.equal(countOf(l, 'sports'), 1);
  assert.deepEqual(minOf(st), [2, 3]);
  // A third joins the stack.
  assert.equal(stackCopy(l, 'w', st.id), st);
  assert.deepEqual(st.items.map(c => c.id), ['m', 's', 'w']);
  assert.equal(st.front, 'w');
  assert.equal(stackOf(l, 'w'), st);
  assert.equal(stackOf(l, 'g'), null);
});

test('stackProblem says why a widget can’t join: the search bar, more than three, or too small a spot', () => {
  const l = page();
  assert.equal(stackProblem(l, 's', 'm'), null);
  assert.equal(stackProblem(l, 'b', 'm'), 'search');
  assert.equal(stackProblem(l, 'm', 'b'), 'search');
  assert.equal(stackProblem(l, 'g', 'c'), 'small');   // GitHub needs 3 × 3; Claude's spot is 3 × 2
  assert.equal(stackProblem(l, 'c', 'g'), null);
  assert.equal(stackProblem(l, 'm', 'm'), 'missing');
  assert.equal(stackProblem(l, 'nope', 'm'), 'missing');
  const st = stackCopy(l, 's', 'm');
  stackCopy(l, 'w', st.id);
  assert.equal(stackProblem(l, 'g', st.id), 'full');
  assert.equal(stackCopy(l, 'g', st.id), null);        // refused: nothing changes
  assert.equal(st.items.length, 3);
  assert.ok(l.widgets.some(c => c.id === 'g'));
  // A stack joins another widget or stack only up to three.
  const l2 = page();
  const a = stackCopy(l2, 's', 'm');
  const b = stackCopy(l2, 'w', 'g');
  assert.equal(stackProblem(l2, a.id, b.id), 'full');
  const l3 = page();
  const one = stackCopy(l3, 's', 'm');
  const both = stackCopy(l3, one.id, 'g');
  assert.deepEqual(both.items.map(c => c.id), ['g', 'm', 's']);
  assert.equal(both.front, 's');                       // what the joining stack was showing
  assert.equal(l3.widgets.some(c => c.id === one.id), false);
});

test('removing a stacked widget keeps the rest stacked; with one left it’s a plain widget in the stack’s spot', () => {
  const l = page();
  const st = stackCopy(l, 's', 'm');
  stackCopy(l, 'w', st.id);
  setFront(l, st.id, 's');
  assert.equal(removeCopy(l, 's'), true);
  assert.deepEqual(st.items.map(c => c.id), ['m', 'w']);
  assert.equal(st.front, 'w');                         // the next one along
  assert.equal(removeCopy(l, 'w'), true);
  assert.deepEqual(l.widgets.find(c => c.id === 'm'), { id: 'm', type: 'markets', x: 0, y: 0, w: 3, h: 5, settings: { items: ['BTC'] } });
  assert.equal(l.widgets.some(isStack), false);
  assert.equal(removeCopy(l, 'nope'), false);
});

test('taking a widget out puts it in a free spot at its default size, else its minimum, else refuses', () => {
  const l = page();
  stackCopy(l, 's', 'm');
  const out = unstackCopy(l, 'm');
  assert.deepEqual(rect(out), [3, 0, 3, 5]);           // Markets' default size, in the first free spot
  assert.deepEqual(out.settings, { items: ['BTC'] });
  const left = l.widgets.find(c => c.id === 's');      // one left: a plain widget again
  assert.equal(left.type, 'sports');
  assert.deepEqual(rect(left), [0, 0, 3, 5]);
  assert.equal(unstackCopy(l, 'm'), null);             // not in a stack
  const full = { cols: COLS, rows: ROWS, widgets: [{ id: 'st', type: 'stack', x: 0, y: 0, w: 12, h: 12, front: 'n', items: [{ id: 'n', type: 'notes', settings: {} }, { id: 'q', type: 'claude', settings: {} }] }] };
  assert.equal(unstackCopy(full, 'n'), null);          // no room anywhere: it stays
  assert.equal(full.widgets[0].items.length, 2);
});

test('setFront shows a member of the stack, and nothing else', () => {
  const l = page();
  const st = stackCopy(l, 's', 'm');
  assert.equal(setFront(l, st.id, 'm'), true);
  assert.equal(st.front, 'm');
  assert.equal(setFront(l, st.id, 'm'), false);        // already showing
  assert.equal(setFront(l, st.id, 'g'), false);        // not in it
  assert.equal(setFront(l, 'g', 'g'), false);          // not a stack
  assert.equal(st.front, 'm');
});

test('normalizeLayout keeps stacks valid: members cleaned and counted, the bar and a fourth out, one member plain', () => {
  const l = normalizeLayout({ widgets: [
    { id: 'st', type: 'stack', x: 0, y: 0, w: 3, h: 6, front: 'gone', items: [
      { id: 'k', type: 'clock', settings: { face: 'nope' } },
      { id: 'n', type: 'notes' },
      { type: 'junk' },
      { id: 'q', type: 'search' },
      { id: 'm1', type: 'markets', settings: { items: ['BTC'] } },
      { id: 'm2', type: 'markets', settings: { items: ['ETH'] } },
    ] },
    { id: 'k2', type: 'clock', x: 3, y: 0 },
    { id: 'solo', type: 'stack', x: 6, y: 0, w: 3, h: 4, front: 'x', items: [{ id: 'x', type: 'claude' }] },
    { id: 'none', type: 'stack', x: 9, y: 0, w: 3, h: 3, items: [] },
    { id: 'tiny', type: 'stack', x: 9, y: 6, w: 1, h: 1, front: 'g1', items: [{ id: 'g1', type: 'github' }, { id: 't', type: 'tasks' }] },
  ] }, state(null));
  const st = l.widgets.find(c => c.id === 'st');
  assert.deepEqual(rect(st), [0, 0, 3, 6]);
  assert.deepEqual(st.items.map(c => [c.id, c.type]), [['k', 'clock'], ['n', 'notes'], ['m1', 'markets']]);
  assert.equal(st.items[0].settings.face, 'classic');
  assert.equal(st.front, 'k');                         // a front that isn't a member: the first
  assert.equal(countOf(l, 'clock'), 1);                // the stacked clock counts: the second goes
  assert.equal(l.widgets.some(c => c.id === 'k2'), false);
  assert.deepEqual(l.widgets.find(c => c.id === 'x'), { id: 'x', type: 'claude', x: 6, y: 0, w: 3, h: 4, settings: {} });
  assert.equal(l.widgets.some(c => c.id === 'none' || c.id === 'solo'), false);
  assert.deepEqual(rect(l.widgets.find(c => c.id === 'tiny')), [9, 6, 3, 3]);   // its biggest member's minimum
  assert.equal(l.widgets.find(c => c.id === 'q').type, 'search');              // out of the stack, in a spot of its own
  assert.equal(l.widgets.find(c => c.id === 'm2').type, 'markets');
  assert.equal(countOf(l, 'markets'), 2);
  for (const c of l.widgets) assert.ok(fits(l, c, c.id));
  // Ids stay unique across stacks and their members.
  const dup = normalizeLayout({ widgets: [
    { id: 'a', type: 'notes', x: 0, y: 0, w: 3, h: 3 },
    { id: 'a', type: 'stack', x: 3, y: 0, w: 3, h: 3, front: 'a', items: [{ id: 'a', type: 'claude' }, { id: 'c', type: 'tasks' }] },
  ] }, state(null));
  const ids = copiesOf(dup).map(c => c.id).concat(dup.widgets.filter(isStack).map(c => c.id));
  assert.equal(new Set(ids).size, 4);
  assert.ok(dup.widgets.filter(isStack).every(c => c.items.some(i => i.id === c.front)));
});

test('limits count stacked widgets; a stacked widget duplicates to a free spot', () => {
  const l = page();
  stackCopy(l, 's', 'm');
  const d = duplicateCopy(l, 's');
  assert.equal(d.type, 'sports');
  assert.deepEqual(d.settings, TYPES.sports.defaults());
  assert.equal(stackOf(l, d.id), null);
  assert.equal(countOf(l, 'sports'), 2);
  const one = { cols: COLS, rows: ROWS, widgets: [{ id: 'st', type: 'stack', x: 0, y: 0, w: 3, h: 4, front: 'k', items: [{ id: 'k', type: 'clock', settings: TYPES.clock.defaults() }, { id: 'n', type: 'notes', settings: {} }] }] };
  assert.equal(addCopy(one, 'clock'), null);           // the clock in the stack is the page's one
  assert.equal(copyTitle(one.widgets[0]), 'Stack · Clock, Notes');
});

test('a stack moves and resizes as one, down to its biggest member’s minimum', () => {
  const l = page();
  const st = stackCopy(l, 'c', 'g');                   // GitHub (3 × 3 at least) and Claude
  assert.deepEqual(minOf(st), [3, 3]);
  assert.equal(moveCopy(l, st.id, { x: 6, y: 0, w: 2, h: 6 }), false);
  assert.equal(moveCopy(l, st.id, { x: 6, y: 0, w: 3, h: 3 }), true);
  assert.deepEqual(rect(st), [6, 0, 3, 3]);
});

test('Reset layout takes stacks apart, and a page with a stack isn’t in its default places', () => {
  const l = page();
  stackCopy(l, 's', 'm');
  assert.deepEqual(resetLayout(l), []);
  assert.equal(l.widgets.some(isStack), false);
  assert.deepEqual(l.widgets.map(c => c.type).sort(), ['claude', 'github', 'markets', 'search', 'sports', 'website']);
  assert.deepEqual(l.widgets.find(c => c.id === 'm').settings, { items: ['BTC'] });
  for (const c of l.widgets) assert.ok(fits(l, c, c.id));
  const d = { cols: COLS, rows: ROWS, widgets: placeDefaults({ cols: COLS, rows: ROWS, widgets: [] }, ['clock', 'notes', 'markets']) };
  assert.equal(atDefaultPlaces(d), true);
  stackCopy(d, byType(d).notes.id, byType(d).clock.id);
  assert.equal(atDefaultPlaces(d), false);
});

test('a tab’s own layout copies stacks with new ids; copyById finds stacked copies and stacks', () => {
  const s = tabs();
  const main = s.prefs.layout;
  const { tasks, notes } = byType(main);
  const st = stackCopy(main, notes.id, tasks.id);
  assert.equal(copyById(s, notes.id).type, 'notes');
  assert.equal(copyById(s, st.id), st);
  const own = giveOwnLayout(s, 'g2', 'copy');
  const copied = own.widgets.find(isStack);
  assert.deepEqual(copied.items.map(c => c.type), ['tasks', 'notes']);
  assert.notEqual(copied.id, st.id);
  assert.ok(copied.items.every(c => !st.items.some(m => m.id === c.id)));
  assert.equal(copied.front, copied.items[1].id);      // still showing Notes
  // A member id another layout uses is renamed, and front follows it.
  const out = normalizeLayouts({ g2: { widgets: [{ id: 'z', type: 'stack', x: 0, y: 0, w: 3, h: 4, front: notes.id, items: [{ id: notes.id, type: 'notes' }, { id: 'q', type: 'claude' }] }] } }, s);
  const z = out.g2.widgets[0];
  assert.notEqual(z.items[0].id, notes.id);
  assert.equal(z.front, z.items[0].id);
});
