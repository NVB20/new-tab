# Sports widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new widget type, **Sports**, that lists the followed NBA and NFL teams' games, Messi's
games (Inter Miami, Argentina) and the chosen F1 sessions in one timeline by day, with live scores
and a day of results.

**Architecture:** A pure module `js/sports.js` (team lists, settings, ESPN and Jolpica parsers, the
timeline) carries all the logic and is unit-tested in Node. `js/sports-widget.js` fetches through
the shared request cache (`feed()` in `js/net.js`), renders rows and the ✎ editor, in the shape of
`js/markets-widget.js`. The type joins `TYPES` in `js/layout.js`, the mount joins `js/registry.js`.

**Tech Stack:** Plain HTML/CSS/JS modules, no build, no dependencies. Tests: `node --test`
(Node 22). Data: ESPN site API (`https://site.api.espn.com/apis/site/v2/sports`) and Jolpica F1
(`https://api.jolpi.ca/ergast/f1`), both keyless with `Access-Control-Allow-Origin: *`.

Spec: `docs/superpowers/specs/2026-10-16-sports-widget-design.md`.

## Global Constraints

- No dependencies, no bundler; ES modules loaded straight by `newtab.html`. `manifest.json` does not change.
- Pure modules have no DOM or Chrome access and are unit-tested with `node --test`.
- Code style: 2-space indent, single quotes, semicolons, `const` arrow helpers, short comments that say why.
- Every network request goes through `feed(key, ttlMs, load)` from `js/net.js`; cache keys start with `sports-v1:`.
- TTLs: team schedules 6 h, F1 season 24 h, F1 last result 1 h, scoreboards 30 s while a game may be on (1 h for a game that ended by the clock without a final score, none once final); a 30 s tick while the tab is visible redraws and reloads whatever the cache says is due.
- Window: games starting within 14 days; finished games stay until 24 h after their usual end; usual lengths NBA 150 min, NFL 210, soccer 120, F1 practice 60, sprint qualifying 45, sprint 60, qualifying 60, race 120.
- Settings: `{ follow, f1Sessions, edited }`; default follow `['soccer:20232', 'soccer:202', 'f1']`, default sessions `['sprint', 'qualifying', 'race']`.
- Widget type: `sports`, label `Sports`, icon `trophy`, size `[3, 5]`, min `[2, 3]`, max 5.
- UI copy: "Nothing chosen. Choose teams", "No games scheduled yet", "Loading…", "Pick your NBA and NFL teams", "ESPN unreachable · data from 3h ago", "Couldn't load the schedule for Los Angeles Lakers", "Couldn't load the F1 calendar", "Results soon", "TBD", "Postponed", "Cancelled".
- Work happens in the worktree `.claude/worktrees/sports-widget` (branch `sports-widget`); other Claude sessions edit `main` at the same time. Finished work is merged to `main` (the user views `main` with Live Server).
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
| --- | --- |
| `js/sports.js` (new) | Team lists, settings cleaning, ESPN and Jolpica parsers, cache trimming, scoreboard targets, the timeline, date and time formatting. Pure. |
| `test/sports.test.js` (new) | Unit tests for `js/sports.js`, with ESPN/Jolpica fixtures trimmed from real responses of 2026-10-16. |
| `js/sports-widget.js` (new) | `mountSports(root, store, copy)`: loading through `feed()`, rendering rows, notes and the ✎ editor, timers. |
| `js/net.js` | Adds `sweep(prefix, keep)`, which removes old cache entries (daily scoreboards). |
| `test/net.test.js` | Test for `sweep`. |
| `js/layout.js` | The `sports` type; Reset layout puts it under Markets and GitHub; old pages never get one. |
| `test/layout.test.js` | Test for the type and Reset layout. |
| `js/registry.js` | Mounts the type. |
| `js/ui.js` | `trophy` icon. |
| `js/prefs.js` | One row in the copy's Layout group. |
| `css/newtab.css` | `.sp-*` styles. |
| `README.md` | Feature row, Sports section, Your data rows, Known limits, tests list. |

---

### Task 1: Worktree, team lists and settings

**Files:**
- Create: `js/sports.js`
- Test: `test/sports.test.js`

**Interfaces:**
- Produces: `NBA_TEAMS`, `NFL_TEAMS`, `SOCCER_TEAMS` (arrays of `{ id: string, abbr, name }`), `F1_SESSIONS` (`['practice', 'sprint', 'qualifying', 'race']`), `F1_SESSION_LABELS`, `teamOf(followId) → { sport, id, abbr, name } | null`, `cleanSports(settings) → { follow: string[], f1Sessions: string[], edited: boolean }`, `competitionTag(slug, abbreviation?) → string`, `leaguePath(sport, league?) → string`, `schedulePath(sport, id) → string`, `raceShort(name) → string`. Module constants `MIN`, `DAY` used by later tasks.

- [ ] **Step 1: Create the worktree**

From the main checkout (`C:/Users/nivb4/OneDrive/Desktop/new-tab`):

```bash
git worktree add -b sports-widget .claude/worktrees/sports-widget main
```

Then switch the session into it with `EnterWorktree` (path `.claude/worktrees/sports-widget`). All later paths are relative to the worktree.

- [ ] **Step 2: Write the failing tests**

Create `test/sports.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NBA_TEAMS, NFL_TEAMS, SOCCER_TEAMS, teamOf, cleanSports, competitionTag, leaguePath, schedulePath, raceShort,
} from '../js/sports.js';

test('the team lists hold every NBA and NFL team once, and Messi\'s two teams', () => {
  assert.equal(NBA_TEAMS.length, 30);
  assert.equal(NFL_TEAMS.length, 32);
  for (const list of [NBA_TEAMS, NFL_TEAMS]) {
    assert.equal(new Set(list.map(t => t.id)).size, list.length);
    assert.equal(new Set(list.map(t => t.abbr)).size, list.length);
  }
  assert.deepEqual(SOCCER_TEAMS.map(t => t.name), ['Inter Miami', 'Argentina']);
});

test('teamOf reads a followed id', () => {
  assert.deepEqual(teamOf('nba:13'), { sport: 'nba', id: '13', abbr: 'LAL', name: 'Los Angeles Lakers' });
  assert.equal(teamOf('nfl:12').name, 'Kansas City Chiefs');
  assert.equal(teamOf('soccer:20232').abbr, 'MIA');
  assert.equal(teamOf('f1'), null);
  assert.equal(teamOf('nba:999'), null);
  assert.equal(teamOf(42), null);
});

test('cleanSports keeps known ids once and known sessions in order; missing fields take defaults', () => {
  assert.deepEqual(cleanSports({}), { follow: ['soccer:20232', 'soccer:202', 'f1'], f1Sessions: ['sprint', 'qualifying', 'race'], edited: false });
  assert.deepEqual(
    cleanSports({ follow: ['nba:13', 'junk', 'nba:13', 'f1', 5, 'nfl:12'], f1Sessions: ['race', 'x', 'practice'], edited: true }),
    { follow: ['nba:13', 'f1', 'nfl:12'], f1Sessions: ['practice', 'race'], edited: true });
  assert.deepEqual(cleanSports({ follow: [], f1Sessions: [] }).follow, []);
  assert.equal(cleanSports({ edited: 'yes' }).edited, false);
});

test('competitions, ESPN paths and race names get short forms', () => {
  assert.equal(competitionTag('usa.1', 'MLS'), 'MLS');
  assert.equal(competitionTag('fifa.friendly', 'FRIENDLY'), 'Friendly');
  assert.equal(competitionTag('concacaf.leagues.cup'), 'Leagues Cup');
  assert.equal(competitionTag('uefa.nations', 'UNL'), 'UNL');
  assert.equal(competitionTag('x'), 'Soccer');
  assert.equal(leaguePath('nba'), 'basketball/nba');
  assert.equal(leaguePath('soccer', 'usa.1'), 'soccer/usa.1');
  assert.equal(schedulePath('nfl', '12'), 'football/nfl/teams/12/schedule');
  assert.equal(schedulePath('soccer', '202'), 'soccer/all/teams/202/schedule');
  assert.equal(raceShort('United States Grand Prix'), 'US GP');
  assert.equal(raceShort('Bahrain Grand Prix in Malaysia'), 'Bahrain GP in Malaysia');
  assert.equal(raceShort('Mexico City Grand Prix'), 'Mexico City GP');
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `node --test test/sports.test.js`
Expected: FAIL with `Cannot find module` for `js/sports.js`.

- [ ] **Step 4: Write the module's first part**

Create `js/sports.js`:

```js
// Sports widget data: the teams a copy can follow, its settings, parsers for ESPN's site API
// (NBA, NFL, soccer) and Jolpica F1, and the timeline the widget draws. Pure (unit-tested in Node).

import { MONTHS } from './feeds.js';

const MIN = 60e3;
const DAY = 86400e3;

const teams = list => list.map(([id, abbr, name]) => ({ id: String(id), abbr, name }));

// ESPN team ids, from /basketball/nba/teams and /football/nfl/teams (2026-10-16).
export const NBA_TEAMS = teams([
  [1, 'ATL', 'Atlanta Hawks'], [17, 'BKN', 'Brooklyn Nets'], [2, 'BOS', 'Boston Celtics'],
  [30, 'CHA', 'Charlotte Hornets'], [4, 'CHI', 'Chicago Bulls'], [5, 'CLE', 'Cleveland Cavaliers'],
  [6, 'DAL', 'Dallas Mavericks'], [7, 'DEN', 'Denver Nuggets'], [8, 'DET', 'Detroit Pistons'],
  [9, 'GS', 'Golden State Warriors'], [10, 'HOU', 'Houston Rockets'],
  [11, 'IND', 'Indiana Pacers'], [12, 'LAC', 'LA Clippers'], [13, 'LAL', 'Los Angeles Lakers'],
  [29, 'MEM', 'Memphis Grizzlies'], [14, 'MIA', 'Miami Heat'], [15, 'MIL', 'Milwaukee Bucks'],
  [16, 'MIN', 'Minnesota Timberwolves'], [3, 'NO', 'New Orleans Pelicans'],
  [18, 'NY', 'New York Knicks'], [25, 'OKC', 'Oklahoma City Thunder'],
  [19, 'ORL', 'Orlando Magic'], [20, 'PHI', 'Philadelphia 76ers'], [21, 'PHX', 'Phoenix Suns'],
  [22, 'POR', 'Portland Trail Blazers'], [24, 'SA', 'San Antonio Spurs'],
  [23, 'SAC', 'Sacramento Kings'], [28, 'TOR', 'Toronto Raptors'], [26, 'UTAH', 'Utah Jazz'],
  [27, 'WSH', 'Washington Wizards'],
]);

export const NFL_TEAMS = teams([
  [22, 'ARI', 'Arizona Cardinals'], [1, 'ATL', 'Atlanta Falcons'], [33, 'BAL', 'Baltimore Ravens'],
  [2, 'BUF', 'Buffalo Bills'], [29, 'CAR', 'Carolina Panthers'], [3, 'CHI', 'Chicago Bears'],
  [4, 'CIN', 'Cincinnati Bengals'], [5, 'CLE', 'Cleveland Browns'], [6, 'DAL', 'Dallas Cowboys'],
  [7, 'DEN', 'Denver Broncos'], [8, 'DET', 'Detroit Lions'], [9, 'GB', 'Green Bay Packers'],
  [34, 'HOU', 'Houston Texans'], [11, 'IND', 'Indianapolis Colts'],
  [30, 'JAX', 'Jacksonville Jaguars'], [12, 'KC', 'Kansas City Chiefs'],
  [24, 'LAC', 'Los Angeles Chargers'], [14, 'LAR', 'Los Angeles Rams'],
  [13, 'LV', 'Las Vegas Raiders'], [15, 'MIA', 'Miami Dolphins'], [16, 'MIN', 'Minnesota Vikings'],
  [17, 'NE', 'New England Patriots'], [18, 'NO', 'New Orleans Saints'],
  [19, 'NYG', 'New York Giants'], [20, 'NYJ', 'New York Jets'], [21, 'PHI', 'Philadelphia Eagles'],
  [23, 'PIT', 'Pittsburgh Steelers'], [26, 'SEA', 'Seattle Seahawks'],
  [25, 'SF', 'San Francisco 49ers'], [27, 'TB', 'Tampa Bay Buccaneers'],
  [10, 'TEN', 'Tennessee Titans'], [28, 'WSH', 'Washington Commanders'],
]);

