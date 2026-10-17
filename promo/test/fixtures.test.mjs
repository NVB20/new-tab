import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildState, WORK, USER } from '../fixtures/state.mjs';
import { buildCache } from '../fixtures/cache.mjs';
import { iconMap } from '../fixtures/icons.mjs';
import { scoreboards } from '../../js/sports.js';

const EPOCH = new Date(2026, 9, 20, 9, 41).getTime();

test('the demo state keeps every widget and tile through normalizing', () => {
  const s = buildState();
  assert.deepEqual(s.prefs.layout.widgets.map(w => w.id).sort(),
    ['w-clock', 'w-github', 'w-markets', 'w-search', 'w-sports', 'w-tiles', 'w-weather']);
  assert.deepEqual(s.prefs.layouts[WORK].widgets.map(w => w.id).sort(),
    ['w2-clock', 'w2-markets', 'w2-search', 'w2-sports', 'w2-weather']);
  assert.equal(s.tiles.length, 14);
  assert.equal(s.tiles.filter(t => t.folderId === 'f-ai').length, 4);
  assert.equal(s.prefs.github.user, USER);
  assert.equal(s.onboarding.done, true);
  assert.equal(s.groups[0].id, s.activeGroupId);
});

test('the page wears the GitHub theme with the blue accent', () => {
  const { prefs } = buildState();
  assert.equal(prefs.theme, 'github');
  assert.equal(prefs.accent, '#2563eb');
});

test('the layout shot opens on Work', () => {
  assert.equal(buildState({ activeGroup: WORK }).activeGroupId, WORK);
});

test('every tile logo has a saved image', () => {
  const icons = iconMap();
  for (const t of buildState().tiles.filter(t => t.kind !== 'folder')) {
    assert.match(icons[t.icon] ?? '', /^data:image\/svg\+xml;base64,/, t.title);
  }
});

test('every cache entry is dated at the video clock', () => {
  for (const [key, entry] of Object.entries(buildCache(EPOCH))) assert.equal(entry.at, EPOCH, key);
});

test('markets all go up', () => {
  const c = buildCache(EPOCH);
  for (const coin of ['BTC', 'ETH', 'SOL']) {
    assert.ok(c[`ticker:${coin}USDT`].data.change > 0, coin);
    const line = c[`kline:${coin}USDT`].data;
    assert.equal(line.length, 24);
    assert.ok(line.at(-1) > line[0], coin);
  }
  for (const id of ['SPY', 'QQQ', 'GOLD']) {
    const line = c[`cnbc:session:${id}`].data;
    assert.ok(line.at(-1) > line[0], id);
  }
  for (const q of Object.values(c['cnbc:quotes:GOLD,QQQ,SPY'].data)) assert.ok(q.change > 0, q.name);
  const days = Object.values(c['fx:EUR:ILS,USD'].data.rates);
  assert.equal(days.length, 10);
  assert.ok(days.at(-1).ILS > days[0].ILS);
});

test('the contribution map is a full year ending today', () => {
  const cal = buildCache(EPOCH)[`github-cal:${USER}`].data;
  assert.equal(cal.days.length, 371);
  assert.equal(cal.days.at(-1).date, '2026-10-20');
  assert.equal(cal.total, cal.days.reduce((n, d) => n + d.count, 0));
  assert.ok(cal.days.filter(d => d.level >= 3).length > 100);
});

test('a Lakers game is live and its scoreboard is saved', () => {
  const c = buildCache(EPOCH);
  const events = c['sports-v1:team:nba:13'].data;
  const live = events.find(e => e.state === 'in');
  assert.ok(live);
  const boards = scoreboards(events, EPOCH);
  assert.equal(boards.length, 1);
  assert.ok(c[`sports-v1:live:${boards[0].path}:${boards[0].day}`].data.some(e => e.id === live.id));
});

test('the weather starts this hour and has a week', () => {
  const wx = buildCache(EPOCH)['weather-v1:32.08,34.78'].data;
  assert.ok(wx.now.at <= EPOCH && EPOCH - wx.now.at < 3600e3);
  assert.equal(wx.hours[0].at, wx.now.at);
  assert.equal(wx.days.length, 7);
  assert.equal(wx.days[0].date, '2026-10-20');
});
