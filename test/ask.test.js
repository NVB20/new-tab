import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeMode, nextMode, googleUrl, claudeUrl, addHandoff, HANDOFF_TTL } from '../js/ask.js';

const search = over => ({ enabled: true, google: true, claude: true, mode: 'google', ...over });

test('activeMode is the saved mode while it is on', () => {
  assert.equal(activeMode(search({ mode: 'claude' })), 'claude');
  assert.equal(activeMode(search({ mode: 'google' })), 'google');
});

test('activeMode falls back to the mode that is on', () => {
  assert.equal(activeMode(search({ mode: 'google', google: false })), 'claude');
  assert.equal(activeMode(search({ mode: 'claude', claude: false })), 'google');
});

test('activeMode treats an unknown saved mode as the first one on', () => {
  assert.equal(activeMode(search({ mode: 'bing' })), 'google');
  assert.equal(activeMode(search({ mode: 'bing', google: false })), 'claude');
});

test('activeMode is null when the bar is off or has no mode on', () => {
  assert.equal(activeMode(search({ enabled: false })), null);
  assert.equal(activeMode(search({ google: false, claude: false })), null);
});

test('nextMode flips between the two modes', () => {
  assert.equal(nextMode(search({ mode: 'google' })), 'claude');
  assert.equal(nextMode(search({ mode: 'claude' })), 'google');
});

test('nextMode stays put with only one mode on', () => {
  assert.equal(nextMode(search({ claude: false })), 'google');
  assert.equal(nextMode(search({ google: false, mode: 'google' })), 'claude');
});

test('googleUrl encodes the query', () => {
  assert.equal(googleUrl('a&b c/ü'), 'https://www.google.com/search?q=a%26b%20c%2F%C3%BC');
});

test('claudeUrl carries only the id, in the fragment', () => {
  assert.equal(claudeUrl('abc-123'), 'https://claude.ai/new#nt=abc-123');
});

test('addHandoff appends the new message', () => {
  const now = 1_000_000;
  const out = addHandoff([{ id: 'a', text: 'old', at: now - 1000 }], { id: 'b', text: 'new', at: now }, now);
  assert.deepEqual(out.map(h => h.id), ['a', 'b']);
});

test('addHandoff drops messages that are too old to be picked up', () => {
  const now = 1_000_000;
  const out = addHandoff([{ id: 'a', text: 'stale', at: now - HANDOFF_TTL }], { id: 'b', text: 'new', at: now }, now);
  assert.deepEqual(out.map(h => h.id), ['b']);
});

test('addHandoff starts a list when storage holds none', () => {
  const entry = { id: 'b', text: 'new', at: 5 };
  assert.deepEqual(addHandoff(undefined, entry, 5), [entry]);
  assert.deepEqual(addHandoff('junk', entry, 5), [entry]);
});
