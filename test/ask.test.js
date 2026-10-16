import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enginesOn, activeMode, nextMode, googleUrl, chatUrl, addHandoff, HANDOFF_TTL,
} from '../js/ask.js';

const search = over => ({ google: true, claude: true, chatgpt: false, gemini: false, mode: 'google', ...over });

// ---- engines ----

test('enginesOn lists the engines that are on, in bar order', () => {
  assert.deepEqual(enginesOn(search({ gemini: true, chatgpt: true })), ['google', 'claude', 'chatgpt', 'gemini']);
  assert.deepEqual(enginesOn(search({ google: false, gemini: true })), ['claude', 'gemini']);
});

test('activeMode is the saved engine while it is on', () => {
  assert.equal(activeMode(search({ mode: 'claude' })), 'claude');
  assert.equal(activeMode(search({ chatgpt: true, mode: 'chatgpt' })), 'chatgpt');
  assert.equal(activeMode(search({ gemini: true, mode: 'gemini' })), 'gemini');
});

test('activeMode falls back to the first engine that is on', () => {
  assert.equal(activeMode(search({ mode: 'chatgpt' })), 'google');
  assert.equal(activeMode(search({ mode: 'google', google: false, claude: false, gemini: true })), 'gemini');
});

test('activeMode treats an unknown saved mode as the first one on', () => {
  assert.equal(activeMode(search({ mode: 'bing' })), 'google');
});

test('activeMode is null when the bar is off or has no engine on', () => {
  assert.equal(activeMode(search({ google: false, claude: false })), null);
  assert.equal(activeMode(search({ google: false, claude: false })), null);
});

test('nextMode steps through the engines that are on and wraps around', () => {
  const all = search({ chatgpt: true, gemini: true });
  assert.equal(nextMode({ ...all, mode: 'google' }), 'claude');
  assert.equal(nextMode({ ...all, mode: 'claude' }), 'chatgpt');
  assert.equal(nextMode({ ...all, mode: 'chatgpt' }), 'gemini');
  assert.equal(nextMode({ ...all, mode: 'gemini' }), 'google');
});

test('nextMode skips engines that are off', () => {
  assert.equal(nextMode(search({ claude: false, gemini: true, mode: 'google' })), 'gemini');
});

test('nextMode stays put with only one engine on', () => {
  assert.equal(nextMode(search({ claude: false })), 'google');
});

test('googleUrl encodes the query', () => {
  assert.equal(googleUrl('a&b c/ü'), 'https://www.google.com/search?q=a%26b%20c%2F%C3%BC');
});

test('chatUrl opens each engine\'s new chat with only the id, in the fragment', () => {
  assert.equal(chatUrl('claude', 'abc-123'), 'https://claude.ai/new#nt=abc-123');
  assert.equal(chatUrl('chatgpt', 'abc-123'), 'https://chatgpt.com/#nt=abc-123');
  assert.equal(chatUrl('gemini', 'abc-123'), 'https://gemini.google.com/app#nt=abc-123');
});

// ---- handoff ----

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

