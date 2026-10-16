import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// net.js uses the browser's localStorage; a Map-backed stand-in is enough here.
const memory = new Map();
globalThis.localStorage = {
  getItem: k => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: k => memory.delete(k),
};
const { feed } = await import('../js/net.js');

const HOUR = 3600e3;
beforeEach(() => memory.clear());

test('feed fetches once, then serves the saved value until it is an hour old', async () => {
  let calls = 0;
  const load = async () => ({ n: ++calls });
  const first = await feed('k', HOUR, load);
  const second = await feed('k', HOUR, load);
  assert.equal(calls, 1);
  assert.deepEqual(second.data, first.data);
  assert.ok(second.at > 0);
});

test('a failed fetch is not retried within the hour, and its error is remembered', async () => {
  let calls = 0;
  const fail = async () => {
    calls++;
    const err = new Error('HTTP 403');
    err.status = 403;
    err.rateLimited = true;
    throw err;
  };
  const first = await feed('k', HOUR, fail);
  const second = await feed('k', HOUR, fail);
  assert.equal(calls, 1);
  assert.equal(first.error.rateLimited, true);
  assert.equal(second.error.rateLimited, true);
  assert.equal(second.data, null);
});

test('after a failure the last good value is still shown', async () => {
  await feed('k', 0, async () => ({ ok: 1 }));
  const res = await feed('k', 0, async () => { throw new Error('offline'); });
  assert.deepEqual(res.data, { ok: 1 });
  assert.ok(res.error);
});

test('a ttl of 0 (Refresh) always fetches', async () => {
  let calls = 0;
  await feed('k', 0, async () => ++calls);
  await feed('k', 0, async () => ++calls);
  assert.equal(calls, 2);
});

test('callers in this tab share a request in flight; an attempt started by another tab is not repeated', async () => {
  let calls = 0;
  let release;
  const slow = () => new Promise(resolve => { calls++; release = () => resolve({ v: 1 }); });
  const a = feed('k', HOUR, slow);
  const b = feed('k', HOUR, slow);
  assert.equal(calls, 1);
  release();
  assert.deepEqual((await a).data, { v: 1 });
  assert.deepEqual((await b).data, { v: 1 });

  memory.clear();
  memory.set('newtab:cache:j:attempt', JSON.stringify({ at: Date.now(), error: null }));
  const other = await feed('j', HOUR, slow);
  assert.equal(calls, 1);
  assert.equal(other.data, null);
});
