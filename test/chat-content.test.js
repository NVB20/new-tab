// content/chat.js is a classic content script, so it is loaded into a vm context here. Without a
// `chrome` global it only defines its functions and does nothing else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../content/chat.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const { handoffId } = ctx;
// Objects made inside the vm context have their own prototypes; copy results out for deepEqual.
const plain = v => JSON.parse(JSON.stringify(v));
const takeHandoff = (...args) => plain(ctx.takeHandoff(...args));
const siteFor = host => plain(ctx.siteFor(host) ?? null);

const TTL = 2 * 60e3;   // keep in step with HANDOFF_TTL in js/ask.js

test('siteFor knows each chat site and its engine', () => {
  assert.equal(siteFor('claude.ai').engine, 'claude');
  assert.equal(siteFor('chatgpt.com').engine, 'chatgpt');
  assert.equal(siteFor('gemini.google.com').engine, 'gemini');
});

test('siteFor gives every site a message box and a send button selector', () => {
  for (const host of ['claude.ai', 'chatgpt.com', 'gemini.google.com']) {
    assert.ok(siteFor(host).composer, host);
    assert.ok(siteFor(host).send, host);
  }
});

test('siteFor ignores any other site', () => {
  assert.equal(siteFor('example.com'), null);
  assert.equal(siteFor('evil-claude.ai'), null);
});

test('handoffId reads the id from #nt=<id>', () => {
  assert.equal(handoffId('#nt=0b6f1c2e-9d1a-4c3e-8f00-123456789abc'), '0b6f1c2e-9d1a-4c3e-8f00-123456789abc');
});

test('handoffId ignores any other fragment', () => {
  assert.equal(handoffId(''), null);
  assert.equal(handoffId('#'), null);
  assert.equal(handoffId('#nt='), null);
  assert.equal(handoffId('#other=abc'), null);
  assert.equal(handoffId('#nt=abc&x=1'), null);
  assert.equal(handoffId('#nt=' + 'a'.repeat(65)), null);
});

const now = 1_000_000;

test('takeHandoff returns a fresh message for this site and removes it', () => {
  const list = [{ id: 'a', engine: 'claude', text: 'first', at: now - 500 }, { id: 'b', engine: 'chatgpt', text: 'second', at: now - 100 }];
  const out = takeHandoff(list, 'b', 'chatgpt', now);
  assert.equal(out.text, 'second');
  assert.deepEqual(out.rest.map(h => h.id), ['a']);
});

test('takeHandoff refuses a message meant for another site, and still removes it', () => {
  const out = takeHandoff([{ id: 'a', engine: 'claude', text: 'x', at: now }], 'a', 'gemini', now);
  assert.equal(out.text, null);
  assert.deepEqual(out.rest, []);
});

test('takeHandoff refuses a message that is too old, and still removes it', () => {
  const out = takeHandoff([{ id: 'a', engine: 'claude', text: 'stale', at: now - TTL }], 'a', 'claude', now);
  assert.equal(out.text, null);
  assert.deepEqual(out.rest, []);
});

test('takeHandoff refuses a message dated in the future', () => {
  assert.equal(takeHandoff([{ id: 'a', engine: 'claude', text: 'x', at: now + 5000 }], 'a', 'claude', now).text, null);
});

test('takeHandoff finds nothing for an unknown id and leaves the list alone', () => {
  const list = [{ id: 'a', engine: 'claude', text: 'x', at: now }];
  const out = takeHandoff(list, 'zzz', 'claude', now);
  assert.equal(out.text, null);
  assert.deepEqual(out.rest, list);
});

test('takeHandoff copes with missing or malformed storage', () => {
  assert.deepEqual(takeHandoff(undefined, 'a', 'claude', now), { text: null, rest: [] });
  assert.equal(takeHandoff([null, { id: 'a', engine: 'claude', text: 42, at: now }], 'a', 'claude', now).text, null);
});
