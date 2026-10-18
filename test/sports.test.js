import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NBA_TEAMS, NFL_TEAMS, SOCCER_TEAMS, IL_SOCCER_CLUBS, IL_BASKET_CLUBS, ISRAEL, IL_SPORTS,
  teamOf, cleanSports, competitionTag, leaguePath, schedulePath, raceShort,
  competition365, logo365, link365, parse365Game, parse365Games, teamTtl,
  parseEspnEvent, parseSchedule, nextPhases, joinParts, parseScoreboard, trimEvents, applyLive, etDay, scoreboards, boardTtl, lengthOf,
  parseF1Season, parseF1Last, raceAwaitingResult, parseOpenF1Season, openF1RaceKey, parseOpenF1Podium,
  rowState, resultFor, followedSide, dayKey, dayLabel, formatTime, isNight, longDay, timeline,
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
  assert.equal(parseScoreboard({}, 'nba'), null);
});

test('parseSchedule and parseScoreboard return null for a response that is not a schedule, so it never replaces saved data', () => {
  assert.equal(parseSchedule(null, 'nba'), null);
  assert.equal(parseSchedule({ events: 'x' }, 'nba'), null);
  assert.equal(parseSchedule({ events: [{ id: '1' }, null] }, 'nba'), null);   // events, none readable
  assert.deepEqual(parseSchedule({ requestedSeason: { type: 2 }, events: [] }, 'nba'), { type: 2, events: [] });   // a real empty schedule
  assert.equal(parseSchedule({ events: [chiefsAtRaiders] }, 'nfl').events.length, 1);
  assert.equal(parseScoreboard(null, 'nba'), null);
  assert.equal(parseScoreboard({ events: {} }, 'nba'), null);
  assert.equal(parseScoreboard({ events: [{}] }, 'nba'), null);
  assert.deepEqual(parseScoreboard({ events: [] }, 'nba'), []);
});

test('nextPhases asks for the following parts of the season once the current one has no game in the next two weeks', () => {
  const NOW0 = Date.parse('2026-10-16T12:00Z');
  const at = d => ({ start: NOW0 + d * 86400e3 });
  const phases = (type, events, sport) => nextPhases({ type, events }, sport, NOW0);
  assert.deepEqual(phases(1, [at(-3), at(5)], 'nba'), [2]);          // preseason, a game still to come
  assert.deepEqual(phases(1, [at(-3), at(20)], 'nba'), []);          // preseason, next game more than 14 days out
  assert.deepEqual(phases(2, [at(-3), at(20)], 'nba'), []);          // regular season goes on past the window
  assert.deepEqual(phases(2, [at(-3), at(10)], 'nba'), [5, 3]);   // the last game is inside the window
  assert.deepEqual(phases(2, [at(-3), at(-1)], 'nba'), [5, 3]);      // regular season ending: play-in, playoffs
  assert.deepEqual(phases(2, [], 'nba'), [5, 3]);
  assert.deepEqual(phases(2, [at(-3)], 'nfl'), [3]);
  assert.deepEqual(phases(5, [at(-3)], 'nba'), [3]);
  assert.deepEqual(phases(3, [], 'nba'), []);
  assert.deepEqual(phases(13846, [], 'soccer'), []);                  // MLS season types
  assert.deepEqual(phases(null, [], 'nba'), []);
});