// Messi's teams.
export const SOCCER_TEAMS = teams([[20232, 'MIA', 'Inter Miami'], [202, 'ARG', 'Argentina']]);
const TEAMS = { nba: NBA_TEAMS, nfl: NFL_TEAMS, soccer: SOCCER_TEAMS };

export const F1_SESSIONS = ['practice', 'sprint', 'qualifying', 'race'];
export const F1_SESSION_LABELS = { practice: 'Practice', sprint: 'Sprint', qualifying: 'Qualifying', race: 'Race' };
const DEFAULT_FOLLOW = ['soccer:20232', 'soccer:202', 'f1'];
const DEFAULT_SESSIONS = ['sprint', 'qualifying', 'race'];

// A followed id ('nba:13', 'soccer:202') → { sport, id, abbr, name }; 'f1' and unknown ids → null.
export function teamOf(followId) {
  const [sport, id] = String(followId).split(':');
  const team = TEAMS[sport]?.find(t => t.id === id);
  return team ? { sport, ...team } : null;
}

// A Sports copy's settings: follow (team ids as above, and 'f1'), the F1 sessions it shows, and
// whether its editor has been opened. Unknown ids and sessions go; a missing field takes its default.
export function cleanSports(s = {}) {
  const follow = Array.isArray(s.follow) ? [...new Set(s.follow.filter(id => id === 'f1' || teamOf(id)))] : [...DEFAULT_FOLLOW];
  const f1Sessions = Array.isArray(s.f1Sessions) ? F1_SESSIONS.filter(x => s.f1Sessions.includes(x)) : [...DEFAULT_SESSIONS];
  return { follow, f1Sessions, edited: s.edited === true };
}

// ESPN's league slugs → the short name a soccer competition goes by in the list.
const COMPETITIONS = {
  'usa.1': 'MLS',
  'concacaf.leagues.cup': 'Leagues Cup',
  'concacaf.champions': 'CONCACAF',
  'campeones.cup': 'Campeones Cup',
  'club.friendly': 'Friendly',
  'fifa.friendly': 'Friendly',
  'fifa.world': 'World Cup',
  'fifa.worldq.conmebol': 'WC qual.',
  'conmebol.america': 'Copa América',
};
export const competitionTag = (slug, abbreviation) => COMPETITIONS[slug] ?? (abbreviation ? String(abbreviation) : 'Soccer');

const LEAGUES = { nba: 'basketball/nba', nfl: 'football/nfl' };
// A league on ESPN's site API ('basketball/nba', 'soccer/usa.1'), and a team's schedule. Soccer
// schedules use 'all', which covers every competition the team plays in.
export const leaguePath = (sport, league) => LEAGUES[sport] ?? `soccer/${league}`;
export const schedulePath = (sport, id) => `${sport === 'soccer' ? 'soccer/all' : LEAGUES[sport]}/teams/${id}/schedule`;

// "United States Grand Prix" → "US GP".
export const raceShort = name => String(name ?? '').replace('Grand Prix', 'GP').replace(/^United States\b/, 'US').trim();
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test test/sports.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add js/sports.js test/sports.test.js
git commit -m "feat: sports.js: the NBA, NFL and Messi teams a Sports widget can follow, and its settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ESPN parsers, cache trimming, live scores

**Files:**
- Modify: `js/sports.js` (append)
- Test: `test/sports.test.js` (append; extend the import)

**Interfaces:**
- Consumes: `competitionTag`, `leaguePath`, `MIN`, `DAY` from Task 1.
- Produces: event shape (a game) `{ id, sport: 'nba'|'nfl'|'soccer', league, tag, start: ms, timeValid, state: 'pre'|'in'|'post', detail, off: string|null, home: Side, away: Side, tv, url }` with `Side = { id, abbr, name, logo, score: string|null, winner: boolean }`; `byStart(a, b)`; `lengthOf(event) → ms`; `parseEspnEvent(e, sport, league?)`; `parseSchedule(json, sport) → { type, events }`; `nextPhase({ type, events }) → number|null`; `parseScoreboard(json, sport, league?) → events`; `trimEvents(events, now)`; `applyLive(events, live)`; `etDay(ms) → 'YYYYMMDD'`; `scoreboards(events, now) → [{ sport, league, path, day, ids }]`; `boardTtl(board, events, live, now) → 30000 | 3600000 | null`; internal `ymd(ms, timeZone)` used by Task 4.

- [ ] **Step 1: Write the failing tests**

In `test/sports.test.js`, replace the import block with:

```js
import {
  NBA_TEAMS, NFL_TEAMS, SOCCER_TEAMS, teamOf, cleanSports, competitionTag, leaguePath, schedulePath, raceShort,
  parseEspnEvent, parseSchedule, nextPhase, parseScoreboard, trimEvents, applyLive, etDay, scoreboards, boardTtl, lengthOf,
} from '../js/sports.js';
```

Append:

