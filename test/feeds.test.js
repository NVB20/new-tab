import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTicker, parseKline, parseFxPair, fxCurrencies, parseCnbcQuotes, parseCnbcSession, parseCnbcDay, parseCommits, latestCommits, latestRepos, parseStats, parseIssues,
  formatPrice, formatRate, formatChange, sparkPoints, timeAgo, parseCoins, cleanMarketItems,
  isPair, isSegment, segmentItem, moveMarketItem, headingDropIndex, parseContributions, heatmapLayout,
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

test('parseFxPair turns EUR-based rates into any pair, with its change and series', () => {
  const json = { base: 'EUR', rates: {
    '2026-10-14': { USD: 1.1195, ILS: 3.4443 },
    '2026-10-15': { USD: 1.1208, ILS: 3.4769 },
    '2026-10-13': { USD: 1.1188, ILS: 3.4404 },
  } };
  const eur = parseFxPair(json, 'EUR/ILS');
  assert.equal(eur.rate, 3.4769);
  assert.equal(eur.date, '2026-10-15');
  assert.deepEqual(eur.series, [3.4404, 3.4443, 3.4769]);
  assert.ok(Math.abs(eur.change - (3.4769 / 3.4443 - 1)) < 1e-12);
  const usd = parseFxPair(json, 'USD/ILS');
  assert.ok(Math.abs(usd.rate - 3.4769 / 1.1208) < 1e-12);
  assert.ok(Math.abs(usd.change - ((3.4769 / 1.1208) / (3.4443 / 1.1195) - 1)) < 1e-12);
  assert.equal(parseFxPair(json, 'GBP/ILS'), null);
  assert.equal(parseFxPair({ rates: {} }, 'EUR/ILS'), null);
});

test('fxCurrencies lists the non-EUR currencies the chosen pairs need', () => {
  assert.deepEqual(fxCurrencies(['BTC', 'USD/ILS', 'EUR/ILS', 'GBP/USD']), ['GBP', 'ILS', 'USD']);
  assert.deepEqual(fxCurrencies(['BTC']), []);
});

test('parseCnbcQuotes reads each known symbol\'s price and change, skipping unknown ones', () => {
  const json = { FormattedQuoteResult: { FormattedQuote: [
    { symbol: 'SPY', code: 0, name: 'SPDR S&P 500 ETF Trust', last: '763.25', change_pct: '-1.11%', last_timedate: '4:10 PM EDT' },
    { symbol: 'ZZZZQ', code: 1 },
    { symbol: '.DJI', code: 0, name: 'Dow Jones Industrial Average', last: '52,002.41', change_pct: '+0.34%', last_timedate: '4:20 PM EDT' },
    { symbol: 'QQQ', code: 0, name: 'Invesco QQQ Trust', last: '709.80', change_pct: 'UNCH', last_timedate: '4:15 PM EDT' },
  ] } };
  assert.deepEqual(parseCnbcQuotes(json), {
    SPY: { price: 763.25, change: -1.11 / 100, name: 'SPDR S&P 500 ETF Trust', time: '4:10 PM EDT' },
    '.DJI': { price: 52002.41, change: 0.34 / 100, name: 'Dow Jones Industrial Average', time: '4:20 PM EDT' },
    QQQ: { price: 709.8, change: 0, name: 'Invesco QQQ Trust', time: '4:15 PM EDT' },
  });
  assert.deepEqual(parseCnbcQuotes({}), {});
});

test('parseCnbcSession keeps the closes of the latest regular session', () => {
  const bar = (tradeTime, close) => ({ tradeTime, close: String(close) });
  const json = { barData: { priceBars: [
    bar('20261015093000', 100), bar('20261015155000', 101),
    bar('20261016040000', 99), bar('20261016092000', 98),
    bar('20261016093000', 102), bar('20261016094000', 103), bar('20261016155000', 104),
    bar('20261016160000', 105), bar('20261016163000', 106),
  ] } };
  assert.deepEqual(parseCnbcSession(json), [102, 103, 104]);
  // Before the bell the last session is the previous day's.
  json.barData.priceBars = json.barData.priceBars.filter(b => b.tradeTime < '20261016093000');
  assert.deepEqual(parseCnbcSession(json), [100, 101]);
  assert.deepEqual(parseCnbcSession({ status: 'ERROR' }), []);
});

