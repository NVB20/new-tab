// Sports widget data: the teams a copy can follow, its settings, parsers for ESPN's site API
// (NBA, NFL, soccer), 365Scores (Israeli clubs, national teams and any team found by search) and
// Jolpica F1, the team search, and the timeline the widget draws. Pure (unit-tested in Node).

import { MONTHS } from './feeds.js';
import { onlyFrom } from './util.js';

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

// Teams whose games come from 365Scores, followed as '365:<id>' (its team ids are unique across
// sports); kind is 'soccer' or 'basketball'.
export const KINDS = ['soccer', 'basketball'];
const teams365 = (kind, list) => teams(list).map(t => ({ ...t, kind }));

// Israeli clubs of the 2026-27 season and the national teams, by their 365Scores ids (from
// /web/standings, 2026-10-18). Ligat Ha'Al is soccer's top league, the Winner League basketball's.
export const IL_SOCCER_CLUBS = teams365('soccer', [
  [559, 'BEI', 'Beitar Jerusalem'], [561, 'BNS', 'Bnei Sakhnin'], [579, 'HBS', 'Hapoel Beer Sheva'],
  [575, 'HHA', 'Hapoel Haifa'], [614, 'HJE', 'Hapoel Jerusalem'], [571, 'HPT', 'Hapoel Petah Tikva'],
  [574, 'HRG', 'Hapoel Ramat Gan'], [567, 'HTA', 'Hapoel Tel Aviv'], [606, 'ITB', 'Ironi Tiberias'],
  [563, 'IKS', 'Kiryat Shmona'], [562, 'MHA', 'Maccabi Haifa'], [560, 'NET', 'Maccabi Netanya'],
  [564, 'MPT', 'Maccabi Petah Tikva'], [566, 'MTA', 'Maccabi Tel Aviv'],
]);
export const IL_BASKET_CLUBS = teams365('basketball', [
  [632, 'HER', 'Bnei Hertzliya'], [27923, 'HBS', 'Hapoel Beer Sheva/Dimona'], [10884, 'HGE', 'Hapoel Galil Elion'],
  [91167, 'EMK', 'Hapoel HaEmek'], [633, 'HOL', 'Hapoel Holon'], [9900, 'EIL', 'Hapoel Ironi Eilat'],
  [634, 'JER', 'Hapoel Jerusalem'], [654, 'HTA', 'Hapoel Tel Aviv'], [641, 'ATA', 'Ironi Kiryat Ata'],
  [686, 'NES', 'Ironi Ness Ziona'], [652, 'ASH', 'Maccabi Ashdod'], [635, 'IRG', 'Maccabi Ironi Ramat Gan'],
  [640, 'RSH', 'Maccabi Rishon Lezion'], [631, 'MTA', 'Maccabi Tel Aviv'],
]);
export const NATIONAL_TEAMS = [...teams365('soccer', [[5034, 'ISR', 'Israel']]), ...teams365('basketball', [[1728, 'ISR', 'Israel']])];
// Teams ESPN already brings (Messi's), by their 365Scores id → their ESPN id; and 365Scores' NBA,
// whose teams the NBA list has.
export const ON_ESPN = { 54729: 'soccer:20232', 2378: 'soccer:202' };
const NBA_365 = 103;

const TEAMS = { nba: NBA_TEAMS, nfl: NFL_TEAMS, soccer: SOCCER_TEAMS, 365: [...IL_SOCCER_CLUBS, ...IL_BASKET_CLUBS, ...NATIONAL_TEAMS] };

export const F1_SESSIONS = ['practice', 'sprint', 'qualifying', 'race'];
export const F1_SESSION_LABELS = { practice: 'Practice', sprint: 'Sprint', qualifying: 'Qualifying', race: 'Race' };
const DEFAULT_FOLLOW = ['soccer:20232', 'soccer:202', 'f1'];
const DEFAULT_SESSIONS = ['sprint', 'qualifying', 'race'];

