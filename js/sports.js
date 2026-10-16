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
