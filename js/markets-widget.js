// Markets widget: live crypto prices from Bybit, US index and commodity quotes from CNBC and ECB
// exchange rates with sparklines, for the coins, indexes and currency pairs chosen in its ✎ editor, under segment
// headings added from its right-click menu, in the order they're dragged into. Each copy on the
// page has its own list; the prices are fetched once and shared through the request cache.

import { el, icon, svgEl, widgetHead, widgetSub, widgetEmpty, showMenu } from './ui.js';
import { feed, fetchJson, peek } from './net.js';
import {
  parseTicker, parseKline, parseFxPair, fxCurrencies, parseCnbcQuotes, parseCnbcSession, parseCnbcDay, isPair,
  isSegment, segmentItem, blockEnd, moveMarketItem, headingDropIndex, SEGMENT_MAX,
  formatPrice, formatRate, formatChange, sparkPoints, parseCoins,
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
const CNBC_QUOTES = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol';
const CNBC_BARS = 'https://ts-api.cnbc.com/harmony/app/bars';
// Products offered by the editor (any other coin can be typed in). Coins are Bybit spot pairs
// against USDT; indexes and commodities are CNBC quotes, by their symbol there and on
// TradingView (commodities are front-month futures, priced in their unit); currency pairs use the
// ECB's daily reference rates.
const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'TRX', 'AVAX', 'LINK', 'DOT', 'LTC', 'SUI', 'HYPE'];
const STOCKS = {
  SPY: { cnbc: 'SPY', tv: 'AMEX:SPY' },
  QQQ: { cnbc: 'QQQ', tv: 'NASDAQ:QQQ' },
  DJIA: { cnbc: '.DJI', tv: 'DJ:DJI' },
};
const COMMODITIES = {
  GOLD: { cnbc: '@GC.1', tv: 'COMEX:GC1!', unit: 'USD per troy ounce' },
  SILVER: { cnbc: '@SI.1', tv: 'COMEX:SI1!', unit: 'USD per troy ounce' },
  PLAT: { cnbc: '@PL.1', tv: 'NYMEX:PL1!', unit: 'USD per troy ounce' },
  COPPER: { cnbc: '@HG.1', tv: 'COMEX:HG1!', unit: 'USD per pound' },
  OIL: { cnbc: '@CL.1', tv: 'NYMEX:CL1!', unit: 'USD per barrel' },
  BRENT: { cnbc: '@LCO.1', tv: 'ICEEUR:BRN1!', unit: 'USD per barrel' },
  NATGAS: { cnbc: '@NG.1', tv: 'NYMEX:NG1!', unit: 'USD per MMBtu' },
  CORN: { cnbc: '@C.1', tv: 'CBOT:ZC1!', unit: 'US cents per bushel' },
  WHEAT: { cnbc: '@W.1', tv: 'CBOT:ZW1!', unit: 'US cents per bushel' },
  SOY: { cnbc: '@S.1', tv: 'CBOT:ZS1!', unit: 'US cents per bushel' },
  COFFEE: { cnbc: '@KC.1', tv: 'ICEUS:KC1!', unit: 'US cents per pound' },
  SUGAR: { cnbc: '@SB.1', tv: 'ICEUS:SB1!', unit: 'US cents per pound' },
  COCOA: { cnbc: '@CC.1', tv: 'ICEUS:CC1!', unit: 'USD per tonne' },
};
const CNBC = { ...STOCKS, ...COMMODITIES };
const PAIRS = ['USD/ILS', 'EUR/ILS', 'GBP/ILS', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF'];

const isCnbc = id => Object.hasOwn(CNBC, id);
const isCommodity = id => Object.hasOwn(COMMODITIES, id);
const isCoin = id => !isSegment(id) && !isPair(id) && !isCnbc(id);
const segmentName = item => item.slice(1);
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
  // The links don't drag on their own, so a drag anywhere on the row moves the row.
  function marketRow({ label, href, title, value, change, closes, chart }) {
    const trend = trendOf(change);
    return el('div', { class: 'mk-row' },
      el('a', { class: 'mk-sym', title, text: label, draggable: false, ...linkProps(href) }),
      closes.length > 1 ? sparkline(closes, trend) : el('span'),
      el('span', { class: 'mk-price', text: value }),
      el('span', { class: `mk-chg ${trend}`, text: change == null ? '' : formatChange(change) }),
      chart ? el('a', { class: 'mk-tv', title: chart.title, 'aria-label': chart.title, draggable: false, ...linkProps(chart.href) }, icon('candles', 15)) : el('span'));
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

  const cnbcRow = ({ id, quote, closes }) => marketRow({
    label: id,
    href: `https://www.cnbc.com/quotes/${CNBC[id].cnbc}`,
    title: !quote ? `No CNBC quote for ${id} yet`
      : `${quote.name}${CNBC[id].unit ? ` in ${CNBC[id].unit}` : ''} on CNBC · as of ${quote.time}`,
    value: quote ? formatPrice(quote.price) : '—',
    change: quote?.change ?? null,
    closes,
    chart: { href: `https://www.tradingview.com/chart/?symbol=${CNBC[id].tv}`, title: `${id} chart on TradingView` },
  });

  const pairRow = ({ id, fx }) => marketRow({
    label: id,
    href: `https://www.google.com/finance/quote/${id.replace('/', '-')}`,
    title: fx ? `ECB reference rate for ${fx.date} · last ${fx.series.length} days` : `No ECB rate for ${id} yet`,
    value: fx ? formatRate(fx.rate) : '—',
    change: fx?.change ?? null,
    closes: fx?.series ?? [],
  });

  // One entry of the list, a heading or a row, which knows its place in the items for dragging.
  function entryNode(r, index) {
    const node = isSegment(r.id) ? el('div', { class: 'mk-segment', dir: 'auto', text: segmentName(r.id) })
      : isPair(r.id) ? pairRow(r) : isCnbc(r.id) ? cnbcRow(r) : coinRow(r);
    node.dataset.index = index;
    node.draggable = true;
    return node;
  }

  let shownRows = [];   // the latest rows, drawn unless a drag or a segment's name box is open
  let naming = null;    // { at, rename }: the name box sits at index at, over the heading if rename
  let dragFrom = null;  // index of the entry being dragged

  // What the list was last drawn from: a refresh (every 30 s, and on every return to the tab)
  // that brings the same numbers leaves the rows alone.
  let drawn = '';
  const signature = rows => JSON.stringify([rows, prefs().openInNewTab]);

  function renderMarkets(rows) {
    shownRows = rows;
    if (!naming && dragFrom == null && signature(rows) !== drawn) draw();
  }

  function draw() {
    drawn = naming ? '' : signature(shownRows);
    if (!shownRows.length && !naming) {
      marketList.replaceChildren(widgetEmpty('Nothing chosen. ',
        el('button', { type: 'button', class: 'link-btn', text: 'Choose products', onclick: () => setEditing(true) })));
      return;
    }
    const nodes = shownRows.map(entryNode);
    if (naming) {
      const box = nameBox(naming.rename ? segmentName(shownRows[naming.at].id) : '');
      nodes.splice(naming.at, naming.rename ? 1 : 0, el('div', { class: 'mk-segment' }, box));
    }
    marketList.replaceChildren(...nodes);
  }

  const marketKeys = coin => ({ ticker: `ticker:${coin}USDT`, kline: `kline:${coin}USDT` });
  // All pairs come from one request: the ECB's EUR rates for every currency they use.
  const fxKey = currencies => `fx:EUR:${currencies.join(',')}`;
  // All indexes' and commodities' quotes come from one request too; each one's chart from its own.
  const cnbcOf = list => list.filter(isCnbc).sort();
  const quotesKey = ids => `cnbc:quotes:${ids.join(',')}`;
  const sessionKey = id => `cnbc:session:${id}`;

  // Rows in the chosen order, headings among them; coin(id) gives a coin's { ticker, closes },
  // cnbc(id) an index's or commodity's { quote, closes }.
  const marketRows = (list, coin, cnbc, fxTable) => list.map(id => (isSegment(id) ? { id }
    : isPair(id) ? { id, fx: fxTable ? parseFxPair(fxTable, id) : null }
    : { id, ...(isCnbc(id) ? cnbc(id) : coin(id)) }));

  function renderCachedMarkets() {
    const list = items();
    const currencies = fxCurrencies(list);
    const fxTable = currencies.length ? peek(fxKey(currencies))?.data ?? null : null;
    const ids = cnbcOf(list);
    const quotes = ids.length ? peek(quotesKey(ids))?.data ?? {} : {};
    renderMarkets(marketRows(list, id => ({
      ticker: peek(marketKeys(id).ticker)?.data ?? null,
      closes: peek(marketKeys(id).kline)?.data ?? [],
    }), id => ({
      quote: quotes[CNBC[id].cnbc] ?? null,
      closes: peek(sessionKey(id))?.data ?? [],
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

  async function loadCnbc(ids) {
    if (!ids.length) return new Map();
    const symbols = ids.map(id => CNBC[id].cnbc).join('|');
    const [quotes, sessions] = await Promise.all([
      feed(quotesKey(ids), PRICE_TTL, async () => {
        const table = parseCnbcQuotes(await fetchJson(`${CNBC_QUOTES}?symbols=${encodeURIComponent(symbols)}&requestMethod=itv&output=json`));
        return Object.keys(table).length ? table : null;
      }),
      Promise.all(ids.map(loadSession)),
    ]);
    return new Map(ids.map((id, i) => [id, { quote: quotes.data?.[CNBC[id].cnbc] ?? null, closes: sessions[i] }]));
  }

  // 10-minute bars of the last five days, which reach back over a long weekend: an index charts
  // its latest session, a commodity its last 24 hours of trading. CNBC reads the times in New
  // York; a day either side of UTC's is close enough here.
  async function loadSession(id) {
    const stamp = ms => isoDay(ms).replaceAll('-', '') + '000000';
    const parse = isCommodity(id) ? parseCnbcDay : parseCnbcSession;
    const result = await feed(sessionKey(id), KLINE_TTL, async () => {
      const span = `${stamp(Date.now() - 5 * 86400e3)}/${stamp(Date.now() + 86400e3)}`;
      const closes = parse(await fetchJson(`${CNBC_BARS}/${encodeURIComponent(CNBC[id].cnbc)}/10M/${span}/adjusted/EST5EDT.json`));
      return closes.length ? closes : null;
    });
    return result.data ?? [];
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
    const [coins, cnbc, fxTable] = await Promise.all([
      Promise.all(list.filter(isCoin).map(loadCoin)).then(entries => new Map(entries)),
      loadCnbc(cnbcOf(list)),
      loadFx(fxCurrencies(list)),
    ]);
    if (my === seq) renderMarkets(marketRows(list, id => coins.get(id), id => cnbc.get(id), fxTable));
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
      customShown = items().filter(id => isCoin(id) && !COINS.includes(id));
      renderEditor();
    }
  }

  // change gets a copy of this copy's items and returns the new list.
  function editItems(change) {
    store.update(s => {
      const own = copyById(s, copy.id);
      if (own) own.settings.items = change([...own.settings.items]);
    });
  }

  function setItem(id, on) {
    editItems(list => [...list.filter(i => i !== id), ...(on ? [id] : [])]);
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
        if (isCoin(coin) && !COINS.includes(coin) && !customShown.includes(coin)) customShown.push(coin);
        if (!items().includes(coin)) setItem(coin, true);
        renderEditor();
        marketEditor.querySelector('.mk-add input').focus();
      },
    }, input, el('button', { type: 'submit', class: 'btn', text: 'Add' }));
    marketEditor.replaceChildren(
      widgetSub('Crypto · Bybit, in USDT'),
      el('div', { class: 'mk-checks' }, [...COINS, ...customShown].map(checkbox)),
      addForm,
      widgetSub('US indexes · CNBC'),
      el('div', { class: 'mk-checks' }, Object.keys(STOCKS).map(checkbox)),
      widgetSub('Commodities · CNBC futures'),
      el('div', { class: 'mk-checks' }, Object.keys(COMMODITIES).map(checkbox)),
      widgetSub('Currencies · ECB daily rate'),
      el('div', { class: 'mk-checks' }, PAIRS.map(checkbox)));
  }

  setEditing(false);

  // ---- segments: headings added, renamed and removed from the right-click menu ----

  function nameBox(value) {
    const box = el('input', {
      type: 'text', class: 'mk-segment-edit', value, maxLength: SEGMENT_MAX, dir: 'auto', spellcheck: false,
      autocomplete: 'off', placeholder: 'Segment name', 'aria-label': 'Segment name',
      onkeydown: e => {
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        e.preventDefault();
        finishNaming(e.key === 'Enter' ? box.value : null);
      },
      onblur: () => finishNaming(box.value),
    });
    return box;
  }

  function startNaming(at, rename) {
    naming = { at, rename };
    draw();
    const box = marketList.querySelector('.mk-segment-edit');
    box.focus();
    box.select();
  }

  // name is null when cancelled; a blank name changes nothing.
  function finishNaming(name) {
    if (!naming) return;   // Enter already saved; this is the blur that follows
    const { at, rename } = naming;
    naming = null;
    draw();
    const item = name == null ? null : segmentItem(name);
    if (!item) return;
    editItems(list => {
      if (!rename) list.splice(at, 0, item);
      else if (isSegment(list[at] ?? '')) list[at] = item;
      return list;
    });
  }

  section.addEventListener('contextmenu', e => {
    if (editing || naming) return;
    e.preventDefault();
    const node = e.target.closest('.mk-list [data-index]');
    const at = node ? Number(node.dataset.index) : -1;
    const item = shownRows[at]?.id;
    const addAtEnd = { label: 'New segment', icon: 'plus', action: () => startNaming(shownRows.length, false) };
    const choose = { label: 'Choose products…', icon: 'edit', action: () => setEditing(true) };
    showMenu(e.clientX, e.clientY, !item ? [addAtEnd, choose]
      : isSegment(item) ? [
        { label: 'Rename', icon: 'edit', action: () => startNaming(at, true) },
        // Its rows stay, under the heading above.
        { label: 'Remove segment', icon: 'trash', action: () => editItems(list => list.filter((i, n) => n !== at || i !== item)) },
        { separator: true },
        addAtEnd,
      ] : [
        { label: 'New segment above', icon: 'plus', action: () => startNaming(at, false) },
        { label: `Remove ${item}`, icon: 'x', action: () => setItem(item, false) },
        { separator: true },
        choose,
      ]);
  });

  // ---- drag to reorder: a row lands above or below the row under the pointer; a heading takes
  // its rows along and lands between segments ----

  const MARKET_MIME = 'application/x-newtab-market';
  let dragIds = [];   // the items as they were drawn when the drag began
  let marked = null;

  const clearMark = () => {
    marked?.classList.remove('drop-before', 'drop-after');
    marked = null;
  };

  // The index in dragIds that the dragged block would land before, or null for no move.
  function dropIndex(e) {
    const node = e.target.closest?.('[data-index]');
    let to = dragIds.length;   // the empty space below the last entry
    if (node) {
      const over = Number(node.dataset.index);
      const r = node.getBoundingClientRect();
      const upper = e.clientY < r.top + r.height / 2;
      to = isSegment(dragIds[dragFrom]) ? headingDropIndex(dragIds, over, upper) : over + (upper ? 0 : 1);
    }
    return to >= dragFrom && to <= blockEnd(dragIds, dragFrom) ? null : to;
  }

  function endDrag() {
    if (dragFrom == null) return;
    dragFrom = null;
    clearMark();
    draw();   // with any prices that came in during the drag
  }

  marketList.addEventListener('dragstart', e => {
    const node = e.target.closest?.('[data-index]');
    if (!node || naming) return;
    dragFrom = Number(node.dataset.index);
    dragIds = shownRows.map(r => r.id);
    e.dataTransfer.setData(MARKET_MIME, node.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    const end = blockEnd(dragIds, dragFrom);
    for (const n of marketList.querySelectorAll('[data-index]')) {
      const i = Number(n.dataset.index);
      if (i >= dragFrom && i < end) n.classList.add('dragging');
    }
  });

  marketList.addEventListener('dragover', e => {
    if (dragFrom == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearMark();
    const to = dropIndex(e);
    if (to == null) return;
    const nodes = marketList.querySelectorAll('[data-index]');
    marked = nodes[to] ?? nodes[nodes.length - 1];
    marked.classList.add(nodes[to] ? 'drop-before' : 'drop-after');
  });

  marketList.addEventListener('dragleave', e => {
    if (!marketList.contains(e.relatedTarget)) clearMark();
  });

  marketList.addEventListener('drop', e => {
    if (dragFrom == null) return;
    e.preventDefault();
    const [from, to, ids] = [dragFrom, dropIndex(e), dragIds];
    endDrag();
    // Moved only if the list is still the one that was drawn (another tab may have changed it).
    if (to != null) editItems(list => (JSON.stringify(list) === JSON.stringify(ids) ? moveMarketItem(ids, from, to) : list));
  });

  marketList.addEventListener('dragend', endDrag);

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
    seq++;   // a load started for the old list (say, before a drag) draws nothing
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
