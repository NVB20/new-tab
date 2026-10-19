// Markets widget: live crypto prices from Bybit, US index and commodity quotes from CNBC, and any
// stock, index, fund, future or currency pair from Yahoo Finance, with sparklines, for the
// products ticked or found with the search in its ✎ editor, under segment headings added from its
// right-click menu, in the order they're dragged into. Each copy on the page has its own list; the
// prices are fetched once and shared through the request cache. Each kind has sources to fall
// back on while its own is down: Binance and OKX, Yahoo Finance, CNBC, and the ECB's daily rates.

import { el, icon, svgEl, widgetHead, widgetSub, widgetEmpty, showMenu } from './ui.js';
import { feed, fetchJson, fetchText, peek } from './net.js';
import {
  parseTicker, parseKline, parseBinanceTicker, parseBinanceKline, parseOkxTicker, parseOkxCandles,
  parseFxPair, fxCurrencies, parseEcbRates, parseCurrencyApi, parseCnbcQuotes, parseCnbcSession, parseCnbcDay,
  parseYahooChart, parseYahooSpark, yahooCloses, isPair, isSymbol, pairSymbol, usTicker, symbolLabel,
  tradingViewSymbol, priceUnit, parseYahooSearch, searchProducts,
  isSegment, segmentItem, blockEnd, moveMarketItem, headingDropIndex, SEGMENT_MAX,
  formatPrice, formatRate, formatChange, sparkPoints,
} from './feeds.js';
import { copyById, TYPES } from './layout.js';