// A short name for a team that has none: the first three letters of its first word that has three.
const shortName = name => (name.split(/\s+/).find(w => w.length >= 3) ?? name).slice(0, 3).toUpperCase();

// A followed 365Scores team found by search, as a copy saves it ({ name, abbr, kind }), or null.
function cleanTeam(t) {
  if (t === null || typeof t !== 'object' || !KINDS.includes(t.kind)) return null;
  const name = typeof t.name === 'string' ? t.name.trim().slice(0, 80) : '';
  const abbr = typeof t.abbr === 'string' ? t.abbr.trim().slice(0, 8) : '';
  return name ? { name, abbr: abbr || shortName(name), kind: t.kind } : null;
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// A followed id ('nba:13', 'soccer:202', '365:631') → { sport, id, abbr, name }, with kind for a
// 365Scores team; 'f1' and unknown ids → null. found: the copy's teams found by search.
export function teamOf(followId, found = {}) {
  const parts = String(followId).split(':');
  if (parts.length !== 2) return null;
  const [sport, id] = parts;
  let team = Object.hasOwn(TEAMS, sport) ? TEAMS[sport].find(t => t.id === id) : null;
  if (!team && sport === '365' && /^\d+$/.test(id) && isObject(found) && Object.hasOwn(found, id)) {
    const saved = cleanTeam(found[id]);
    team = saved && { id, ...saved };
  }
  return team ? { sport, ...team } : null;
}

// Israeli teams were followed as 'il-soccer:<id>' and 'il-basket:<id>' until 2026-10-18.
const renamed = id => (typeof id === 'string' ? id.replace(/^il-(soccer|basket):/, '365:') : id);

// A Sports copy's settings: follow (team ids as above, and 'f1'), the F1 sessions it shows,
// whether its editor has been opened, and teams (the followed teams found by search that no list
// has: { [365Scores id]: { name, abbr, kind } }). Unknown ids and sessions go; a missing field
// takes its default.
export function cleanSports(s = {}) {
  const found = isObject(s.teams) ? s.teams : {};
  const follow = Array.isArray(s.follow)
    ? [...new Set(s.follow.map(renamed).filter(id => id === 'f1' || teamOf(id, found)))]
    : [...DEFAULT_FOLLOW];
  const f1Sessions = Array.isArray(s.f1Sessions) ? F1_SESSIONS.filter(x => s.f1Sessions.includes(x)) : [...DEFAULT_SESSIONS];
  const teams = {};
  for (const id of follow) {
    const [sport, team] = id.split(':');
    if (sport === '365' && !teamOf(id)) teams[team] = cleanTeam(found[team]);
  }
  return { follow, f1Sessions, edited: s.edited === true, teams };
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
export const competitionTag = (slug, abbreviation) => (Object.hasOwn(COMPETITIONS, slug) ? COMPETITIONS[slug] : abbreviation ? String(abbreviation) : 'Soccer');

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
const LENGTH = { nba: 150, nfl: 210, soccer: 120, 365: 120 };   // minutes a game usually takes
const ESPN_SPORTS = new Set(['nba', 'nfl', 'soccer']);

export const byStart = (a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
// How long an event usually takes, in ms (F1 sessions carry their own minutes).
export const lengthOf = e => (e.minutes ?? LENGTH[e.sport] ?? 120) * MIN;

// Schedules give the score as { displayValue }, scoreboards as a string.
const scoreOf = s => {
  const v = s !== null && typeof s === 'object' ? s.displayValue : s;
  return v == null || v === '' ? null : String(v);
};

// Links and logos come from a response we don't control: keep only links to ESPN's site (its
// events also link to bookmakers), and logos from ESPN's CDN.
const espnLink = url => onlyFrom('https://www.espn.com/', url);

function side(competitors, where) {
  const c = competitors.find(x => x?.homeAway === where);
  const t = c?.team;
  if (t?.id == null) return null;
  return {
    id: String(t.id),
    abbr: String(t.abbreviation ?? ''),
    name: String(t.displayName ?? t.abbreviation ?? ''),
    logo: onlyFrom('https://a.espncdn.com/', t.logo ?? t.logos?.[0]?.href),
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
  // The soccer slug goes into scoreboard addresses later, so it must look like one ('usa.1').
  const raw = String(league ?? e.league?.slug ?? '');
  const slug = sport === 'soccer' ? (/^[a-z0-9.]+$/.test(raw) ? raw : '') : sport;
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
    off: Object.hasOwn(OFF, String(type.name)) ? OFF[type.name] : null,
    home: { ...home, score: scored ? home.score : null },
    away: { ...away, score: scored ? away.score : null },
    tv: String(tv?.media?.shortName ?? tv?.names?.[0] ?? ''),
    url: espnLink(e.links?.find(l => l?.rel?.includes('summary') && l.rel.includes('desktop'))?.href),
  };
}

// A team's schedule → { type, events }, or null when the response isn't a schedule (events not a
// list, or none of them readable). type is the part of the season ESPN sent: for NBA and NFL,
// 1 preseason, 2 regular season, 3 playoffs, 5 the NBA play-in.
export function parseSchedule(json, sport) {
  if (!Array.isArray(json?.events)) return null;
  const events = json.events.map(e => parseEspnEvent(e, sport)).filter(Boolean);
  if (json.events.length && !events.length) return null;
  const type = Number.isInteger(json.requestedSeason?.type) ? json.requestedSeason.type : null;
  return { type, events };
}

// ESPN sends only the current part of the season, so a schedule whose last game is within the
// timeline's two weeks (or past) asks for the parts after it too: the season types to add.
export function nextPhases({ type, events }, sport, now) {
  if (events.some(e => e.start > now + 14 * DAY)) return [];
  if (type === 1) return [2];
  if (type === 2) return sport === 'nba' ? [5, 3] : sport === 'nfl' ? [3] : [];
  return type === 5 ? [3] : [];
}

// A scoreboard's games, or null when the response isn't one.
export function parseScoreboard(json, sport, league) {
  if (!Array.isArray(json?.events)) return null;
  const games = json.events.map(e => parseEspnEvent(e, sport, league)).filter(Boolean);
  return json.events.length && !games.length ? null : games;
}

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
    if (!g || (e.state === 'post' && g.state !== 'post')) return e;
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

const formats = new Map();
// Building an Intl.DateTimeFormat costs far more than using one, and a draw formats every row a
// few times: one is kept per locale and options (a time zone of undefined is the computer's).
function formatter(locale, options) {
  const key = locale + JSON.stringify(options);
  let f = formats.get(key);
  if (!f) formats.set(key, (f = new Intl.DateTimeFormat(locale, options)));
  return f;
}

// The calendar day of a time in a time zone (undefined: the computer's), as 'YYYY-MM-DD'.
function ymd(ms, timeZone) {
  const f = formatter('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(ms).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// The US Eastern day ESPN's scoreboards file a game under: '20261021'.
export const etDay = ms => ymd(ms, 'America/New_York').replaceAll('-', '');

// The scoreboards that matter, one per league and day, with the ids of their games: ESPN team
// games that have started, are still listed and that their schedule doesn't call final yet.
export function scoreboards(events, now) {
  const out = new Map();
  for (const e of events) {
    if (!ESPN_SPORTS.has(e.sport) || e.off || e.state === 'post' || (!e.timeValid && e.state === 'pre') || e.start > now || now >= e.start + lengthOf(e) + DAY) continue;
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

// ---- 365Scores: Israeli clubs, national teams and any team found by search ----

// Competitions by 365Scores id → the short name they go by in the list (Israel's, and England's
// Premier League, whose name other countries' leagues share); international ones go by their
// name, the rest by the name 365Scores gives them (LaLiga, Serie A, Bundesliga, Ligue 1, NBA).
const COMPETITIONS_365 = {
  42: "Ha'Al", 43: 'Leumit', 49: 'State Cup', 546: 'Toto Cup', 6285: 'Super Cup',
  47: 'Winner', 7202: 'Leumit', 51: 'State Cup', 609: 'Winner Cup', 8844: 'Super Cup', 7: 'EPL',
};
const NAMED_COMPETITIONS = [
  [/^UEFA Champions League/, 'UCL'], [/^UEFA Europa League/, 'UEL'], [/^UEFA Conference League/, 'UECL'],
  [/Nations League/, 'UNL'], [/W(orld )?C(up)? Qual/i, 'WC qual.'], [/^FIBA World Cup$/, 'World Cup'],
  [/^EuroLeague/i, 'EuroLeague'], [/^Eurocup/i, 'EuroCup'], [/^Basketball Champions League/, 'BCL'], [/Friendl/, 'Friendly'],
];
export function competition365(id, name) {
  if (Object.hasOwn(COMPETITIONS_365, id)) return COMPETITIONS_365[id];
  const base = String(name ?? '').split(' - ')[0].trim();
  return NAMED_COMPETITIONS.find(([pattern]) => pattern.test(base))?.[1] ?? base;
}

const whole = v => Number.isInteger(v) && v >= 0;
const IMAGES = 'https://imagecache.365scores.com/image/upload/f_png,w_32,h_32,c_limit,q_auto:eco,dpr_2,d_Competitors:default1.png';
// A team's logo on 365Scores' image host, built from its id and image version alone.
export const logo365 = (id, version) => (whole(id) && whole(version) ? `${IMAGES}/v${version}/Competitors/${id}` : '');

// A game's page on 365scores.com; '' when an id isn't a number. kind: 'soccer' or 'basketball'.
export function link365(kind, game, competition) {
  const home = game?.homeCompetitor;
  const away = game?.awayCompetitor;
  const comp = game?.competitionId;
  if (![game?.id, comp, home?.id, away?.id].every(whole)) return '';
  const slug = s => encodeURIComponent(String(s ?? ''));
  return `https://www.365scores.com/${kind === 'basketball' ? 'basketball' : 'football'}/match/${slug(competition?.nameForURL)}-${comp}/`
    + `${slug(home.nameForURL)}-${slug(away.nameForURL)}-${home.id}-${away.id}-${comp}#id=${game.id}`;
}

// 365Scores gives no short name for some teams.
const abbr365 = c => (c.symbolicName ? String(c.symbolicName) : shortName(String(c.name ?? '')));
// 365Scores' sport ids → the kinds the widget follows.
const KIND_OF = { 1: 'soccer', 2: 'basketball' };

function side365(c) {
  if (!whole(c?.id)) return null;
  const score = Number(c.score);   // -1 before the start
  return {
    id: String(c.id),
    abbr: abbr365(c),
    name: String(c.name ?? ''),
    logo: logo365(c.id, c.imageVersion),
    score: Number.isFinite(score) && score >= 0 ? String(score) : null,
    winner: c.isWinner === true,
  };
}

// Games that didn't happen come among the finished ones (group 4), told apart by their status.
const OFF_365 = [[/postpon/i, 'Postponed'], [/cancel/i, 'Cancelled'], [/abandon/i, 'Abandoned'], [/suspend|interrupt/i, 'Suspended']];

// What a live or finished game shows in place of its time: "63'", 'HT', 'Q2 0:31' (365Scores says
// which by its display type: 1 the status, 2 the clock, 3 both); FT, FT-Pens, AET, Final, Final/OT.
function detail365(g, state, kind) {
  const status = String(g.statusText ?? '');
  if (state === 'post') {
    if (kind === 'basketball') return /OT/.test(status) ? 'Final/OT' : 'Final';
    return /penalt/i.test(status) ? 'FT-Pens' : /extra|\bAET\b|\bET\b/i.test(status) ? 'AET' : 'FT';
  }
  if (state !== 'in') return '';
  const short = String(g.shortStatusText ?? status);
  const clock = String(g.gameTimeDisplay ?? '').replace(/^0(\d)/, '$1');
  if (g.gameTimeAndStatusDisplayType === 2) return clock || short;
  if (g.gameTimeAndStatusDisplayType === 3) return [short, clock].filter(Boolean).join(' ');
  return short;
}

// One game from 365Scores → an event like an ESPN game's (sport '365', and kind), or null when it
// lacks an id, a start or a side, or is neither soccer nor basketball. competition: its entry in
// the response's competitions.
export function parse365Game(g, competition) {
  const start = Date.parse(g?.startTime);
  const home = side365(g?.homeCompetitor);
  const away = side365(g?.awayCompetitor);
  const kind = Object.hasOwn(KIND_OF, g?.sportId) ? KIND_OF[g.sportId] : null;
  if (!whole(g?.id) || !Number.isFinite(start) || !home || !away || !kind) return null;
  const off = OFF_365.find(([pattern]) => pattern.test(String(g.statusText ?? '')))?.[1] ?? null;
  const state = g.statusGroup === 3 ? 'in' : g.statusGroup === 4 ? 'post' : 'pre';
  const scored = state !== 'pre' && !off;
  return {
    id: `365:${g.id}`,
    sport: '365',
    kind,
    league: '',
    tag: competition365(g.competitionId, competition?.name ?? g.competitionDisplayName) || (kind === 'basketball' ? 'Basketball' : 'Soccer'),
    start,
    timeValid: true,
    state,
    detail: off ? '' : detail365(g, state, kind),
    off,
    home: { ...home, score: scored ? home.score : null },
    away: { ...away, score: scored ? away.score : null },
    tv: '',
    url: link365(kind, g, competition),
  };
}

// A team's games (/web/games/current: its last result, a game under way, its next five) → events,
// or null when the response isn't a game list (games not a list, or none of them readable).
export function parse365Games(json) {
  if (!Array.isArray(json?.games)) return null;
  const competitions = new Map((Array.isArray(json.competitions) ? json.competitions : []).map(c => [c?.id, c]));
  const events = json.games.map(g => parse365Game(g, competitions.get(g?.competitionId))).filter(Boolean);
  return json.games.length && !events.length ? null : events;
}

// ---- searching for a team ----

const KIND_LABEL = { soccer: 'Soccer', basketball: 'Basketball' };
// Lower case, without accents or apostrophes: 'Atlético' and "Ha'Al" match 'atletico' and 'haal'.
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ'’]/g, '').toLowerCase().trim();

// A search result: id (what following it adds), name, meta (the muted line), logo, and team (what a
// copy saves for a 365Scores team no list has).
const result = (id, name, meta, logo = '', team = null) => ({ id, name, meta, logo, team });

// Words of a name, each after a space: ' hapoel beer sheva dimona'.
const words = s => ` ${fold(s).replace(/[^a-z0-9]+/g, ' ').trim()}`;

// The fixed lists' teams with a word starting with the text ('lakers', 'maccabi tel') or whose
// abbreviation is it, in list order.
export function searchLists(text) {
  const q = words(text).trim();
  if (q.length < 2) return [];
  const lists = [
    ['nba', NBA_TEAMS, () => 'NBA'], ['nfl', NFL_TEAMS, () => 'NFL'], ['soccer', SOCCER_TEAMS, () => 'Messi'],
    ['365', IL_SOCCER_CLUBS, () => "Ligat Ha'Al"], ['365', IL_BASKET_CLUBS, () => 'Winner League'],
    ['365', NATIONAL_TEAMS, t => `National team · ${KIND_LABEL[t.kind]}`],
  ];
  return lists.flatMap(([sport, list, meta]) => list
    .filter(t => words(t.name).includes(` ${q}`) || fold(t.abbr) === q)
    .map(t => result(`${sport}:${t.id}`, t.name, meta(t))));
}

// What /web/search found → results, in 365Scores' order (the most followed first): soccer and
// basketball teams it doesn't hide; Messi's teams as their ESPN ids, and none of its NBA teams
// (the NBA list has them). null when the response isn't a search result.
export function parse365Search(json) {
  if (!Array.isArray(json?.competitors)) return null;
  const countries = new Map((Array.isArray(json.countries) ? json.countries : []).map(c => [c?.id, String(c?.name ?? '')]));
  const out = [];
  for (const c of json.competitors) {
    const kind = Object.hasOwn(KIND_OF, c?.sportId) ? KIND_OF[c.sportId] : null;
    if (!kind || !whole(c.id) || c.hideOnSearch === true || c.mainCompetitionId === NBA_365 || !c.name) continue;
    const logo = logo365(c.id, c.imageVersion);
    if (Object.hasOwn(ON_ESPN, c.id)) {
      out.push(result(ON_ESPN[c.id], teamOf(ON_ESPN[c.id]).name, 'Messi', logo));
      continue;
    }
    const name = String(c.name).slice(0, 80);
    const meta = [countries.get(c.countryId), KIND_LABEL[kind]].filter(Boolean).join(' · ');
    out.push(result(`365:${c.id}`, name, meta, logo, { name, abbr: abbr365(c).slice(0, 8), kind }));
  }
  return out;
}

// The lists' matches first, then 365Scores' (a team both have takes 365Scores' logo), at most limit.
export function mergeResults(listed, found, limit = 8) {
  const byId = new Map(listed.map(r => [r.id, { ...r }]));
  for (const r of found ?? []) {
    const mine = byId.get(r.id);
    if (mine) mine.logo ||= r.logo;
    else byId.set(r.id, r);
  }
  return [...byId.values()].slice(0, limit);
}

// How long a team's saved 365Scores games stay fresh: 30 s while one may be under way (past its
// start and not over, up to twice its usual length), an hour while one that ended by the clock
// isn't over yet (until a day after its end), else 6 hours.
export function teamTtl(events, now) {
  const open = events.filter(e => !e.off && e.state !== 'post' && e.start <= now);
  if (open.some(e => now < e.start + 2 * lengthOf(e))) return 30e3;
  if (open.some(e => now < e.start + lengthOf(e) + DAY)) return 3600e3;
  return 6 * 3600e3;
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
const F1_RACE = ['Race', 'race', 'Race', 120];

// One session of a race weekend as an event; its id is the same whichever source lists it.
const f1Event = (season, round, raceName, [key, session, label, minutes], start, timeValid) => ({
  id: `f1:${season}-${round}-${key}`, sport: 'f1', tag: 'F1', session, season, round,
  title: `${raceShort(raceName)} · ${label}`, start, timeValid, minutes, state: 'pre',
  url: `https://www.formula1.com/en/racing/${season}`,
});

// The season (/current.json) → every session as an event, oldest first; null when it isn't one.
// A session without a time yet sits at noon UTC with timeValid false.
export function parseF1Season(json) {
  const table = json?.MRData?.RaceTable;
  if (!Array.isArray(table?.Races)) return null;
  const out = [];
  for (const r of table.Races) {
    const season = String(r.season ?? table.season ?? '');
    const add = (when, part) => {
      const start = Date.parse(`${when.date}T${when.time ?? '12:00:00Z'}`);
      if (Number.isFinite(start)) out.push(f1Event(season, Number(r.round), r.raceName, part, start, !!when.time));
    };
    for (const part of F1_PARTS) if (r[part[0]]) add(r[part[0]], part);
    add({ date: r.date, time: r.time }, F1_RACE);
  }
  return out.sort(byStart);
}

// ---- OpenF1, while Jolpica is down ----

// OpenF1's session names → Jolpica's parts (its testing days have none).
const OPENF1_PARTS = new Map([
  ['Practice 1', F1_PARTS[0]], ['Practice 2', F1_PARTS[1]], ['Practice 3', F1_PARTS[2]],
  ['Sprint Qualifying', F1_PARTS[3]], ['Sprint Shootout', F1_PARTS[3]], ['Sprint', F1_PARTS[4]],
  ['Qualifying', F1_PARTS[5]], ['Race', F1_RACE],
]);

// A season's meetings and sessions (/v1/meetings and /v1/sessions, by year) → the events
// parseF1Season gives, or null when they aren't lists. Rounds count the meetings that hold a race
// and weren't cancelled, oldest first, as Jolpica numbers them, so the ids agree.
export function parseOpenF1Season(meetings, sessions) {
  if (!Array.isArray(meetings) || !Array.isArray(sessions)) return null;
  const parts = sessions.filter(s => !s?.is_cancelled && OPENF1_PARTS.has(s?.session_name) && Number.isFinite(Date.parse(s.date_start)));
  const holdsRace = m => parts.some(s => s.meeting_key === m.meeting_key && s.session_name === 'Race');
  const rounds = meetings.filter(m => m && !m.is_cancelled && holdsRace(m))
    .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));
  return rounds.flatMap((m, i) => parts.filter(s => s.meeting_key === m.meeting_key)
    .map(s => f1Event(String(m.year ?? s.year ?? ''), i + 1, m.meeting_name, OPENF1_PARTS.get(s.session_name), Date.parse(s.date_start), true)))
    .sort(byStart);
}

// The session key of the race event among a season's races (/v1/sessions?session_name=Race),
// matched by its start; null when none is.
export function openF1RaceKey(sessions, race) {
  const s = Array.isArray(sessions)
    ? sessions.find(x => !x?.is_cancelled && Math.abs(Date.parse(x?.date_start) - race.start) < 6 * 60 * MIN)
    : null;
  return s?.session_key ?? null;
}

// A race's top three (/v1/session_result) by the drivers' codes (/v1/drivers): ['VER', …] or null.
export function parseOpenF1Podium(results, drivers) {
  if (!Array.isArray(results) || !Array.isArray(drivers)) return null;
  const code = new Map(drivers.map(d => [d?.driver_number, String(d?.name_acronym ?? d?.last_name ?? '')]));
  const podium = results.filter(r => [1, 2, 3].includes(r?.position))
    .sort((a, b) => a.position - b.position)
    .map(r => code.get(r.driver_number))
    .filter(Boolean);
  return podium.length ? podium : null;
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
  if (now < e.start || (!e.timeValid && e.state === 'pre')) return 'pre';
  return now < e.start + 2 * lengthOf(e) ? 'live' : 'final';
}

// W, L or D for the followed side of a game with a score; '' without a score or a single side.
export function resultFor(e, side) {
  if (e.state !== 'post' || (side !== 'home' && side !== 'away') || e.home.score == null || e.away.score == null) return '';
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
export const formatTime = (ms, hour24, timeZone) => formatter(hour24 ? 'en-GB' : 'en-US', {
  timeZone, hour: hour24 ? '2-digit' : 'numeric', minute: '2-digit', hourCycle: hour24 ? 'h23' : 'h12',
}).format(ms);
// Starts from midnight to 6:59 in the morning get a moon.
export const isNight = (ms, timeZone) => Number(formatter('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(ms)) < 7;
// 'Sunday 18 October', for screen readers.
export const longDay = (ms, timeZone) => formatter('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(ms);

// The rows a copy shows, by local day: the followed teams' games and the chosen F1 sessions that
// start within `days` or are still listed after starting; a followed team (or F1) with none of
// those adds its next event. A game between two followed teams is one row.
export function timeline(events, { follow, f1Sessions, now, timeZone, days = 14 }) {
  const byId = new Map();
  for (const e of events) if (!byId.has(e.id) || (e.state === 'post' && byId.get(e.id).state !== 'post')) byId.set(e.id, e);
  const unique = [...byId.values()].filter(e => follows(e, follow, f1Sessions));
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

// Several cache results as one: every event, the oldest time among the parts that have data, the
// first error. A part that failed with nothing saved has at 0 and doesn't date the rest.
export function joinParts(parts) {
  const have = parts.filter(p => p.data);
  return {
    data: have.length ? parts.flatMap(p => p.data ?? []) : null,
    at: have.length ? Math.min(...have.map(p => p.at)) : 0,
    error: parts.find(p => p.error)?.error,
  };
}
