import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENTRIES, KINDS, SHOWS, cleanWatched, shownEntries, nextUp, creditsAfter, watchedUpTo, unwatchedFrom } from '../js/marvel.js';

const ids = list => list.map(e => e.id);

test('the order has Digital Spy\'s 115 entries, from Eyes of Wakanda to VisionQuest', () => {
  assert.equal(ENTRIES.length, 115);
  assert.equal(ENTRIES[0].title, 'Eyes of Wakanda');
  assert.equal(ENTRIES[76].title, 'Avengers: Endgame');   // its number 77
  assert.equal(ENTRIES.at(-1).title, 'VisionQuest');
  assert.equal(ENTRIES.filter(e => e.kind === 'film').length, 38);   // its films-only list
});

test('every entry has a unique id, a known kind and a release year', () => {
  assert.equal(new Set(ids(ENTRIES)).size, ENTRIES.length);
  for (const e of ENTRIES) {
    assert.match(e.id, /^[a-z0-9-]+$/, e.id);
    assert.ok(KINDS[e.kind], e.id);
    assert.ok(Number.isInteger(e.year) && e.year >= 2008 && e.year <= 2026, e.id);
    assert.equal(typeof e.part, 'string', e.id);
    assert.equal(typeof e.tv, 'boolean', e.id);
  }
});

test('Agents of SHIELD is split into the parts other things happen between', () => {
  const aos = ENTRIES.filter(e => e.title === 'Agents of SHIELD');
  assert.equal(aos.length, 17);   // seasons 1–5 in three parts each, then 6 and 7
  assert.equal(aos[0].part, 'Season 1 · episodes 1–7');
  assert.ok(aos.every(e => e.tv && e.kind === 'series'));
});

test('cleanWatched keeps known ids once, in the list\'s order', () => {
  assert.deepEqual(cleanWatched(['endgame', 'iron-man', 'junk', 'iron-man', 7, null]), ['iron-man', 'endgame']);
  assert.deepEqual(cleanWatched('iron-man'), []);
  assert.deepEqual(cleanWatched(undefined), []);
});

test('shownEntries: everything, without the Marvel Television shows, or films only', () => {
  assert.deepEqual(SHOWS, ['all', 'studios', 'films']);
  assert.equal(shownEntries('all').length, 115);
  const studios = shownEntries('studios');
  assert.ok(!studios.some(e => e.tv));
  assert.ok(studios.some(e => e.title === 'Daredevil: Born Again'));   // Marvel Studios' Daredevil stays
  assert.ok(!studios.some(e => e.title === 'Daredevil'));
  assert.equal(shownEntries('films').length, 38);
  assert.equal(shownEntries('junk').length, 115);
});

test('nextUp is the first shown entry not watched, or null', () => {
  const all = shownEntries('all');
  assert.equal(nextUp(all, []).id, 'eyes-of-wakanda');
  assert.equal(nextUp(all, ['eyes-of-wakanda', 'captain-america-first-avenger']).id, 'agent-carter-one-shot');
  assert.equal(nextUp(all, ['captain-america-first-avenger']).id, 'eyes-of-wakanda');   // a skipped one comes first
  assert.equal(nextUp(shownEntries('films'), ['captain-america-first-avenger']).id, 'captain-marvel');
  assert.equal(nextUp(all, ids(all)), null);
});

test('creditsAfter names the watched films whose credits scenes belong after an entry', () => {
  assert.deepEqual(creditsAfter('infinity-war', []), []);
  assert.deepEqual(ids(creditsAfter('infinity-war', ['captain-marvel', 'ant-man-wasp'])), ['captain-marvel', 'ant-man-wasp']);
  assert.deepEqual(ids(creditsAfter('endgame', ['black-widow', 'captain-marvel'])), ['black-widow']);
  assert.deepEqual(creditsAfter('iron-man', ['black-widow']), []);
});

test('watchedUpTo ticks every shown entry up to one; unwatchedFrom unticks it and every one after', () => {
  const films = shownEntries('films');
  const upTo = watchedUpTo(['aos-1a'], films, 'iron-man');
  assert.deepEqual(upTo, ['captain-america-first-avenger', 'captain-marvel', 'iron-man', 'aos-1a']);
  // Only shown entries change: the Agents of SHIELD part stays ticked.
  assert.deepEqual(unwatchedFrom(upTo, films, 'captain-marvel'), ['captain-america-first-avenger', 'aos-1a']);
  assert.deepEqual(watchedUpTo([], films, 'junk'), []);
});
