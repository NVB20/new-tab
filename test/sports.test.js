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