test('parseCnbcDay keeps the closes of the 24 hours up to the latest bar', () => {
  const hour = 3600e3;
  const bar = (h, close) => ({ tradeTimeinMills: h * hour, close: String(close) });
  const json = { barData: { priceBars: [bar(0, 99), bar(10, 98), bar(11, 100), bar(30, 101), bar(33, 'x'), bar(34, 102)] } };
  assert.deepEqual(parseCnbcDay(json), [100, 101, 102]);
  assert.deepEqual(parseCnbcDay({ status: 'ERROR' }), []);
});

test('cleanMarketItems keeps valid coins and pairs once, in order', () => {
  assert.deepEqual(cleanMarketItems(['btc', 'EUR/ILS', 'BTC', '$x', 'usd/ils', 'EURO/ILS', 7, 'SOL']), ['BTC', 'EUR/ILS', 'USD/ILS', 'SOL']);
  assert.deepEqual(cleanMarketItems('BTC'), null);
});

test('cleanMarketItems keeps segment headings as typed, repeats allowed, empty ones dropped', () => {
  assert.deepEqual(
    cleanMarketItems(['#Crypto', 'btc', ' #  US   stocks ', 'SPY', '#', '# ', '#Crypto', 'BTC', '#' + 'x'.repeat(30)]),
    ['#Crypto', 'BTC', '#US stocks', 'SPY', '#Crypto', '#' + 'x'.repeat(24)]);
});

test('isPair is only for currency pairs, not a heading with a slash in it', () => {
  assert.equal(isPair('EUR/ILS'), true);
  assert.equal(isPair('#US/EU'), false);
  assert.deepEqual(fxCurrencies(['#US/EU', 'USD/ILS']), ['ILS', 'USD']);
});

test('segmentItem turns a typed name into a heading entry', () => {
  assert.equal(segmentItem('  Crypto  coins '), '#Crypto coins');
  assert.equal(segmentItem('   '), null);
  assert.equal(segmentItem('a'.repeat(30)), '#' + 'a'.repeat(24));
  assert.equal(isSegment('#Crypto'), true);
  assert.equal(isSegment('BTC'), false);
});

test('moveMarketItem moves a row alone and a heading with its rows', () => {
  const items = ['BTC', '#Crypto', 'ETH', 'SOL', '#US', 'SPY', 'QQQ'];
  // A row, down into another segment and up to the top.
  assert.deepEqual(moveMarketItem(items, 2, 6), ['BTC', '#Crypto', 'SOL', '#US', 'SPY', 'ETH', 'QQQ']);
  assert.deepEqual(moveMarketItem(items, 5, 0), ['SPY', 'BTC', '#Crypto', 'ETH', 'SOL', '#US', 'QQQ']);
  // A heading takes its rows: US above Crypto, Crypto to the end.
  assert.deepEqual(moveMarketItem(items, 4, 1), ['BTC', '#US', 'SPY', 'QQQ', '#Crypto', 'ETH', 'SOL']);
  assert.deepEqual(moveMarketItem(items, 1, 7), ['BTC', '#US', 'SPY', 'QQQ', '#Crypto', 'ETH', 'SOL']);
  // Dropping where it already is, or inside its own block, changes nothing.
  assert.deepEqual(moveMarketItem(items, 2, 3), items);
  assert.deepEqual(moveMarketItem(items, 1, 3), items);
  assert.deepEqual(moveMarketItem(items, 1, 4), items);
});

test('headingDropIndex snaps a heading drop to a segment boundary', () => {
  const items = ['BTC', '#Crypto', 'ETH', 'SOL', '#US', 'SPY', '#FX'];
  // Over a heading's top half: above that segment; anywhere else: below the segment's last row.
  assert.equal(headingDropIndex(items, 4, true), 4);
  assert.equal(headingDropIndex(items, 4, false), 6);
  assert.equal(headingDropIndex(items, 2, true), 4);
  assert.equal(headingDropIndex(items, 6, false), 7);
  // Rows that belong to no segment stay at the top: a drop on them lands above the first heading.
  assert.equal(headingDropIndex(items, 0, true), 1);
  assert.equal(headingDropIndex(['#US', 'SPY'], 1, true), 2);
});

