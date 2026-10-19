// Economic calendar: this week's releases (CPI, rate decisions, jobs reports…) for the USA, the
// Eurozone and Israel, from TradingView's calendar, or ForexFactory's weekly feed while it's down.
// TradingView's API is unofficial and answers only requests with its own Origin, which a fetch
// can't set: the widget adds a session rule that sets it on this extension's own requests to that
// host (originRule). Pure (unit-tested in Node).

import { dayKey, dayLabel } from './sports.js';

export const LEVELS = ['high', 'medium', 'low'];
export const MARKETS = ['US', 'EU', 'IL'];
export const LEVEL_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };
export const MARKET_LABELS = { US: 'USA', EU: 'Eurozone', IL: 'Israel' };
const DEFAULT_LEVELS = ['high', 'medium'];

export const TV_API = 'https://economic-calendar.tradingview.com/events';
export const TV_HOST = 'economic-calendar.tradingview.com';
export const TV_ORIGIN = 'https://www.tradingview.com';
export const FF_FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
// The calendar's sources by the name a fetch reports (net.js firstOf), for the credit line.
export const SOURCES = {
  TradingView: 'https://www.tradingview.com/economic-calendar/',
  ForexFactory: 'https://www.forexfactory.com/calendar',
};

const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const DAYS = 7;              // today and the next 6
export const DUE_MS = 15 * MIN;     // how long a release with no number yet shows "Due"

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const minus = s => s.replace(/^-/, '−');

// ---- settings ----

// Known levels, each once, in LEVELS order.
const levelsIn = list => (Array.isArray(list) ? LEVELS.filter(l => list.includes(l)) : []);

// { markets: { US: levels, EU: levels, IL: levels } }: the importance levels each market shows; a
// market with none isn't shown, and one missing (say, added later) has none. With nothing on
// anywhere, every market shows High and Medium. Settings from before importance per market were
// one list of levels for the markets listed: { levels, markets: ['US', …] }.
export function cleanEcon(s) {
  const markets = {};
  if (Array.isArray(s?.markets)) {
    const levels = levelsIn(s.levels).length ? levelsIn(s.levels) : DEFAULT_LEVELS;
    for (const m of MARKETS) markets[m] = s.markets.includes(m) ? [...levels] : [];
  } else {
    for (const m of MARKETS) markets[m] = isObj(s?.markets) ? levelsIn(s.markets[m]) : [];
  }
  if (!MARKETS.some(m => markets[m].length)) for (const m of MARKETS) markets[m] = [...DEFAULT_LEVELS];
  return { markets };
}

// The markets shown: 'US, EU, IL', for the copy's title.
export const marketsSummary = markets => MARKETS.filter(m => markets[m]?.length).join(', ');

// ---- TradingView ----

// Yesterday to 9 days on, in whole UTC days: whatever the time zone, that holds today and the
// next 6 local days, and the address stays the same all day.
export function tvUrl(now) {
  const midnight = Math.floor(now / DAY) * DAY;
  const iso = ms => new Date(ms).toISOString();
  const params = new URLSearchParams({ from: iso(midnight - DAY), to: iso(midnight + 9 * DAY), countries: MARKETS.join(',') });
  return `${TV_API}?${params}`;
}

const ORIGIN_FILTER = `|${TV_API}?`;

// The session rule that gives this extension's requests to the calendar TradingView's Origin
// (a fetch can't set it). initiatorDomains: this extension's id, so no site's requests are
// touched, a site given to a Website widget included.
export const originRule = (extensionId, id) => ({
  id,
  priority: 1,
  action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'set', value: TV_ORIGIN }] },
  condition: { urlFilter: ORIGIN_FILTER, requestDomains: [TV_HOST], initiatorDomains: [extensionId], resourceTypes: ['xmlhttprequest'] },
});

export const isOriginRule = rule => rule?.action?.type === 'modifyHeaders' && rule.condition?.urlFilter === ORIGIN_FILTER;

