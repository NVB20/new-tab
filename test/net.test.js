import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// net.js uses the browser's localStorage; a Map-backed stand-in is enough here.
const memory = new Map();
globalThis.localStorage = {
  getItem: k => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: k => memory.delete(k),
  get length() { return memory.size; },
  key: i => [...memory.keys()][i] ?? null,
};
const { feed, peek, sweep, firstOf, unreachable } = await import('../js/net.js');

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

test('sweep removes the saved values a test rejects, with their attempt records', async () => {
  await feed('live:a:20261001', HOUR, async () => 1);
  await feed('live:a:20261016', HOUR, async () => 2);
  await feed('other', HOUR, async () => 3);
  sweep('live:', key => key.slice(-8) >= '20261013');
  assert.equal(peek('live:a:20261001'), null);
  assert.equal(memory.has('newtab:cache:live:a:20261001:attempt'), false);
  assert.equal(peek('live:a:20261016').data, 2);
  assert.equal(peek('other').data, 3);
});

// ---- sources ----

const httpError = status => Object.assign(new Error(`HTTP ${status}`), { status });
const counting = (name, answer) => {
  const source = { name, calls: 0, load: async () => { source.calls++; return answer(); } };
  return source;
};

test('unreachable: offline, timed out, broken, 5xx, 429 and rate limits are; other 4xx are not', () => {
  assert.equal(unreachable(new TypeError('Failed to fetch')), true);
  assert.equal(unreachable(new Error('Unexpected Open-Meteo response')), true);
  assert.equal(unreachable(httpError(503)), true);
  assert.equal(unreachable(httpError(429)), true);
  assert.equal(unreachable(Object.assign(httpError(403), { rateLimited: true })), true);
  assert.equal(unreachable(httpError(404)), false);
  assert.equal(unreachable(httpError(400)), false);
});

test('firstOf takes the first source that answers and names it', async () => {
  const a = counting('A', () => ({ v: 'a' }));
  const b = counting('B', () => ({ v: 'b' }));
  assert.deepEqual(await firstOf([a, b]), { data: { v: 'a' }, via: 'A' });
  assert.equal(b.calls, 0);
});

test('a source with nothing for this hands over without being marked down', async () => {
  const empty = counting('A', () => null);
  const notListed = counting('B', () => { throw httpError(400); });
  const c = counting('C', () => 3);
  assert.deepEqual(await firstOf([empty, notListed, c]), { data: 3, via: 'C' });
  await firstOf([empty, notListed, c]);
  assert.equal(empty.calls, 2);
  assert.equal(notListed.calls, 2);
});

test('an unreachable source hands over and is skipped by every tab until it is due again', async () => {
  const down = counting('A', () => { throw new TypeError('Failed to fetch'); });
  const b = counting('B', () => 'b');
  assert.deepEqual(await firstOf([down, b]), { data: 'b', via: 'B' });
  assert.ok(Number(memory.get('newtab:cache:down:A')) > Date.now());
  assert.deepEqual(await firstOf([down, b]), { data: 'b', via: 'B' });
  assert.equal(down.calls, 1);
  // Its time out: asked first again.
  memory.set('newtab:cache:down:A', String(Date.now() - 1));
  await firstOf([down, b]);
  assert.equal(down.calls, 2);
});

test('when every source is marked down they are all tried, and one that answers is cleared', async () => {
  memory.set('newtab:cache:down:A', String(Date.now() + 60e3));
  memory.set('newtab:cache:down:B', String(Date.now() + 60e3));
  const a = counting('A', () => 'a');
  const b = counting('B', () => 'b');
  assert.deepEqual(await firstOf([a, b]), { data: 'a', via: 'A' });
  assert.equal(memory.has('newtab:cache:down:A'), false);
});

test('a slow source is left after the handover time and marked down; the last one gets its full time', async () => {
  const slow = { name: 'A', load: () => new Promise(resolve => setTimeout(() => resolve('late'), 200)) };
  const lastSlow = { name: 'B', load: () => new Promise(resolve => setTimeout(() => resolve('b'), 60)) };
  assert.deepEqual(await firstOf([slow, lastSlow], { handoverMs: 20 }), { data: 'b', via: 'B' });
  assert.ok(memory.has('newtab:cache:down:A'));
});

test('no answer anywhere: the first error, or null when nothing failed', async () => {
  const first = httpError(404);
  await assert.rejects(firstOf([
    counting('A', () => { throw first; }),
    counting('B', () => { throw httpError(503); }),
  ]), err => err === first);
  assert.equal(await firstOf([counting('A', () => null), counting('B', () => null)]), null);
});

test('feed takes a list of sources and saves which one answered', async () => {
  const sources = [counting('A', () => { throw httpError(502); }), counting('B', () => ({ ok: 1 }))];
  const res = await feed('k', HOUR, sources);
  assert.deepEqual(res.data, { ok: 1 });
  assert.equal(res.via, 'B');
  assert.equal(peek('k').via, 'B');
  assert.equal((await feed('k', HOUR, sources)).via, 'B');
});

test('feed with sources that all fail keeps the last good value and its source', async () => {
  await feed('k', 0, [counting('A', () => 1)]);
  const res = await feed('k', 0, [counting('A', () => { throw httpError(500); }), counting('B', () => { throw httpError(500); })]);
  assert.equal(res.data, 1);
  assert.equal(res.via, 'A');
  assert.equal(res.error.status, 500);
});