```js
// ESPN events as the site API sent them on 2026-10-16, trimmed to the fields the parser reads.
const link = href => [{ rel: ['summary', 'desktop', 'event'], href }];
const chiefsAtRaiders = {   // a team schedule's finished game: score objects, logo lists, TV under media
  id: '401872976', date: '2026-10-04T20:25Z', timeValid: true,
  links: link('https://www.espn.com/nfl/game/_/gameId/401872976/chiefs-raiders'),
  competitions: [{
    status: { type: { name: 'STATUS_FINAL', state: 'post', shortDetail: 'Final' } },
    broadcasts: [{ type: { shortName: 'TV' }, media: { shortName: 'CBS' } }],
    competitors: [
      { homeAway: 'home', winner: false, score: { value: 27, displayValue: '27' },
        team: { id: '13', abbreviation: 'LV', displayName: 'Las Vegas Raiders', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nfl/500/lv.png' }] } },
      { homeAway: 'away', winner: true, score: { value: 30, displayValue: '30' },
        team: { id: '12', abbreviation: 'KC', displayName: 'Kansas City Chiefs', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png' }] } },
    ],
  }],
};
const chargersAtChiefs = {
  id: '401873006', date: '2026-10-18T20:25Z', timeValid: true,
  links: link('https://www.espn.com/nfl/game/_/gameId/401873006/chargers-chiefs'),
  competitions: [{
    status: { type: { name: 'STATUS_SCHEDULED', state: 'pre', shortDetail: '10/18 - 4:25 PM EDT' } },
    broadcasts: [{ type: { shortName: 'TV' }, media: { shortName: 'CBS' } }],
    competitors: [
      { homeAway: 'home', team: { id: '12', abbreviation: 'KC', displayName: 'Kansas City Chiefs', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png' }] } },
      { homeAway: 'away', team: { id: '24', abbreviation: 'LAC', displayName: 'Los Angeles Chargers', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nfl/500/lac.png' }] } },
    ],
  }],
};
const miamiAtAtlanta = {   // soccer schedules name the competition
  id: '761880', date: '2026-10-17T23:30Z', timeValid: true,
  league: { slug: 'usa.1', abbreviation: 'MLS' },
  links: link('https://www.espn.com/soccer/match/_/gameId/761880/inter-miami-cf-atlanta-united-fc'),
  competitions: [{
    status: { type: { name: 'STATUS_SCHEDULED', state: 'pre', shortDetail: '10/17 - 7:30 PM EDT' } },
    broadcasts: [{ type: { shortName: 'STREAMING' }, media: { shortName: 'Apple TV' } }],
    competitors: [
      { homeAway: 'home', winner: false, team: { id: '18418', abbreviation: 'ATL', displayName: 'Atlanta United FC', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/soccer/500/18418.png' }] } },
      { homeAway: 'away', winner: false, team: { id: '20232', abbreviation: 'MIA', displayName: 'Inter Miami CF', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/soccer/500/20232.png' }] } },
    ],
  }],
};
const cavsAtSixers = {   // a scoreboard's game: score strings, team.logo, TV names
  id: '401909093', date: '2026-10-22T23:00Z',
  links: link('https://www.espn.com/nba/game/_/gameId/401909093/cavaliers-76ers'),
  competitions: [{
    timeValid: true,
    status: { type: { name: 'STATUS_SCHEDULED', state: 'pre', shortDetail: '10/22 - 7:00 PM EDT' } },
    broadcasts: [{ market: 'national', names: ['ESPN'] }],
    competitors: [
      { homeAway: 'home', score: '0', team: { id: '20', abbreviation: 'PHI', displayName: 'Philadelphia 76ers', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/phi.png' } },
      { homeAway: 'away', score: '0', team: { id: '5', abbreviation: 'CLE', displayName: 'Cleveland Cavaliers', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/cle.png' } },
    ],
  }],
};
const withStatus = (e, type, scores) => ({
  ...e,
  competitions: [{
    ...e.competitions[0],
    status: { type },
    competitors: e.competitions[0].competitors.map((c, i) => ({ ...c, score: scores?.[i] ?? c.score })),
  }],
});

test('parseEspnEvent reads a schedule\'s finished game', () => {
  assert.deepEqual(parseEspnEvent(chiefsAtRaiders, 'nfl'), {
    id: '401872976', sport: 'nfl', league: 'nfl', tag: 'NFL', start: Date.parse('2026-10-04T20:25Z'), timeValid: true,
    state: 'post', detail: 'Final', off: null,
    home: { id: '13', abbr: 'LV', name: 'Las Vegas Raiders', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lv.png', score: '27', winner: false },
    away: { id: '12', abbr: 'KC', name: 'Kansas City Chiefs', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png', score: '30', winner: true },
    tv: 'CBS', url: 'https://www.espn.com/nfl/game/_/gameId/401872976/chiefs-raiders',
  });
});

test('parseEspnEvent reads upcoming games, soccer competitions and scoreboard games', () => {
  const next = parseEspnEvent(chargersAtChiefs, 'nfl');
  assert.equal(next.state, 'pre');
  assert.equal(next.home.abbr, 'KC');
  assert.equal(next.home.score, null);
  const soccer = parseEspnEvent(miamiAtAtlanta, 'soccer');
  assert.equal(soccer.league, 'usa.1');
  assert.equal(soccer.tag, 'MLS');
  assert.equal(soccer.tv, 'Apple TV');
  const board = parseEspnEvent(cavsAtSixers, 'nba');
  assert.equal(board.home.logo, 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/phi.png');
  assert.equal(board.tv, 'ESPN');
  assert.equal(board.home.score, null);   // 0–0 before the start is no score
  assert.equal(board.timeValid, true);
});

test('parseEspnEvent marks postponed games and unknown times, and drops events it can\'t read', () => {
  const postponed = withStatus(chargersAtChiefs, { name: 'STATUS_POSTPONED', state: 'pre', shortDetail: 'Postponed' });
  assert.equal(parseEspnEvent(postponed, 'nfl').off, 'Postponed');
  assert.equal(parseEspnEvent({ ...chargersAtChiefs, timeValid: false }, 'nfl').timeValid, false);
  assert.equal(parseEspnEvent({ ...chargersAtChiefs, id: undefined }, 'nfl'), null);
  assert.equal(parseEspnEvent({ ...chargersAtChiefs, date: 'soon' }, 'nfl'), null);
  assert.equal(parseEspnEvent({ id: '1', date: '2026-10-18T20:25Z', competitions: [{ competitors: [] }] }, 'nfl'), null);
  assert.equal(parseEspnEvent(null, 'nfl'), null);
});

test('parseScoreboard reads live games; a soccer scoreboard is told its competition', () => {
  const live = withStatus(cavsAtSixers, { name: 'STATUS_IN_PROGRESS', state: 'in', shortDetail: 'Q3 5:21' }, ['71', '67']);
  const [game] = parseScoreboard({ events: [live] }, 'nba');
  assert.equal(game.state, 'in');
  assert.equal(game.detail, 'Q3 5:21');
  assert.equal(game.home.score, '71');
  assert.equal(game.away.score, '67');
  const [match] = parseScoreboard({ events: [{ ...miamiAtAtlanta, league: undefined }] }, 'soccer', 'usa.1');
  assert.equal(match.tag, 'MLS');
  assert.deepEqual(parseScoreboard({}, 'nba'), []);
});

test('nextPhase asks for the next part of the season once one is over, never past the playoffs', () => {
  const pre = parseSchedule({ requestedSeason: { type: 1 }, events: [chiefsAtRaiders] }, 'nfl');
  assert.equal(pre.type, 1);
  assert.equal(nextPhase(pre), 2);
  assert.equal(nextPhase(parseSchedule({ requestedSeason: { type: 2 }, events: [chiefsAtRaiders, chargersAtChiefs] }, 'nfl')), null);
  assert.equal(nextPhase(parseSchedule({ requestedSeason: { type: 2 }, events: [] }, 'nfl')), 3);
  assert.equal(nextPhase(parseSchedule({ requestedSeason: { type: 3 }, events: [] }, 'nfl')), null);
  assert.equal(nextPhase(parseSchedule({ requestedSeason: { type: 13846 }, events: [] }, 'soccer')), null);   // MLS season types
  assert.deepEqual(parseSchedule(null, 'nba'), { type: null, events: [] });
});

// Parsed games for the logic below.
const NOW = Date.parse('2026-10-16T12:00Z');   // 15:00 on Friday 16 October in Israel
const DAY = 86400e3;
const lal = { id: '13', abbr: 'LAL', name: 'Los Angeles Lakers', logo: '', score: null, winner: false };
const gs = { id: '9', abbr: 'GS', name: 'Golden State Warriors', logo: '', score: null, winner: false };
const game = over => ({
  id: 'g', sport: 'nba', league: 'nba', tag: 'NBA', start: NOW, timeValid: true, state: 'pre', detail: '', off: null,
  home: lal, away: gs, tv: '', url: '', ...over,
});

test('lengthOf gives each sport its usual length; F1 sessions bring their own', () => {
  assert.equal(lengthOf(game()), 150 * 60e3);
  assert.equal(lengthOf(game({ sport: 'nfl' })), 210 * 60e3);
  assert.equal(lengthOf({ sport: 'f1', minutes: 45 }), 45 * 60e3);
});

test('trimEvents keeps 3 days back to 60 ahead, and the next game when none is sooner', () => {
  const at = days => NOW + days * DAY;
  const events = [game({ id: 'old', start: at(-4) }), game({ id: 'recent', start: at(-2) }), game({ id: 'soon', start: at(5) }),
    game({ id: 'far', start: at(70) }), game({ id: 'farther', start: at(80) })];
  assert.deepEqual(trimEvents(events, NOW).map(e => e.id), ['recent', 'soon']);
  assert.deepEqual(trimEvents([game({ id: 'far', start: at(70) }), game({ id: 'farther', start: at(80) })], NOW).map(e => e.id), ['far']);
});

test('applyLive lays the scoreboard\'s state and score over the schedule\'s game', () => {
  const scheduled = game({ id: '1', tv: 'ESPN' });
  const board = game({ id: '1', state: 'in', detail: 'Q3 5:21', home: { ...lal, score: '71', logo: 'x' }, away: { ...gs, score: '67' } });
  const [merged, other] = applyLive([scheduled, game({ id: '2' })], [board]);
  assert.equal(merged.state, 'in');
  assert.equal(merged.detail, 'Q3 5:21');
  assert.equal(merged.home.score, '71');
  assert.equal(merged.home.logo, '');   // the schedule's own fields stay
  assert.equal(merged.tv, 'ESPN');
  assert.equal(other.state, 'pre');
});

test('etDay files games under their US Eastern day', () => {
  assert.equal(etDay(Date.parse('2026-10-22T02:00Z')), '20261021');   // 22:00 in New York
  assert.equal(etDay(Date.parse('2026-10-22T23:00Z')), '20261022');
});

test('scoreboards lists one per league and day for games under way or ended without a final', () => {
  const events = [
    game({ id: 'a', start: NOW - 3600e3 }),
    game({ id: 'b', start: NOW - 7200e3 }),                               // same league and day
    game({ id: 'c', start: NOW - 3600e3, state: 'post' }),                // final already
    game({ id: 'd', start: NOW + 3600e3 }),                               // not started
    game({ id: 'e', start: NOW - 3 * DAY }),                              // no longer shown
    game({ id: 'f', sport: 'soccer', league: 'usa.1', tag: 'MLS', start: NOW - 3600e3 }),
    game({ id: 'g', sport: 'soccer', league: '', start: NOW - 3600e3 }),  // competition unknown
    game({ id: 'h', start: NOW - 3600e3, off: 'Postponed' }),
  ];
  assert.deepEqual(scoreboards(events, NOW), [
    { sport: 'nba', league: 'nba', path: 'basketball/nba', day: '20261016', ids: ['a', 'b'] },
    { sport: 'soccer', league: 'usa.1', path: 'soccer/usa.1', day: '20261016', ids: ['f'] },
  ]);
});

test('boardTtl: 30 s while a game may be on, hourly once it ended by the clock, never when all are final', () => {
  const live = game({ id: 'a', start: NOW - 3600e3 });
  const ended = game({ id: 'b', start: NOW - 6 * 3600e3 });   // past twice its length, no final seen
  const board = ids => ({ sport: 'nba', league: 'nba', path: 'basketball/nba', day: '20261016', ids });
  assert.equal(boardTtl(board(['a', 'b']), [live, ended], [], NOW), 30e3);
  assert.equal(boardTtl(board(['b']), [ended], [], NOW), 3600e3);
  assert.equal(boardTtl(board(['b']), [ended], [{ ...ended, state: 'post' }], NOW), null);
  assert.equal(boardTtl(board(['a']), [live], [{ ...live, state: 'in' }], NOW), 30e3);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/sports.test.js`
Expected: FAIL: `The requested module '../js/sports.js' does not provide an export named 'parseEspnEvent'`.

- [ ] **Step 3: Append the ESPN part to `js/sports.js`**

```js
// ---- ESPN ----

const STATES = ['pre', 'in', 'post'];
const OFF = { STATUS_POSTPONED: 'Postponed', STATUS_CANCELED: 'Cancelled', STATUS_SUSPENDED: 'Suspended', STATUS_ABANDONED: 'Abandoned' };
const LENGTH = { nba: 150, nfl: 210, soccer: 120 };   // minutes a game usually takes

export const byStart = (a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
// How long an event usually takes, in ms (F1 sessions carry their own minutes).
export const lengthOf = e => (e.minutes ?? LENGTH[e.sport] ?? 120) * MIN;

// Schedules give the score as { displayValue }, scoreboards as a string.
const scoreOf = s => {
  const v = s !== null && typeof s === 'object' ? s.displayValue : s;
  return v == null || v === '' ? null : String(v);
};

function side(competitors, where) {
  const c = competitors.find(x => x?.homeAway === where);
  const t = c?.team;
  if (t?.id == null) return null;
  return {
    id: String(t.id),
    abbr: String(t.abbreviation ?? ''),
    name: String(t.displayName ?? t.abbreviation ?? ''),
    logo: String(t.logo ?? t.logos?.[0]?.href ?? ''),
    score: scoreOf(c.score),
    winner: c.winner === true,
  };
}

// One ESPN event, from a team's schedule or a scoreboard → a game, or null when it lacks an id, a
// date or a side. league: the soccer competition's slug, for scoreboards (their events don't name it).
export function parseEspnEvent(e, sport, league) {
  const c = e?.competitions?.[0];
  const start = Date.parse(e?.date ?? c?.date);
  const competitors = Array.isArray(c?.competitors) ? c.competitors : [];
  const home = side(competitors, 'home');
  const away = side(competitors, 'away');
  if (e?.id == null || !Number.isFinite(start) || !home || !away) return null;
  const type = c.status?.type ?? e.status?.type ?? {};
  const state = STATES.includes(type.state) ? type.state : 'pre';
  const slug = sport === 'soccer' ? String(league ?? e.league?.slug ?? '') : sport;
  const tv = Array.isArray(c.broadcasts) ? c.broadcasts[0] : null;
  const scored = state !== 'pre';   // scoreboards show 0–0 before the start
  return {
    id: String(e.id),
    sport,
    league: slug,
    tag: sport === 'soccer' ? competitionTag(slug, e.league?.abbreviation) : sport.toUpperCase(),
    start,
    timeValid: (e.timeValid ?? c.timeValid) !== false,
    state,
    detail: String(type.shortDetail ?? ''),
    off: OFF[type.name] ?? null,
    home: { ...home, score: scored ? home.score : null },
    away: { ...away, score: scored ? away.score : null },
    tv: String(tv?.media?.shortName ?? tv?.names?.[0] ?? ''),
    url: String(e.links?.find(l => l?.rel?.includes('summary') && l.rel.includes('desktop'))?.href ?? ''),
  };
}

// A team's schedule → { type, events }. type is the part of the season ESPN sent: for NBA and
// NFL, 1 preseason, 2 regular season, 3 playoffs.
export function parseSchedule(json, sport) {
  const events = Array.isArray(json?.events) ? json.events.map(e => parseEspnEvent(e, sport)).filter(Boolean) : [];
  const type = Number.isInteger(json?.requestedSeason?.type) ? json.requestedSeason.type : null;
  return { type, events };
}

// ESPN sends only the current part of the season, so a schedule with no game still to come asks
// for the next part too: the season type to add, else null.
export function nextPhase({ type, events }) {
  if (type !== 1 && type !== 2) return null;
  return events.some(e => e.state !== 'post') ? null : type + 1;
}

export const parseScoreboard = (json, sport, league) =>
  (Array.isArray(json?.events) ? json.events.map(e => parseEspnEvent(e, sport, league)).filter(Boolean) : []);

// What a source keeps in the cache: games from 3 days ago to 60 days ahead, and its next game
// when there's none sooner.
export function trimEvents(events, now) {
  const sorted = [...events].sort(byStart);
  const kept = sorted.filter(e => e.start >= now - 3 * DAY && e.start <= now + 60 * DAY);
  const next = sorted.find(e => e.start > now);
  if (next && !kept.includes(next)) kept.push(next);
  return kept;
}

// A scoreboard's copy of a game laid over the schedule's: its state, clock and score.
export function applyLive(events, live) {
  const byId = new Map(live.map(g => [g.id, g]));
  return events.map(e => {
    const g = e.sport === 'f1' ? null : byId.get(e.id);
    if (!g) return e;
    return {
      ...e,
      state: g.state,
      detail: g.detail,
      off: g.off,
      home: { ...e.home, score: g.home.score, winner: g.home.winner },
      away: { ...e.away, score: g.away.score, winner: g.away.winner },
    };
  });
}

const dateFormats = new Map();
// The calendar day of a time in a time zone (undefined: the computer's), as 'YYYY-MM-DD'.
function ymd(ms, timeZone) {
  let f = dateFormats.get(timeZone);
  if (!f) dateFormats.set(timeZone, (f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })));
  const p = Object.fromEntries(f.formatToParts(ms).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// The US Eastern day ESPN's scoreboards file a game under: '20261021'.
export const etDay = ms => ymd(ms, 'America/New_York').replaceAll('-', '');

// The scoreboards that matter, one per league and day, with the ids of their games: team games
// that have started, are still listed and that their schedule doesn't call final yet.
export function scoreboards(events, now) {
  const out = new Map();
  for (const e of events) {
    if (e.sport === 'f1' || e.off || e.state === 'post' || e.start > now || now >= e.start + lengthOf(e) + DAY) continue;
    if (e.sport === 'soccer' && !e.league) continue;
    const path = leaguePath(e.sport, e.league);
    const day = etDay(e.start);
    const key = `${path}:${day}`;
    if (!out.has(key)) out.set(key, { sport: e.sport, league: e.league, path, day, ids: [] });
    out.get(key).ids.push(e.id);
  }
  return [...out.values()];
}

// How often to refresh a scoreboard, given what its saved copy (`live`) says: every 30 s while one
// of its games may be under way, hourly for a game that ended by the clock without a final score
// yet, never (null) once all are final.
export function boardTtl(board, events, live, now) {
  const open = applyLive(events.filter(e => board.ids.includes(e.id)), live).filter(e => e.state !== 'post' && !e.off);
  if (!open.length) return null;
  return open.some(e => now < e.start + 2 * lengthOf(e)) ? 30e3 : 3600e3;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/sports.test.js`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add js/sports.js test/sports.test.js