const TV_LEVELS = { 1: 'high', 0: 'medium', '-1': 'low' };

// TradingView rates almost every Israeli release low, CPI included, and the Bank of Israel's
// decision medium. By indicator, ignoring case; the rest keep TradingView's rating.
const ISRAEL_LEVELS = {
  'interest rate': 'high',
  'inflation rate': 'high',
  'inflation rate mom': 'high',
  'gdp growth annualized': 'medium',
  'unemployment rate': 'medium',
};

const CURRENCY_UNITS = ['$', '€', '£', '₪'];
// One formatter for every value: toLocaleString with options builds a new one each call.
const DIGITS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

// '4.2%', '29K', '$9,743M', '−€7.8B', '87B cf'; '' for no value.
export function formatValue(n, unit, scale) {
  if (num(n) == null) return '';
  const digits = DIGITS.format(Math.abs(n));
  const sign = n < 0 ? '−' : '';
  const s = typeof scale === 'string' ? scale.slice(0, 2) : '';
  const u = typeof unit === 'string' ? unit.trim().slice(0, 8) : '';
  if (CURRENCY_UNITS.includes(u)) return `${sign}${u}${digits}${s}`;
  if (u === '%') return `${sign}${digits}${s}%`;
  return `${sign}${digits}${s}${u ? ` ${u}` : ''}`;
}

// ▲ or ▼: the actual against the forecast, or the previous when there's no forecast.
function moveOf(actual, forecast, previous) {
  const against = forecast ?? previous;
  if (actual == null || against == null || actual === against) return '';
  return actual > against ? 'up' : 'down';
}

// Midnight UTC exactly: TradingView's way of giving a date with no time (holidays, meetings).
const isDateOnly = iso => /T00:00:00(\.0+)?Z$/.test(iso);

function tvEvent(e) {
  if (!isObj(e) || !MARKETS.includes(e.country)) return null;
  const id = typeof e.id === 'string' || typeof e.id === 'number' ? String(e.id) : '';
  const title = text(e.title, 120);
  const at = typeof e.date === 'string' ? Date.parse(e.date) : NaN;
  if (!id || !title || !Number.isFinite(at)) return null;
  const indicator = text(e.indicator, 80).toLowerCase();
  const holiday = indicator === 'holidays';
  const allDay = holiday || isDateOnly(e.date);
  const rated = TV_LEVELS[e.importance] ?? 'low';
  const [actual, forecast, previous] = [e.actual, e.forecast, e.previous].map(num);
  return {
    id,
    market: e.country,
    kind: holiday ? 'holiday' : 'event',
    level: (e.country === 'IL' && ISRAEL_LEVELS[indicator]) || rated,
    title,
    period: text(e.period, 16),
    at,
    allDay,
    day: allDay ? e.date.slice(0, 10) : '',
    actual: formatValue(actual, e.unit, e.scale),
    forecast: formatValue(forecast, e.unit, e.scale),
    previous: formatValue(previous, e.unit, e.scale),
    move: moveOf(actual, forecast, previous),
    source: text(e.source, 80),
    about: text(e.comment, 400),
  };
}

// The events of a TradingView answer, or null when it isn't one.
export function parseTradingView(json) {
  if (!isObj(json) || json.status !== 'ok' || !Array.isArray(json.result)) return null;
  return json.result.map(tvEvent).filter(Boolean);
}

// ---- ForexFactory ----

const FF_MARKETS = { USD: 'US', EUR: 'EU' };
const FF_LEVELS = { High: 'high', Medium: 'medium', Low: 'low' };

