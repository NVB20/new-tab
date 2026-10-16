// content/claude.js is a classic content script, so it is loaded into a vm context here. Without a
// `chrome` global it only defines its functions and does nothing else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../content/claude.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const { handoffId } = ctx;
// Arrays made inside the vm context have their own prototype; copy results out for deepEqual.
const takeHandoff = (...args) => JSON.parse(JSON.stringify(ctx.takeHandoff(...args)));

const TTL = 2 * 60e3;   // keep in step with HANDOFF_TTL in js/ask.js

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

test('takeHandoff returns a fresh message with its id and removes it', () => {
  const now = 1_000_000;
  const list = [{ id: 'a', text: 'first', at: now - 500 }, { id: 'b', text: 'second', at: now - 100 }];
  const out = takeHandoff(list, 'b', now);
  assert.equal(out.text, 'second');
  assert.deepEqual(out.rest.map(h => h.id), ['a']);
});

test('takeHandoff refuses a message that is too old, and still removes it', () => {
  const now = 1_000_000;
  const out = takeHandoff([{ id: 'a', text: 'stale', at: now - TTL }], 'a', now);
  assert.equal(out.text, null);
  assert.deepEqual(out.rest, []);
});

test('takeHandoff refuses a message dated in the future', () => {
  const now = 1_000_000;
  assert.equal(takeHandoff([{ id: 'a', text: 'x', at: now + 5000 }], 'a', now).text, null);
});

test('takeHandoff finds nothing for an unknown id and leaves the list alone', () => {
  const list = [{ id: 'a', text: 'x', at: 10 }];
  const out = takeHandoff(list, 'zzz', 10);
  assert.equal(out.text, null);
  assert.deepEqual(out.rest, list);
});

test('takeHandoff copes with missing or malformed storage', () => {
  assert.deepEqual(takeHandoff(undefined, 'a', 10), { text: null, rest: [] });
  assert.equal(takeHandoff([null, { id: 'a', text: 42, at: 10 }], 'a', 10).text, null);
});
