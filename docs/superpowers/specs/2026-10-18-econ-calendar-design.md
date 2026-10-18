# Economic calendar widget: this week's releases for the markets you follow

Date: 2026-10-18
Status: approved (answers: a native widget on TradingView's data with an Origin rule, ForexFactory
as the backup; Israel's key releases raised one or two levels)

A new widget type, **Economic calendar**, lists the economic releases (CPI, rate decisions, jobs
reports…) of today and the next 6 days for the markets and importance levels a copy is set to:
USA, Eurozone and Israel; High, Medium and Low. Up to three copies, each with its own filters.

## Data

- **TradingView**: `economic-calendar.tradingview.com/events?from=<ISO>&to=<ISO>&countries=US,EU,IL`.
  Unofficial; it answers 403 unless the request's `Origin` is TradingView's. A fetch can't set
  `Origin`, so a **static declarativeNetRequest rule** (`rules/econ-calendar.json`, listed in
  the manifest) sets `Origin: https://www.tradingview.com` on `xmlhttprequest` requests to
  `|https://economic-calendar.tradingview.com/events?`. With `declarativeNetRequestWithHostAccess`
  a header rule only acts where the extension has access to both the URL and the page making the
  request, so TradingView's own site is untouched. A static ruleset can't collide with the Website
  widget's session rule ids. Checked in a throwaway extension in Playwright's Chromium: 403
  without the rule, 200 with it. CORS is `*`.
- Each event gives: id, title, country (US, EU, IL), indicator, period, importance (-1, 0, 1),
  date (UTC), actual / forecast / previous, unit, scale, source, comment (a description).
  Holidays are `indicator: "Holidays"` at 00:00 UTC, a date and not a time.
- **Israel's ratings.** TradingView rates almost every Israeli release low (CPI included) and the
  Bank of Israel's rate decision medium. For `country: IL`, by indicator (ignoring case):
  `Interest Rate`, `Inflation Rate`, `Inflation Rate MoM` → High; `GDP Growth Annualized`,
  `Unemployment Rate` → Medium. Everything else keeps TradingView's rating.
- **Backup: ForexFactory** (`nfs.faireconomy.media/ff_calendar_thisweek.json`, its public weekly
  feed), asked only while TradingView can't be reached. USD → US, EUR → EU (no Israel), impact
  High / Medium / Low, `Holiday` as a holiday; this week only (to Saturday, US Eastern), forecast and
  previous but no actual. It sends no CORS headers: a host permission. Asked at most once an hour.
- One fetch covers all three markets and every level; copies filter what they show, so a filter
  change needs no fetch. Through `net.js`'s `feed()`, key `econ-v1:<local date>` (today's
  midnight to 7 days on), shared by every copy and tab; yesterday's keys are swept.
- **How often:** TTL 15 min, 60 min while the data came from ForexFactory. A tab asks the cache
  every minute while visible and when it comes back into view. While an event shown was due less
  than 15 min ago and has no actual yet, the TTL is 1 min, so the number arrives soon after the
  release.
- On failure the last data stays, with "TradingView unreachable · from 2 h ago"; with nothing
  saved, "Couldn't load the calendar" and Try again. From ForexFactory: "From ForexFactory: USA and
  Eurozone this week, no actual numbers".
- **Outside the extension** (the Live Server preview) TradingView refuses the page's origin and
  ForexFactory sends no CORS headers, so the widget says "The calendar loads in the extension".

## What the widget shows

- **Head:** the calendar icon and "Economic calendar"; ✎ on hover. Hover: "Times in your time
  zone · from TradingView".
- **Days:** today, then each day with an event shown, under a heading: "Today · Tue 21 Oct",
  "Tomorrow · Wed 22 Oct", "Thu 23 Oct". Times in this computer's time zone, following the Clock's
  12/24-hour setting.
- **A row:** the time; the market as a text tag (`US`, `EU`, `IL`; Windows draws no flag emoji);
  the importance as three dots (●●● High, ●●○ Medium, ●○○ Low); the title and its period
  ("Inflation Rate YoY · Sep"); then the actual, `f` forecast and `p` previous with the unit
  ("4.2%", "29K", "$9.74B", "−14.5").
- **Released:** the actual in bold with ▲ or ▼ against the forecast (or the previous, with no
  forecast). The arrows are neutral, not green or red: higher isn't always better.
- **Today's past rows** are dimmed, above a thin "now" line. **The next event** shows "in 2 h 14 m"
  (minutes under an hour, "in 3 d" past a day) in place of its actual. An event past its time with
  no actual yet shows "Due" for 15 min, then nothing.
- **Holidays:** one all-day row ("Holiday · Yom Kippur"), no dots, for the copy's markets, whatever
  its importance filter.
- **Hover a row:** the full title, the period, the source (e.g. "Central Bureau of Statistics") and
  TradingView's description.
- **Sizes (container queries):** under 300px wide no previous; under 240px no forecast and no
  period. Days that don't fit the height wrap out of sight, never a cut-off row.
- **Nothing to show:** "Nothing for these filters this week", with Change filters (opens ✎).

## Editor (✎)

- **Importance:** High, Medium, Low chips; **Markets:** USA, Eurozone, Israel chips. Each a toggle;
  the last one on in a row can't be turned off.
- A note: "Israel: rate decisions and CPI count as High, GDP and unemployment as Medium." and
  "Calendar: TradingView", linked.

## Settings and layout

- The copy's settings: `{ levels: ['high', 'medium'], markets: ['US', 'EU', 'IL'] }`, cleaned by
  `cleanEcon` (known values, each once, in a fixed order; an empty list goes back to the default).
- Type `econ`, label "Economic calendar", icon `calendar`. Size 3 × 5, minimum 2 × 3, up to 3
  copies. Copy title: "Economic calendar · US, EU, IL".
- Preferences → Layout → Economic calendar: "Markets and importance: use ✎ on the widget".
- **Default place:** the far column (with Markets). Its minimums already fill all 12 rows, so it
  is a spare type: it moves to the clock column when that has room, and is left out when neither
  has (setup then says there's no room).

## Setup

- Widgets step: Economic calendar ("Releases that move markets"), after Markets. Nothing to fill
  in on the Connect step: the defaults show every market.

## Manifest, README

- `host_permissions`: `https://economic-calendar.tradingview.com/*` and
  `https://nfs.faireconomy.media/*`; `declarative_net_request.rule_resources`: the rule file.
  Reload the extension.
- README: a section, two rows in "Your data", and a Known limits line (TradingView's API is
  unofficial and answers only with its own Origin; Israel's ratings are raised; the backup's gaps).
- Store listing justifications, one line each, in the hand-off.

## Files

- `js/econ.js` (pure, tested in `test/econ.test.js`): settings, URLs and range, parsing both
  sources, Israel's ratings, filtering, days, value labels, the next and due events, the TTL.
- `js/econ-widget.js`: the widget and its editor.
- `rules/econ-calendar.json`, `manifest.json`, `js/layout.js`, `js/registry.js`,
  `js/widget-about.js`, `js/prefs.js`, `js/onboarding.js`, `docs/onboarding.md`,
  `css/newtab.css`, `README.md`.

## Testing

- Unit tests for `econ.js` against real response shapes from both sources.
- The real extension in Playwright's Chromium (headless, its own CDP port and profile): the
  widget loads TradingView's data through the rule, filters by chip without a fetch, survives a
  reload, and shows the ForexFactory backup when TradingView is blocked.
