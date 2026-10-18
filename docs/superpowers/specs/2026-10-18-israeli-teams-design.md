# Sports widget: Israeli clubs and national teams

Date: 2026-10-18
Status: approved

The Sports widget can follow any Ligat Ha'Al soccer club, any Winner League basketball club, and
Israel's national soccer and basketball teams. A followed team brings in every competition it
plays (league, cups, European games, Nations League, qualifiers, friendlies), in the same list
and rows as the NBA, NFL, Messi and F1 games.

## Data source

**365Scores' web API**, `https://webws.365scores.com/web`: free, no key, sends
`Access-Control-Allow-Origin: *`, so `manifest.json` doesn't change. Logos come from
`https://imagecache.365scores.com/`. It is unofficial and undocumented, like ESPN's: every field
is read defensively and the last good data is kept.

Checked and rejected (2026-10-18):

- ESPN: its `isr.1` league stopped in May 2025 (season 2024); Israeli clubs' ESPN schedules hold
  only their European qualifiers, with nothing upcoming. Its EuroLeague league lists the teams but
  their schedules are empty. (ESPN does have the national soccer team, id 461, but one source for
  every Israeli team keeps the rows alike.)
- TheSportsDB (free key `123` answers again): one game per league request, and it had
  Beitar–Maccabi Tel Aviv on Sat 17 Oct with no score; it's on Mon 19 Oct.
- The EuroLeague's own feed (fine, CORS) covers only EuroLeague games; the Israel Basketball
  Association's WordPress API sends no CORS headers (a new host permission); nothing free covers
  Ligat Ha'Al besides 365Scores. Sofascore and LiveScore refuse requests from outside their sites.

### Endpoint

`/games/current/?appTypeId=5&langId=1&timezoneName=UTC&userCountryId=6&competitors=<id>`: a
team's last result, a game in progress, and its next five games (about two weeks for a club in
the EuroLeague and the Winner League; months ahead for a national team). One request per followed
team.

Fields used from a game: `id`, `startTime`, `statusGroup` (2 scheduled, 3 live, 4 over),
`statusText`, `shortStatusText`, `gameTimeDisplay`, `gameTimeAndStatusDisplayType` (1: show the
status, "HT"; 2: the minute, "63'"; 3: both, "Q2 00:31"), `competitionId`,
`competitionDisplayName`, and `homeCompetitor` / `awayCompetitor` (`id`, `name`, `symbolicName`,
`score`, -1 before the start; `isWinner`, set after penalties; `imageVersion`, `nameForURL`). The
response's `competitions[]` give each competition's `name` and `nameForURL`.

Group 4 also holds games that didn't happen: `statusText` "Postponed", "Cancelled", "Abandoned",
"Suspended" are read before the group.

## Teams

Fixed lists in `js/sports.js` (365Scores ids, 2026-27 season, from `/web/standings`):

- **Ligat Ha'Al** (competition 42): 14 clubs, by `symbolicName`: MHA, MTA, HTA, HBS, BEI, NET,
  HHA, BNS, HJE, MPT, HRG, HPT, IKS, ITB.
- **Winner League** (competition 47): 14 clubs: JER, MTA, ASH, HTA, IRG, EIL, ATA, HBS, EMK, RSH,
  HER, NES, HOL, HGE.
- **Israel:** the national soccer team (5034) and basketball team (1728).

Followed ids: `il-soccer:<id>` and `il-basket:<id>`. `cleanSports` accepts them like any team id.
New copies keep today's defaults (Inter Miami, Argentina, F1).

## Rows

Like the other team games:

- **Event:** `id` `365:<game id>` (never clashes with ESPN's), `sport` `il-soccer` / `il-basket`,
  usual length 2 h for both, `timeValid` true.
- **Teams:** `symbolicName` as the abbreviation; without one, the first three letters of the
  first word that has three (BC Dubai → DUB). Logo:
  `https://imagecache.365scores.com/image/upload/f_png,w_32,h_32,c_limit,q_auto:eco,dpr_2,d_Competitors:default1.png/v<imageVersion>/Competitors/<id>`,
  built only from integer ids and versions.
- **Tag:** Israeli competitions by id: 42 Ha'Al, 43 and 7202 Leumit, 49 and 51 State Cup, 546 Toto
  Cup, 6285 and 8844 Super Cup, 47 Winner, 609 Winner Cup. Others by name: UEFA Champions League
  UCL, Europa League UEL, Conference League UECL (their qualifiers too), Nations League UNL (as
  ESPN's abbreviation for it), World Cup qualifiers WC qual., EuroLeague, Eurocup EuroCup,
  Basketball Champions League BCL, friendlies Friendly. Anything else: the competition's name
  before " - ".
- **Live** (`statusGroup` 3): `state` 'in', detail by the display type ("63'", "HT", "Q2 0:31",
  leading zero dropped).
- **Over** (`statusGroup` 4): `state` 'post', detail FT (soccer), FT-Pens after penalties, AET
  after extra time; Final or Final/OT (basketball). W/L/D as for ESPN games: the score, and on a
  level score after penalties `isWinner`.
- **Link:** the game on 365scores.com,
  `https://www.365scores.com/<football|basketball>/match/<competition>-<competitionId>/<home>-<away>-<homeId>-<awayId>-<competitionId>#id=<gameId>`,
  each slug URI-encoded.
- **TV:** none (365Scores lists channels only per game).
- A game between two followed teams (a derby) is one row.

## Caching and refresh

Key `sports-v1:365:<team id>`, through `feed()`, trimmed like the ESPN schedules. The TTL comes
from the saved games:

- 30 s while one of them may be under way: live, or past its start without being over, up to
  twice its usual length;
- an hour for one that ended by the clock without being over yet (until a day after its end);
- else 6 hours.

ESPN scoreboards skip these games. A typical setup (a soccer club, a basketball club, both
national teams) adds 4 requests every 6 hours, plus one every 30 s per team while its game is on.

## Errors

A failed team keeps its last data. The notes name the host: "365Scores unreachable · data from 3h
ago", or "Couldn't load the schedule for Maccabi Tel Aviv (basketball)" with nothing saved.

## The ✎ editor

After Messi: **Ligat Ha'Al** (14 chips, full name in the tooltip), **Winner League** (14 chips),
**Israel** (checkboxes *Soccer* and *Basketball*), then Formula 1. The unedited-copy hint becomes
"Pick your teams" and counts Israeli teams as picks.

## Code

- `js/sports.js`: the lists, `teamOf` for the new sports, `parse365Games(json, sport)`, the tags,
  logo and link builders, `teamTtl(events, now)`; `scoreboards` skips non-ESPN games.
- `js/sports-widget.js`: the loader, the notes' host, the editor part.
- `js/widget-about.js`: the Sports description names Israeli teams.
- `README.md`: Sports row and section, `webws.365scores.com` and `imagecache.365scores.com` in
  *Your data*, and under *Known limits*: 365Scores' API is unofficial; the club lists are this
  season's (a relegated club leaves the editor next season).

## Testing

- `test/sports.test.js` with trimmed real responses (2026-10-18): scheduled, live soccer (minute,
  half time), live basketball (quarter and clock), over (FT, after penalties, Final/OT), postponed;
  missing short names; tags; logo and link building and rejecting odd ids; a response that isn't
  a game list; `teamOf` and `cleanSports` with the new ids; `teamTtl`; `scoreboards` skipping them;
  `timeline` with a derby between two followed clubs.
- In the browser (headless, the static preview with a seeded state and the real API): Israeli rows
  with logos and tags, the editor, the link opening the right game.
