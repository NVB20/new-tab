import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromSpeedDial2 } from '../js/importer.js';
import { DEFAULT_PREFS } from '../js/store.js';

function counterIds() {
  let n = 0;
  return () => 'id' + ++n;
}

const dial = (id, idgroup, position, title, url, thumbnail = '') => ({
  id, idgroup, position, title, url, thumbnail, visits: 3, ts_created: 1,
});

const sample = {
  groups: [
    { color: '', id: 1, position: 99, title: 'dev' },
    { id: 0, title: 'Home', position: 0 },
  ],
  dials: [
    dial(9, 0, 999, 'Late B', 'https://late-b.com'),
    dial(3, 0, 2, 'Third', 'https://third.com'),
    dial(5, 0, 999, 'Late A ', 'https://late-a.com'),
    dial(1, 0, 0, '  Netflix ', 'https://www.netflix.com/', 'https://img.example/netflix.png'),
    dial(2, 0, 1, 'Second', 'https://second.com'),
    dial(6, 1, 0, 'Github', 'https://github.com/NVB20'),
    dial(7, 42, 0, 'Orphan', 'https://orphan.com'),
    dial(8, 0, 3, 'No url', ''),
    dial(10, 1, 1, '', 'https://www.draw.io/'),
  ],
  preferences: {
    columns: 5,
    spacing: 8,
    maxWidth: 720,
    centeredLayout: true,
    showAddButton: 1,
    openInNewTab: false,
    bookmarks: { showTitle: true },
    theme: { theme: 'dark' },
    widgets: {
      enabled: 1,
      position: 'left',
      clock: { enabled: 1, hourCycle: '24', name: 'Niv', showGreeting: 1 },
      tasks: { enabled: 1 },
      notes: { enabled: 0 },
    },
  },
};

test('groups are ordered by position and get new ids', () => {
  const out = fromSpeedDial2(sample, counterIds());
  assert.deepEqual(out.groups.map(g => g.title), ['Home', 'dev']);
  assert.ok(out.groups.every(g => typeof g.id === 'string'));
  assert.equal(out.activeGroupId, out.groups[0].id);
});

test('tiles are ordered by position, then id, with 999 positions last', () => {
  const out = fromSpeedDial2(sample, counterIds());
  const home = out.groups[0].id;
  const titles = out.tiles.filter(t => t.groupId === home).map(t => t.title);
  assert.deepEqual(titles, ['Netflix', 'Second', 'Third', 'Late A', 'Late B', 'Orphan']);
});

test('tiles from a missing group go to the first group', () => {
  const out = fromSpeedDial2(sample, counterIds());
  const orphan = out.tiles.find(t => t.title === 'Orphan');
  assert.equal(orphan.groupId, out.groups[0].id);
});

test('dials without a url are skipped and empty titles fall back to the host', () => {
  const out = fromSpeedDial2(sample, counterIds());
  assert.equal(out.tiles.find(t => t.title === 'No url'), undefined);
  assert.ok(out.tiles.some(t => t.title === 'draw.io' && t.url === 'https://www.draw.io/'));
});

test('thumbnail becomes icon and only known tile fields are kept', () => {
  const out = fromSpeedDial2(sample, counterIds());
  const netflix = out.tiles.find(t => t.title === 'Netflix');
  assert.deepEqual(Object.keys(netflix).sort(), ['groupId', 'icon', 'id', 'title', 'url']);
  assert.equal(netflix.icon, 'https://img.example/netflix.png');
});

test('preferences are mapped onto our prefs', () => {
  const { prefs } = fromSpeedDial2(sample, counterIds());
  assert.equal(prefs.columns, 5);
  assert.equal(prefs.spacing, 8);
  assert.equal(prefs.width, 720);
  assert.equal(prefs.centerVertically, true);
  assert.equal(prefs.showAddButton, true);
  assert.equal(prefs.openInNewTab, false);
  assert.equal(prefs.theme, 'dark');
  assert.equal(prefs.tiles.showTitle, true);
  assert.equal(prefs.widgets.enabled, true);
  assert.equal(prefs.widgets.position, 'left');
  assert.deepEqual(prefs.widgets.clock, { enabled: true, hour24: true, name: 'Niv', greeting: true });
  assert.equal(prefs.widgets.tasks.enabled, true);
  assert.equal(prefs.widgets.notes.enabled, false);
  assert.equal(prefs.accent, DEFAULT_PREFS.accent);
  assert.equal(prefs.tiles.color, DEFAULT_PREFS.tiles.color);
});

test('out-of-range and wrong-typed preferences fall back or clamp', () => {
  const { prefs } = fromSpeedDial2({
    dials: [],
    preferences: { columns: 40, spacing: -5, maxWidth: 'wide', theme: { theme: 'neon' }, widgets: { position: 'top' } },
  }, counterIds());
  assert.equal(prefs.columns, 10);
  assert.equal(prefs.spacing, 0);
  assert.equal(prefs.width, DEFAULT_PREFS.width);
  assert.equal(prefs.theme, DEFAULT_PREFS.theme);
  assert.equal(prefs.widgets.position, DEFAULT_PREFS.widgets.position);
});

test('a 12-hour clock is mapped', () => {
  const { prefs } = fromSpeedDial2({ dials: [], preferences: { widgets: { clock: { hourCycle: '12' } } } }, counterIds());
  assert.equal(prefs.widgets.clock.hour24, false);
});

test('missing groups list creates a Home group', () => {
  const out = fromSpeedDial2({ dials: [dial(1, 0, 0, 'A', 'https://a.com')] }, counterIds());
  assert.deepEqual(out.groups.map(g => g.title), ['Home']);
  assert.equal(out.tiles[0].groupId, out.groups[0].id);
});

test('input that is not a Speed Dial 2 export is rejected', () => {
  assert.throws(() => fromSpeedDial2(null), /Speed Dial 2/);
  assert.throws(() => fromSpeedDial2({ groups: [] }), /Speed Dial 2/);
  assert.throws(() => fromSpeedDial2('text'), /Speed Dial 2/);
});
