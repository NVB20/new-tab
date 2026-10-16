# Widgets refresh: GitHub heatmap, Markets picker, clock faces

Date: 2026-10-16
Status: approved

## GitHub

- The list becomes **Latest commits**: the user's 6 newest commits across every repo and organisation,
  newest first. Several may come from one repo; duplicates (same sha, found by search and by the
  private-repo lookup) are dropped. Private repos the token can see are asked for their 6 newest
  commits instead of 1. Open PRs stay above the list when there are any.
- A **contribution heatmap** sits right under the heading: the past year as an SVG grid (weeks as
  columns, Sunday on top), four accent-coloured levels, month labels, a `<title>` tooltip per day
  ("6 contributions on Oct 26"), and a caption "3,209 contributions in the last year". Clicking it
  opens the profile.
- Source: `https://github.com/users/<user>/contributions` (the HTML calendar the profile shows; no
  token, includes private counts if the user turned that on). Needs `host_permissions:
  ["https://github.com/*"]` because the page has no CORS headers. Parsed with regexes in `feeds.js`
  (`parseContributions`) so it is unit-tested in Node.
- Cached separately (`github-cal:<user>`), fetched at most once an hour like the rest, Refresh skips
  the wait. On failure without a saved copy, one muted line explains it; the rest of the widget is
  unaffected. The main GitHub cache key moves to `github-v5` (the list's meaning changed).

## Markets

- Prefs: `markets.coins` (text) and `markets.fx` (bool) are replaced by `markets.items`, an ordered
  list of ids: coin tickers (`'BTC'`, Bybit spot vs USDT) and currency pairs (`'EUR/ILS'`). Default
  `['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS']`. Saved states without `items` are migrated from the
  old fields in `normalizeState`.
- A ✎ button in the heading (visible on hover) switches the widget body to an editor: checkboxes
  for 14 popular coins and 7 pairs (USD/ILS, EUR/ILS, GBP/ILS, EUR/USD, GBP/USD, USD/JPY, USD/CHF),
  plus a box to add any other coin ticker. Ticking appends to the list, unticking removes; the
  page updates live. ✓ closes the editor. Preferences loses the Coins box and USD/ILS switch.
- All pairs come from one Frankfurter request with EUR as base (`from=EUR&to=USD,ILS,…`); a pair's
  rate is `rate[quote] / rate[base]` per day, which gives its latest rate, day change and series.

## Clock faces

- `clock.face`: `'classic'` (default, today's look), `'stencil'` (the One UI screenshot: hours
  stacked over minutes in Big Shoulders Stencil 800, slightly translucent, rounded bold date line
  "Fri 3 Oct" underneath), `'rounded'` (stacked, Nunito 900), `'serif'` (stacked, DM Serif
  Display), `'dot'` (one line, Doto dot matrix). Unknown values fall back to classic.
- Stacked faces always show two-digit hours; non-classic faces use the short date ("Fri 3 Oct").
- A ✎ on the clock (on hover) opens a strip of previews under it, one per face, drawn with the
  current time; clicking one applies it. Preferences → Widgets → Clock also gets a Style control.
- Fonts are bundled as latin woff2 files in `fonts/` with their OFL licences; no network needed.

## Testing

Unit tests for `parseContributions`, heatmap layout, `latestCommits`, the FX table and pair maths,
market item cleaning and the prefs migration. Visual check of all faces and both widgets in
headless Chrome against the static preview.
