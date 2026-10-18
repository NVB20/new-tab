# Sports widget: search for any team

Date: 2026-10-18
Status: approved

A search box at the top of the Sports widget's ✎ editor finds any soccer or basketball team
365Scores knows (clubs, national, women's and youth teams, worldwide) and follows it. It builds on
[Israeli clubs and national teams](2026-10-18-israeli-teams-design.md): every 365Scores team,
listed or found, is followed, fetched and drawn the same way.

## Search

`https://webws.365scores.com/web/search/?appTypeId=5&langId=1&query=<text>` (CORS `*`, cached by
the browser for a day). It answers `competitors[]` sorted by popularity (`id`, `sportId`, `type`
1 club / 2 national, `name`, `symbolicName`, `countryId`, `mainCompetitionId`, `imageVersion`,
`hideOnSearch`) with `countries[]` (`id`, `name`).

- Asked once the box holds 3 letters or more (2 letters bring thousands of teams, 175 KB), 300 ms
  after typing stops; an answer to an older query is dropped. Not saved in the request cache.
- Kept: `sportId` 1 (soccer) and 2 (basketball), not `hideOnSearch`, whole-number ids. At most 8.
- Teams the widget already gets from ESPN aren't offered twice: 365Scores' NBA teams
  (`mainCompetitionId` 103) are dropped, and Inter Miami (54729) and Argentina (2378) are shown as
  the Messi entries (`soccer:20232`, `soccer:202`).
- The fixed lists are searched too, from 2 letters and with no request, and come first: a name
  word starting with the text, or the exact abbreviation ("Lakers" finds the NBA entry, "Chiefs"
  the NFL one, "MTA" both Maccabi Tel Aviv clubs, "ar" Arizona and Argentina but not Charlotte).
- A result: logo (365Scores teams), name, and a muted line: country · Soccer / Basketball, or the
  list's name (NBA, NFL, Messi). It's a button pressed while followed; a click follows or
  unfollows.
- States: "Searching…", "No teams found", "Couldn't search, check your connection".

## Followed ids and settings

- Every 365Scores team is `365:<id>` (365Scores' team ids are unique across sports). Saved
  `il-soccer:<id>` / `il-basket:<id>` ids become `365:<id>`.
- New setting `teams`: `{ [id]: { name, abbr, kind } }` for followed 365Scores teams outside the
  fixed lists (`kind` 'soccer' or 'basketball'; name up to 80 characters, abbr up to 8). `clean`
  keeps entries only for followed ids, and drops a `365:` id that is in no list and has no entry.
  Default `{}`.
- `teamOf(id, teams)` → `{ sport, id, abbr, name }`, plus `kind` for 365Scores teams.

## Games

365Scores games get `sport: '365'` and `kind` from the game's `sportId` (1 soccer, 2 basketball;
games of other sports are dropped). `kind` picks the link (football / basketball), the finished
detail (FT / Final) and the fallback tag. More tags by name: Premier League (not Israel's) EPL,
LaLiga, Serie A, Bundesliga, Ligue 1, NBA, Copa del Rey. The cache key stays `sports-v1:365:<id>`.

## The ✎ editor

Search box, its results, then **Your teams** (chips with the full name for followed teams found by
search, outside the lists), NBA, NFL, Messi, Ligat Ha'Al, Winner League, **National teams** (chips
*Israel · Soccer*, *Israel · Basketball*, which were the Israel checkboxes), Formula 1. Escape in
the box clears it.

## Privacy

README "Your data": what you type in the search (3 letters or more) goes to `webws.365scores.com`.

## Testing

`test/sports.test.js`: search parsing (sports kept, NBA and Messi's teams mapped, hidden and junk
dropped, at most 8), the fixed lists' matches, the id migration, `teams` cleaning, `teamOf` with
`teams`, games of other sports dropped, the new tags. In the browser: typing a query, following a
found team (its games in the list, its chip under Your teams), unfollowing, an NBA query giving the
ESPN entry.
