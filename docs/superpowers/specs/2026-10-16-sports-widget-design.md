# Sports widget: NBA, NFL, F1 and Messi's games in one timeline

Date: 2026-10-16
Status: approved

A new widget type, **Sports**, lists the upcoming games of the teams you follow (NBA, NFL), every
F1 session you care about, and Messi's games (Inter Miami and Argentina), in one list by date. A
game in progress shows its live score; a finished one stays for a day with its result.

## Data sources

Both are free, need no key and send `Access-Control-Allow-Origin: *`, so nothing changes in
`manifest.json`. Team logos are plain `<img>` from `a.espncdn.com`.

| Source | Used for |
| --- | --- |
| ESPN site API, `https://site.api.espn.com/apis/site/v2/sports` | NBA, NFL, Inter Miami and Argentina: schedules, results, live scores |
| Jolpica F1 (the Ergast successor), `https://api.jolpi.ca/ergast/f1` | F1 season calendar with every session's time, last race results |

ESPN's API is unofficial and undocumented: it can change without notice. Every field is read
defensively (a missing field drops that event, never throws) and the last good data is kept.

Checked and rejected (2026-10-16): TheSportsDB (free key `123` answers 403 "Free API temporarily
disabled while we rebuild the site"), BALLDONTLIE (key, 5 requests/min, NBA games only on the free
tier), API-Sports (key, 100 requests/day per sport, unclear current-season access), NBA's own CDN
(403 outside nba.com), football-data.org (no MLS on the free tier), OpenF1 (fine, but its live
timing is paid and Jolpica already has the calendar).

### Endpoints

- **NBA / NFL team schedule:** `/{basketball/nba | football/nfl}/teams/{id}/schedule`. It returns
  the current part of the season only (`requestedSeason.type`: 1 preseason, 2 regular, 3
  playoffs), with finished games' scores. When it has no game still to come and the type is below
  3, the loader also asks `?seasontype={type + 1}` and merges both (today the Lakers' default is a
  finished preseason; `seasontype=2` has their 80+ regular-season games).
- **Soccer team, upcoming:** `/soccer/all/teams/{id}/schedule?fixture=true`. **Results:** the same
  without `fixture=true`. The `all` path covers every competition (seen for Inter Miami: MLS,
  Leagues Cup, CONCACAF Champions Cup, Campeones Cup, club friendlies; for Argentina: World Cup,
  qualifiers, friendlies). Each event names its competition in `league.slug`.
- **Live score:** the league's scoreboard for the game's day in US Eastern time,
  `/{sport}/{league}/scoreboard?dates=YYYYMMDD` (NBA/NFL use `nba`/`nfl`; soccer uses the event's
  `league.slug`, e.g. `usa.1`, `fifa.friendly`). One request covers every followed game in that
  league that day. ESPN's NBA scoreboard rejects date ranges, which is why schedules come per team.
- **F1 season:** `/current.json` → `Races[]`, each with `date`/`time` for the race and for
  `FirstPractice`, `SecondPractice`, `ThirdPractice`, `SprintQualifying`, `Sprint`, `Qualifying`.
  Cancelled rounds are not listed.
- **F1 last result:** `/current/last/results.json` → the latest race's round and finishing order.

