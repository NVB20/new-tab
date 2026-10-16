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

// Frankfurter time series → latest rate, its change from the previous day, and the series.
export function parseFxSeries(json, currency) {
  const days = Object.entries(json?.rates ?? {})
    .filter(([, r]) => typeof r?.[currency] === 'number')
    .sort(([a], [b]) => (a < b ? -1 : 1));
  if (!days.length) return null;
  const series = days.map(([, r]) => r[currency]);
  const rate = series.at(-1);
  const prev = series.at(-2);
  return { rate, change: prev ? rate / prev - 1 : 0, date: days.at(-1)[0], series };
}

export function parseRepos(json) {
  if (!Array.isArray(json)) return [];
  return json
    .filter(r => r && typeof r.full_name === 'string')
    .map(r => ({ name: r.full_name, url: r.html_url, pushedAt: Date.parse(r.pushed_at) || 0, private: !!r.private }));
}

export function mergeRepos(lists, limit) {
  const byName = new Map();
  for (const repo of lists.flat()) if (!byName.has(repo.name)) byName.set(repo.name, repo);
  return [...byName.values()].sort((a, b) => b.pushedAt - a.pushedAt).slice(0, limit);
}

// GitHub issue search results (is:pr) → PR rows.
export function parsePulls(json) {
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

// "btc, SOL xrp" → ['BTC', 'SOL', 'XRP'] (tickers only, no duplicates).
export function parseCoins(text) {
  const coins = String(text ?? '').toUpperCase().split(/[\s,;]+/).filter(c => /^[A-Z0-9]{2,10}$/.test(c));
  return [...new Set(coins)];
}

export function parseNames(text) {
  return String(text ?? '').split(/[\s,]+/).filter(Boolean);
}
