// Parsing and formatting for the Markets and GitHub widgets. Pure (unit-tested in Node).

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
    if (price == null) continue;
    quotes[q.symbol] = { price, change: (num(q.change_pct) ?? 0) / 100, name: String(q.name ?? q.symbol), time: String(q.last_timedate ?? '') };
  }
  return quotes;
}

// CNBC price bars (New York time, oldest first) → the closes of the latest regular session,
// 9:30 to 16:00, which is the session a quote's change is measured over.
export function parseCnbcSession(json) {
  const bars = json?.barData?.priceBars;
  if (!Array.isArray(bars)) return [];
  const session = bars
    .map(b => ({ day: String(b?.tradeTime).slice(0, 8), time: String(b?.tradeTime).slice(8, 12), close: Number(b?.close) }))
    .filter(b => b.time >= '0930' && b.time < '1600' && Number.isFinite(b.close));
  const last = session.at(-1)?.day;
  return session.filter(b => b.day === last).map(b => b.close);
}

// GitHub commit search results → commit rows, newest first, with the message's first line.
export function parseCommits(json) {
  if (!Array.isArray(json?.items)) return [];
  return json.items
    .map(i => ({
      sha: String(i.sha ?? '').slice(0, 7),
      message: String(i.commit?.message ?? '').split('\n')[0],
      repo: String(i.repository?.full_name ?? ''),
      url: i.html_url,
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

// GitHub issue search results (is:pr or is:issue) → PR or issue rows.
export function parseIssues(json) {
  if (!Array.isArray(json?.items)) return [];
  return json.items.map(i => ({
    title: String(i.title ?? ''),
    number: i.number,
    url: i.html_url,
    repo: String(i.repository_url ?? '').replace('https://api.github.com/repos/', ''),
    updatedAt: Date.parse(i.updated_at) || 0,
    draft: !!i.draft,
  }));
}

const grouped = (n, digits) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatPrice(n) {
  const abs = Math.abs(n);
  if (abs >= 10000) return grouped(n, 0);
  if (abs >= 100) return grouped(n, 2);
  if (abs >= 1) return grouped(n, 4);
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
export const isPair = id => id.includes('/');

// "btc, SOL xrp" → ['BTC', 'SOL', 'XRP'] (tickers only, no duplicates).
export function parseCoins(text) {
  const coins = String(text ?? '').toUpperCase().split(/[\s,;]+/).filter(c => COIN.test(c));
  return [...new Set(coins)];
}

// Markets items: coin tickers ('BTC') and currency pairs ('EUR/ILS'), valid ones once, in order.
// Anything but a list gives null.
export function cleanMarketItems(list) {
  if (!Array.isArray(list)) return null;
  const items = list
    .filter(i => typeof i === 'string')
    .map(i => i.trim().toUpperCase())
    .filter(i => COIN.test(i) || PAIR.test(i));
  return [...new Set(items)];
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