function ffEvent(e) {
  if (!isObj(e)) return null;
  const market = FF_MARKETS[e.country];
  const title = text(e.title, 120);
  const at = typeof e.date === 'string' ? Date.parse(e.date) : NaN;
  if (!market || !title || !Number.isFinite(at)) return null;
  const holiday = e.impact === 'Holiday';
  return {
    id: `ff:${market}:${e.date}:${title}`,
    market,
    kind: holiday ? 'holiday' : 'event',
    level: FF_LEVELS[e.impact] ?? 'low',
    title,
    period: '',
    at,
    allDay: holiday,
    day: holiday ? e.date.slice(0, 10) : '',
    actual: '',
    forecast: minus(text(e.forecast, 16)),
    previous: minus(text(e.previous, 16)),
    move: '',
    source: '',
    about: '',
  };
}

// The USA's and the Eurozone's events in ForexFactory's weekly feed, or null when it isn't one.
export function parseForexFactory(json) {
  if (!Array.isArray(json)) return null;
  return json.map(ffEvent).filter(Boolean);
}

// ---- the calendar ----

const plusDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const hasNumbers = e => !!(e.forecast || e.previous);
const RANK = { high: 0, medium: 1, low: 2 };

// What a row is now: an all-day one; out (its number is in); due (a release whose number hasn't
// come yet, for DUE_MS); past; or ahead, where those at the first time ahead are next.
function stateOf(e, now, nextAt) {
  if (e.allDay) return 'allday';
  if (e.actual) return 'out';
  if (e.at <= now) return hasNumbers(e) && now - e.at < DUE_MS ? 'due' : 'past';
  return e.at === nextAt ? 'next' : 'later';
}

const byWhen = (a, b) =>
  (b.allDay - a.allDay) || (a.allDay ? (a.kind === 'holiday' ? -1 : 0) - (b.kind === 'holiday' ? -1 : 0) : a.at - b.at)
  || RANK[a.level] - RANK[b.level] || a.title.localeCompare(b.title);

// A copy's rows by local day, today and the next 6 ([{ day, label, events }], days with nothing
// shown left out): each market at its own levels (markets: { US: levels, … }), and holidays in
// every market shown, whatever the level.
export function calendar(events, { markets, now, timeZone, days = DAYS }) {
  const today = dayKey(now, timeZone);
  const last = plusDays(today, days - 1);
  const levelsOf = e => markets[e.market] ?? [];
  const shown = events
    .filter(e => levelsOf(e).length && (e.kind === 'holiday' || levelsOf(e).includes(e.level)))
    .map(e => ({ e, day: e.allDay ? e.day : dayKey(e.at, timeZone) }))
    .filter(({ day }) => day >= today && day <= last);
  const ahead = shown.filter(({ e }) => !e.allDay && e.at > now).map(({ e }) => e.at);
  const nextAt = ahead.length ? Math.min(...ahead) : null;
  const groups = new Map();
  for (const { e, day } of shown) {
    if (!groups.has(day)) groups.set(day, { day, label: dayLabel(day, today), events: [] });
    groups.get(day).events.push({ ...e, state: stateOf(e, now, nextAt) });
  }
  return [...groups.values()].sort((a, b) => a.day.localeCompare(b.day)).map(g => ({ ...g, events: g.events.sort(byWhen) }));
}

// 'in 14 m', 'in 2 h 14 m', 'in 3 h', 'in 2 d'.
export function untilLabel(at, now) {
  const minutes = Math.max(1, Math.ceil((at - now) / MIN));
  if (minutes < 60) return `in ${minutes} m`;
  if (minutes < 24 * 60) {
    const m = minutes % 60;
    return `in ${Math.floor(minutes / 60)} h${m ? ` ${m} m` : ''}`;
  }
  return `in ${Math.floor((at - now) / DAY)} d`;
}

// How long the saved calendar stays fresh for a copy showing `shown`: a minute while one of its
// releases is due (so the number shows soon after it's out), an hour from ForexFactory (it asks
// not to be fetched often, and has no numbers to wait for), else 15 minutes.
export function econTtl(shown, now, via) {
  if (via === 'ForexFactory') return HOUR;
  const due = shown.some(e => !e.allDay && !e.actual && hasNumbers(e) && e.at <= now && now - e.at < DUE_MS);
  return due ? MIN : 15 * MIN;
}
