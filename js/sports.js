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