test('parseCommits reads commit search results, newest first, first line of the message', () => {
  const json = { items: [
    { sha: 'edf33f2c7e86aaaa', html_url: 'https://github.com/NVB20/devops-ai/commit/edf33f2c', commit: { message: 'Step 01: echo bot', author: { date: '2026-10-15T21:46:28.000+03:00' } }, repository: { full_name: 'NVB20/devops-ai', private: false } },
    { sha: '22bd6a013b49bbbb', html_url: 'https://github.com/NVB20/devops-ai/commit/22bd6a01', commit: { message: 'Step 02: AI answers\n\nlong body', author: { date: '2026-10-16T01:26:57.000+03:00' } }, repository: { full_name: 'eitan-capital/crm', private: true } },
  ] };
  assert.deepEqual(parseCommits(json), [
    { sha: '22bd6a0', message: 'Step 02: AI answers', repo: 'eitan-capital/crm', url: 'https://github.com/NVB20/devops-ai/commit/22bd6a01', at: Date.parse('2026-10-16T01:26:57.000+03:00'), private: true },
    { sha: 'edf33f2', message: 'Step 01: echo bot', repo: 'NVB20/devops-ai', url: 'https://github.com/NVB20/devops-ai/commit/edf33f2c', at: Date.parse('2026-10-15T21:46:28.000+03:00'), private: false },
  ]);
  assert.deepEqual(parseCommits({ message: 'Validation Failed' }), []);
});

test('latestCommits keeps the newest commits across repos and drops duplicates', () => {
  const c = (repo, at, sha) => ({ repo, at, sha });
  const commits = [c('a/one', 5, 'x'), c('b/two', 9, 'y'), c('a/one', 7, 'z'), c('c/three', 1, 'w'), c('b/two', 9, 'y')];
  assert.deepEqual(latestCommits(commits, 10).map(x => x.sha), ['y', 'z', 'x', 'w']);
  assert.deepEqual(latestCommits(commits, 2).map(x => x.sha), ['y', 'z']);
  assert.deepEqual(latestCommits([], 3), []);
});

const CALENDAR = `
<h2 tabindex="-1" id="js-contribution-activity-description" class="f4 text-normal mb-2">
      3,209
      contributions
        in the last year
    </h2>
<table><tbody><tr>
  <td tabindex="0" data-ix="0" aria-selected="false" style="width: 11px" data-date="2026-10-12" id="contribution-day-component-1-0" data-level="0" role="gridcell" class="ContributionCalendar-day"></td>
  <tool-tip id="tooltip-a" for="contribution-day-component-1-0" popover="manual" class="sr-only position-absolute">No contributions on October 12th.</tool-tip>
  <td tabindex="0" data-ix="1" style="width: 11px" data-date="2026-10-11" id="contribution-day-component-0-1" data-level="4" class="ContributionCalendar-day"></td>
  <tool-tip id="tooltip-b" for="contribution-day-component-0-1" class="sr-only">1,024 contributions on October 11th.</tool-tip>
  <td data-date="2026-10-13" id="contribution-day-component-2-1" data-level="1" class="ContributionCalendar-day"></td>
  <tool-tip id="tooltip-c" for="contribution-day-component-2-1" class="sr-only">1 contribution on October 13th.</tool-tip>
</tr></tbody></table>`;

test('parseContributions reads days, levels, counts and the yearly total', () => {
  assert.deepEqual(parseContributions(CALENDAR), {
    total: 3209,
    days: [
      { date: '2026-10-11', level: 4, count: 1024 },
      { date: '2026-10-12', level: 0, count: 0 },
      { date: '2026-10-13', level: 1, count: 1 },
    ],
  });
  assert.equal(parseContributions('<html>nothing</html>'), null);
});

