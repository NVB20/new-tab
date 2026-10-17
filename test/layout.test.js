import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, ROWS, TYPES, GITHUB_PARTS, fits, firstFree, countOf, stackOrder, defaultLayout, normalizeLayout,
  addCopy, plannedCopy, duplicateCopy, removeCopy, moveCopy, resetLayout, copyTitle, prefsSection,
  placeDefaults, atDefaultPlaces, swapPlan, swapCopy,
  cleanGithubParts, moveGithubPart, showGithubPart,
  copyById, allLayouts, ownLayout, activeLayout, giveOwnLayout, dropOwnLayout, normalizeLayouts,
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
  assert.deepEqual(t.tasks.settings, { view: 'all', showDone: false });
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

test('addCopy takes the default size, else the minimum, else refuses; duplicates copy settings', () => {
  const l = defaultLayout(legacy());
  assert.equal(addCopy(l, 'clock'), null);                     // limit 1
  assert.equal(addCopy(l, 'search'), null);                    // limit 1 too
  assert.equal(addCopy(l, 'weather'), null);
  assert.equal(addCopy(l, 'claude'), null);                    // no room
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
  assert.equal(plannedCopy(l, 'claude'), null);                // no room
  assert.equal(plannedCopy(l, 'weather'), null);
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
  assert.equal(TYPES.website.max, 5);
});

test('prefsSection says where Preferences keeps a type’s settings', () => {
  for (const type of ['clock', 'markets', 'tiles', 'website']) assert.equal(prefsSection(type), 'layout', type);
  assert.equal(prefsSection('search'), 'search');
  assert.equal(prefsSection('github'), 'github');
  for (const type of ['tasks', 'notes', 'claude']) assert.equal(prefsSection(type), null, type);
  assert.equal(prefsSection('weather'), 'layout');   // an unknown type falls back to its own group
});

test('Tasks: a view and whether Finished is open, cleaned to valid values', () => {
  assert.deepEqual(TYPES.tasks.defaults(), { view: 'all', showDone: false });
  assert.deepEqual(TYPES.tasks.clean({}), { view: 'all', showDone: false });
  assert.deepEqual(TYPES.tasks.clean({ view: 'upcoming', showDone: true }), { view: 'upcoming', showDone: true });
  assert.deepEqual(TYPES.tasks.clean({ view: 'someday', showDone: 'yes' }), { view: 'all', showDone: false });
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