git commit -m "feat: sports.js reads ESPN schedules and scoreboards, trims them for the cache and finds live games

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Jolpica F1 parsers

**Files:**
- Modify: `js/sports.js` (append)
- Test: `test/sports.test.js` (append; extend the import)

**Interfaces:**
- Consumes: `raceShort`, `byStart`, `lengthOf`, `DAY`.
- Produces: F1 event shape `{ id: 'f1:2026-18-Race', sport: 'f1', tag: 'F1', session: 'practice'|'sprint'|'qualifying'|'race', season: '2026', round: 18, title: 'US GP · Race', start, timeValid, minutes, state: 'pre', url }`; `parseF1Season(json) → events | null`; `parseF1Last(json) → { season, round, podium: string[] } | null`; `raceAwaitingResult(events, now) → event | null`.

- [ ] **Step 1: Write the failing tests**

Extend the import in `test/sports.test.js` with `parseF1Season, parseF1Last, raceAwaitingResult` (add them to the last import line). Append:

```js
// Jolpica's season as sent on 2026-10-16, trimmed: the US GP (round 18) and a sprint weekend.
const season = { MRData: { RaceTable: { season: '2026', Races: [
  { season: '2026', round: '18', raceName: 'United States Grand Prix', date: '2026-10-25', time: '20:00:00Z',
    FirstPractice: { date: '2026-10-23', time: '17:30:00Z' }, SecondPractice: { date: '2026-10-23', time: '21:00:00Z' },
    ThirdPractice: { date: '2026-10-24', time: '17:30:00Z' }, Qualifying: { date: '2026-10-24', time: '21:00:00Z' } },
  { season: '2026', round: '2', raceName: 'Chinese Grand Prix', date: '2026-03-15', time: '07:00:00Z',
    FirstPractice: { date: '2026-03-13', time: '03:30:00Z' }, Qualifying: { date: '2026-03-14', time: '07:00:00Z' },
    Sprint: { date: '2026-03-14', time: '03:00:00Z' }, SprintQualifying: { date: '2026-03-13', time: '07:30:00Z' } },
] } } };

test('parseF1Season lists every session with its name, setting and usual length, oldest first', () => {
  const sessions = parseF1Season(season);
  assert.equal(sessions[0].round, 2);
  assert.deepEqual(sessions.filter(s => s.round === 18).map(s => [s.title, s.session, s.minutes]), [
    ['US GP · Practice 1', 'practice', 60], ['US GP · Practice 2', 'practice', 60], ['US GP · Practice 3', 'practice', 60],
    ['US GP · Qualifying', 'qualifying', 60], ['US GP · Race', 'race', 120],
  ]);
  assert.deepEqual(sessions.at(-1), {
    id: 'f1:2026-18-Race', sport: 'f1', tag: 'F1', session: 'race', season: '2026', round: 18, title: 'US GP · Race',
    start: Date.parse('2026-10-25T20:00:00Z'), timeValid: true, minutes: 120, state: 'pre', url: 'https://www.formula1.com/en/racing/2026',
  });
  assert.deepEqual(sessions.filter(s => s.round === 2 && s.session === 'sprint').map(s => [s.title, s.minutes]),
    [['Chinese GP · Sprint Qualifying', 45], ['Chinese GP · Sprint', 60]]);
});

test('parseF1Season keeps a session without a time as TBD and rejects junk', () => {
  const [race] = parseF1Season({ MRData: { RaceTable: { season: '2027', Races: [{ season: '2027', round: '1', raceName: 'Australian Grand Prix', date: '2027-03-07' }] } } });
  assert.equal(race.timeValid, false);
  assert.equal(race.start, Date.parse('2027-03-07T12:00:00Z'));
  assert.equal(parseF1Season({}), null);
});

test('parseF1Last reads the podium of the latest race', () => {
  const json = { MRData: { RaceTable: { season: '2026', round: '17', Races: [{ season: '2026', round: '17', raceName: 'Singapore Grand Prix',
    Results: [
      { position: '2', Driver: { code: 'LEC', familyName: 'Leclerc' } },
      { position: '1', Driver: { code: 'VER', familyName: 'Verstappen' } },
      { position: '3', Driver: { code: 'ANT', familyName: 'Antonelli' } },
      { position: '4', Driver: { code: 'NOR', familyName: 'Norris' } },
    ] }] } } };
  assert.deepEqual(parseF1Last(json), { season: '2026', round: 17, podium: ['VER', 'LEC', 'ANT'] });
  assert.equal(parseF1Last({ MRData: { RaceTable: { Races: [] } } }), null);
});

test('raceAwaitingResult is the latest race past its usual end, for a day', () => {
  const sessions = parseF1Season(season);
  const start = Date.parse('2026-10-25T20:00:00Z');
  assert.equal(raceAwaitingResult(sessions, start + 3600e3), null);          // still running
  assert.equal(raceAwaitingResult(sessions, start + 3 * 3600e3).round, 18);
  assert.equal(raceAwaitingResult(sessions, start + 27 * 3600e3), null);     // a day after its end
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/sports.test.js`
Expected: FAIL: no export named `parseF1Season`.

- [ ] **Step 3: Append the Jolpica part to `js/sports.js`**

```js
// ---- Jolpica F1 ----

// Jolpica's session fields → the setting that shows them, their name and usual length (minutes).
const F1_PARTS = [
  ['FirstPractice', 'practice', 'Practice 1', 60],
  ['SecondPractice', 'practice', 'Practice 2', 60],
  ['ThirdPractice', 'practice', 'Practice 3', 60],
  ['SprintQualifying', 'sprint', 'Sprint Qualifying', 45],
  ['Sprint', 'sprint', 'Sprint', 60],
  ['Qualifying', 'qualifying', 'Qualifying', 60],
];

// The season (/current.json) → every session as an event, oldest first; null when it isn't one.
// A session without a time yet sits at noon UTC with timeValid false.
export function parseF1Season(json) {
  const table = json?.MRData?.RaceTable;
  if (!Array.isArray(table?.Races)) return null;
  const out = [];
  for (const r of table.Races) {
    const season = String(r.season ?? table.season ?? '');
    const round = Number(r.round);
    const race = raceShort(r.raceName);
    const add = (when, key, session, label, minutes) => {
      const start = Date.parse(`${when.date}T${when.time ?? '12:00:00Z'}`);
      if (!Number.isFinite(start)) return;
      out.push({
        id: `f1:${season}-${round}-${key}`, sport: 'f1', tag: 'F1', session, season, round,
        title: `${race} · ${label}`, start, timeValid: !!when.time, minutes, state: 'pre',
        url: `https://www.formula1.com/en/racing/${season}`,
      });
    };
    for (const [key, session, label, minutes] of F1_PARTS) if (r[key]) add(r[key], key, session, label, minutes);
    add({ date: r.date, time: r.time }, 'Race', 'race', 'Race', 120);
  }
  return out.sort(byStart);
}

// The last race's result (/current/last/results.json) → { season, round, podium: ['VER', …] }, or null.
export function parseF1Last(json) {
  const table = json?.MRData?.RaceTable;
  const race = table?.Races?.[0];
  const results = Array.isArray(race?.Results) ? race.Results : [];
  const podium = [...results]
    .sort((a, b) => Number(a.position) - Number(b.position))
    .slice(0, 3)
    .map(r => String(r.Driver?.code ?? r.Driver?.familyName ?? ''))
    .filter(Boolean);
  return podium.length ? { season: String(race.season ?? table.season ?? ''), round: Number(race.round), podium } : null;
}