test('heatmapLayout puts weeks in columns with Sunday on top, and labels months', () => {
  // 2026-10-11 is a Sunday.
  const day = date => ({ date, level: 1, count: 1 });
  const { cols, cells } = heatmapLayout(['2026-10-11', '2026-10-17', '2026-10-18', '2026-10-20'].map(day));
  assert.equal(cols, 2);
  assert.deepEqual(cells.map(c => [c.col, c.row]), [[0, 0], [0, 6], [1, 0], [1, 2]]);
  assert.deepEqual(heatmapLayout([day('2026-10-14')]).cells.map(c => [c.col, c.row]), [[0, 3]]);
  // A month is named above the week its first days fall in.
  const weeks = ['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06'].map(day);
  assert.deepEqual(heatmapLayout(weeks).months, [{ col: 1, label: 'Nov' }, { col: 6, label: 'Dec' }]);
});

test('parseIssues reads search results into PR and issue rows', () => {
  const json = { items: [
    { title: 'Fix login', number: 12, html_url: 'https://github.com/o/r/pull/12', repository_url: 'https://api.github.com/repos/o/r', updated_at: '2026-10-16T08:00:00Z', draft: true },
    { title: 'Crash on start', number: 7, html_url: 'https://github.com/o/r/issues/7', repository_url: 'https://api.github.com/repos/o/r', updated_at: '2026-10-15T08:00:00Z' },
  ] };
  assert.deepEqual(parseIssues(json), [
    { title: 'Fix login', number: 12, url: 'https://github.com/o/r/pull/12', repo: 'o/r', updatedAt: Date.parse('2026-10-16T08:00:00Z'), draft: true },
    { title: 'Crash on start', number: 7, url: 'https://github.com/o/r/issues/7', repo: 'o/r', updatedAt: Date.parse('2026-10-15T08:00:00Z'), draft: false },
  ]);
  assert.deepEqual(parseIssues({ message: 'rate limited' }), []);
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


test('latestRepos lists each repo once, by its newest commit', () => {
  const commits = [
    { repo: 'me/a', at: 100, private: false },
    { repo: 'org/b', at: 300, private: true },
    { repo: 'me/a', at: 200, private: false },
    { repo: 'me/c', at: 50, private: false },
    { repo: '', at: 999, private: false },
  ];
  assert.deepEqual(latestRepos(commits, 5), [
    { repo: 'org/b', url: 'https://github.com/org/b', at: 300, private: true },
    { repo: 'me/a', url: 'https://github.com/me/a', at: 200, private: false },
    { repo: 'me/c', url: 'https://github.com/me/c', at: 50, private: false },
  ]);
  assert.deepEqual(latestRepos(commits, 1).map(r => r.repo), ['org/b']);
  assert.deepEqual(latestRepos([], 5), []);
  assert.equal(commits[0].repo, 'me/a');   // the list passed in keeps its order
});

test('parseStats counts followers, public repos and the stars on repos that aren’t forks', () => {
  const repos = [{ stargazers_count: 10 }, { stargazers_count: 5, fork: true }, { stargazers_count: 2 }, { stargazers_count: 'x' }, null];
  assert.deepEqual(parseStats({ followers: 128, public_repos: 42 }, repos), { followers: 128, repos: 42, stars: 12 });
  assert.deepEqual(parseStats({}, {}), { followers: 0, repos: 0, stars: 0 });
  assert.deepEqual(parseStats(null, null), { followers: 0, repos: 0, stars: 0 });
});

test('GitHub rows link only to github.com, whatever the response says', () => {
  const bad = ['javascript:alert(1)', 'https://evil.example/login', 'https://github.com.evil.example/', 42];
  for (const html_url of bad) {
    assert.equal(parseCommits({ items: [{ sha: 'a', html_url }] })[0].url, '', String(html_url));
    assert.equal(parseIssues({ items: [{ title: 'x', html_url }] })[0].url, '', String(html_url));
  }
  assert.equal(parseIssues({ items: [{ html_url: 'https://github.com/o/r/pull/1' }] })[0].url, 'https://github.com/o/r/pull/1');
});

test('parseCnbcQuotes skips a "__proto__" symbol', () => {
  const quotes = parseCnbcQuotes({ FormattedQuoteResult: { FormattedQuote: [{ symbol: '__proto__', code: 0, last: '1' }] } });
  assert.equal(Object.getPrototypeOf(quotes), Object.prototype);
  assert.deepEqual(Object.keys(quotes), []);
});
