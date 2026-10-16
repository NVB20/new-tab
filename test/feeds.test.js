import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTicker, parseKline, parseFxSeries, parseRepos, parsePulls, mergeRepos,
  formatPrice, formatRate, formatChange, sparkPoints, timeAgo, parseCoins, parseNames,
} from '../js/feeds.js';

test('parseTicker reads Bybit last price and 24h change', () => {
  const json = { retCode: 0, result: { list: [{ symbol: 'BTCUSDT', lastPrice: '82276.2', price24hPcnt: '0.0118' }] } };
  assert.deepEqual(parseTicker(json), { price: 82276.2, change: 0.0118 });
  assert.equal(parseTicker({ retCode: 10001, result: {} }), null);
  assert.equal(parseTicker(null), null);
});

test('parseKline returns closes oldest first', () => {
  const json = { retCode: 0, result: { list: [['3', '1', '1', '1', '106.87'], ['2', '1', '1', '1', '106.38'], ['1', '1', '1', '1', '106.33']] } };
  assert.deepEqual(parseKline(json), [106.33, 106.38, 106.87]);
  assert.deepEqual(parseKline({}), []);
});

test('parseFxSeries gives the latest rate and the change from the day before', () => {
  const json = { rates: { '2026-10-13': { ILS: 3.0751 }, '2026-10-15': { ILS: 3.1022 }, '2026-10-14': { ILS: 3.0766 } } };
  const fx = parseFxSeries(json, 'ILS');
  assert.equal(fx.rate, 3.1022);
  assert.equal(fx.date, '2026-10-15');
  assert.ok(Math.abs(fx.change - (3.1022 / 3.0766 - 1)) < 1e-12);
  assert.equal(fx.series.length, 3);
  assert.equal(parseFxSeries({ rates: {} }, 'ILS'), null);
});

test('parseRepos keeps name, link, push time and visibility', () => {
  const json = [{ full_name: 'NVB20/devops-ai', html_url: 'https://github.com/NVB20/devops-ai', pushed_at: '2026-10-15T22:27:00Z', private: false, extra: 1 }];
  assert.deepEqual(parseRepos(json), [{ name: 'NVB20/devops-ai', url: 'https://github.com/NVB20/devops-ai', pushedAt: Date.parse('2026-10-15T22:27:00Z'), private: false }]);
  assert.deepEqual(parseRepos({ message: 'Not Found' }), []);
});

test('mergeRepos de-duplicates and sorts by most recent push', () => {
  const a = [{ name: 'x/a', pushedAt: 1 }, { name: 'x/b', pushedAt: 5 }];
  const b = [{ name: 'x/b', pushedAt: 5 }, { name: 'y/c', pushedAt: 3 }];
  assert.deepEqual(mergeRepos([a, b], 2).map(r => r.name), ['x/b', 'y/c']);
});

test('parsePulls reads search results into PR rows', () => {
  const json = { items: [{ title: 'Fix login', number: 12, html_url: 'https://github.com/o/r/pull/12', repository_url: 'https://api.github.com/repos/o/r', updated_at: '2026-10-16T08:00:00Z', draft: true }] };
  assert.deepEqual(parsePulls(json), [{ title: 'Fix login', number: 12, url: 'https://github.com/o/r/pull/12', repo: 'o/r', updatedAt: Date.parse('2026-10-16T08:00:00Z'), draft: true }]);
  assert.deepEqual(parsePulls({ message: 'rate limited' }), []);
});

test('formatPrice adapts decimals to the size of the price', () => {
  assert.equal(formatPrice(82276.2), '82,276');
  assert.equal(formatPrice(3215.456), '3,215.46');
  assert.equal(formatPrice(106.87), '106.87');
  assert.equal(formatPrice(2.41567), '2.4157');
  assert.equal(formatPrice(0.000123456), '0.0001235');
  assert.equal(formatRate(3.1022), '3.1022');
});

test('formatChange shows a signed percentage', () => {
  assert.equal(formatChange(0.0118), '+1.18%');
  assert.equal(formatChange(-0.0042), '−0.42%');
  assert.equal(formatChange(0), '0.00%');
});

test('sparkPoints scales values into the box with the highest value at the top', () => {
  assert.equal(sparkPoints([1, 2, 3], 10, 4), '0,4 5,2 10,0');
  assert.equal(sparkPoints([5, 5], 10, 4), '0,2 10,2');
  assert.equal(sparkPoints([7], 10, 4), '');
});

test('timeAgo gives a short relative time', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  assert.equal(timeAgo(now - 20e3, now), 'now');
  assert.equal(timeAgo(now - 5 * 60e3, now), '5m');
  assert.equal(timeAgo(now - 3 * 3600e3, now), '3h');
  assert.equal(timeAgo(now - 2 * 86400e3, now), '2d');
  assert.equal(timeAgo(now - 21 * 86400e3, now), '3w');
});

test('parseCoins upper-cases, de-duplicates and drops junk', () => {
  assert.deepEqual(parseCoins('btc, SOL xrp,eth  btc ;; $doge'), ['BTC', 'SOL', 'XRP', 'ETH']);
});

test('parseNames splits on commas and spaces, keeping case', () => {
  assert.deepEqual(parseNames(' eitan-capital, Investing-Academy  '), ['eitan-capital', 'Investing-Academy']);
  assert.deepEqual(parseNames(''), []);
});