test('joinParts: every part events, the oldest time among parts with data, the first error', () => {
  const error = new Error('HTTP 500');
  assert.deepEqual(joinParts([{ data: [{ id: 'a' }], at: 1000 }, { data: null, at: 0, error }]), { data: [{ id: 'a' }], at: 1000, error });
  assert.deepEqual(joinParts([{ data: [{ id: 'a' }], at: 3000 }, { data: [{ id: 'b' }], at: 2000 }]),
    { data: [{ id: 'a' }, { id: 'b' }], at: 2000, error: undefined });
  assert.deepEqual(joinParts([{ data: null, at: 0, error }, { data: null, at: 0 }]), { data: null, at: 0, error });
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

// OpenF1's 2026 season, trimmed: testing, the Australian and Chinese GPs, a cancelled Bahrain GP
// and the US GP. Rounds count the meetings with a race, so China is round 2 as on Jolpica.
const meeting = (key, name, start, cancelled = false) => ({ meeting_key: key, meeting_name: name, year: 2026, date_start: start, is_cancelled: cancelled });
const session = (key, name, start, cancelled = false) => ({ meeting_key: key, session_name: name, date_start: start, year: 2026, is_cancelled: cancelled, session_key: Date.parse(start) / 1000 });
const OPENF1_MEETINGS = [
  meeting(1304, 'Pre-Season Testing', '2026-02-11T07:00:00+00:00'),
  meeting(1279, 'Australian Grand Prix', '2026-03-06T01:30:00+00:00'),
  meeting(1280, 'Chinese Grand Prix', '2026-03-13T03:30:00+00:00'),
  meeting(1282, 'Bahrain Grand Prix', '2026-04-10T11:30:00+00:00', true),
  meeting(1297, 'United States Grand Prix', '2026-10-23T17:30:00+00:00'),
];
const OPENF1_SESSIONS = [
  session(1304, 'Day 1', '2026-02-11T07:00:00+00:00'),
  session(1279, 'Race', '2026-03-08T04:00:00+00:00'),
  session(1280, 'Practice 1', '2026-03-13T03:30:00+00:00'),
  session(1280, 'Sprint Qualifying', '2026-03-13T07:30:00+00:00'),
  session(1280, 'Sprint', '2026-03-14T03:00:00+00:00'),
  session(1280, 'Qualifying', '2026-03-14T07:00:00+00:00'),
  session(1280, 'Race', '2026-03-15T07:00:00+00:00'),
  session(1282, 'Race', '2026-04-12T15:00:00+00:00', true),
  session(1297, 'Practice 1', '2026-10-23T17:30:00+00:00'),
  session(1297, 'Race', '2026-10-25T20:00:00+00:00'),
];

test('OpenF1\'s season reads as Jolpica\'s: the same ids, titles and times; testing and cancelled races left out', () => {
  const events = parseOpenF1Season(OPENF1_MEETINGS, OPENF1_SESSIONS);
  const china = events.filter(e => e.round === 2);
  assert.deepEqual(china, parseF1Season(season).filter(e => e.round === 2));
  assert.deepEqual([...new Set(events.map(e => e.title.split(' · ')[0]))], ['Australian GP', 'Chinese GP', 'US GP']);
  assert.deepEqual(events.filter(e => e.round === 3).map(e => e.id), ['f1:2026-3-FirstPractice', 'f1:2026-3-Race']);
  assert.deepEqual(parseOpenF1Season([], []), []);
  assert.equal(parseOpenF1Season({ detail: 'error' }, OPENF1_SESSIONS), null);
});

test('OpenF1\'s podium: the race found by its start, its top three by driver code', () => {
  const [race] = parseF1Season(season).filter(e => e.round === 18 && e.session === 'race');
  assert.equal(openF1RaceKey(OPENF1_SESSIONS.filter(s => s.session_name === 'Race'), race), Date.parse('2026-10-25T20:00:00Z') / 1000);
  assert.equal(openF1RaceKey([], race), null);
  assert.equal(openF1RaceKey({ detail: 'error' }, race), null);
  const results = [{ position: 2, driver_number: 16 }, { position: 1, driver_number: 3 }, { position: 3, driver_number: 12 }, { position: 4, driver_number: 1 }];
  const drivers = [{ driver_number: 1, name_acronym: 'NOR' }, { driver_number: 3, name_acronym: 'VER' }, { driver_number: 16, name_acronym: 'LEC' }, { driver_number: 12, name_acronym: 'ANT' }];
  assert.deepEqual(parseOpenF1Podium(results, drivers), ['VER', 'LEC', 'ANT']);
  assert.equal(parseOpenF1Podium([], drivers), null);
  assert.equal(parseOpenF1Podium(null, drivers), null);
});

test('raceAwaitingResult is the latest race past its usual end, for a day', () => {
  const sessions = parseF1Season(season);
  const start = Date.parse('2026-10-25T20:00:00Z');
  assert.equal(raceAwaitingResult(sessions, start + 3600e3), null);          // still running
  assert.equal(raceAwaitingResult(sessions, start + 3 * 3600e3).round, 18);
  assert.equal(raceAwaitingResult(sessions, start + 27 * 3600e3), null);     // a day after its end
});

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

test('applyLive and timeline never let a stale live copy replace a final', () => {
  const final = game({ id: '1', state: 'post', detail: 'Final', home: { ...lal, score: '100' }, away: { ...gs, score: '90' } });
  const stale = game({ id: '1', state: 'in', detail: 'Q4 1:00', home: { ...lal, score: '98' }, away: { ...gs, score: '90' } });
  assert.equal(applyLive([final], [stale])[0].state, 'post');
  assert.equal(applyLive([final], [stale])[0].home.score, '100');
  for (const order of [[stale, final], [final, stale]]) {
    const days = timeline(order, { follow: ['nba:13'], f1Sessions: [], now: NOW, timeZone: TZ });
    assert.equal(days[0].events[0].state, 'post');
    assert.equal(days[0].events[0].home.score, '100');
  }
});

test('resultFor gives no chip until ESPN calls the game final', () => {
  const g = state => game({ state, home: { ...lal, score: '50' }, away: { ...gs, score: '40' } });
  assert.equal(resultFor(g('in'), 'home'), '');
  assert.equal(resultFor(g('pre'), 'home'), '');
  assert.equal(resultFor(g('post'), 'home'), 'W');
});

test('a game without a set time is never live by the clock alone', () => {
  const tbd = game({ start: NOW - 3600e3, timeValid: false });
  assert.equal(rowState(tbd, NOW), 'pre');
  assert.equal(rowState({ ...tbd, state: 'in' }, NOW), 'live');
  assert.deepEqual(scoreboards([tbd], NOW), []);
});

test('links must be https and logos come only from ESPN\'s CDN', () => {
  const bad = (href, logo) => ({
    ...chargersAtChiefs, links: link(href),
    competitions: [{ ...chargersAtChiefs.competitions[0], competitors: chargersAtChiefs.competitions[0].competitors.map(c => ({ ...c, team: { ...c.team, logos: [{ href: logo }] } })) }],
  });
  const g = parseEspnEvent(bad('javascript:alert(1)', 'https://evil.example/x.png'), 'nfl');
  assert.equal(g.url, '');
  assert.equal(g.home.logo, '');
  const http = parseEspnEvent(bad('http://www.espn.com/x', 'http://a.espncdn.com/x.png'), 'nfl');
  assert.equal(http.url, '');
  assert.equal(http.home.logo, '');
  const ok = parseEspnEvent(bad('https://www.espn.com/x', 'https://a.espncdn.com/x.png'), 'nfl');
  assert.equal(ok.url, 'https://www.espn.com/x');
  assert.equal(ok.home.logo, 'https://a.espncdn.com/x.png');
});

test('teamOf accepts only an exact sport:id', () => {
  assert.equal(teamOf('nba:13:extra'), null);
  assert.deepEqual(cleanSports({ follow: ['nba:13:extra', 'nba:13'] }).follow, ['nba:13']);
});

test('an ESPN event links only to espn.com, never to the bookmakers its links include', () => {
  const event = links => ({
    id: '1', date: '2026-10-20T00:00Z',
    competitions: [{ competitors: [{ homeAway: 'home', team: { id: '13' } }, { homeAway: 'away', team: { id: '2' } }] }],
    links,
  });
  const rel = ['summary', 'desktop'];
  assert.equal(parseEspnEvent(event([{ rel, href: 'https://www.espn.com/nba/game/_/gameId/1' }]), 'nba').url, 'https://www.espn.com/nba/game/_/gameId/1');
  for (const href of ['https://www.bet365.com/x', 'https://www.espn.com.evil.example/', 'javascript:alert(1)']) {
    assert.equal(parseEspnEvent(event([{ rel, href }]), 'nba').url, '', href);
  }
});

test('names from ESPN that are Object keys read as unknown', () => {
  const e = {
    id: '1', date: '2026-10-20T00:00Z',
    competitions: [{ competitors: [{ homeAway: 'home', team: { id: '1' } }, { homeAway: 'away', team: { id: '2' } }], status: { type: { name: 'toString' } } }],
  };
  assert.equal(parseEspnEvent(e, 'nba').off, null);
  assert.equal(competitionTag('constructor', 'X'), 'X');
  assert.equal(teamOf('toString:1'), null);
  assert.equal(teamOf('constructor:1'), null);
});

test('a soccer league slug that would bend a scoreboard address is dropped', () => {
  const e = {
    id: '1', date: '2026-10-20T00:00Z',
    competitions: [{ competitors: [{ homeAway: 'home', team: { id: '1' } }, { homeAway: 'away', team: { id: '2' } }] }],
  };
  assert.equal(parseEspnEvent(e, 'soccer', 'usa.1').league, 'usa.1');
  assert.equal(parseEspnEvent(e, 'soccer', '../../x?y').league, '');
});

// ---- 365Scores: Israeli clubs and national teams ----

test('the Israeli lists hold 14 clubs each, every id and abbreviation once, and the national teams', () => {
  for (const list of [IL_SOCCER_CLUBS, IL_BASKET_CLUBS]) {
    assert.equal(list.length, 14);
    assert.equal(new Set(list.map(t => t.id)).size, 14);
    assert.equal(new Set(list.map(t => t.abbr)).size, 14);
  }
  assert.deepEqual(teamOf('il-basket:631'), { sport: 'il-basket', id: '631', abbr: 'MTA', name: 'Maccabi Tel Aviv' });
  assert.equal(teamOf('il-soccer:559').name, 'Beitar Jerusalem');
  assert.deepEqual(teamOf(`il-soccer:${ISRAEL['il-soccer'].id}`), { sport: 'il-soccer', id: '5034', abbr: 'ISR', name: 'Israel' });
  assert.equal(teamOf(`il-basket:${ISRAEL['il-basket'].id}`).id, '1728');
  assert.equal(teamOf('il-soccer:631'), null);   // the basketball club's id
  assert.deepEqual(Object.keys(IL_SPORTS), ['il-soccer', 'il-basket']);
  assert.deepEqual(cleanSports({ follow: ['il-soccer:566', 'il-basket:631', 'il-basket:5034', 'il-soccer:1'] }).follow,
    ['il-soccer:566', 'il-basket:631']);
});

// 365Scores games as /web/games/current and /web/games/allscores sent them on 2026-10-18, trimmed
// to the fields the parser reads (live and other leagues' games show the states).
const c365 = (id, name, symbolicName, score, imageVersion, nameForURL, isWinner = false) => ({ id, name, symbolicName, score, isWinner, imageVersion, nameForURL });
const g365 = (id, competitionId, competitionDisplayName, startTime, [statusGroup, statusText, shortStatusText, displayType = 0, gameTimeDisplay = ''], home, away) => ({
  id, competitionId, competitionDisplayName, startTime, statusGroup, statusText, shortStatusText,
  gameTimeAndStatusDisplayType: displayType, gameTimeDisplay, homeCompetitor: home, awayCompetitor: away,
});
const SCHEDULED = [2, 'Scheduled', 'Sched.'];
const mtaAta = g365(4829925, 47, 'Winner League', '2026-10-18T17:55:00+00:00', SCHEDULED,
  c365(631, 'Maccabi Tel Aviv', 'MTA', -1, 3, 'maccabi-tel-aviv'), c365(641, 'Ironi Kiryat Ata', 'ATA', -1, 4, 'elizor-kiryat-ata'));
const dubaiHta = g365(4798426, 569, 'EuroLeague', '2026-10-30T16:00:00+00:00', SCHEDULED,
  c365(83343, 'BC Dubai', null, -1, 3, 'bc-dubai'), c365(654, 'Hapoel Tel Aviv', 'HTA', -1, 4, 'hapoel-tel-aviv'));
const totoFinal = g365(4815899, 546, 'Toto League Cup - Final', '2026-10-29T18:30:00+00:00', SCHEDULED,
  c365(566, 'Maccabi Tel Aviv', 'MTA', -1, 11, 'maccabi-tel-aviv'), c365(567, 'Hapoel Tel Aviv', 'HTA', -1, 5, 'hapoel-tel-aviv'));
const onPens = g365(4807672, 546, 'Toto League Cup - Placement Playoffs', '2026-08-17T17:00:00+00:00', [4, 'After Penalties', 'After Penalties', 1],
  c365(574, 'Hapoel Ramat Gan', 'HRG', 3, 3, 'hapoel-ramat-gan'), c365(559, 'Beitar Jerusalem', 'BEI', 3, 2, 'beitar-jerusalem', true));
const secondHalf = g365(4739615, 147, 'J1 League', '2026-10-18T07:00:00+00:00', [3, '2nd Half', '2nd Half', 2, "63'"],
  c365(9133, 'Machida Zelvia', 'MAC', 1, 1, 'machida-zelvia'), c365(2168, 'Fukuoka', 'AVI', 0, 1, 'fukuoka'));
const halfTime = g365(4652570, 618, 'K League 1', '2026-10-18T07:30:00+00:00', [3, 'Halftime', 'HT', 1, "45'"],
  c365(9822, 'Pohang Steelers', 'POH', 0, 1, 'pohang-steelers'), c365(11471, 'FC Anyang', 'ANY', 0, 1, 'fc-anyang'));
const quarter = g365(4816265, 401, 'Korean Basketball League - Regular Season', '2026-10-18T07:30:00+00:00', [3, 'Q2', 'Q2', 3, '00:31'],
  c365(10727, 'Anyang KGC', null, 36, 2, 'anyang-kgc'), c365(6850, 'KCC Egis', null, 40, 2, 'kcc-egis'));
const overtime = g365(4862461, 8042, 'Liga Argentina de Básquetbol - North Conference', '2026-10-18T00:30:00+00:00', [4, 'Final/OT', 'Final/OT', 1],
  c365(49951, 'Comunicaciones Mercedes', null, 92, 3, 'comunicaciones-mercedes', true), c365(79320, 'Asociacion El Ceibo', null, 88, 4, 'asociacion-el-ceibo'));
const ended = g365(4632644, 113, 'Brasileirão Série A', '2026-10-18T00:00:00+00:00', [4, 'Ended', 'Ended', 1],
  c365(1225, 'São Paulo', 'SAO', 1, 9, 'sao-paulo', true), c365(1227, 'Vasco da Gama', 'VAS', 0, 7, 'vasco-da-gama'));
const postponed = g365(4754011, 7741, 'Segunda RFEF ', '2026-10-18T10:00:00+00:00', [4, 'Postponed', 'Post.', 1],
  c365(57341, 'CF Intercity', 'ICA', -1, 2, 'cf-intercity'), c365(17982, 'Real Murcia Imperial', null, -1, 1, 'real-murcia-imperial'));
const IMG = 'https://imagecache.365scores.com/image/upload/f_png,w_32,h_32,c_limit,q_auto:eco,dpr_2,d_Competitors:default1.png';

test('parse365Games reads a team\'s games: tags, short names, logos and links to the game on 365scores.com', () => {
  const json = { competitions: [{ id: 47, name: 'Winner League', nameForURL: 'winner-league' }, { id: 569, name: 'EuroLeague', nameForURL: 'euroleague' }], games: [mtaAta, dubaiHta] };
  const [mta, dubai] = parse365Games(json, 'il-basket');
  assert.deepEqual(mta, {
    id: '365:4829925', sport: 'il-basket', league: '', tag: 'Winner', start: Date.parse('2026-10-18T17:55:00Z'), timeValid: true,
    state: 'pre', detail: '', off: null,
    home: { id: '631', abbr: 'MTA', name: 'Maccabi Tel Aviv', logo: `${IMG}/v3/Competitors/631`, score: null, winner: false },
    away: { id: '641', abbr: 'ATA', name: 'Ironi Kiryat Ata', logo: `${IMG}/v4/Competitors/641`, score: null, winner: false },
    tv: '', url: 'https://www.365scores.com/basketball/match/winner-league-47/maccabi-tel-aviv-elizor-kiryat-ata-631-641-47#id=4829925',
  });
  assert.equal(dubai.tag, 'EuroLeague');
  assert.equal(dubai.home.abbr, 'DUB');   // 365Scores gives BC Dubai no short name
  assert.equal(dubai.home.name, 'BC Dubai');
});

test('parse365Games: a cup game decided on penalties is over, level, and won by the side 365Scores names', () => {
  const [derby, pens] = parse365Games({ competitions: [{ id: 546, name: 'Toto League Cup', nameForURL: 'toto-league-cup' }], games: [totoFinal, onPens] }, 'il-soccer');
  assert.equal(derby.tag, 'Toto Cup');
  assert.equal(derby.url, 'https://www.365scores.com/football/match/toto-league-cup-546/maccabi-tel-aviv-hapoel-tel-aviv-566-567-546#id=4815899');
  assert.equal(pens.state, 'post');
  assert.equal(pens.detail, 'FT-Pens');
  assert.deepEqual([pens.home.score, pens.away.score, pens.away.winner], ['3', '3', true]);
  assert.equal(resultFor(pens, 'away'), 'W');
  assert.equal(resultFor(pens, 'home'), 'L');
});

test('parse365Game reads live and finished games: the minute, half time, quarter and clock, FT and Final/OT', () => {
  const read = (g, sport) => parse365Game(g, sport, null);
  const live = read(secondHalf, 'il-soccer');
  assert.deepEqual([live.state, live.detail, live.home.score, live.away.score], ['in', "63'", '1', '0']);
  assert.equal(live.tag, 'J1 League');   // no entry in competitions: the game's own name
  assert.equal(read(halfTime, 'il-soccer').detail, 'HT');
  const q2 = read(quarter, 'il-basket');
  assert.deepEqual([q2.state, q2.detail, q2.home.abbr, q2.away.abbr], ['in', 'Q2 0:31', 'ANY', 'KCC']);
  assert.equal(q2.tag, 'Korean Basketball League');
  const ot = read(overtime, 'il-basket');
  assert.deepEqual([ot.state, ot.detail, ot.home.score, ot.home.winner, ot.home.abbr], ['post', 'Final/OT', '92', true, 'COM']);
  const ft = read(ended, 'il-soccer');
  assert.deepEqual([ft.state, ft.detail, ft.home.score, ft.away.score], ['post', 'FT', '1', '0']);
  assert.equal(resultFor(ft, 'home'), 'W');
});

test('parse365Game: a postponed game comes among the finished ones, and reads as postponed with no score', () => {
  const g = parse365Game(postponed, 'il-soccer', null);
  assert.equal(g.off, 'Postponed');
  assert.equal(g.detail, '');
  assert.deepEqual([g.home.score, g.away.score], [null, null]);
  assert.equal(g.tag, 'Segunda RFEF');
  assert.equal(rowState(g, NOW), 'off');
  assert.equal(resultFor(g, 'home'), '');
});

test('parse365Games returns null for a response that is not a game list, so it never replaces saved data', () => {
  assert.equal(parse365Games({}, 'il-soccer'), null);
  assert.equal(parse365Games({ games: 'x' }, 'il-soccer'), null);
  assert.equal(parse365Games({ games: [{ id: 'x' }, null] }, 'il-soccer'), null);
  assert.deepEqual(parse365Games({ games: [] }, 'il-soccer'), []);
  assert.deepEqual(parse365Games({ games: [mtaAta, { id: 1 }] }, 'il-basket').map(e => e.id), ['365:4829925']);
  assert.equal(parse365Game({ ...mtaAta, startTime: 'soon' }, 'il-basket', null), null);
  assert.equal(parse365Game({ ...mtaAta, homeCompetitor: { id: '631' } }, 'il-basket', null), null);
});

test('competition365: Israeli competitions by id, international ones by name, the rest by their own name', () => {
  assert.equal(competition365(42, 'Premier League'), "Ha'Al");
  assert.equal(competition365(47, 'Winner League'), 'Winner');
  assert.equal(competition365(609, 'Winner Cup - Final'), 'Winner Cup');
  assert.equal(competition365(7685, 'UEFA Conference League'), 'UECL');
  assert.equal(competition365(596, 'UEFA Europa League Qualifiers'), 'UEL');
  assert.equal(competition365(1, 'UEFA Champions League - League Phase'), 'UCL');
  assert.equal(competition365(7016, 'UEFA Nations League - League B - Group 3'), 'UNL');
  assert.equal(competition365(5421, 'UEFA WC Qualification'), 'WC qual.');
  assert.equal(competition365(6894, 'FIBA World Cup Qualification'), 'WC qual.');
  assert.equal(competition365(471, 'FIBA World Cup'), 'World Cup');
  assert.equal(competition365(329, 'Eurocup'), 'EuroCup');
  assert.equal(competition365(321, 'Club Friendlies'), 'Friendly');
  assert.equal(competition365(570, 'Friendly International'), 'Friendly');
  assert.equal(competition365('constructor', 'X'), 'X');
  assert.equal(competition365(9, undefined), '');
});

test('365Scores logos and links are built from whole-number ids only; slugs are escaped', () => {
  assert.equal(logo365(566, 11), `${IMG}/v11/Competitors/566`);
  assert.equal(logo365('566', 11), '');
  assert.equal(logo365(566, undefined), '');
  assert.equal(logo365(-1, 1), '');
  assert.equal(link365('il-soccer', { ...totoFinal, id: '1/../x' }, null), '');
  assert.equal(link365('il-soccer', { ...totoFinal, homeCompetitor: { ...totoFinal.homeCompetitor, nameForURL: 'a/b?c#d' } }, { nameForURL: 'cup' }),
    'https://www.365scores.com/football/match/cup-546/a%2Fb%3Fc%23d-hapoel-tel-aviv-566-567-546#id=4815899');
});

test('teamTtl: 30 s while a game may be on, hourly once it ended by the clock without being over, else 6 hours', () => {
  const il = over => game({ id: '365:1', sport: 'il-basket', league: '', tag: 'Winner', ...over });
  assert.equal(lengthOf(il()), 120 * 60e3);
  assert.equal(teamTtl([il({ start: NOW + 3600e3 })], NOW), 6 * 3600e3);
  assert.equal(teamTtl([il({ start: NOW - 3600e3 })], NOW), 30e3);                   // started, 365Scores not told yet
  assert.equal(teamTtl([il({ start: NOW - 3600e3, state: 'in' })], NOW), 30e3);
  assert.equal(teamTtl([il({ start: NOW - 5 * 3600e3 })], NOW), 3600e3);             // past twice its length
  assert.equal(teamTtl([il({ start: NOW - 30 * 3600e3 })], NOW), 6 * 3600e3);        // a day after its end
  assert.equal(teamTtl([il({ start: NOW - 3600e3, state: 'post' })], NOW), 6 * 3600e3);
  assert.equal(teamTtl([il({ start: NOW - 3600e3, state: 'post', off: 'Postponed' })], NOW), 6 * 3600e3);
  assert.equal(teamTtl([il({ start: NOW + DAY }), il({ id: '365:2', start: NOW - 60e3 })], NOW), 30e3);
  assert.equal(teamTtl([], NOW), 6 * 3600e3);
});

test('ESPN scoreboards leave 365Scores games alone', () => {
  assert.deepEqual(scoreboards([game({ id: '365:1', sport: 'il-soccer', league: '', start: NOW - 3600e3 })], NOW), []);
});

test('timeline: a derby between two followed clubs is one row, from either club\'s games', () => {
  const json = { competitions: [{ id: 546, name: 'Toto League Cup', nameForURL: 'toto-league-cup' }], games: [totoFinal] };
  const events = [...parse365Games(json, 'il-soccer'), ...parse365Games(json, 'il-soccer')];
  const days = timeline(events, { follow: ['il-soccer:566', 'il-soccer:567'], f1Sessions: [], now: NOW, timeZone: TZ });
  assert.deepEqual(days.map(d => [d.label, d.events.map(e => [e.id, e.side])]), [['Thu 29 Oct', [['365:4815899', 'both']]]]);
  const mine = timeline(events, { follow: ['il-soccer:567'], f1Sessions: [], now: NOW, timeZone: TZ });
  assert.equal(mine[0].events[0].side, 'away');
});