Fields used from an ESPN event: `id`, `date`, `timeValid` (false = time not set yet),
`competitions[0].competitors[]` (`homeAway`, `team.id/abbreviation/displayName/logo`, `score`,
`winner`), `competitions[0].status.type` (`state` pre/in/post, `name` e.g. `STATUS_POSTPONED`,
`shortDetail` e.g. "Q3 5:21", "67'", "FT"), `competitions[0].broadcasts[]` (TV), `league.slug`,
`links[]` (the `summary/desktop/event` link, ESPN's game page).

## What the widget shows

### The timeline

- One list, oldest first, under day headings: **Yesterday** (finished games only), **Today**,
  **Tomorrow**, then `Sun 18 Oct` (the clock's short date style). Days are the computer's local
  days.
- **Window:** games starting in the next 14 days, games in progress, and finished games until 24
  hours after their usual end. A followed team (or F1) with nothing in the window adds its next
  event anyway, so a quiet week doesn't empty the widget.
- A game between two followed teams is one row.
- Several copies of the widget each have their own list; data is shared (see Caching).

### A row

- **Tag:** `NBA`, `NFL`, `F1`, or the soccer competition's short name: `usa.1` MLS,
  `concacaf.leagues.cup` Leagues Cup, `concacaf.champions` CONCACAF, `campeones.cup` Campeones
  Cup, `club.friendly` and `fifa.friendly` Friendly, `fifa.world` World Cup,
  `fifa.worldq.conmebol` WC qual., `conmebol.america` Copa América; anything else uses ESPN's
  `league.abbreviation`.
- **Matchup:** away logo, `LAC @ KC`, home logo (ESPN's order). The followed team's abbreviation
  is bold. F1 rows read `US GP · Qualifying` (the race name without "Grand Prix" and sponsors,
  plus the session).
- **Time:** local start time, 24-hour unless the page's Clock is set to 12-hour. A moon icon
  marks starts from 00:00 to 06:59 local. `timeValid: false` shows `TBD`.
- **TV:** the first broadcast's short name (CBS, Apple TV, ESPN), muted, at the end.
- **States:**
  - *Live* (`state: 'in'`): red dot, the score `LAC 17 – 24 KC` and `shortDetail` ("Q3 5:21",
    "67'", "Half") in place of the time.
  - *Finished* (`state: 'post'`): dimmed, final score, and a `W` / `L` / `D` chip from the
    followed team's side (no chip when both teams are followed). F1: after a race, the podium
    `VER · LEC · ANT` once Jolpica has the result, `Results soon` until then; other finished F1
    sessions just drop off.
  - *Postponed / cancelled* (`STATUS_POSTPONED`, `STATUS_CANCELED`): dimmed, `Postponed` or
    `Cancelled` instead of the time.
  - *F1 live:* no free live timing, so a session reads `LIVE` (red dot) from its start until its
    usual end.
- **Click:** opens ESPN's game page (`summary/desktop/event` link), or for F1
  `https://www.formula1.com/en/racing/{season}`; new tab when *Open tiles in a new tab* is on (as
  Markets does). Each row has an `aria-label` in words: "Los Angeles Chargers at Kansas City
  Chiefs, Sunday 18 October, 23:25, CBS".

### Usual lengths (for the live and finished windows)

NBA 2.5 h, NFL 3.5 h, soccer 2 h, F1 practice 1 h, sprint qualifying 45 min, sprint 1 h,
qualifying 1 h, race 2 h. A team game counts as live from its start until ESPN says `post`, for
at most twice its usual length; after that it is treated as finished, with the last known score
or `Final` when none is known.

### Empty and error states

- Nothing followed: "Nothing chosen. **Choose teams**" (opens the editor), as Markets does.
- Followed, but no event known at all: "No games scheduled yet".
- A copy that follows no NBA and no NFL team shows a muted last line "**Pick your NBA and NFL
  teams**" (opens the editor) until its editor has been opened once (`settings.edited`).
- A source that fails keeps its last data and adds one muted line under the list: "ESPN
  unreachable · data from 3h ago" (or "Jolpica …"). With no saved data, the line names what's
  missing ("Couldn't load the schedule for Los Angeles Lakers", "Couldn't load the F1
  calendar"). Other sources are unaffected.

### Narrow widget

Under 3 cells wide: no logos, no TV column.

## The ✎ editor

Like Markets: ✎ in the heading (on hover) swaps the list for the editor, ✓ closes it, every change
applies at once.

- **NBA:** 30 toggle chips with team abbreviations (full name in the tooltip), in a grid.
- **NFL:** 32 chips, the same way.
- **Messi:** Inter Miami, Argentina (checkboxes).
- **F1:** a Follow F1 checkbox, then session chips Practice, Sprint (sprint qualifying and the
  sprint), Qualifying, Race.

Team lists (ESPN team id, abbreviation, name) are fixed lists in `js/sports.js`, taken from ESPN's
`/basketball/nba/teams` and `/football/nfl/teams`; the editor needs no network.

## Settings and layout

- New type in `js/layout.js` `TYPES`: `sports`, label `Sports`, icon `trophy` (new in `ui.js`),
  size `[3, 5]`, min `[2, 3]`, max 5.
- Settings: `{ follow, f1Sessions, edited }`
  - `follow`: ids, each once: `nba:<espnId>`, `nfl:<espnId>`, `soccer:20232` (Inter Miami),
    `soccer:202` (Argentina), `f1`. Default `['soccer:20232', 'soccer:202', 'f1']`.
  - `f1Sessions`: subset of `practice`, `sprint`, `qualifying`, `race`. Default
    `['sprint', 'qualifying', 'race']`.
  - `edited`: boolean, default false.
  - `clean` drops unknown ids and sessions; a missing field takes its default.
- Added from the Layout-mode tray; existing pages don't get one automatically, and converting an
  old saved state (`defaultLayout`) doesn't add one.
- **Reset layout** keeps a Sports copy: it joins the column with Markets and GitHub (heights shrink
  to fit, never below their minimums).
- Preferences → Layout lists each copy with one row: "Teams and F1 · Use ✎ on the widget to
  choose them", as Markets does.

## Caching and refresh

All requests go through `feed()` in `net.js`, so every copy and every open tab shares one fetch,
and a failure isn't retried before the TTL.

| Key | What | TTL |
| --- | --- | --- |
| `sports-v1:team:nba:<id>` (also `nfl`) | parsed schedule (with the next-phase merge) | 6 h |
| `sports-v1:soccer:<id>:next` | parsed upcoming games | 6 h |
| `sports-v1:soccer:<id>:last` | parsed results | 6 h |
| `sports-v1:f1:season` | parsed sessions of the season | 24 h |
| `sports-v1:f1:last` | round and top three of the latest race | 1 h |
| `sports-v1:live:<sport>/<league>:<YYYYMMDD>` | live states and scores by event id | 30 s |

- Parsed data only goes into the cache, trimmed to games from 3 days ago to 60 days ahead (plus
  the next one when none is sooner), so large responses (Inter Miami's results are about 540 KB)
  don't fill `localStorage`. Scoreboard entries are one per league and day; on mount the widget
  removes those more than 3 days old (`sweep` in `net.js`).
- A league's scoreboard for a day is read for followed team games that have started, are still
  listed and aren't known to be final. It is refreshed every 30 s while one of them may be under
  way (within twice its usual length), hourly for a game that ended by the clock without a final
  score yet (a game that ended while no tab was open gets its score from the first of those), and
  not at all once its saved copy says every game is final.
- While the tab is visible the widget ticks every 30 seconds: it redraws (day headings, live
  windows, finished games dropping off) and reloads whatever the cache says is due, so network
  requests happen only when a TTL has passed.
- The F1 result is fetched once a race's usual end has passed and the saved result is for an
  earlier round.
- A finished game's score comes from the live scoreboard when it was seen, else from the team's
  schedule or results.
- A typical setup (2 NBA teams, 1 NFL team, Inter Miami, Argentina, F1) makes 7 requests every 6
  hours and the F1 calendar once a day, plus one every 30 s per league while one of those games is
  on.

## Code

- `js/sports.js` (pure, unit-tested in Node): team lists; settings cleaning; ESPN schedule,
  results and scoreboard parsers; the season-phase rule; Jolpica season and last-result parsers;
  competition short names; F1 race short names; and `timeline(events, { now, follow, ... })`,
  which applies the window, the next-event rule, de-duplication, W/L/D and grouping by local day.
- `js/sports-widget.js`: `mountSports(root, store, copy)`; fetching, timers, rendering and the
  editor, in the shape of `markets-widget.js`.
- `js/layout.js` (the type, Reset layout's column), `js/registry.js` (mount), `js/ui.js` (trophy
  icon), `js/prefs.js` (the Layout row), `css/newtab.css` (`.sp-*` styles).
- `README.md`: a Sports row in *What's on the page*, a *Sports* section (following teams, what a row
  shows, times in your time zone), the two hosts and `a.espncdn.com` in *Your data*, and under
  *Known limits*: ESPN's API is unofficial; F1 "live" follows the schedule, not live timing.

## Testing

- `test/sports.test.js` with trimmed real responses (saved 2026-10-16) as fixtures: schedule
  parsing; the preseason → regular-season merge; soccer upcoming + results; scoreboard live state;
  postponed and TBD games; Jolpica sessions and the podium; competition and race short names;
  settings cleaning; and `timeline`: the 14-day window, the next-event rule, a game between two
  followed teams, W/L/D, the 24-hour finished window, day labels, and day grouping across Israel's
  switch to winter time (25 Oct 2026).
- `test/layout.test.js`: the new type's limits and Reset layout keeping a Sports copy.
- In the browser (headless Chrome on the static preview, with a seeded state): the widget with
  upcoming, live, finished and postponed rows, empty and error states, the editor, and the narrow
  width.
