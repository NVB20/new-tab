# Markets: add any ticker

Date: 2026-10-19
Status: approved (answers: a search with suggestions; one box for coins too; every currency pair
live from Yahoo Finance with the ECB as backup)

A search box at the top of the Markets widget's ✎ editor finds any stock, ETF, index, fund,
future, coin or currency pair Yahoo Finance knows (US, Tel Aviv, London, Tokyo, …) and adds it to
the copy's list. Found symbols and every currency pair are quoted live from Yahoo Finance.

## Search

`https://query1.finance.yahoo.com/v1/finance/search?q=<text>&quotesCount=10&newsCount=0`
(already a host permission; the browser caches it for 10 minutes). It answers `quotes[]` with
`symbol`, `quoteType`, `shortname`, `longname`, `exchDisp`.

- Asked from the first letter, 300 ms after typing stops; an answer to an older query is dropped.
  Not saved in the request cache.
- The checklists are searched too, with no request, and come first (at most 4): an id starting with
  the text (`go` GOLD), a name word starting with it (`natural` NATGAS, `bitcoin` BTC), or a pair by
  its letters (`usd ils`, `usd/ils`, `ils`). At most 8 results in all, each item once.
- A Yahoo result becomes an item:
  - `CRYPTOCURRENCY` priced in USD → the coin, priced on Bybit as today (`SOL-USD` → `SOL`;
    Yahoo's CoinMarketCap-id suffix is dropped: `PEPE24478-USD` → `PEPE`). Other crypto quotes are
    dropped.
  - `CURRENCY` → the pair (`EURPLN=X` → `EUR/PLN`, `ILS=X` → `USD/ILS`).
  - A symbol a checklist item is quoted by → that item (`GC=F` GOLD, `^DJI` DJIA, `SPY` SPY).
  - `EQUITY`, `ETF`, `INDEX`, `MUTUALFUND`, `FUTURE` → `'$' + symbol` (`$AAPL`, `$TEVA.TA`,
    `$^TA125.TA`). Anything else (options, …) is dropped.
- A result: the row's label in bold, the name, and a muted line *Exchange · Type* (Stock, ETF,
  Index, Fund, Future, Currency, or *Crypto · Bybit*). It's a button pressed while the item is in
  the list; a click adds or removes it. Enter adds the top result. Escape clears the box.
- States: "Searching…", "Nothing found", "Couldn't search, check your connection".

## The ✎ editor

Search box and its results, then **Your symbols** (a chip per item in the list that no checklist
has: found symbols, other pairs, other coins; they stay while the editor is open, unpressed once
removed, so a removal can be undone), then the checklists as before. The "Other coin" box goes;
coins are found by the search. The currencies heading becomes *Currencies · Yahoo Finance, live*.

## Items

- New kind: `'$' + Yahoo symbol`, up to 20 characters after the `$`
  (`/^\$\^?[A-Z0-9][A-Z0-9.=&-]{0,19}$/`). `cleanMarketItems` keeps them like the others (upper
  case, once each). Any `AAA/BBB` pair is allowed. Saved lists need no migration.

## Quotes

- Found symbols and pairs come from Yahoo Finance's spark (`/v7/finance/spark?symbols=…&range=1d&
  interval=5m`, at most 20 symbols a request, so the list is asked in batches), every 30 s while
  visible: the price, the change on the day and a sparkline of today's session. A pair's Yahoo
  symbol is `AAABBB=X`. Funds have no intraday prices, so no sparkline.
- While Yahoo is down: US tickers (`$` + 1–5 letters, optionally `-X` as in `BRK-B`, which CNBC
  writes `BRK.B`) from CNBC like the listed indexes, and pairs from the ECB chain as before
  (Frankfurter, the ECB, currency-api; a currency none of them has shows a dash). Other found
  symbols show a dash.
- The listed indexes and commodities stay CNBC first, Yahoo Finance second; coins stay Bybit,
  Binance, OKX.

## Rows

- Label: the symbol without `^` and `=F`, with its exchange suffix (`TEVA.TA`, `TEVA`); an index
  goes by its short name when it has 8 characters or fewer (TA-125, TA-35, S&P 500), else by its
  symbol without the suffix (`IXIC`). Long labels end in an ellipsis.
- Price: with at most the decimals Yahoo Finance gives the symbol (`priceHint`: a stock's 2, so
  TEVA is 41.31, not 41.3100); a US ticker from CNBC gets 2.
- Hover: the name, on Yahoo Finance, as of the time, and the currency when it isn't USD ("in
  agorot" for ILA, "in pence" for GBp). Pairs: "USD/ILS on Yahoo Finance · as of …", or the ECB
  wording while on the backup.
- Click: the symbol's Yahoo Finance page (CNBC's while on CNBC). Candles: TradingView where the
  name there follows from Yahoo's: US tickers, pairs (`FX_IDC:EURPLN`), and stocks on Tel Aviv,
  London, XETRA, Tokyo, Hong Kong, Toronto, Paris, Amsterdam and SIX. Not indexes or futures.

## Privacy

README "Your data": what you type in the Markets search goes to `query1.finance.yahoo.com`; the
Markets rows now ask it for found symbols and pairs. No manifest change.

## Testing

- Unit tests (feeds.test.js): reading the search into items, the checklist search,
  `cleanMarketItems` with `$` items, labels, pair symbols, TradingView names, the chart's info.
- The loaded extension in Playwright's Chromium: search "teva" and add TEVA.TA, add EUR/PLN, live
  USD/ILS, remove a chip, reload.
