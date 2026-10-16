// Markets widget: live crypto prices from Bybit and ECB exchange rates with sparklines, for the
// coins and currency pairs chosen in its ✎ editor. Each copy on the page has its own list; the
// prices are fetched once and shared through the request cache.

import { el, icon, svgEl, widgetHead, widgetSub, widgetEmpty } from './ui.js';
import { feed, fetchJson, peek } from './net.js';
import {
  parseTicker, parseKline, parseFxPair, fxCurrencies, isPair, formatPrice, formatRate, formatChange, sparkPoints, parseCoins,
} from './feeds.js';
import { copyById, TYPES } from './layout.js';

const PRICE_TTL = 30e3;
const KLINE_TTL = 5 * 60e3;
const FX_TTL = 60 * 60e3;
const REFRESH_MS = 30e3;
const RECONFIGURE_MS = 800;   // wait for typing to stop before refetching after a settings change
const SPARK = { w: 64, h: 18 };
const BYBIT = 'https://api.bybit.com/v5/market';
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
// Products offered by the editor (any other coin can be typed in). Coins are Bybit spot pairs
// against USDT; currency pairs use the ECB's daily reference rates.
const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'TRX', 'AVAX', 'LINK', 'DOT', 'LTC', 'SUI', 'HYPE'];
const PAIRS = ['USD/ILS', 'EUR/ILS', 'GBP/ILS', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF'];

const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const trendOf = change => (change > 0 ? 'up' : change < 0 ? 'down' : 'flat');

function sparkline(values, trend) {
  const svg = svgEl('svg', { viewBox: `0 0 ${SPARK.w} ${SPARK.h}`, preserveAspectRatio: 'none', class: `mk-spark ${trend}`, 'aria-hidden': 'true' });
  svg.append(svgEl('polyline', { points: sparkPoints(values, SPARK.w, SPARK.h) }));
  return svg;
}

export function mountMarkets(root, store, copy) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.markets.defaults();
  const items = () => settings().items;
  const prefs = () => store.get().prefs;
  const linkProps = href => (prefs().openInNewTab ? { href, target: '_blank', rel: 'noopener' } : { href });

  const marketList = el('div', { class: 'mk-list' });
  const marketEditor = el('div', { class: 'mk-editor', hidden: true });
  const editButton = el('button', { type: 'button', class: 'icon-btn widget-edit', onclick: () => setEditing(!editing) });
  const head = widgetHead('trend', 'Markets');
  head.append(editButton);
  const section = el('section', { class: 'widget widget-markets' }, head, marketList, marketEditor);
  root.append(section);

  // The symbol's link stretches over the whole row; chart is an optional link in the last column.
  function marketRow({ label, href, title, value, change, closes, chart }) {
    const trend = trendOf(change);
    return el('div', { class: 'mk-row' },
      el('a', { class: 'mk-sym', title, text: label, ...linkProps(href) }),
      closes.length > 1 ? sparkline(closes, trend) : el('span'),
      el('span', { class: 'mk-price', text: value }),
      el('span', { class: `mk-chg ${trend}`, text: change == null ? '' : formatChange(change) }),
      chart ? el('a', { class: 'mk-tv', title: chart.title, 'aria-label': chart.title, ...linkProps(chart.href) }, icon('candles', 15)) : el('span'));
  }

  const coinRow = ({ id, ticker, closes }) => marketRow({
    label: id,
    href: `https://www.bybit.com/en/trade/spot/${id}/USDT`,
    title: ticker ? `${id}/USDT on Bybit · 24h chart` : `No Bybit spot price for ${id}/USDT`,
    value: ticker ? formatPrice(ticker.price) : '—',
    change: ticker?.change ?? null,
    closes,
    chart: { href: `https://www.tradingview.com/chart/?symbol=BYBIT:${id}USDT`, title: `${id}/USDT chart on TradingView` },
  });

  const pairRow = ({ id, fx }) => marketRow({
    label: id,
    href: `https://www.google.com/finance/quote/${id.replace('/', '-')}`,
    title: fx ? `ECB reference rate for ${fx.date} · last ${fx.series.length} days` : `No ECB rate for ${id} yet`,
    value: fx ? formatRate(fx.rate) : '—',
    change: fx?.change ?? null,
    closes: fx?.series ?? [],
  });

  function renderMarkets(rows) {
    if (!rows.length) {
      marketList.replaceChildren(widgetEmpty('Nothing chosen. ',
        el('button', { type: 'button', class: 'link-btn', text: 'Choose products', onclick: () => setEditing(true) })));
      return;
    }
    marketList.replaceChildren(...rows.map(r => (isPair(r.id) ? pairRow(r) : coinRow(r))));
  }

  const marketKeys = coin => ({ ticker: `ticker:${coin}USDT`, kline: `kline:${coin}USDT` });
  // All pairs come from one request: the ECB's EUR rates for every currency they use.
  const fxKey = currencies => `fx:EUR:${currencies.join(',')}`;

  // Rows in the chosen order; coin(id) gives a coin's { ticker, closes }.
  const marketRows = (list, coin, fxTable) => list.map(id => (isPair(id)
    ? { id, fx: fxTable ? parseFxPair(fxTable, id) : null }
    : { id, ...coin(id) }));

  function renderCachedMarkets() {
    const list = items();
    const currencies = fxCurrencies(list);
    const fxTable = currencies.length ? peek(fxKey(currencies))?.data ?? null : null;
    renderMarkets(marketRows(list, id => ({
      ticker: peek(marketKeys(id).ticker)?.data ?? null,
      closes: peek(marketKeys(id).kline)?.data ?? [],
    }), fxTable));
  }

  async function loadCoin(coin) {
    const keys = marketKeys(coin);
    const symbol = `${coin}USDT`;
    const [ticker, kline] = await Promise.all([
      feed(keys.ticker, PRICE_TTL, async () => parseTicker(await fetchJson(`${BYBIT}/tickers?category=spot&symbol=${symbol}`))),
      feed(keys.kline, KLINE_TTL, async () => {
        const closes = parseKline(await fetchJson(`${BYBIT}/kline?category=spot&symbol=${symbol}&interval=60&limit=24`));
        return closes.length ? closes : null;
      }),
    ]);
    return [coin, { ticker: ticker.data, closes: kline.data ?? [] }];
  }

  async function loadFx(currencies) {
    if (!currencies.length) return null;
    const from = isoDay(Date.now() - 12 * 86400e3);
    const result = await feed(fxKey(currencies), FX_TTL, async () => {
      const json = await fetchJson(`${FRANKFURTER}/${from}..?from=EUR&to=${currencies.join(',')}`);
      return json?.rates ? { base: json.base, rates: json.rates } : null;
    });
    return result.data;
  }

  let seq = 0;
  async function loadMarkets() {
    const list = items();
    const my = ++seq;
    const [coins, fxTable] = await Promise.all([
      Promise.all(list.filter(id => !isPair(id)).map(loadCoin)).then(entries => new Map(entries)),
      loadFx(fxCurrencies(list)),
    ]);
    if (my === seq) renderMarkets(marketRows(list, id => coins.get(id), fxTable));
  }

  // ---- editor: ✎ swaps the rows for checkboxes; changes apply as they're made ----

  let editing = false;
  let customShown = [];   // typed-in coins stay listed while the editor is open, even unticked

  function setEditing(on) {
    editing = on;
    section.classList.toggle('editing', on);
    editButton.replaceChildren(icon(on ? 'check' : 'edit', 15));
    editButton.title = on ? 'Done' : 'Choose products';
    editButton.setAttribute('aria-label', editButton.title);
    editButton.setAttribute('aria-pressed', String(on));
    marketList.hidden = on;
    marketEditor.hidden = !on;
    if (on) {
      customShown = items().filter(id => !isPair(id) && !COINS.includes(id));
      renderEditor();
    }
  }

  function setItem(id, on) {
    store.update(s => {
      const own = copyById(s, copy.id);
      if (!own) return;
      const list = own.settings.items.filter(i => i !== id);
      if (on) list.push(id);
      own.settings.items = list;
    });
  }

  function checkbox(id) {
    const input = el('input', { type: 'checkbox', checked: items().includes(id), onchange: () => setItem(id, input.checked) });
    return el('label', { class: 'mk-check' }, input, el('span', { text: id }));
  }

  function renderEditor() {
    const input = el('input', {
      type: 'text', class: 'pref-input', placeholder: 'Other coin, e.g. PEPE', maxLength: 10,
      spellcheck: false, autocomplete: 'off', 'aria-label': 'Add a coin by its ticker',
    });
    const addForm = el('form', {
      class: 'mk-add',
      onsubmit: e => {
        e.preventDefault();
        const [coin] = parseCoins(input.value);
        if (!coin) return;
        if (!COINS.includes(coin) && !customShown.includes(coin)) customShown.push(coin);
        if (!items().includes(coin)) setItem(coin, true);
        renderEditor();
        marketEditor.querySelector('.mk-add input').focus();
      },
    }, input, el('button', { type: 'submit', class: 'btn', text: 'Add' }));
    marketEditor.replaceChildren(
      widgetSub('Crypto · Bybit, in USDT'),
      el('div', { class: 'mk-checks' }, [...COINS, ...customShown].map(checkbox)),
      addForm,
      widgetSub('Currencies · ECB daily rate'),
      el('div', { class: 'mk-checks' }, PAIRS.map(checkbox)));
  }

  setEditing(false);

  // ---- wiring ----

  let conf = null;
  let timer = 0;

  function onPrefs(state) {
    const own = copyById(state, copy.id);
    if (!own) return;
    // Under 3 cells wide there is no room for the sparklines.
    section.classList.toggle('narrow', own.w < 3);
    const next = JSON.stringify([own.settings.items, state.prefs.openInNewTab]);
    if (next === conf) return;
    const first = conf === null;
    conf = next;
    renderCachedMarkets();
    clearTimeout(timer);
    timer = setTimeout(loadMarkets, first ? 0 : RECONFIGURE_MS);
  }

  function refresh() {
    if (document.visibilityState === 'visible') loadMarkets();
  }

  const unsubscribe = store.subscribe(onPrefs, ['prefs']);
  onPrefs(store.get());
  const interval = setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', refresh);

  return {
    destroy() {
      seq++;   // a load still running draws nothing
      clearInterval(interval);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      unsubscribe();
    },
  };
}