// The race whose result the widget shows: the latest one past its usual end and still listed
// (for a day after that), or null.
export function raceAwaitingResult(events, now) {
  return events
    .filter(e => e.sport === 'f1' && e.session === 'race' && e.start + lengthOf(e) <= now && now < e.start + lengthOf(e) + DAY)
    .sort(byStart)
    .at(-1) ?? null;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/sports.test.js`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add js/sports.js test/sports.test.js
git commit -m "feat: sports.js reads Jolpica's F1 season and the last race's podium

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The timeline, results and local times

**Files:**
- Modify: `js/sports.js` (append)
- Test: `test/sports.test.js` (append; extend the import)

**Interfaces:**
- Consumes: `ymd`, `byStart`, `lengthOf`, `DAY`, `MONTHS` (from `js/feeds.js`).
- Produces: `followedSide(e, follow) → 'home'|'away'|'both'|null`; `rowState(e, now) → 'pre'|'live'|'final'|'off'`; `resultFor(e, side) → 'W'|'L'|'D'|''`; `dayKey(ms, timeZone?) → 'YYYY-MM-DD'`; `dayLabel(key, todayKey)`; `formatTime(ms, hour24, timeZone?)`; `isNight(ms, timeZone?)`; `longDay(ms, timeZone?)`; `timeline(events, { follow, f1Sessions, now, timeZone?, days = 14 }) → [{ day, label, events: [{ ...event, side, status }] }]`.

- [ ] **Step 1: Write the failing tests**

Extend the import in `test/sports.test.js` with `rowState, resultFor, followedSide, dayKey, dayLabel, formatTime, isNight, longDay, timeline`. Append:

```js
const TZ = 'Asia/Jerusalem';

test('rowState: start time, live, final, postponed; F1 by the clock', () => {
  assert.equal(rowState(game({ start: NOW + 3600e3 }), NOW), 'pre');
  assert.equal(rowState(game({ start: NOW - 3600e3 }), NOW), 'live');            // started, ESPN not told yet
  assert.equal(rowState(game({ start: NOW - 3600e3, state: 'in' }), NOW), 'live');
  assert.equal(rowState(game({ start: NOW - 3600e3, state: 'post' }), NOW), 'final');
  assert.equal(rowState(game({ start: NOW - 6 * 3600e3 }), NOW), 'final');      // past twice its length
  assert.equal(rowState(game({ off: 'Postponed' }), NOW), 'off');
  const quali = { sport: 'f1', session: 'qualifying', minutes: 60 };
  assert.equal(rowState({ ...quali, start: NOW + 1 }, NOW), 'pre');
  assert.equal(rowState({ ...quali, start: NOW - 30 * 60e3 }, NOW), 'live');
  assert.equal(rowState({ ...quali, start: NOW - 90 * 60e3 }, NOW), 'final');
});

test('resultFor gives W, L or D from the followed side', () => {
  const final = (home, away, winners = [false, false]) => game({
    state: 'post', home: { ...lal, score: home, winner: winners[0] }, away: { ...gs, score: away, winner: winners[1] },
  });
  assert.equal(resultFor(final('112', '104'), 'home'), 'W');
  assert.equal(resultFor(final('112', '104'), 'away'), 'L');
  assert.equal(resultFor(final('1', '1'), 'home'), 'D');
  assert.equal(resultFor(final('1', '1', [false, true]), 'away'), 'W');   // won on penalties
  assert.equal(resultFor(final('1', '1', [false, true]), 'home'), 'L');
  assert.equal(resultFor(final('112', '104'), 'both'), '');
  assert.equal(resultFor(final(null, null), 'home'), '');
});

test('followedSide names the followed side of a game', () => {
  assert.equal(followedSide(game(), ['nba:13']), 'home');
  assert.equal(followedSide(game(), ['nba:9']), 'away');
  assert.equal(followedSide(game(), ['nba:13', 'nba:9']), 'both');
  assert.equal(followedSide(game(), ['nfl:13']), null);   // the same id in another league
});

test('day keys and labels follow the local calendar, across the switch to winter time', () => {
  assert.equal(dayKey(Date.parse('2026-10-17T23:30Z'), TZ), '2026-10-18');   // 02:30 in Israel
  assert.equal(dayKey(Date.parse('2026-10-25T21:30Z'), TZ), '2026-10-25');   // 23:30, after the clocks went back
  const today = dayKey(Date.parse('2026-10-24T21:30Z'), TZ);                   // 00:30 on the 25th
  assert.equal(today, '2026-10-25');
  assert.equal(dayLabel('2026-10-25', today), 'Today');
  assert.equal(dayLabel('2026-10-26', today), 'Tomorrow');
  assert.equal(dayLabel('2026-10-24', today), 'Yesterday');
  assert.equal(dayLabel('2026-10-18', today), 'Sun 18 Oct');
});

test('times read 24- or 12-hour; night starts are noticed; long days for screen readers', () => {
  const kc = Date.parse('2026-10-18T20:25Z');
  assert.equal(formatTime(kc, true, TZ), '23:25');
  assert.equal(formatTime(kc, false, TZ).replace(/\s/g, ' '), '11:25 PM');
  assert.equal(formatTime(Date.parse('2026-10-22T02:00Z'), true, TZ), '05:00');
  assert.equal(isNight(Date.parse('2026-10-22T02:00Z'), TZ), true);
  assert.equal(isNight(kc, TZ), false);
  assert.equal(longDay(kc, TZ), 'Sunday 18 October');
});

test('timeline: two weeks ahead, finished games for a day, one row per game, chosen F1 sessions', () => {
  const kc = { id: '12', abbr: 'KC', name: 'Kansas City Chiefs', logo: '', score: null, winner: false };
  const lv = { id: '13', abbr: 'LV', name: 'Las Vegas Raiders', logo: '', score: null, winner: false };
  const nfl = over => game({ sport: 'nfl', league: 'nfl', tag: 'NFL', ...over });
  const f1 = over => ({ sport: 'f1', tag: 'F1', minutes: 60, timeValid: true, state: 'pre', ...over });
  const events = [
    game({ id: 'opener', start: Date.parse('2026-10-22T02:00Z') }),
    game({ id: 'opener', start: Date.parse('2026-10-22T02:00Z') }),            // the same game from the other team's schedule
    game({ id: 'later', start: NOW + 20 * DAY, home: gs, away: lal }),          // past the window
    nfl({ id: 'won', start: NOW - 20 * 3600e3, state: 'post', home: { ...lv, score: '27' }, away: { ...kc, score: '30', winner: true } }),
    nfl({ id: 'old', start: NOW - 3 * DAY, state: 'post', home: lv, away: kc }),
    nfl({ id: 'kc-far', start: NOW + 30 * DAY, home: kc, away: lv }),          // not needed: 'won' is listed
    f1({ id: 'f1-q', session: 'qualifying', start: Date.parse('2026-10-24T21:00Z'), title: 'US GP · Qualifying' }),
    f1({ id: 'f1-p', session: 'practice', start: Date.parse('2026-10-23T17:30Z'), title: 'US GP · Practice 1' }),
  ];
  const days = timeline(events, { follow: ['nba:13', 'nba:9', 'nfl:12', 'f1'], f1Sessions: ['qualifying', 'race'], now: NOW, timeZone: TZ });
  assert.deepEqual(days.map(d => [d.label, d.events.map(e => e.id)]), [
    ['Yesterday', ['won']],        // 19:00 on the 15th in Israel
    ['Thu 22 Oct', ['opener']],    // 05:00
    ['Sun 25 Oct', ['f1-q']],      // midnight, still summer time
  ]);
  const [won] = days[0].events;
  assert.equal(won.side, 'away');
  assert.equal(won.status, 'final');
  assert.equal(days[1].events[0].side, 'both');
  assert.equal(days[1].events[0].status, 'pre');
});

test('timeline adds the next game of a team with nothing in the window, and lists nothing unfollowed', () => {
  const events = [
    game({ id: 'far', start: NOW + 40 * DAY }),
    game({ id: 'farther', start: NOW + 50 * DAY }),
    game({ id: 'theirs', start: NOW + DAY, home: { ...lal, id: '2' }, away: { ...gs, id: '3' } }),
  ];
  const days = timeline(events, { follow: ['nba:13'], f1Sessions: [], now: NOW, timeZone: TZ });
  assert.deepEqual(days.flatMap(d => d.events.map(e => e.id)), ['far']);
  assert.deepEqual(timeline(events, { follow: [], f1Sessions: [], now: NOW, timeZone: TZ }), []);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/sports.test.js`
Expected: FAIL: no export named `rowState`.

- [ ] **Step 3: Append the timeline part to `js/sports.js`**

```js
// ---- the timeline ----

// Which sides of a game the followed ids take: 'home', 'away', 'both' or null.
export function followedSide(e, follow) {
  if (e.sport === 'f1') return null;
  const home = follow.includes(`${e.sport}:${e.home.id}`);
  const away = follow.includes(`${e.sport}:${e.away.id}`);
  return home && away ? 'both' : home ? 'home' : away ? 'away' : null;
}

// How a row reads: 'pre' (its start time), 'live', 'final' or 'off' (postponed, cancelled). A team
// game past its start counts as live until ESPN calls it final, for at most twice its usual length.
export function rowState(e, now) {
  if (e.off) return 'off';
  if (e.sport === 'f1') return now < e.start ? 'pre' : now < e.start + lengthOf(e) ? 'live' : 'final';
  if (e.state === 'post') return 'final';
  if (now < e.start) return 'pre';
  return now < e.start + 2 * lengthOf(e) ? 'live' : 'final';
}

// W, L or D for the followed side of a game with a score; '' without a score or a single side.
export function resultFor(e, side) {
  if ((side !== 'home' && side !== 'away') || e.home.score == null || e.away.score == null) return '';
  const mine = e[side];
  const other = side === 'home' ? e.away : e.home;
  const a = Number(mine.score);
  const b = Number(other.score);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  if (a !== b) return a > b ? 'W' : 'L';
  return mine.winner ? 'W' : other.winner ? 'L' : 'D';   // level after extra time: penalties decide
}

// Still listed: until a day after its usual end (F1 sessions other than the race go when they
// end), or a day after its start when postponed or cancelled.
function shown(e, now) {
  if (e.off) return now < e.start + DAY;
  const end = e.start + lengthOf(e);
  if (e.sport === 'f1' && e.session !== 'race') return now < end;
  return now < end + DAY;
}

const follows = (e, follow, f1Sessions) =>
  (e.sport === 'f1' ? follow.includes('f1') && f1Sessions.includes(e.session) : followedSide(e, follow) !== null);

export const dayKey = ymd;
const shiftDay = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// A day heading: 'Today', 'Tomorrow', 'Yesterday', else 'Sun 18 Oct' (the clock's short date).
export function dayLabel(key, todayKey) {
  if (key === todayKey) return 'Today';
  if (key === shiftDay(todayKey, 1)) return 'Tomorrow';
  if (key === shiftDay(todayKey, -1)) return 'Yesterday';
  const d = new Date(`${key}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// '23:25', or '11:25 PM' on a 12-hour clock.
export const formatTime = (ms, hour24, timeZone) => new Intl.DateTimeFormat(hour24 ? 'en-GB' : 'en-US', {
  timeZone, hour: hour24 ? '2-digit' : 'numeric', minute: '2-digit', hourCycle: hour24 ? 'h23' : 'h12',
}).format(ms);
// Starts from midnight to 6:59 in the morning get a moon.
export const isNight = (ms, timeZone) => Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(ms)) < 7;
// 'Sunday 18 October', for screen readers.
export const longDay = (ms, timeZone) => new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(ms);

// The rows a copy shows, by local day: the followed teams' games and the chosen F1 sessions that
// start within `days` or are still listed after starting; a followed team (or F1) with none of
// those adds its next event. A game between two followed teams is one row.
export function timeline(events, { follow, f1Sessions, now, timeZone, days = 14 }) {
  const unique = [...new Map(events.map(e => [e.id, e])).values()].filter(e => follows(e, follow, f1Sessions));
  const chosen = new Set(unique.filter(e => shown(e, now) && e.start < now + days * DAY));
  for (const id of follow) {
    const own = unique.filter(e => (id === 'f1' ? e.sport === 'f1' : followedSide(e, [id]) !== null));
    if (own.some(e => chosen.has(e))) continue;
    const next = own.filter(e => e.start > now).sort(byStart)[0];
    if (next) chosen.add(next);
  }
  const today = dayKey(now, timeZone);
  const groups = new Map();
  for (const e of [...chosen].sort(byStart)) {
    const day = dayKey(e.start, timeZone);
    if (!groups.has(day)) groups.set(day, { day, label: dayLabel(day, today), events: [] });
    groups.get(day).events.push({ ...e, side: followedSide(e, follow), status: rowState(e, now) });
  }
  return [...groups.values()];
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/sports.test.js`
Expected: PASS, 26 tests.

- [ ] **Step 5: Commit**

```bash
git add js/sports.js test/sports.test.js
git commit -m "feat: sports.js builds the timeline: two weeks by local day, live and final rows, W/L/D

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `sweep` in the request cache

**Files:**
- Modify: `js/net.js` (append)
- Test: `test/net.test.js`

**Interfaces:**
- Produces: `sweep(prefix, keep)`: removes every cache entry (and its `:attempt` record) whose key starts with `prefix` and for which `keep(key)` is false. `key` is given without the `newtab:cache:` prefix and without `:attempt`.

- [ ] **Step 1: Write the failing test**

In `test/net.test.js`, replace the stand-in and the import:

```js
// net.js uses the browser's localStorage; a Map-backed stand-in is enough here.
const memory = new Map();
globalThis.localStorage = {
  getItem: k => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: k => memory.delete(k),
  get length() { return memory.size; },
  key: i => [...memory.keys()][i] ?? null,
};
const { feed, peek, sweep } = await import('../js/net.js');
```

Append:

```js
test('sweep removes the saved values a test rejects, with their attempt records', async () => {
  await feed('live:a:20261001', HOUR, async () => 1);
  await feed('live:a:20261016', HOUR, async () => 2);
  await feed('other', HOUR, async () => 3);
  sweep('live:', key => key.slice(-8) >= '20261013');
  assert.equal(peek('live:a:20261001'), null);
  assert.equal(memory.has('newtab:cache:live:a:20261001:attempt'), false);
  assert.equal(peek('live:a:20261016').data, 2);
  assert.equal(peek('other').data, 3);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test test/net.test.js`
Expected: FAIL: no export named `sweep`.

- [ ] **Step 3: Append `sweep` to `js/net.js`**

```js
// Removes saved values, and their attempt records, whose key starts with prefix and fails
// keep(key). For caches keyed by day, which would otherwise pile up.
export function sweep(prefix, keep) {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) {
      if (!k?.startsWith(PREFIX + prefix)) continue;
      if (!keep(k.slice(PREFIX.length).replace(/:attempt$/, ''))) localStorage.removeItem(k);
    }
  } catch {
    // cache is only a speed-up
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/net.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add js/net.js test/net.test.js
git commit -m "feat: net.js sweep drops cache entries a test rejects, for caches keyed by day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The `sports` layout type

**Files:**
- Modify: `js/layout.js` (import, `TYPES`, `FAR`, `defaultPositions` comment, `defaultLayout`)
- Test: `test/layout.test.js` (append)

**Interfaces:**
- Consumes: `cleanSports` from `js/sports.js`.
- Produces: `TYPES.sports = { label: 'Sports', icon: 'trophy', size: [3, 5], min: [2, 3], max: 5, defaults, clean }`; Reset layout places a kept Sports copy in the Markets/GitHub column.

- [ ] **Step 1: Write the failing test**

Append to `test/layout.test.js`:

```js
test('Sports: its own settings, never added to an old page, kept by Reset layout under Markets and GitHub', () => {
  assert.deepEqual(TYPES.sports.defaults(), { follow: ['soccer:20232', 'soccer:202', 'f1'], f1Sessions: ['sprint', 'qualifying', 'race'], edited: false });
  assert.deepEqual(TYPES.sports.clean({ follow: ['nba:13', 'junk'] }).follow, ['nba:13']);
  assert.equal(TYPES.sports.max, 5);
  assert.equal(prefsSection('sports'), 'layout');
  const l = defaultLayout(legacy());
  assert.equal(byType(l).sports, undefined);
  removeCopy(l, byType(l).notes.id);
  const sports = addCopy(l, 'sports');
  assert.deepEqual(rect(sports), [0, 8, 2, 3]);   // only its minimum fits where Notes was
  resetLayout(l);
  const t = byType(l);
  assert.deepEqual(rect(t.markets), [9, 0, 3, 4]);
  assert.deepEqual(rect(t.github), [9, 4, 3, 4]);
  assert.deepEqual(rect(t.sports), [9, 8, 3, 4]);
  assert.equal(t.sports.id, sports.id);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test test/layout.test.js`
Expected: FAIL: `Cannot read properties of undefined (reading 'defaults')`.

- [ ] **Step 3: Add the type**

In `js/layout.js`, under `import { cleanMarketItems } from './feeds.js';` add:

```js
import { cleanSports } from './sports.js';
```

In `TYPES`, after the `github: { … },` entry, add:

```js
  sports: {
    label: 'Sports', icon: 'trophy', size: [3, 5], min: [2, 3], max: 5,
    defaults: () => cleanSports({}),
    clean: s => cleanSports(s),
  },
```

Replace

```js
const FAR = { markets: 5, github: 7 };                      // the other column
```

with

```js
const FAR = { markets: 5, github: 7, sports: 5 };           // the other column
```

In the comment above `defaultPositions`, replace `Markets and GitHub opposite,` with `Markets, GitHub and Sports opposite,`.

In `defaultLayout`, replace

```js
  const types = [...Object.keys(NEAR), ...Object.keys(FAR)].filter(on);
```

with

```js
  // Sports came after Layout mode: an old page never had it.
  const types = [...Object.keys(NEAR), 'markets', 'github'].filter(on);
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, every file (the existing layout tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add js/layout.js test/layout.test.js
git commit -m "feat: layout.js gets the Sports type; Reset layout puts it under Markets and GitHub

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The widget

**Files:**
- Create: `js/sports-widget.js`
- Modify: `js/registry.js`, `js/ui.js` (ICONS), `js/prefs.js` (`copyRows`), `css/newtab.css`

**Interfaces:**
- Consumes: everything exported by `js/sports.js`; `feed`, `fetchJson`, `peek`, `sweep` from `js/net.js`; `timeAgo` from `js/feeds.js`; `copyById`, `TYPES` from `js/layout.js`; `el`, `icon`, `widgetHead`, `widgetSub`, `widgetEmpty` from `js/ui.js`.
- Produces: `mountSports(root, store, copy) → { destroy() }`.

- [ ] **Step 1: Write `js/sports-widget.js`**

```js
// Sports widget: the followed NBA and NFL teams' games, Messi's (Inter Miami, Argentina) and the
// chosen F1 sessions in one list by day, with live scores and a day of results. Schedules come
// from ESPN's site API and Jolpica F1 through the request cache, shared by every copy and tab.

import { el, icon, widgetHead, widgetSub, widgetEmpty } from './ui.js';
import { feed, fetchJson, peek, sweep } from './net.js';
import { timeAgo } from './feeds.js';
import { copyById, TYPES } from './layout.js';
import {
  NBA_TEAMS, NFL_TEAMS, SOCCER_TEAMS, F1_SESSIONS, F1_SESSION_LABELS, teamOf, schedulePath, parseSchedule, nextPhase,
  parseScoreboard, trimEvents, applyLive, scoreboards, boardTtl, etDay, parseF1Season, parseF1Last, raceAwaitingResult,
  timeline, resultFor, formatTime, isNight, longDay,
} from './sports.js';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const SCHEDULE_TTL = 6 * HOUR;
const F1_TTL = DAY;
const F1_LAST_TTL = HOUR;
const REFRESH_MS = 30e3;
const RECONFIGURE_MS = 800;   // wait for clicking to stop before refetching after a settings change
const KEY = 'sports-v1';
const F1_SEASON = `${KEY}:f1:season`;
const F1_LAST = `${KEY}:f1:last`;
const liveKey = b => `${KEY}:live:${b.path}:${b.day}`;

// The cache keys a followed id reads: a team's schedule (soccer: upcoming games and results), or F1's season.
function sourceKeys(id) {
  if (id === 'f1') return [F1_SEASON];
  const { sport, id: team } = teamOf(id);
  return sport === 'soccer' ? [`${KEY}:soccer:${team}:next`, `${KEY}:soccer:${team}:last`] : [`${KEY}:team:${sport}:${team}`];
}

// Several cache results as one: every event, the oldest time, the first error.
const joined = parts => ({
  data: parts.some(p => p.data) ? parts.flatMap(p => p.data ?? []) : null,
  at: Math.min(...parts.map(p => p.at)),
  error: parts.find(p => p.error)?.error,
});

const trimmed = events => trimEvents(events, Date.now());

async function loadSource(id) {
  if (id === 'f1') return feed(F1_SEASON, F1_TTL, async () => parseF1Season(await fetchJson(`${JOLPICA}/current.json`)));
  const { sport, id: team } = teamOf(id);
  const [key, lastKey] = sourceKeys(id);
  const url = `${ESPN}/${schedulePath(sport, team)}`;
  if (sport === 'soccer') {
    return joined(await Promise.all([
      feed(key, SCHEDULE_TTL, async () => trimmed(parseSchedule(await fetchJson(`${url}?fixture=true`), sport).events)),
      feed(lastKey, SCHEDULE_TTL, async () => trimmed(parseSchedule(await fetchJson(url), sport).events)),
    ]));
  }
  return feed(key, SCHEDULE_TTL, async () => {
    const first = parseSchedule(await fetchJson(url), sport);
    const next = nextPhase(first);
    const more = next ? parseSchedule(await fetchJson(`${url}?seasontype=${next}`), sport).events : [];
    return trimmed([...first.events, ...more]);
  });
}

const cachedSource = id => joined(sourceKeys(id).map(key => peek(key) ?? { data: null, at: 0 }));

// Every scoreboard that matters: its saved copy, refreshed when boardTtl says it's due.
async function loadLive(events) {
  const now = Date.now();
  const boards = await Promise.all(scoreboards(events, now).map(async b => {
    const saved = peek(liveKey(b))?.data ?? [];
    const ttl = boardTtl(b, events, saved, now);
    if (ttl == null) return saved;
    const { data } = await feed(liveKey(b), ttl,
      async () => parseScoreboard(await fetchJson(`${ESPN}/${b.path}/scoreboard?dates=${b.day}`), b.sport, b.league));
    return data ?? saved;
  }));
  return boards.flat();
}

const cachedLive = events => scoreboards(events, Date.now()).flatMap(b => peek(liveKey(b))?.data ?? []);

// The podium of the race awaiting its result, once Jolpica has it.
async function loadPodium(events) {
  const race = raceAwaitingResult(events, Date.now());
  if (!race) return null;
  const isRace = r => r?.season === race.season && r.round === race.round;
  const saved = peek(F1_LAST)?.data;
  if (isRace(saved)) return saved;
  const { data } = await feed(F1_LAST, F1_LAST_TTL, async () => parseF1Last(await fetchJson(`${JOLPICA}/current/last/results.json`)));
  return isRace(data) ? data : null;
}

export function mountSports(root, store, copy) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.sports.defaults();
  const prefs = () => store.get().prefs;
  const linkProps = href => (prefs().openInNewTab ? { href, target: '_blank', rel: 'noopener' } : { href });
  // Times follow the Clock's 12/24-hour setting.
  const hour24 = () => prefs().layout.widgets.find(c => c.type === 'clock')?.settings.hour24 ?? true;

  const list = el('div', { class: 'sp-list' });
  const notes = el('div', { class: 'sp-notes' });
  const editor = el('div', { class: 'sp-editor', hidden: true });
  const editButton = el('button', { type: 'button', class: 'icon-btn widget-edit', onclick: () => setEditing(!editing) });
  const head = widgetHead('trophy', 'Sports');
  head.append(editButton);
  const section = el('section', { class: 'widget widget-sports' }, head, list, notes, editor);
  root.append(section);

  let sources = new Map();   // followed id → { data: events, at, error }
  let live = [];             // scoreboard games
  let podium = null;         // { season, round, podium } of the race awaiting its result
  let loaded = false;

  const events = () => [...sources.values()].flatMap(r => r.data ?? []);

  // ---- rows ----

  const logo = team => (team.logo
    ? el('img', { class: 'sp-logo', src: team.logo, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', onerror: e => e.target.remove() })
    : null);
  const abbr = (team, mine) => el(mine ? 'b' : 'span', { text: team.abbr });
  const scored = e => e.sport !== 'f1' && (e.status === 'live' || e.status === 'final') && e.home.score != null && e.away.score != null;
  const podiumOf = e => (podium?.season === e.season && podium.round === e.round ? podium.podium.join(' · ') : 'Results soon');

  function matchup(e) {
    if (e.sport === 'f1') return el('span', { class: 'sp-match' }, el('span', { class: 'sp-title', text: e.title }));
    const mine = where => e.side === where || e.side === 'both';
    return el('span', { class: 'sp-match' },
      logo(e.away), abbr(e.away, mine('away')),
      scored(e) ? el('span', { class: 'sp-score', text: `${e.away.score} – ${e.home.score}` }) : el('span', { class: 'sp-at', text: '@' }),
      abbr(e.home, mine('home')), logo(e.home));
  }

  function when(e) {
    const tv = e.tv ? el('span', { class: 'sp-tv', text: e.tv }) : null;
    const wrap = (...children) => el('span', { class: 'sp-when' }, ...children);
    switch (e.status) {
      case 'off':
        return wrap(el('span', { text: e.off }));
      case 'live':
        return wrap(el('span', { class: 'sp-dot', 'aria-hidden': 'true' }), el('span', { text: e.state === 'in' && e.detail ? e.detail : 'LIVE' }), tv);
      case 'final': {
        if (e.sport === 'f1') return wrap(el('span', { text: podiumOf(e) }));
        const result = resultFor(e, e.side);
        return wrap(result ? el('span', { class: `sp-res ${result}`, text: result }) : null,
          el('span', { text: e.state === 'post' && e.detail ? e.detail : 'Final' }));
      }
      default:
        return wrap(e.timeValid && isNight(e.start) ? icon('moon', 13) : null,
          el('span', { text: e.timeValid ? formatTime(e.start, hour24()) : 'TBD' }), tv);
    }
  }

  function label(e) {
    const parts = [
      e.sport === 'f1' ? `Formula 1, ${e.title}` : `${e.away.name} at ${e.home.name}`,
      `${longDay(e.start)}, ${e.timeValid ? formatTime(e.start, hour24()) : 'time to be decided'}`,
    ];
    if (e.status === 'off') parts.push(e.off);
    if (e.status === 'live') parts.push('live');
    if (e.status === 'final') parts.push(e.sport === 'f1' ? podiumOf(e) : 'final');
    if (scored(e)) parts.push(`${e.away.abbr} ${e.away.score}, ${e.home.abbr} ${e.home.score}`);
    if (e.tv) parts.push(e.tv);
    return parts.join(', ');
  }

  const row = e => el('a', { class: `sp-row ${e.status}`, 'aria-label': label(e), ...linkProps(e.url || 'https://www.espn.com/') },
    el('span', { class: 'sp-tag', text: e.tag }), matchup(e), when(e));

  // ---- list ----

  const what = id => (id === 'f1' ? 'the F1 calendar' : `the schedule for ${teamOf(id).name}`);

  // A line per source that failed: how old the data shown is, or what couldn't load.
  function problems(follow) {
    const lines = [];
    for (const [host, ids] of [['ESPN', follow.filter(id => id !== 'f1')], ['Jolpica', follow.filter(id => id === 'f1')]]) {
      const failed = ids.filter(id => sources.get(id)?.error);
      const stale = failed.filter(id => sources.get(id).data);
      if (stale.length) {
        const ago = timeAgo(Math.min(...stale.map(id => sources.get(id).at)));
        lines.push(ago === 'now' ? `${host} unreachable` : `${host} unreachable · data from ${ago} ago`);
      }
      for (const id of failed.filter(id => !sources.get(id).data)) lines.push(`Couldn't load ${what(id)}`);
    }
    return lines.map(text => el('p', { class: 'widget-note', text }));
  }

  const pickLink = text => el('button', { type: 'button', class: 'link-btn', text, onclick: () => setEditing(true) });

  function render() {
    const s = settings();
    if (!s.follow.length) {
      list.replaceChildren(widgetEmpty('Nothing chosen. ', pickLink('Choose teams')));
      notes.replaceChildren();
      return;
    }
    const days = timeline(applyLive(events(), live), { follow: s.follow, f1Sessions: s.f1Sessions, now: Date.now() });
    list.replaceChildren(...(days.length
      ? days.flatMap(d => [el('div', { class: 'sp-day', text: d.label }), ...d.events.map(row)])
      : [widgetEmpty(loaded ? 'No games scheduled yet' : 'Loading…')]));
    const hint = !s.edited && !s.follow.some(id => /^(nba|nfl):/.test(id));
    notes.replaceChildren(...problems(s.follow),
      ...(hint ? [el('p', { class: 'widget-note' }, pickLink('Pick your NBA and NFL teams'))] : []));
  }

  // ---- editor: ✎ swaps the list for team buttons; changes apply as they're made ----

  let editing = false;

  function update(fn) {
    store.update(s => {
      const own = copyById(s, copy.id);
      if (own) fn(own.settings);
    });
  }
  const toggled = (ids, id, on) => [...ids.filter(x => x !== id), ...(on ? [id] : [])];

  // A button that stays pressed while its item is chosen.
  function chip(text, title, pressed, onToggle) {
    const button = el('button', {
      type: 'button', class: 'sp-chip', text, title, 'aria-pressed': String(pressed),
      onclick: () => {
        const on = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(on));
        onToggle(on);
      },
    });
    return button;
  }

  function renderEditor() {
    const s = settings();
    const teamChip = (sport, t) => {
      const id = `${sport}:${t.id}`;
      return chip(t.abbr, t.name, s.follow.includes(id), on => update(own => { own.follow = toggled(own.follow, id, on); }));
    };
    const check = (id, text) => {
      const input = el('input', {
        type: 'checkbox', checked: s.follow.includes(id),
        onchange: () => update(own => { own.follow = toggled(own.follow, id, input.checked); }),
      });
      return el('label', { class: 'mk-check' }, input, el('span', { text }));
    };
    const sessionChip = x => chip(F1_SESSION_LABELS[x], null, s.f1Sessions.includes(x),
      on => update(own => { own.f1Sessions = F1_SESSIONS.filter(y => (y === x ? on : own.f1Sessions.includes(y))); }));
    editor.replaceChildren(
      widgetSub('NBA'), el('div', { class: 'sp-chips' }, NBA_TEAMS.map(t => teamChip('nba', t))),
      widgetSub('NFL'), el('div', { class: 'sp-chips' }, NFL_TEAMS.map(t => teamChip('nfl', t))),
      widgetSub('Messi'), el('div', { class: 'mk-checks' }, SOCCER_TEAMS.map(t => check(`soccer:${t.id}`, t.name))),
      widgetSub('Formula 1'), el('div', { class: 'mk-checks' }, check('f1', 'Follow F1')),
      el('div', { class: 'sp-chips' }, F1_SESSIONS.map(sessionChip)));
  }

  function setEditing(on) {
    editing = on;
    section.classList.toggle('editing', on);
    editButton.replaceChildren(icon(on ? 'check' : 'edit', 15));
    editButton.title = on ? 'Done' : 'Choose teams';
    editButton.setAttribute('aria-label', editButton.title);
    editButton.setAttribute('aria-pressed', String(on));
    list.hidden = on;
    notes.hidden = on;
    editor.hidden = !on;
    if (on) {
      if (!settings().edited) update(own => { own.edited = true; });
      renderEditor();
    }
  }

  setEditing(false);

  // ---- wiring ----

  let seq = 0;
  async function load() {
    const my = ++seq;
    const { follow } = settings();
    const entries = await Promise.all(follow.map(async id => [id, await loadSource(id)]));
    if (my !== seq) return;
    sources = new Map(entries);
    const [games, result] = await Promise.all([loadLive(events()), loadPodium(events())]);
    if (my !== seq) return;
    live = games;
    podium = result;
    loaded = true;
    render();
  }

  function renderCached() {
    sources = new Map(settings().follow.map(id => [id, cachedSource(id)]));
    live = cachedLive(events());
    podium = peek(F1_LAST)?.data ?? null;
    render();
  }

  let conf = null;
  let timer = 0;

  function onPrefs(state) {
    const own = copyById(state, copy.id);
    if (!own) return;
    // Under 3 cells wide there is no room for logos and channels.
    section.classList.toggle('narrow', own.w < 3);
    const s = own.settings;
    const next = JSON.stringify([s.follow, s.f1Sessions, s.edited, state.prefs.openInNewTab, hour24()]);
    if (next === conf) return;
    const first = conf === null;
    conf = next;
    renderCached();
    clearTimeout(timer);
    timer = setTimeout(load, first ? 0 : RECONFIGURE_MS);
  }

  function refresh() {
    if (document.visibilityState === 'visible') load();
  }

  // Scoreboards are saved per league and day: drop those more than 3 days old.
  sweep(`${KEY}:live:`, key => key.slice(-8) >= etDay(Date.now() - 3 * DAY));
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
```

- [ ] **Step 2: Register the mount, the icon and the Preferences row**

`js/registry.js`: under `import { mountGithub } from './github-widget.js';` add `import { mountSports } from './sports-widget.js';`, and in `MOUNTS` after `github: mountGithub,` add `sports: mountSports,`.

`js/ui.js`: in `ICONS`, after the `trend:` line add:

```js
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.7 4M17 6h2.5a2.5 2.5 0 0 1-2.7 4M12 14v3M8.5 20h7M9.5 17h5"/>',
```

`js/prefs.js`: in `copyRows`, after

```js
      case 'markets':
        return [row('Coins and pairs', el('span'), 'Use ✎ on the widget to choose them')];
```

add

```js
      case 'sports':
        return [row('Teams and F1', el('span'), 'Use ✎ on the widget to choose them')];
```

- [ ] **Step 3: Add the styles**

In `css/newtab.css`, after the line `.mk-add .pref-input { flex: 1; width: auto; min-width: 0; }`, add:

```css

/* Sports: the followed teams' games by day. A row is the tag, the matchup, then the time (or the
   score) and the channel. */
.sp-day { margin: 10px 0 2px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.sp-list > .sp-day:first-child { margin-top: 0; }
.sp-row {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin: 0 -8px;
  padding: 5px 8px;
  border-radius: 8px;
  color: var(--text);
  text-decoration: none;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.sp-row:hover { background: var(--hover); }
.sp-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.sp-row.final, .sp-row.off { opacity: 0.62; }
.sp-tag { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 10.5px; font-weight: 600; letter-spacing: 0.03em; color: var(--muted); }
.sp-match { display: flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; white-space: nowrap; }
.sp-match b { font-weight: 700; }
.sp-title { overflow: hidden; text-overflow: ellipsis; }
.sp-at { color: var(--muted); }
.sp-score { font-weight: 600; }
.sp-logo { flex: none; width: 16px; height: 16px; object-fit: contain; }
.sp-when { display: flex; align-items: center; justify-content: flex-end; gap: 6px; white-space: nowrap; }
.sp-when > .icon { color: var(--muted); }
.sp-tv { font-size: 11.5px; color: var(--muted); }
.sp-row.live .sp-when { color: var(--down); }
.sp-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: sp-pulse 1.6s ease-in-out infinite; }
@keyframes sp-pulse { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .sp-dot { animation: none; } }
.sp-res { min-width: 18px; padding: 1px 4px; border-radius: 4px; font-size: 11px; font-weight: 700; text-align: center; }
.sp-res.W { color: var(--up); background: color-mix(in srgb, var(--up) 16%, transparent); }
.sp-res.L { color: var(--down); background: color-mix(in srgb, var(--down) 16%, transparent); }
.sp-res.D { color: var(--muted); background: var(--hover); }
/* Under 3 cells wide: no logos, no channels. */
.widget-sports.narrow .sp-logo, .widget-sports.narrow .sp-tv { display: none; }
.widget-sports.narrow .sp-row { grid-template-columns: 38px minmax(0, 1fr) auto; }

/* Sports editor: team buttons that stay pressed while followed. */
.sp-editor > .widget-sub:first-child { margin-top: 0; }
.sp-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.sp-chips + .widget-sub { margin-top: 12px; }
.mk-checks + .sp-chips { margin-top: 4px; }
.sp-chip { padding: 3px 7px; border: 1px solid var(--border); border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
.sp-chip:hover { color: var(--text); background: var(--hover); }
.sp-chip[aria-pressed="true"] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); background: var(--accent-soft); }
.sp-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
```

- [ ] **Step 4: Run the unit tests**

Run: `npm test`
Expected: PASS, every file.

- [ ] **Step 5: Check it in the browser**

Save this script as `C:\Users\nivb4\AppData\Local\Temp\claude\c--Users-nivb4-OneDrive-Desktop-new-tab\c2ff77cd-9aa7-4e1d-b795-748e7f583755\scratchpad\sports-shot.mjs` (not committed). It serves the worktree, opens it in Playwright's Chromium on CDP port 9367 with its own profile, seeds a layout with three Sports copies and cached rows (live, final, postponed, an error), and saves screenshots of the list and the editor.

```js
// Screenshots the Sports widget on the static preview in headless Chromium, with seeded rows.
// Usage: node sports-shot.mjs <repoDir> <outDir>
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [repo, out] = process.argv.slice(2);
const PORT = 5531;
const CDP = 9367;
const pw = join(process.env.LOCALAPPDATA, 'ms-playwright');
const build = readdirSync(pw).filter(d => /^chromium-\d+$/.test(d)).sort().at(-1);
const chrome = join(pw, build, 'chrome-win64', 'chrome.exe');
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: repo, stdio: 'ignore' });
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${join(out, 'profile-sports-shot')}`, 'about:blank'], { stdio: 'ignore' });

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(t => t.type === 'page');
  } catch {
    // not up yet
  }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let next = 0;
const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  pending.get(m.id)?.(m);
  pending.delete(m.id);
});
const send = (method, params = {}) => new Promise(r => {
  pending.set(++next, r);
  ws.send(JSON.stringify({ id: next, method, params }));
});
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, name), Buffer.from(r.result.data, 'base64'));
  console.log('wrote', join(out, name));
};

await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
// Seed from a page of the same origin that doesn't run the app, so nothing writes over the seed.
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/manifest.json` });
await sleep(800);

await evaluate(`(() => {
  localStorage.clear();
  const now = Date.now(), H = 3600e3, D = 24 * H;
  const team = (league, id, abbr, name, score = null, winner = false) =>
    ({ id, abbr, name, logo: 'https://a.espncdn.com/i/teamlogos/' + league + '/500/' + abbr.toLowerCase() + '.png', score, winner });
  const game = o => ({ timeValid: true, off: null, tv: '', url: 'https://www.espn.com/', detail: '', ...o });
  const put = (key, data) => localStorage.setItem('newtab:cache:sports-v1:' + key, JSON.stringify({ at: now, data }));
  put('team:nba:13', [
    game({ id: 's1', sport: 'nba', league: 'nba', tag: 'NBA', start: now - H, state: 'in', detail: 'Q3 5:21', tv: 'ESPN',
      home: team('nba', '13', 'LAL', 'Los Angeles Lakers', '87'), away: team('nba', '9', 'GS', 'Golden State Warriors', '84') }),
    game({ id: 's2', sport: 'nba', league: 'nba', tag: 'NBA', start: now + 2 * D, state: 'pre',
      home: team('nba', '26', 'UTAH', 'Utah Jazz'), away: team('nba', '13', 'LAL', 'Los Angeles Lakers') }),
  ]);
  put('team:nfl:12', [
    game({ id: 's3', sport: 'nfl', league: 'nfl', tag: 'NFL', start: now - 20 * H, state: 'post', detail: 'Final', tv: 'CBS',
      home: team('nfl', '13', 'LV', 'Las Vegas Raiders', '27'), away: team('nfl', '12', 'KC', 'Kansas City Chiefs', '30', true) }),
    game({ id: 's4', sport: 'nfl', league: 'nfl', tag: 'NFL', start: now + 26 * H, state: 'pre', tv: 'NBC',
      home: team('nfl', '26', 'SEA', 'Seattle Seahawks'), away: team('nfl', '12', 'KC', 'Kansas City Chiefs') }),
  ]);
  const flag = (id, abbr, name) => ({ id, abbr, name, logo: 'https://a.espncdn.com/i/teamlogos/countries/500/' + abbr.toLowerCase() + '.png', score: null, winner: false });
  put('soccer:202:next', [game({ id: 's5', sport: 'soccer', league: 'fifa.friendly', tag: 'Friendly', start: now + 3 * D, state: 'pre', off: 'Postponed',
    home: flag('202', 'ARG', 'Argentina'), away: flag('205', 'BRA', 'Brazil') })]);
  put('soccer:202:last', []);
  localStorage.setItem('newtab:cache:sports-v1:team:nba:2:attempt', JSON.stringify({ at: now, error: { status: 500, rateLimited: false, message: 'HTTP 500' } }));
  const sports = settings => ({ type: 'sports', settings: { f1Sessions: ['sprint', 'qualifying', 'race'], edited: true, ...settings } });
  const prefs = { layout: { cols: 12, rows: 12, widgets: [
    { id: 'clock', type: 'clock', x: 0, y: 0, w: 3, h: 3, settings: {} },
    { id: 'sp-wide', x: 3, y: 0, w: 4, h: 10, ...sports({ follow: ['nba:13', 'nfl:12', 'soccer:20232', 'soccer:202', 'f1'] }) },
    { id: 'sp-narrow', x: 7, y: 0, w: 2, h: 8, ...sports({ follow: ['nba:2', 'f1'] }) },
    { id: 'sp-new', type: 'sports', x: 9, y: 0, w: 3, h: 8, settings: {} },
  ] } };
  localStorage.setItem('newtab:state', JSON.stringify({ prefs }));
  localStorage.setItem('newtab:prefs', JSON.stringify(prefs));
})()`);
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/newtab.html` });
await sleep(8000);
await shot('sports-1-list.png');
console.log(JSON.stringify(await evaluate(`[...document.querySelectorAll('.widget-sports')].map(w => w.innerText)`), null, 2));

await evaluate(`document.querySelector('[data-id="sp-wide"] .widget-edit').click()`);
await sleep(400);
await shot('sports-2-editor.png');

ws.close();
browser.kill();
server.kill();
process.exit(0);
```

Run (from the worktree):

```bash
node "C:/Users/nivb4/AppData/Local/Temp/claude/c--Users-nivb4-OneDrive-Desktop-new-tab/c2ff77cd-9aa7-4e1d-b795-748e7f583755/scratchpad/sports-shot.mjs" . "C:/Users/nivb4/AppData/Local/Temp/claude/c--Users-nivb4-OneDrive-Desktop-new-tab/c2ff77cd-9aa7-4e1d-b795-748e7f583755/scratchpad/shots"
```

Then stop any Chromium left over (PowerShell):

```powershell
Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object CommandLine -like '*profile-sports-shot*' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

Open both PNGs with the Read tool and check, against the printed `innerText`:
- `sp-wide`: a day heading over each group; `GS 84 – 87 LAL` with a red pulsing dot and `Q3 5:21`; `KC 30 – 27 LV` dimmed with a green `W` and `Final`; `KC @ SEA` with its time and `NBC`; `LAL @ UTAH`; `Friendly ARG @ BRA … Postponed` (ESPN's home/away order as seeded); real Inter Miami fixtures (`MIA @ ATL`, `Apple TV`) and real F1 rows (`US GP · Qualifying`, `US GP · Race`); followed abbreviations in bold; logos beside each team; a moon beside starts between 00:00 and 06:59.
- `sp-narrow`: no logos, no channels; the note `Couldn't load the schedule for Boston Celtics`; F1 rows.
- `sp-new`: Inter Miami, Argentina and F1 rows, and the note `Pick your NBA and NFL teams`.
- Editor shot: NBA and NFL chips with `LAL` and `KC` pressed (accent colour), Inter Miami and Argentina ticked, Follow F1 ticked, Sprint, Qualifying and Race pressed.

If a check fails, fix the code and run the script again before committing.

- [ ] **Step 6: Commit**

```bash
git add js/sports-widget.js js/registry.js js/ui.js js/prefs.js css/newtab.css
git commit -m "feat: Sports widget: the followed teams' games, Messi's and F1 in one timeline, with live scores and a day of results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: README, and landing on main

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

In the *What's on the page* table, after the **GitHub** row, add:

```markdown
| **Sports** | Your NBA and NFL teams' games, Messi's (Inter Miami and Argentina) and F1 sessions in one list by day, with live scores and a day of results. |
```

In the *Layout mode* section's tray bullet, replace `Markets, GitHub, tiles blocks and Claude allow five each.` with `Markets, GitHub, Sports, tiles blocks and Claude allow five each.`

Before `## Search bar and AI chats`, add:

```markdown
## Sports

Add the **Sports** widget in [Layout mode](#layout-mode). It lists what's coming up for the teams
you follow in one list by day (Today, Tomorrow, Sun 18 Oct), in your computer's time zone.

- **Choose what's shown:** hover the widget and click **✎**. Press the NBA and NFL teams you
  follow (hover a button for the team's full name), tick Messi's teams (Inter Miami, Argentina)
  and F1, and pick the F1 sessions you want (Practice, Sprint, Qualifying, Race). Changes apply as
  you go; **✓** closes the editor. A new widget follows Inter Miami, Argentina and F1.
- **A row:** the league or competition (NBA, NFL, MLS, Leagues Cup, World Cup, F1, …), the
  teams with yours in bold, the start time and the TV channel. A moon marks games that start
  between midnight and 7 in the morning. Times follow the Clock's 12/24-hour setting.
- **Live:** a red dot, the score and the clock (Q3 5:21, 67'). Scores refresh every 30 seconds
  while the tab is open. F1 sessions read LIVE while they're scheduled to run.
- **Results:** a finished game stays for a day with its score and W, L or D for your team; after
  a race, the podium.
- **Click a row** to open the game on ESPN (F1: the season on formula1.com).
- The list covers the next 14 days; a team with nothing in that time still shows its next game.
  Up to five copies can each follow their own list (say, F1 alone in a corner).

Schedules come from ESPN's public site API and from Jolpica F1 (the successor of the Ergast API),
both free and without a key. Team schedules are checked every 6 hours and the F1 calendar once a
day; every copy and every open tab shares one fetch.
```

In *Your data*, add these rows to the table after the GitHub row:

```markdown
| Sports (NBA, NFL, soccer) | `site.api.espn.com` (schedules, scores); team logos from `a.espncdn.com` | every 6 hours; every 30 s while one of your games is on |
| Sports (F1) | `api.jolpi.ca` | calendar once a day; hourly after a race until the result is in |
```

In *Known limits*, add:

```markdown
- Sports: ESPN's site API is public but unofficial and can change without notice. The widget then
  keeps the last schedule it had and says ESPN is unreachable. F1 "live" follows the timetable,
  not live timing (there is no free live timing).
```

In *Development*, change `Runs the unit tests (store, importer, tile/group/folder actions, feeds, network cache, tasks,
helpers)` to `Runs the unit tests (store, importer, tile/group/folder actions, feeds, sports schedules and timeline,
network cache, tasks, helpers)`.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README for the Sports widget: following teams, rows, live scores, where the data comes from

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Bring in main and test again**

In the worktree:

```bash
git merge main
npm test
```

Expected: the merge applies (resolve any conflict in `js/layout.js`, `js/prefs.js`, `js/registry.js`, `js/ui.js`, `css/newtab.css` or `README.md` by keeping both sides' additions), and every test passes. If `main` changed `js/layout.js` or `js/prefs.js`, run the browser check of Task 7 Step 5 again.

- [ ] **Step 4: Land on main**

`ExitWorktree` (keep). From the main checkout:

```bash
git status --porcelain -- js/layout.js js/prefs.js js/registry.js js/ui.js js/net.js css/newtab.css README.md test/layout.test.js test/net.test.js
```

Expected: no output. If another session has uncommitted edits to one of these files, wait for them to commit (poll that command in a background until-loop), then:

```bash
git merge --ff-only sports-widget
npm test
git worktree remove .claude/worktrees/sports-widget
git branch -d sports-widget
```

Expected: fast-forward, every test passes. Tell the other sessions (`ListAgents`, then `SendMessage`) that `main` now has the Sports widget and which shared files changed.
