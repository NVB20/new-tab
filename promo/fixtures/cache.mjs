// What each widget finds in its cache (localStorage 'newtab:cache:<key>' as { at, data, via }) on
// the demo page, dated at the video's clock, so nothing is stale and no widget asks the network.
// The shapes are the widgets' own parsed data (js/markets-widget.js, github-widget.js,
// sports-widget.js, weather-widget.js); the values are made up.
import { scoreboards } from '../../js/sports.js';
import { placeKey } from '../../js/weather.js';
import { fxCurrencies } from '../../js/feeds.js';
import { USER, PLACE, MARKETS } from './state.mjs';

const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// The same pseudo-random numbers every build, so the lines and the map never change.
export function random(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

// n values climbing from start to end, wobbling by up to ±wobble (a fraction) on the way.
export function climb(start, end, n, seed, wobble = 0.004) {
  const r = random(seed);
  return Array.from({ length: n }, (_, i) => {
    const k = i / (n - 1);
    const v = start + (end - start) * (0.6 * k + 0.4 * k * k);
    return i === 0 || i === n - 1 ? v : v * (1 + (r() - 0.5) * 2 * wobble);
  });
}

const two = n => String(n).padStart(2, '0');
const localDay = ms => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const round = (v, digits) => Number(v.toFixed(digits));

// ---- Markets ----

// coin: [24 h ago, now, decimals]
const COINS = { BTC: [94180, 98420.5, 1], ETH: [3726.1, 3912.4, 2], SOL: [199.4, 214.6, 2], XRP: [2.33, 2.41, 4] };
// id: [CNBC symbol, name, at the open, now]
const CNBC = {
  GOLD: ['@GC.1', "Gold COMEX (Dec'26)", 4171.2, 4212.3],
  QQQ: ['QQQ', 'Invesco QQQ Trust', 706.4, 718.6],
  SPY: ['SPY', 'SPDR S&P 500 ETF Trust', 762.1, 771.4],
};

function markets(epoch) {
  const out = {};
  let seed = 1;
  for (const [coin, [from, to, digits]] of Object.entries(COINS)) {
    out[`ticker:${coin}USDT`] = { data: { price: to, change: round(to / from - 1, 4) }, via: 'Bybit' };
    out[`kline:${coin}USDT`] = { data: climb(from, to, 24, seed++).map(v => round(v, digits)), via: 'Bybit' };
  }
  const quotes = {};
  for (const [id, [symbol, name, from, to]] of Object.entries(CNBC)) {
    quotes[symbol] = { price: to, change: round(to / from - 1, 4), name, time: '4:00 PM EDT' };
    out[`cnbc:session:${id}`] = { data: climb(from, to, 39, seed++).map(v => round(v, 2)), via: 'CNBC' };
  }
  out[`cnbc:quotes:${Object.keys(CNBC).sort().join(',')}`] = { data: quotes, via: 'CNBC' };

  // The ten weekdays before today: the shekel weakens a little against the euro, the dollar holds.
  const days = [];
  for (let ms = epoch - DAY; days.length < 10; ms -= DAY) {
    if (![0, 6].includes(new Date(ms).getDay())) days.unshift(ms);
  }
  const ils = climb(3.402, 3.471, days.length, 41, 0.002);
  const rates = Object.fromEntries(days.map((ms, i) => [new Date(ms).toISOString().slice(0, 10), { ILS: round(ils[i], 4), USD: 1.1203 }]));
  out[`fx:EUR:${fxCurrencies(MARKETS).join(',')}`] = { data: { base: 'EUR', rates }, via: 'Frankfurter' };
  return out;
}

// ---- GitHub ----

const REPO = `${USER}/new-tab`;
const gh = path => `https://github.com/${path}`;
// [sha, message, minutes ago]
const COMMITS = [
  ['a41c9e2', 'Weather: the week ahead with sunrise and sunset', 18],
  ['9d03b7f', 'Markets: commodities from CNBC with sparklines', 47],
  ['5be1d20', 'Layout mode: stack up to three widgets in one spot', 95],
  ['e7720aa', 'Sports: live scores for the teams you follow', 160],
  ['31c8f4b', 'ASCII background: a ripple where you click', 260],
  ['c90e615', 'Tiles: drop one on another to make a folder', 420],
  ['7fa2d93', 'GitHub: contribution map and open pull requests', 610],
  ['04be7c1', 'Search bar: Google or Claude from the same box', 900],
];
// [title, number, minutes ago]
const PULLS = [
  ['Countdown widget with alarms', 128, 35],
  ['Weather: °F and up to three cities', 126, 140],
  ['Markets: group coins under your own headings', 121, 300],
];

function calendar(epoch) {
  const r = random(2026);
  const days = [];
  for (let i = 370; i >= 0; i--) {
    const ms = epoch - i * DAY;
    const weekend = [0, 6].includes(new Date(ms).getDay());
    const count = weekend ? (r() < 0.5 ? 0 : Math.floor(r() * 4)) : (r() < 0.1 ? 0 : 1 + Math.floor(r() * 9));
    const level = count === 0 ? 0 : count < 3 ? 1 : count < 5 ? 2 : count < 7 ? 3 : 4;
    days.push({ date: localDay(ms), level, count });
  }
  return { total: days.reduce((n, d) => n + d.count, 0), days };
}

function github(epoch) {
  return {
    [`github-stats:${USER}`]: { data: { followers: 1284, repos: 42, stars: 3910 } },
    [`github-cal:${USER}`]: { data: calendar(epoch), via: 'GitHub' },
    [`github-v8:${USER}:public`]: {
      data: {
        commits: COMMITS.map(([sha, message, ago]) => ({ sha, message, repo: REPO, url: gh(`${REPO}/commit/${sha}`), at: epoch - ago * MIN, private: false })),
        repos: [
          { repo: REPO, url: gh(REPO), at: epoch - 18 * MIN, private: false },
          { repo: `${USER}/ascii-field`, url: gh(`${USER}/ascii-field`), at: epoch - 2 * DAY, private: false },
          { repo: `${USER}/dotfiles`, url: gh(`${USER}/dotfiles`), at: epoch - 5 * DAY, private: false },
        ],
        pulls: PULLS.map(([title, number, ago]) => ({ title, number, url: gh(`${REPO}/pull/${number}`), repo: REPO, updatedAt: epoch - ago * MIN, draft: false })),
        reviews: [],
        issues: [],
        tokenInfo: null,
      },
    },
  };
}

// ---- Sports ----

const side = (id, abbr, name, score = null, winner = false) => ({ id, abbr, name, logo: '', score, winner });
const game = ({ id, sport, league, tag, start, state, detail = '', home, away, tv }) => ({
  id, sport, league, tag, start, timeValid: true, state, detail, off: null, home, away, tv,
  url: `https://www.espn.com/${sport === 'soccer' ? 'soccer/match' : `${sport}/game`}/_/gameId/${id}`,
});
const f1 = (round, gp, session, label, start, minutes) => ({
  id: `f1:2026-${round}-${label.replace(/\W/g, '')}`, sport: 'f1', tag: 'F1', session, season: '2026', round,
  title: `${gp} · ${label}`, start, timeValid: true, minutes, state: 'pre', url: 'https://www.formula1.com/en/racing/2026',
});

function sports(epoch) {
  const lakers = (score = null) => side('13', 'LAL', 'Los Angeles Lakers', score, false);
  const live = game({
    id: '401910001', sport: 'nba', league: 'nba', tag: 'NBA', start: epoch - 100 * MIN, state: 'in', detail: 'Q4 2:14',
    home: lakers('108'), away: side('9', 'GS', 'Golden State Warriors', '104'), tv: 'ESPN',
  });
  const nba = [
    live,
    game({ id: '401910002', sport: 'nba', league: 'nba', tag: 'NBA', start: epoch + 2 * DAY + 10 * HOUR, state: 'pre', home: lakers(), away: side('12', 'LAC', 'LA Clippers'), tv: 'TNT' }),
    game({ id: '401910003', sport: 'nba', league: 'nba', tag: 'NBA', start: epoch + 4 * DAY + 11 * HOUR, state: 'pre', home: side('25', 'OKC', 'Oklahoma City Thunder'), away: lakers(), tv: 'ESPN' }),
  ];
  const miami = (score = null, winner = false) => side('20232', 'MIA', 'Inter Miami CF', score, winner);
  const next = [
    game({ id: '761900', sport: 'soccer', league: 'usa.1', tag: 'MLS', start: epoch + 9 * HOUR + 49 * MIN, state: 'pre', home: miami(), away: side('17606', 'NYC', 'New York City FC'), tv: 'Apple TV' }),
  ];
  const last = [
    game({ id: '761899', sport: 'soccer', league: 'usa.1', tag: 'MLS', start: epoch - DAY - 2 * HOUR, state: 'post', detail: 'FT', home: side('18267', 'ORL', 'Orlando City SC', '1'), away: miami('3', true), tv: 'Apple TV' }),
  ];
  const season = [
    f1(20, 'Mexico City GP', 'qualifying', 'Qualifying', epoch + 4 * DAY + 13 * HOUR, 60),
    f1(20, 'Mexico City GP', 'race', 'Race', epoch + 5 * DAY + 12 * HOUR, 120),
  ];
  const out = {
    'sports-v1:team:nba:13': { data: nba, via: 'ESPN' },
    'sports-v1:soccer:20232:next': { data: next, via: 'ESPN' },
    'sports-v1:soccer:20232:last': { data: last, via: 'ESPN' },
    'sports-v1:f1:season': { data: season, via: 'Jolpica' },
  };
  // The live game's scoreboard, which the widget reads for the score.
  for (const b of scoreboards(nba, epoch)) out[`sports-v1:live:${b.path}:${b.day}`] = { data: [live], via: 'ESPN' };
  return out;
}

// ---- Weather ----

function weather(epoch) {
  const hour0 = Math.floor(epoch / HOUR) * HOUR;
  // About 15° before dawn to 27° mid-afternoon.
  const tempAt = ms => {
    const d = new Date(ms);
    return 21 + 6 * Math.sin(((d.getHours() + d.getMinutes() / 60 - 9) / 24) * 2 * Math.PI);
  };
  const isDay = ms => {
    const h = new Date(ms).getHours();
    return h >= 7 && h < 18;
  };
  const hours = Array.from({ length: 48 }, (_, i) => {
    const at = hour0 + i * HOUR;
    return { at, temp: round(tempAt(at), 1), code: isDay(at) ? (i % 7 === 3 ? 2 : i % 3 === 0 ? 1 : 0) : 0, rain: null, isDay: isDay(at) };
  });
  const days = [1, 0, 0, 2, 0, 1, 0].map((code, i) => {
    const midnight = new Date(epoch + i * DAY);
    midnight.setHours(0, 0, 0, 0);
    const m = midnight.getTime();
    return { date: localDay(m), code, max: 27 + (i % 3), min: 18 + (i % 2), rain: null, sunrise: m + 6 * HOUR + (47 + i) * MIN, sunset: m + 17 * HOUR + (54 - i) * MIN };
  });
  const now = { at: hour0, temp: round(tempAt(epoch), 1), feels: round(tempAt(epoch) + 0.8, 1), humidity: 58, wind: 11.2, code: 0, isDay: true };
  return { [`weather-v1:${placeKey(PLACE)}`]: { data: { offset: 3 * 3600, now, hours, days }, via: 'Open-Meteo' } };
}

// Every entry, keyed without the 'newtab:cache:' prefix.
export function buildCache(epoch) {
  const entries = { ...markets(epoch), ...github(epoch), ...sports(epoch), ...weather(epoch) };
  return Object.fromEntries(Object.entries(entries).map(([key, e]) => [key, { at: epoch, ...e }]));
}
