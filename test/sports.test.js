import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NBA_TEAMS, NFL_TEAMS, SOCCER_TEAMS, teamOf, cleanSports, competitionTag, leaguePath, schedulePath, raceShort,
  parseEspnEvent, parseSchedule, nextPhase, parseScoreboard, trimEvents, applyLive, etDay, scoreboards, boardTtl, lengthOf,
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