const PRICE_TTL = 30e3;
const KLINE_TTL = 5 * 60e3;
const FX_TTL = 60 * 60e3;
const REFRESH_MS = 30e3;
const RECONFIGURE_MS = 800;   // wait for typing to stop before refetching after a settings change
const SPARK = { w: 64, h: 18 };
const BYBIT = 'https://api.bybit.com/v5/market';
const BINANCE = 'https://data-api.binance.vision/api/v3';   // Binance's market data host
const OKX = 'https://www.okx.com/api/v5/market';
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
const ECB = 'https://data-api.ecb.europa.eu/service/data/EXR';
const CNBC_QUOTES = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol';
const CNBC_BARS = 'https://ts-api.cnbc.com/harmony/app/bars';
const YAHOO = 'https://query1.finance.yahoo.com';
const SPARK_MAX = 20;          // symbols Yahoo Finance's spark answers in one request
const SEARCH_WAIT_MS = 300;    // wait for typing to stop before searching
const SEARCH_LIMIT = 8;        // results shown
const SEARCH_LISTED = 4;       // of them, the listed products shown first, at most
// Products listed in the editor, with names to search them by (anything else is found with the
// search). Coins are Bybit spot pairs against USDT; indexes and commodities are CNBC quotes, by
// their symbol there, on Yahoo Finance and on TradingView (commodities are front-month futures,
// priced in their unit); currency pairs, like found symbols, are Yahoo Finance's.
const COINS = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', BNB: 'BNB', DOGE: 'Dogecoin', ADA: 'Cardano',
  TRX: 'TRON', AVAX: 'Avalanche', LINK: 'Chainlink', DOT: 'Polkadot', LTC: 'Litecoin', SUI: 'Sui', HYPE: 'Hyperliquid',
};
const STOCKS = {
  SPY: { cnbc: 'SPY', yahoo: 'SPY', tv: 'AMEX:SPY', name: 'S&P 500 ETF' },
  QQQ: { cnbc: 'QQQ', yahoo: 'QQQ', tv: 'NASDAQ:QQQ', name: 'Nasdaq-100 ETF' },
  DJIA: { cnbc: '.DJI', yahoo: '^DJI', tv: 'DJ:DJI', name: 'Dow Jones Industrial Average' },
};
const COMMODITIES = {
  GOLD: { cnbc: '@GC.1', yahoo: 'GC=F', tv: 'COMEX:GC1!', unit: 'USD per troy ounce', name: 'Gold' },
  SILVER: { cnbc: '@SI.1', yahoo: 'SI=F', tv: 'COMEX:SI1!', unit: 'USD per troy ounce', name: 'Silver' },
  PLAT: { cnbc: '@PL.1', yahoo: 'PL=F', tv: 'NYMEX:PL1!', unit: 'USD per troy ounce', name: 'Platinum' },
  COPPER: { cnbc: '@HG.1', yahoo: 'HG=F', tv: 'COMEX:HG1!', unit: 'USD per pound', name: 'Copper' },
  OIL: { cnbc: '@CL.1', yahoo: 'CL=F', tv: 'NYMEX:CL1!', unit: 'USD per barrel', name: 'WTI crude oil' },
  BRENT: { cnbc: '@LCO.1', yahoo: 'BZ=F', tv: 'ICEEUR:BRN1!', unit: 'USD per barrel', name: 'Brent crude oil' },
  NATGAS: { cnbc: '@NG.1', yahoo: 'NG=F', tv: 'NYMEX:NG1!', unit: 'USD per MMBtu', name: 'Natural gas' },
  CORN: { cnbc: '@C.1', yahoo: 'ZC=F', tv: 'CBOT:ZC1!', unit: 'US cents per bushel', name: 'Corn' },
  WHEAT: { cnbc: '@W.1', yahoo: 'ZW=F', tv: 'CBOT:ZW1!', unit: 'US cents per bushel', name: 'Wheat' },
  SOY: { cnbc: '@S.1', yahoo: 'ZS=F', tv: 'CBOT:ZS1!', unit: 'US cents per bushel', name: 'Soybeans' },
  COFFEE: { cnbc: '@KC.1', yahoo: 'KC=F', tv: 'ICEUS:KC1!', unit: 'US cents per pound', name: 'Coffee' },
  SUGAR: { cnbc: '@SB.1', yahoo: 'SB=F', tv: 'ICEUS:SB1!', unit: 'US cents per pound', name: 'Sugar' },
  COCOA: { cnbc: '@CC.1', yahoo: 'CC=F', tv: 'ICEUS:CC1!', unit: 'USD per tonne', name: 'Cocoa' },
};
// The exchanges a coin's price and 24h chart come from, in turn: another answers while Bybit is
// down or doesn't list the coin. Each with its trading page and its name on TradingView.
const EXCHANGES = [
  {
    name: 'Bybit',
    priceUrl: coin => `${BYBIT}/tickers?category=spot&symbol=${coin}USDT`, readPrice: parseTicker,
    chartUrl: coin => `${BYBIT}/kline?category=spot&symbol=${coin}USDT&interval=60&limit=24`, readChart: parseKline,
    trade: coin => `https://www.bybit.com/en/trade/spot/${coin}/USDT`, tv: 'BYBIT',
  },
  {
    name: 'Binance',
    priceUrl: coin => `${BINANCE}/ticker/24hr?symbol=${coin}USDT`, readPrice: parseBinanceTicker,
    chartUrl: coin => `${BINANCE}/klines?symbol=${coin}USDT&interval=1h&limit=24`, readChart: parseBinanceKline,
    trade: coin => `https://www.binance.com/en/trade/${coin}_USDT`, tv: 'BINANCE',
  },
  {
    name: 'OKX',
    priceUrl: coin => `${OKX}/ticker?instId=${coin}-USDT`, readPrice: parseOkxTicker,
    chartUrl: coin => `${OKX}/candles?instId=${coin}-USDT&bar=1H&limit=24`, readChart: parseOkxCandles,
    trade: coin => `https://www.okx.com/trade-spot/${coin.toLowerCase()}-usdt`, tv: 'OKX',
  },
];
const exchangeNamed = name => EXCHANGES.find(x => x.name === name) ?? EXCHANGES[0];
// currency-api (market rates, a snapshot a day) on its CDN and on its mirror.
const CURRENCY_API = [
  ['currency-api', day => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day === 'latest' ? 'latest' : day.replaceAll('-', '.')}/v1/currencies/eur.min.json`],
  ['currency-api mirror', day => `https://${day}.currency-api.pages.dev/v1/currencies/eur.min.json`],
];
const CNBC = { ...STOCKS, ...COMMODITIES };
const PAIRS = ['USD/ILS', 'EUR/ILS', 'GBP/ILS', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF'];
// What the search finds among the listed products with no request, and the Yahoo Finance symbols
// it reads as them.
const PRODUCTS = [
  ...Object.entries(COINS).map(([id, name]) => ({ id, name, meta: 'Crypto · Bybit' })),
  ...Object.entries(STOCKS).map(([id, s]) => ({ id, name: s.name, meta: 'US index · CNBC' })),
  ...Object.entries(COMMODITIES).map(([id, c]) => ({ id, name: c.name, meta: 'Commodity · CNBC' })),
  ...PAIRS.map(id => ({ id, name: '', meta: 'Currency' })),
];
const LISTED_SYMBOLS = Object.fromEntries(Object.entries(CNBC).map(([id, s]) => [s.yahoo, id]));

const isCnbc = id => Object.hasOwn(CNBC, id);
const isCommodity = id => Object.hasOwn(COMMODITIES, id);
// Found symbols and currency pairs are quoted by Yahoo Finance.
const isYahoo = id => isSymbol(id) || isPair(id);
const isCoin = id => !isSegment(id) && !isYahoo(id) && !isCnbc(id);
const isListed = id => Object.hasOwn(COINS, id) || isCnbc(id) || PAIRS.includes(id);
const yahooSymbol = id => (isPair(id) ? pairSymbol(id) : id.slice(1));
// While Yahoo Finance is down, a found US ticker is quoted by CNBC like the listed indexes.
const cnbcSpec = id => (isCnbc(id) ? CNBC[id] : { cnbc: usTicker(id), yahoo: id.slice(1) });
// A row's label: a found symbol's from its symbol (and an index's short name), else the item.
const rowLabel = (id, info) => (isSymbol(id) ? symbolLabel(id, info) : id);
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

  // A row links to the exchange its price came from.
  const coinRow = ({ id, ticker, closes, via }) => {
    const x = exchangeNamed(via);
    return marketRow({
      label: id,
      href: x.trade(id),
      title: ticker ? `${id}/USDT on ${x.name} · 24h chart` : `No spot price for ${id}/USDT on Bybit, Binance or OKX`,
      value: ticker ? formatPrice(ticker.price) : '—',
      change: ticker?.change ?? null,
      closes,
      chart: { href: `https://www.tradingview.com/chart/?symbol=${x.tv}:${id}USDT`, title: `${id}/USDT chart on TradingView` },
    });
  };

  const cnbcRow = ({ id, quote, closes, via }) => {
    const yahoo = via === 'Yahoo Finance';
    return marketRow({
      label: id,
      href: yahoo ? `https://finance.yahoo.com/quote/${encodeURIComponent(CNBC[id].yahoo)}` : `https://www.cnbc.com/quotes/${CNBC[id].cnbc}`,
      title: !quote ? `No quote for ${id} yet`
        : `${quote.name}${CNBC[id].unit ? ` in ${CNBC[id].unit}` : ''} on ${yahoo ? 'Yahoo Finance' : 'CNBC'} · as of ${quote.time}`,
      value: quote ? formatPrice(quote.price) : '—',
      change: quote?.change ?? null,
      closes,
      chart: { href: `https://www.tradingview.com/chart/?symbol=${CNBC[id].tv}`, title: `${id} chart on TradingView` },
    });
  };

  // A found symbol or a pair, from Yahoo Finance; while it's down a US ticker's from CNBC, a pair's
  // the ECB's daily rate (date: its day) or currency-api's.
  const quoteRow = ({ id, quote, info, closes = [], via, date }) => {
    const label = rowLabel(id, info);
    const pair = isPair(id);
    const unit = pair ? '' : priceUnit(info?.currency);
    const tv = tradingViewSymbol(id);
    return marketRow({
      label,
      href: via === 'CNBC' ? `https://www.cnbc.com/quotes/${usTicker(id)}` : `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol(id))}`,
      title: !quote ? `No quote for ${label}`
        : date && via?.startsWith('currency-api') ? `Market rate for ${date} (currency-api, while Yahoo Finance and the ECB can't be reached)`
          : date ? `ECB reference rate for ${date} (while Yahoo Finance can't be reached) · last ${closes.length} days`
            : `${quote.name || label}${unit ? ` in ${unit}` : ''} on ${via} · as of ${quote.time}`,
      value: !quote ? '—' : pair ? formatRate(quote.price) : formatPrice(quote.price, info?.decimals ?? undefined),
      change: quote?.change ?? null,
      closes,
      chart: tv && { href: `https://www.tradingview.com/chart/?symbol=${tv}`, title: `${label} chart on TradingView` },
    });
  };

  // One entry of the list, a heading or a row, which knows its place in the items for dragging.
  function entryNode(r, index) {
    const node = isSegment(r.id) ? el('div', { class: 'mk-segment', dir: 'auto', text: segmentName(r.id) })
      : isYahoo(r.id) ? quoteRow(r) : isCnbc(r.id) ? cnbcRow(r) : coinRow(r);
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
  // While Yahoo Finance is down, all pairs come from one request: the ECB's EUR rates for every
  // currency they use.
  const fxKey = currencies => `fx:EUR:${currencies.join(',')}`;
  // All indexes' and commodities' quotes come from one request too; each one's chart from its own.
  const cnbcOf = list => list.filter(isCnbc).sort();
  const quotesKey = ids => `cnbc:quotes:${ids.join(',')}`;
  const sessionKey = id => `cnbc:session:${id}`;
  // All found symbols' and pairs' quotes and charts come from Yahoo Finance's spark, by item.
  const yahooOf = list => list.filter(isYahoo).sort();
  const yahooKey = ids => `yahoo:quotes:${ids.join(',')}`;

  // Rows in the chosen order, headings among them; coin(id) gives a coin's { ticker, closes, via },
  // cnbc(id) an index's or commodity's { quote, closes, via }, yahoo the found symbols' and pairs'
  // { quote, info, closes, via, date } by item.
  const marketRows = (list, coin, cnbc, yahoo) => list.map(id => (isSegment(id) ? { id }
    : isYahoo(id) ? { id, ...(Object.hasOwn(yahoo, id) ? yahoo[id] : null) }
    : { id, ...(isCnbc(id) ? cnbc(id) : coin(id)) }));

  const cachedYahoo = list => {
    const ids = yahooOf(list);
    return (ids.length && peek(yahooKey(ids))?.data) || {};
  };

  function renderCachedMarkets() {
    const list = items();
    const ids = cnbcOf(list);
    const quotes = ids.length ? peek(quotesKey(ids)) : null;
    renderMarkets(marketRows(list, id => {
      const ticker = peek(marketKeys(id).ticker);
      return { ticker: ticker?.data ?? null, closes: peek(marketKeys(id).kline)?.data ?? [], via: ticker?.via };
    }, id => ({
      quote: quotes?.data?.[CNBC[id].cnbc] ?? null,
      closes: peek(sessionKey(id))?.data ?? [],
      via: quotes?.via,
    }), cachedYahoo(list)));
  }

  // Price and chart each from the first exchange that has the coin.
  async function loadCoin(coin) {
    const keys = marketKeys(coin);
    const [ticker, kline] = await Promise.all([
      feed(keys.ticker, PRICE_TTL, EXCHANGES.map(x => ({ name: x.name, load: async () => x.readPrice(await fetchJson(x.priceUrl(coin))) }))),
      feed(keys.kline, KLINE_TTL, EXCHANGES.map(x => ({
        name: x.name,
        load: async () => {
          const closes = x.readChart(await fetchJson(x.chartUrl(coin)));
          return closes.length ? closes : null;
        },
      }))),
    ]);
    return [coin, { ticker: ticker.data, closes: kline.data ?? [], via: ticker.via }];
  }

  // Listed indexes' and commodities' quotes, or found US tickers' while Yahoo Finance is down, keyed
  // by CNBC's symbols, whichever source gave them.
  async function loadCnbc(ids) {
    if (!ids.length) return new Map();
    const spec = Object.fromEntries(ids.map(id => [id, cnbcSpec(id)]));
    const symbols = ids.map(id => spec[id].cnbc).join('|');
    const [quotes, sessions] = await Promise.all([
      feed(quotesKey(ids), PRICE_TTL, [
        {
          name: 'CNBC',
          load: async () => {
            const table = parseCnbcQuotes(await fetchJson(`${CNBC_QUOTES}?symbols=${encodeURIComponent(symbols)}&requestMethod=itv&output=json`));
            return Object.keys(table).length ? table : null;
          },
        },
        {
          name: 'Yahoo Finance',
          load: async () => {
            const charts = parseYahooSpark(await fetchJson(`${YAHOO}/v7/finance/spark?symbols=${encodeURIComponent(ids.map(id => spec[id].yahoo).join(','))}&range=1d&interval=5m`));
            const found = ids.filter(id => charts[spec[id].yahoo]);
            return found.length ? Object.fromEntries(found.map(id => [spec[id].cnbc, charts[spec[id].yahoo].quote])) : null;
          },
        },
      ]),
      Promise.all(ids.map(loadSession)),
    ]);
    return new Map(ids.map((id, i) => [id, { quote: quotes.data?.[spec[id].cnbc] ?? null, closes: sessions[i], via: quotes.via }]));
  }

  // 10-minute bars of the last five days, which reach back over a long weekend: an index charts
  // its latest session, a commodity its last 24 hours of trading. CNBC reads the times in New
  // York; a day either side of UTC's is close enough here. Yahoo Finance gives an index's latest
  // session (5-minute bars) and two days of a commodity's (15-minute bars) to take 24 hours of.
  async function loadSession(id) {
    const stamp = ms => isoDay(ms).replaceAll('-', '') + '000000';
    const spec = cnbcSpec(id);
    const commodity = isCommodity(id);
    const parse = commodity ? parseCnbcDay : parseCnbcSession;
    const result = await feed(sessionKey(id), KLINE_TTL, [
      {
        name: 'CNBC',
        load: async () => {
          const span = `${stamp(Date.now() - 5 * 86400e3)}/${stamp(Date.now() + 86400e3)}`;
          const closes = parse(await fetchJson(`${CNBC_BARS}/${encodeURIComponent(spec.cnbc)}/10M/${span}/adjusted/EST5EDT.json`));
          return closes.length ? closes : null;
        },
      },
      {
        name: 'Yahoo Finance',
        load: async () => {
          const range = commodity ? 'range=2d&interval=15m' : 'range=1d&interval=5m';
          const chart = parseYahooChart((await fetchJson(`${YAHOO}/v8/finance/chart/${encodeURIComponent(spec.yahoo)}?${range}`))?.chart?.result?.[0]);
          const closes = chart ? yahooCloses(chart.bars, commodity) : [];
          return closes.length ? closes : null;
        },
      },
    ]);
    return result.data ?? [];
  }

  // Market rates for a day and the day before, from one host of currency-api.
  async function currencyApi(url, currencies) {
    const latest = await fetchJson(url('latest'));
    const before = Date.parse(latest?.date) - 86400e3;
    const previous = Number.isFinite(before) ? await fetchJson(url(isoDay(before))).catch(() => null) : null;
    return parseCurrencyApi([previous, latest], currencies);
  }

  // Frankfurter's copy of the ECB's rates, else the ECB's own, else currency-api's market rates.
  async function loadFx(currencies) {
    if (!currencies.length) return { table: null };
    const from = isoDay(Date.now() - 12 * 86400e3);
    const result = await feed(fxKey(currencies), FX_TTL, [
      {
        name: 'Frankfurter',
        load: async () => {
          const json = await fetchJson(`${FRANKFURTER}/${from}..?from=EUR&to=${currencies.join(',')}`);
          return json?.rates ? { base: json.base, rates: json.rates } : null;
        },
      },
      {
        name: 'ECB',
        load: async () => parseEcbRates(await fetchText(`${ECB}/D.${currencies.join('+')}.EUR.SP00.A?startPeriod=${from}&detail=dataonly&format=csvdata`)),
      },
      ...CURRENCY_API.map(([name, url]) => ({ name, load: () => currencyApi(url, currencies) })),
    ]);
    return { table: result.data, via: result.via };
  }

  // Found symbols' and pairs' quotes, with today's closes, by item: from Yahoo Finance's spark (in
  // batches of SPARK_MAX), else from the backups.
  async function loadYahoo(ids) {
    if (!ids.length) return {};
    const result = await feed(yahooKey(ids), PRICE_TTL, [
      {
        name: 'Yahoo Finance',
        load: async () => {
          const batches = [];
          for (let i = 0; i < ids.length; i += SPARK_MAX) batches.push(ids.slice(i, i + SPARK_MAX));
          const charts = Object.assign(Object.create(null), ...await Promise.all(batches.map(async batch =>
            parseYahooSpark(await fetchJson(`${YAHOO}/v7/finance/spark?symbols=${encodeURIComponent(batch.map(yahooSymbol).join(','))}&range=1d&interval=5m`)))));
          const found = ids.filter(id => charts[yahooSymbol(id)]);
          return found.length ? Object.fromEntries(found.map(id => {
            const { quote, info, bars } = charts[yahooSymbol(id)];
            return [id, { quote, info, closes: yahooCloses(bars), via: 'Yahoo Finance' }];
          })) : null;
        },
      },
      { name: 'CNBC and the ECB', load: () => yahooBackup(ids) },
    ]);
    return result.data ?? {};
  }

  // While Yahoo Finance is down: found US tickers from CNBC, with their session's closes, and pairs
  // from the ECB's daily rates (or currency-api's). Other found symbols have no backup.
  async function yahooBackup(ids) {
    const tickers = ids.filter(usTicker);
    const pairs = ids.filter(isPair);
    const [cnbc, fx] = await Promise.all([loadCnbc(tickers), loadFx(fxCurrencies(pairs))]);
    const rows = {};
    for (const id of tickers) {
      const { quote, closes, via } = cnbc.get(id);
      if (quote) rows[id] = { quote, info: { currency: 'USD', decimals: 2 }, closes, via };
    }
    for (const id of pairs) {
      const rate = fx.table ? parseFxPair(fx.table, id) : null;
      if (rate) rows[id] = { quote: { price: rate.rate, change: rate.change }, closes: rate.series, via: fx.via, date: rate.date };
    }
    return Object.keys(rows).length ? rows : null;
  }

  let seq = 0;
  async function loadMarkets() {
    const list = items();
    const my = ++seq;
    const [coins, cnbc, yahoo] = await Promise.all([
      Promise.all(list.filter(isCoin).map(loadCoin)).then(entries => new Map(entries)),
      loadCnbc(cnbcOf(list)),
      loadYahoo(yahooOf(list)),
    ]);
    if (my === seq) renderMarkets(marketRows(list, id => coins.get(id), id => cnbc.get(id), yahoo));
  }

  // ---- editor: ✎ swaps the rows for a search and checkboxes; changes apply as they're made ----

  let editing = false;
  let yoursShown = [];            // items no list has: shown while the editor is open, even once removed
  const described = new Map();    // item → the search result that added it ({ label, name })

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
      yoursShown = items().filter(id => !isSegment(id) && !isListed(id));
      renderEditor();
    } else {
      search('');   // a search still waiting asks nothing
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

  // Every checkbox and button that adds an item says so in data-item, so adding from the search
  // ticks the item's own checkbox too.
  function syncChosen() {
    const list = items();
    for (const node of marketEditor.querySelectorAll('[data-item]')) {
      const on = list.includes(node.dataset.item);
      if (node.type === 'checkbox') node.checked = on;
      else node.setAttribute('aria-pressed', String(on));
    }
  }

  // Adds an item or removes it; one that no list has joins Your symbols (result: the search result
  // that added it, for its label and name).
  function choose(id, on, result = null) {
    if (result) described.set(id, result);
    if (on && !isListed(id) && !yoursShown.includes(id)) {
      yoursShown.push(id);
      drawYours();
    }
    setItem(id, on);
    syncChosen();
  }

  function checkbox(id) {
    const input = el('input', { type: 'checkbox', checked: items().includes(id), 'data-item': id, onchange: () => choose(id, input.checked) });
    return el('label', { class: 'mk-check' }, input, el('span', { text: id }));
  }

  // ---- the search: the listed products at once, Yahoo Finance's once typing stops ----

  const searchBox = el('input', {
    type: 'search', class: 'pref-input sp-search', placeholder: 'Search a name or ticker…',
    'aria-label': 'Search stocks, indexes, coins and currencies', autocomplete: 'off', spellcheck: false,
    oninput: () => search(searchBox.value),
    onkeydown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const top = shownResults[0];
        if (top && !items().includes(top.id)) choose(top.id, true, top);
      } else if (e.key === 'Escape' && searchBox.value) {
        e.preventDefault();
        e.stopPropagation();
        searchBox.value = '';
        search('');
      }
    },
  });
  const results = el('div', { class: 'sp-results', hidden: true });
  const yours = el('div');
  let query = '';
  let found = null;        // Yahoo Finance's results for the query
  let asking = '';         // '', 'busy' or 'failed'
  let shownResults = [];
  let searchSeq = 0;
  let searchTimer = 0;

  function search(text) {
    query = text.trim();
    clearTimeout(searchTimer);
    const my = ++searchSeq;
    found = null;
    asking = query ? 'busy' : '';
    drawResults();
    if (!asking) return;
    searchTimer = setTimeout(async () => {
      let answer = null;
      try {
        answer = parseYahooSearch(await fetchJson(`${YAHOO}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0`), LISTED_SYMBOLS);
      } catch {
        // drawn as a failed search below
      }
      if (my !== searchSeq) return;   // the box has changed since
      found = answer;
      asking = answer ? '' : 'failed';
      drawResults();
    }, SEARCH_WAIT_MS);
  }

  function resultButton(r) {
    return el('button', {
      type: 'button', class: 'sp-result', title: [r.label, r.name].filter(Boolean).join(' · '), 'data-item': r.id,
      'aria-pressed': String(items().includes(r.id)),
      onclick: () => choose(r.id, !items().includes(r.id), r),
    },
    el('span', { class: 'mk-result-sym', text: r.label }),
    el('span', { class: 'sp-result-name', text: r.name }),
    el('span', { class: 'sp-result-meta', text: r.meta }),
    icon('plus', 14), icon('check', 14));
  }

  function drawResults() {
    const listed = searchProducts(PRODUCTS, query).slice(0, SEARCH_LISTED).map(p => ({ ...p, label: p.id }));
    const ids = new Set(listed.map(r => r.id));
    shownResults = [...listed, ...(found ?? []).filter(r => !ids.has(r.id))].slice(0, SEARCH_LIMIT);
    const status = asking === 'busy' ? 'Searching…'
      : asking === 'failed' ? 'Couldn\'t search, check your connection'
        : query && !shownResults.length ? 'Nothing found' : '';
    results.hidden = !shownResults.length && !status;
    results.replaceChildren(...shownResults.map(resultButton), ...(status ? [el('p', { class: 'widget-note', text: status })] : []));
  }

  // An item's label and name on its chip: from the search result that added it, else its quote.
  function describe(id) {
    if (described.has(id)) return described.get(id);
    const entry = cachedYahoo(items())[id];
    return { label: rowLabel(id, entry?.info), name: entry?.quote?.name ?? '' };
  }

  // The items no list has (found symbols, other pairs and coins), to remove or add back.
  function drawYours() {
    yours.replaceChildren(...(yoursShown.length ? [
      widgetSub('Your symbols'),
      el('div', { class: 'sp-chips' }, yoursShown.map(id => {
        const { label, name } = describe(id);
        return el('button', {
          type: 'button', class: 'sp-chip', title: name && name !== label ? `${label} · ${name}` : label, 'data-item': id,
          'aria-pressed': String(items().includes(id)), onclick: () => choose(id, !items().includes(id)),
        }, label);
      })),
    ] : []));
  }

  function renderEditor() {
    searchBox.value = '';
    search('');
    drawYours();
    marketEditor.replaceChildren(
      searchBox, results, yours,
      widgetSub('Crypto · Bybit, in USDT'),
      el('div', { class: 'mk-checks' }, Object.keys(COINS).map(checkbox)),
      widgetSub('US indexes · CNBC'),
      el('div', { class: 'mk-checks' }, Object.keys(STOCKS).map(checkbox)),
      widgetSub('Commodities · CNBC futures'),
      el('div', { class: 'mk-checks' }, Object.keys(COMMODITIES).map(checkbox)),
      widgetSub('Currencies · Yahoo Finance, live'),
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
        { label: `Remove ${rowLabel(item, shownRows[at].info)}`, icon: 'x', action: () => setItem(item, false) },
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
      searchSeq++;   // nor a search
      clearInterval(interval);
      clearTimeout(timer);
      clearTimeout(searchTimer);
      document.removeEventListener('visibilitychange', refresh);
      unsubscribe();
    },
  };
}
