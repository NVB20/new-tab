// Parsing and formatting for the Markets and GitHub widgets. Pure (unit-tested in Node).

import { onlyFrom } from './util.js';

// GitHub's own pages only: a row's link comes from the API's response.
const githubLink = url => onlyFrom('https://github.com/', url);

const finite = v => (Number.isFinite(v) ? v : null);

// Bybit /v5/market/tickers → { price, change } with change as a fraction (0.0118 = +1.18%).
export function parseTicker(json) {
  const t = json?.retCode === 0 ? json.result?.list?.[0] : null;
  if (!t) return null;
  const price = finite(Number(t.lastPrice));
  const change = finite(Number(t.price24hPcnt));
  return price == null ? null : { price, change: change ?? 0 };
}

// Bybit /v5/market/kline (newest first) → closing prices, oldest first.
export function parseKline(json) {
  const list = json?.retCode === 0 ? json.result?.list : null;
  if (!Array.isArray(list)) return [];
  return list.map(row => Number(row?.[4])).filter(Number.isFinite).reverse();
}

// Binance /api/v3/ticker/24hr → { price, change } like parseTicker's (Binance's change is in %).
export function parseBinanceTicker(json) {
  const price = finite(Number(json?.lastPrice));
  if (price == null) return null;
  return { price, change: (finite(Number(json.priceChangePercent)) ?? 0) / 100 };
}

// Binance /api/v3/klines (oldest first) → closing prices.
export function parseBinanceKline(json) {
  if (!Array.isArray(json)) return [];
  return json.map(row => Number(row?.[4])).filter(Number.isFinite);
}

// OKX /api/v5/market/ticker → { price, change }, the change since the price 24 hours ago.
export function parseOkxTicker(json) {
  const t = json?.code === '0' ? json.data?.[0] : null;
  const price = finite(Number(t?.last));
  if (price == null) return null;
  const open = finite(Number(t.open24h));
  return { price, change: open ? price / open - 1 : 0 };
}

// OKX /api/v5/market/candles (newest first) → closing prices, oldest first.
export function parseOkxCandles(json) {
  const list = json?.code === '0' ? json.data : null;
  if (!Array.isArray(list)) return [];
  return list.map(row => Number(row?.[4])).filter(Number.isFinite).reverse();
}

const NEW_YORK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

// One Yahoo Finance chart (the result of /v8/finance/chart, or one response of /v7/finance/spark)
// → { quote, info, bars }: the quote like parseCnbcQuotes' (change as a fraction, time on New
// York's clock), info its { type ('EQUITY', 'INDEX', …), currency, short name, decimals its price
// comes with }, the bars { at, close } oldest first. null without a price.
export function parseYahooChart(r) {
  const meta = r?.meta;
  const price = finite(meta?.regularMarketPrice);
  if (price == null) return null;
  const pct = finite(meta.regularMarketChangePercent);
  const prev = finite(meta.previousClose) ?? finite(meta.chartPreviousClose);
  const time = finite(meta.regularMarketTime);
  const closes = r.indicators?.quote?.[0]?.close;
  const bars = (Array.isArray(r.timestamp) ? r.timestamp : [])
    .map((t, i) => ({ at: t * 1000, close: Array.isArray(closes) ? closes[i] : null }))
    .filter(b => Number.isFinite(b.at) && finite(b.close) != null);
  return {
    quote: {
      price,
      change: pct != null ? pct / 100 : prev ? price / prev - 1 : 0,
      name: String(meta.longName ?? meta.shortName ?? meta.symbol ?? ''),
      time: time != null ? NEW_YORK.format(time * 1000) : '',
    },
    info: {
      type: String(meta.instrumentType ?? ''), currency: String(meta.currency ?? ''), short: String(meta.shortName ?? ''),
      decimals: finite(meta.priceHint),
    },
    bars,
  };
}

// Yahoo Finance's spark for several symbols (/v7/finance/spark) → { [symbol]: parseYahooChart }
// for the ones it has a price for.
export function parseYahooSpark(json) {
  const list = json?.spark?.result;
  const charts = Object.create(null);
  for (const r of Array.isArray(list) ? list : []) {
    const chart = parseYahooChart(r?.response?.[0]);
    if (chart && typeof r.symbol === 'string') charts[r.symbol] = chart;
  }
  return charts;
}

// A chart's closes: all of them (an index's latest session), or with lastDay those in the 24
// hours up to its last bar (a commodity's last day of trading, as parseCnbcDay).
export function yahooCloses(bars, lastDay = false) {
  const last = bars.at(-1)?.at;
  return bars.filter(b => !lastDay || b.at > last - 86400e3).map(b => b.close);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

// The ECB's own reference rates (its data API as CSV: a row per currency and day) → the table
// Frankfurter gives, { base: 'EUR', rates: { day: { USD: 1.12, … } } }; null without rates.
export function parseEcbRates(csv) {
  const [head = '', ...rows] = String(csv ?? '').trim().split(/\r?\n/);
  const cols = head.split(',');
  const [cur, day, value] = ['CURRENCY', 'TIME_PERIOD', 'OBS_VALUE'].map(c => cols.indexOf(c));
  if (cur < 0 || day < 0 || value < 0) return null;
  const rates = {};
  for (const row of rows) {
    const cells = row.split(',');
    const rate = Number(cells[value]);
    if (!CURRENCY.test(cells[cur]) || !DAY.test(cells[day]) || !(rate > 0)) continue;
    (rates[cells[day]] ??= {})[cells[cur]] = rate;
  }
  return Object.keys(rates).length ? { base: 'EUR', rates } : null;
}

// currency-api's daily snapshots of market rates (EUR-based, codes in lower case: { date, eur:
// { usd: 1.12, … } }) → the same table, for the currencies asked; null when none has them.
export function parseCurrencyApi(snapshots, currencies) {
  const rates = {};
  for (const s of snapshots) {
    if (!DAY.test(s?.date ?? '') || !s.eur) continue;
    const day = Object.fromEntries(currencies.filter(c => CURRENCY.test(c))
      .map(c => [c, s.eur[c.toLowerCase()]])
      .filter(([, rate]) => typeof rate === 'number' && rate > 0));
    if (Object.keys(day).length) rates[s.date] = day;
  }
  return Object.keys(rates).length ? { base: 'EUR', rates } : null;
}

// Frankfurter time series (one base, several currencies) → a pair's latest rate, its change from
// the previous day and the series. 'USD/ILS' is ILS per USD, so it's rate[ILS] / rate[USD].
export function parseFxPair(json, pair) {
  const [from, to] = pair.split('/');
  const base = json?.base ?? 'EUR';
  const rateOf = (day, cur) => (cur === base ? 1 : day[cur]);
  const days = Object.entries(json?.rates ?? {})
    .filter(([, day]) => typeof rateOf(day ?? {}, from) === 'number' && typeof rateOf(day ?? {}, to) === 'number')
    .sort(([a], [b]) => (a < b ? -1 : 1));
  if (!days.length) return null;
  const series = days.map(([, day]) => rateOf(day, to) / rateOf(day, from));
  const rate = series.at(-1);
  const prev = series.at(-2);
  return { rate, change: prev ? rate / prev - 1 : 0, date: days.at(-1)[0], series };
}

// Currencies (besides EUR, the ECB's base) needed for the chosen pairs, for one request.
export function fxCurrencies(items) {
  const set = new Set(items.filter(isPair).flatMap(p => p.split('/')));
  set.delete('EUR');
  return [...set].sort();
}

// CNBC quotes for several symbols → { [symbol]: { price, change, name, time } } for the ones it
// knows, with change as a fraction. Its numbers come formatted: '52,002.41', '-1.11%', 'UNCH'.
export function parseCnbcQuotes(json) {
  const list = json?.FormattedQuoteResult?.FormattedQuote;
  const num = v => finite(parseFloat(String(v).replace(/,/g, '')));
  const quotes = {};
  for (const q of Array.isArray(list) ? list : []) {
    const price = q?.code === 0 ? num(q.last) : null;
    if (price == null || q.symbol === '__proto__') continue;   // keyed by the response's symbols
    quotes[q.symbol] = { price, change: (num(q.change_pct) ?? 0) / 100, name: String(q.name ?? q.symbol), time: String(q.last_timedate ?? '') };
  }
  return quotes;
}

// CNBC price bars (New York time, oldest first) → the closes of the latest regular session,
// 9:30 to 16:00, which is the session a quote's change is measured over. A day with a single bar
// in those hours isn't one: on a weekend CNBC repeats Friday's close in a stray Saturday bar.
export function parseCnbcSession(json) {
  const bars = json?.barData?.priceBars;
  if (!Array.isArray(bars)) return [];
  const session = bars
    .map(b => ({ day: String(b?.tradeTime).slice(0, 8), time: String(b?.tradeTime).slice(8, 12), close: Number(b?.close) }))
    .filter(b => b.time >= '0930' && b.time < '1600' && Number.isFinite(b.close));
  const perDay = new Map();
  for (const b of session) perDay.set(b.day, (perDay.get(b.day) ?? 0) + 1);
  const last = [...perDay].filter(([, n]) => n > 1).at(-1)?.[0] ?? session.at(-1)?.day;
  return session.filter(b => b.day === last).map(b => b.close);
}

// CNBC price bars → the closes of the 24 hours up to the latest bar. Futures trade nearly around
// the clock, so that's their last day of trading, over a weekend too.
export function parseCnbcDay(json) {
  const bars = json?.barData?.priceBars;
  if (!Array.isArray(bars)) return [];
  const list = bars
    .map(b => ({ at: Number(b?.tradeTimeinMills), close: parseFloat(b?.close) }))
    .filter(b => Number.isFinite(b.at) && Number.isFinite(b.close));
  const last = list.at(-1)?.at;
  return list.filter(b => b.at > last - 86400e3).map(b => b.close);
}

// GitHub commit search results → commit rows, newest first, with the message's first line.
export function parseCommits(json) {
  if (!Array.isArray(json?.items)) return [];
  return json.items
    .map(i => ({
      sha: String(i.sha ?? '').slice(0, 7),
      message: String(i.commit?.message ?? '').split('\n')[0],
      repo: String(i.repository?.full_name ?? ''),
      url: githubLink(i.html_url),
      at: Date.parse(i.commit?.author?.date) || 0,
      private: !!i.repository?.private,
    }))
    .sort((a, b) => b.at - a.at);
}

// The newest commits across all repos; the same commit found twice is kept once.
export function latestCommits(commits, limit) {
  const seen = new Set();
  return [...commits]
    .sort((a, b) => b.at - a.at)
    .filter(c => !seen.has(c.repo + c.sha) && seen.add(c.repo + c.sha))
    .slice(0, limit);
}

// The repos with the newest commits, newest first, one row each: when the last commit was, and
// whether the repo is private.
export function latestRepos(commits, limit) {
  const byRepo = new Map();
  for (const c of [...commits].sort((a, b) => b.at - a.at)) {
    if (c.repo && !byRepo.has(c.repo)) byRepo.set(c.repo, { repo: c.repo, url: `https://github.com/${c.repo}`, at: c.at, private: c.private });
  }
  return [...byRepo.values()].slice(0, limit);
}

// A GitHub user (/users/<user>) and their repos (/users/<user>/repos) → followers, public repos,
// and the stars on the repos that aren't forks.
export function parseStats(user, repos) {
  const count = v => (Number.isInteger(v) && v > 0 ? v : 0);
  return {
    followers: count(user?.followers),
    repos: count(user?.public_repos),
    stars: (Array.isArray(repos) ? repos : []).filter(r => !r?.fork).reduce((sum, r) => sum + count(r?.stargazers_count), 0),
  };
}

// GitHub issue search results (is:pr or is:issue) → PR or issue rows.
export function parseIssues(json) {
  if (!Array.isArray(json?.items)) return [];
  return json.items.map(i => ({
    title: String(i.title ?? ''),
    number: i.number,
    url: githubLink(i.html_url),
    repo: String(i.repository_url ?? '').replace('https://api.github.com/repos/', ''),
    updatedAt: Date.parse(i.updated_at) || 0,
    draft: !!i.draft,
  }));
}

const grouped = (n, digits) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// most: at most this many decimals, the ones the quote comes with (a stock's 2).
export function formatPrice(n, most = 4) {
  const abs = Math.abs(n);
  if (abs >= 10000) return grouped(n, 0);
  if (abs >= 100) return grouped(n, Math.min(2, most));
  if (abs >= 1) return grouped(n, Math.min(4, most));
  return String(Number(n.toPrecision(4)));
}

export const formatRate = n => n.toFixed(4);

export function formatChange(fraction) {
  const pct = (Math.abs(fraction) * 100).toFixed(2);
  if (pct === '0.00') return '0.00%';
  return (fraction > 0 ? '+' : '−') + pct + '%';
}

// SVG polyline points for a sparkline filling a w×h box (highest value at the top).
export function sparkPoints(values, w, h) {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  const round = v => +v.toFixed(2);
  return values
    .map((v, i) => `${round((i / (values.length - 1)) * w)},${round(span ? h - ((v - min) / span) * h : h / 2)}`)
    .join(' ');
}

export function timeAgo(ms, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / (7 * 86400))}w`;
}

const COIN = /^[A-Z0-9]{2,10}$/;
const PAIR = /^[A-Z]{3}\/[A-Z]{3}$/;
// A symbol found with the search: '$' and its Yahoo Finance symbol ('$AAPL', '$TEVA.TA', '$^TA125.TA').
const SYMBOL = /^\$\^?[A-Z0-9][A-Z0-9.=&-]{0,19}$/;
export const SEGMENT_MAX = 24;
export const isPair = id => PAIR.test(id);
export const isSymbol = id => SYMBOL.test(id);
export const isSegment = item => item.startsWith('#');

// A currency pair's Yahoo Finance symbol: 'EUR/PLN' → 'EURPLN=X'.
export const pairSymbol = pair => `${pair.replace('/', '')}=X`;

// A found US ticker's symbol on CNBC (and TradingView), or null for other symbols. Yahoo Finance
// writes US tickers without an exchange's suffix, a share class after a dash ('BRK-B' is 'BRK.B').
export function usTicker(id) {
  const m = /^\$([A-Z]{1,5})(?:-([A-Z]))?$/.exec(id);
  return !m ? null : m[2] ? `${m[1]}.${m[2]}` : m[1];
}

// A found symbol's label: the Yahoo Finance symbol without '^' and a future's '=F', with its
// exchange's suffix ('TEVA.TA', 'ZN'); an index goes by its short name when that has 8 characters
// or fewer ('TA-125', 'S&P 500'), else by its symbol without the suffix ('IXIC').
export function symbolLabel(id, { type = '', short = '' } = {}) {
  const symbol = id.slice(1);
  const index = type === 'INDEX' || symbol.startsWith('^');
  const name = String(short).replace(/\s+/g, ' ').trim();
  if (index && name && name.length <= 8) return name;
  const bare = symbol.replace(/^\^/, '').replace(/=F$/, '');
  return index ? bare.replace(/\.[A-Z]+$/, '') : bare;
}

// Yahoo Finance's suffix for an exchange → its name on TradingView.
const TV_EXCHANGES = { TA: 'TASE', L: 'LSE', DE: 'XETR', T: 'TSE', HK: 'HKEX', TO: 'TSX', PA: 'EURONEXT', AS: 'EURONEXT', SW: 'SIX' };

// A found symbol's or a pair's name on TradingView, or null when it can't be told from Yahoo
// Finance's: a US ticker as CNBC writes it, a stock on an exchange above with its prefix
// ('TEVA.TA' → 'TASE:TEVA', '0700.HK' → 'HKEX:700'), a pair 'FX_IDC:EURPLN'. Not indexes or futures.
export function tradingViewSymbol(id) {
  if (isPair(id)) return `FX_IDC:${id.replace('/', '')}`;
  const us = usTicker(id);
  if (us) return us;
  const m = /^\$([A-Z0-9-]+)\.([A-Z]+)$/.exec(id);
  if (!m || !Object.hasOwn(TV_EXCHANGES, m[2])) return null;
  const code = m[2] === 'HK' ? m[1].replace(/^0+(?=\d)/, '') : m[1];
  return `${TV_EXCHANGES[m[2]]}:${code.replaceAll('-', '.')}`;
}

// What a Yahoo Finance price is counted in, for a row's hover: nothing for US dollars, else the
// currency, by its small unit where Yahoo gives that (Tel Aviv's agorot, London's pence).
export function priceUnit(currency) {
  const small = { ILA: 'agorot', GBp: 'pence', GBX: 'pence' };
  return currency === 'USD' || !currency ? '' : small[currency] ?? currency;
}

// Yahoo Finance's search types kept as found symbols, and their names.
const SEARCH_TYPES = { EQUITY: 'Stock', ETF: 'ETF', INDEX: 'Index', MUTUALFUND: 'Fund', FUTURE: 'Future' };

// Yahoo Finance's search (/v1/finance/search) → results to add, [{ id, label, name, meta }] in its
// order: a symbol in known (Yahoo symbol → listed item) is that item; a coin priced in USD the
// coin, priced on Bybit ('SOL-USD' → 'SOL'; 'PEPE24478-USD', CoinMarketCap's id telling coins of
// one name apart, → 'PEPE'); a currency the pair ('EURPLN=X' → 'EUR/PLN', 'ILS=X' → 'USD/ILS');
// a stock, ETF, index, fund or future '$' + its symbol. Anything else, and repeats, are dropped.
export function parseYahooSearch(json, known = {}) {
  const seen = new Set();
  return (Array.isArray(json?.quotes) ? json.quotes : []).flatMap(q => {
    const symbol = typeof q?.symbol === 'string' ? q.symbol.toUpperCase() : '';
    const name = String(q?.longname ?? q?.shortname ?? '').replace(/\s+/g, ' ').trim();
    const meta = [String(q?.exchDisp ?? '').trim(), SEARCH_TYPES[q?.quoteType]].filter(Boolean).join(' · ');
    let r = null;
    if (symbol && Object.hasOwn(known, symbol)) {
      r = { id: known[symbol], label: known[symbol], name, meta };
    } else if (q?.quoteType === 'CRYPTOCURRENCY') {
      const coin = /^([A-Z0-9]+)-USD$/.exec(symbol)?.[1].replace(/(?<=[A-Z])\d{4,}$/, '');
      if (coin && COIN.test(coin)) r = { id: coin, label: coin, name: name.replace(/ USD$/, ''), meta: 'Crypto · Bybit' };
    } else if (q?.quoteType === 'CURRENCY') {
      const m = /^([A-Z]{3})?([A-Z]{3})=X$/.exec(symbol);
      const id = m && `${m[1] ?? 'USD'}/${m[2]}`;
      if (m && id.slice(0, 3) !== m[2]) r = { id, label: id, name: '', meta: 'Currency' };
    } else if (Object.hasOwn(SEARCH_TYPES, q?.quoteType ?? '') && SYMBOL.test('$' + symbol)) {
      const id = '$' + symbol;
      r = { id, label: symbolLabel(id, { type: q.quoteType, short: q.shortname ?? '' }), name, meta };
    }
    if (!r || seen.has(r.id)) return [];
    seen.add(r.id);
    return r;
  });
}

// The listed products ([{ id, name }]) matching typed text, in order: an id starting with it
// ('go' → GOLD), a word of the name, or the whole name, starting with it ('gas' → NATGAS,
// 'bitcoin' → BTC), or a pair by its letters or either currency ('usd ils', 'eur/', 'ils').
export function searchProducts(products, text) {
  const t = String(text ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!t) return [];
  const letters = t.replace(/[\s/]+/g, '');
  return products.filter(({ id, name }) => {
    const words = name.toUpperCase();
    return id.startsWith(t) || words.startsWith(t) || words.split(/[\s/&-]+/).some(w => w && w.startsWith(t))
      || (isPair(id) && (id.replace('/', '').startsWith(letters) || id.slice(4) === letters));
  });
}

// "btc, SOL xrp" → ['BTC', 'SOL', 'XRP'] (tickers only, no duplicates).
export function parseCoins(text) {
  const coins = String(text ?? '').toUpperCase().split(/[\s,;]+/).filter(c => COIN.test(c));
  return [...new Set(coins)];
}

// A segment heading's entry in the Markets list for a typed name, or null when there's no name.
export function segmentItem(name) {
  const text = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, SEGMENT_MAX).trim();
  return text ? '#' + text : null;
}

// Markets items: coin tickers ('BTC'), currency pairs ('EUR/ILS'), found symbols ('$TEVA.TA')
// and segment headings ('#Crypto'), in order. Products are kept once, valid ones only; a heading
// keeps its case and may repeat. Anything but a list gives null.
export function cleanMarketItems(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  return list.filter(i => typeof i === 'string').map(i => i.trim()).flatMap(i => {
    if (isSegment(i)) return segmentItem(i.slice(1)) ?? [];
    const id = i.toUpperCase();
    if (!(COIN.test(id) || PAIR.test(id) || SYMBOL.test(id)) || seen.has(id)) return [];
    seen.add(id);
    return id;
  });
}

// Where the block of the Markets entry at i ends (exclusive): a heading's runs over its rows up to
// the next heading, a row's is the row alone.
export function blockEnd(items, i) {
  if (!isSegment(items[i])) return i + 1;
  let end = i + 1;
  while (end < items.length && !isSegment(items[end])) end++;
  return end;
}

// The Markets list with the entry at `from` (a heading with its rows) moved to just before index
// `to` of the list as it is (items.length for the end). A drop inside the block changes nothing.
export function moveMarketItem(items, from, to) {
  const end = blockEnd(items, from);
  if (to >= from && to <= end) return [...items];
  const rest = [...items.slice(0, from), ...items.slice(end)];
  rest.splice(to > end ? to - (end - from) : to, 0, ...items.slice(from, end));
  return rest;
}

// Where a dragged heading lands when dropped on the entry at `over` (in its top half when upper):
// a heading's top half puts it above that segment, anywhere else below the segment's last row.
// Rows that belong to no segment stay at the top, so a drop on them lands above the first heading.
export function headingDropIndex(items, over, upper) {
  let start = over;
  while (start >= 0 && !isSegment(items[start])) start--;
  if (start < 0) return items.findIndex(isSegment);
  return start === over && upper ? start : blockEnd(items, start);
}

// GitHub's contribution calendar (github.com/users/<user>/contributions) → each day's activity
// level (0–4) and count, oldest first, plus the yearly total. The count is in the tooltip that
// points at the day's cell id. null when the page has no calendar.
export function parseContributions(html) {
  const text = String(html ?? '');
  const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const counts = new Map();
  for (const [, tag, label] of text.matchAll(/<tool-tip\b([^>]*)>([^<]*)<\/tool-tip>/g)) {
    const n = label.trim().match(/^([\d,]+) contributions?\b/);
    counts.set(attr(tag, 'for'), n ? Number(n[1].replace(/,/g, '')) : 0);
  }
  const days = [];
  for (const [tag] of text.matchAll(/<td\b[^>]*\bdata-date="[^"]*"[^>]*>/g)) {
    const date = attr(tag, 'data-date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    days.push({ date, level: Math.min(4, Math.max(0, Number(attr(tag, 'data-level')) || 0)), count: counts.get(attr(tag, 'id')) ?? 0 });
  }
  if (!days.length) return null;
  days.sort((a, b) => (a.date < b.date ? -1 : 1));
  const total = text.match(/([\d,]+)\s+contributions?\s+in the last year/);
  return { total: total ? Number(total[1].replace(/,/g, '')) : days.reduce((n, d) => n + d.count, 0), days };
}

// The same calendar from github-contributions-api (jogruber.de), which reads GitHub's page and
// keeps a copy: { total: { lastYear }, contributions: [{ date, count, level }] } → as above, or null.
export function parseContributionsApi(json) {
  if (!Array.isArray(json?.contributions)) return null;
  const days = json.contributions
    .filter(d => DAY.test(d?.date ?? ''))
    .map(d => ({ date: d.date, level: Math.min(4, Math.max(0, Number(d.level) || 0)), count: Math.max(0, Number(d.count) || 0) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!days.length) return null;
  const total = json.total?.lastYear;
  return { total: Number.isInteger(total) && total >= 0 ? total : days.reduce((n, d) => n + d.count, 0), days };
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Grid positions for a contribution heatmap: one column per week, Sunday in row 0. A month is
// named above the column whose top day is one of its first seven days.
export function heatmapLayout(days) {
  if (!days.length) return { cols: 0, cells: [], months: [] };
  const dayNo = date => Date.parse(date + 'T00:00:00Z') / 86400e3;
  const start = dayNo(days[0].date) - new Date(days[0].date + 'T00:00:00Z').getUTCDay();
  const cells = days.map(d => {
    const i = dayNo(d.date) - start;
    return { ...d, col: Math.floor(i / 7), row: i % 7 };
  });
  const months = [];
  for (const c of cells) {
    const isTop = c.row === 0 || c === cells[0];
    const [, month, dom] = c.date.split('-').map(Number);
    if (isTop && dom <= 7) months.push({ col: c.col, label: MONTHS[month - 1] });
  }
  return { cols: cells.at(-1).col + 1, cells, months };
}
