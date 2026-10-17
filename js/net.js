// Fetching with a timeout, and a small cache shared by every open new tab (localStorage is per
// extension origin), so opening many tabs doesn't hammer the APIs or GitHub's rate limit. A value
// can come from several sources in turn (firstOf), so one going down doesn't show.

const PREFIX = 'newtab:cache:';
const DOWN_MS = 10 * 60e3;   // how long every tab skips a source that didn't answer
const HANDOVER_MS = 5000;    // how long a source may take while another is left to ask

async function request(url, headers, timeoutMs) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.rateLimited = res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0';
    throw err;
  }
  return res;
}

export async function fetchJson(url, headers = {}, timeoutMs = 10000) {
  return (await request(url, headers, timeoutMs)).json();
}

export async function fetchText(url, headers = {}, timeoutMs = 10000) {
  return (await request(url, headers, timeoutMs)).text();
}

// Last stored value for a key, however old ({ at, data, via } or null).
export function peek(key) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null');
  } catch {
    return null;
  }
}

// via: the name of the source that gave it, when it came from a list of sources.
function store(key, data, via) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data, via }));
  } catch {
    // cache is only a speed-up
  }
}

// ---- sources ----

const downKey = name => `${PREFIX}down:${name}`;

function isDown(name, now) {
  try {
    return Number(localStorage.getItem(downKey(name))) > now;
  } catch {
    return false;
  }
}

function setDown(name, down) {
  try {
    if (down) localStorage.setItem(downKey(name), String(Date.now() + DOWN_MS));
    else localStorage.removeItem(downKey(name));
  } catch {
    // then every tab asks it first again
  }
}

// Whether an error means the source can't be reached (offline, too slow, overloaded, rate
// limited, or answering something unreadable) rather than having nothing for this request (a 4xx).
export const unreachable = error => !error?.status || error.status >= 500 || error.status === 429 || !!error.rateLimited;

function beforeDeadline(promise, ms) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`No answer in ${ms} ms`)), ms);
  });
  promise.catch(() => {});   // failing after the deadline changes nothing
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// The first answer from sources tried in order, [{ name, load }], as { data, via: its name }. A
// source with nothing for this (null, or a 4xx) hands over to the next. One that's unreachable,
// or slower than handoverMs while another is left to ask, is skipped by every tab for DOWN_MS,
// so the next answers at once; when all are skipped they're all tried. With no answer anywhere
// the first error is thrown, or null returned when none failed.
export async function firstOf(sources, { handoverMs = HANDOVER_MS } = {}) {
  const now = Date.now();
  const up = sources.filter(s => !isDown(s.name, now));
  const order = up.length ? up : sources;
  let failure = null;
  for (const [i, source] of order.entries()) {
    try {
      const data = await (i < order.length - 1 ? beforeDeadline(source.load(), handoverMs) : source.load());
      if (data != null) {
        setDown(source.name, false);
        return { data, via: source.name };
      }
    } catch (error) {
      failure ??= error;
      if (unreachable(error)) setDown(source.name, true);
    }
  }
  if (failure) throw failure;
  return null;
}

function readAttempt(key) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key + ':attempt') ?? 'null');
  } catch {
    return null;
  }
}

function writeAttempt(key, error) {
  const record = { at: Date.now(), error: error ? { status: error.status, rateLimited: !!error.rateLimited, message: error.message } : null };
  try {
    localStorage.setItem(PREFIX + key + ':attempt', JSON.stringify(record));
  } catch {
    // cache is only a speed-up
  }
}

const inflight = new Map();   // key → the promise of a load running in this tab

// Saved value if fetched less than ttlMs ago, else fetched and parsed fresh: by load(), or from
// a list of sources (firstOf), when via names the one that gave it. A load already running in
// this tab (another widget copy asking for the same thing) is shared. Every attempt is recorded
// before it starts, so a failure (or a fetch already running in another tab) isn't retried until
// ttlMs has passed. On failure the last good value is returned with error set. ttlMs = 0 always
// fetches (manual refresh).
export async function feed(key, ttlMs, load) {
  const hit = peek(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return { data: hit.data, at: hit.at, via: hit.via };
  if (inflight.has(key)) return inflight.get(key);
  const attempt = readAttempt(key);
  if (attempt && now - attempt.at < ttlMs) {
    return { data: hit?.data ?? null, at: hit?.at ?? 0, via: hit?.via, error: attempt.error ?? undefined };
  }
  writeAttempt(key, null);
  const run = (async () => {
    try {
      const got = Array.isArray(load) ? await firstOf(load) : { data: await load() };
      if (got?.data != null) {
        store(key, got.data, got.via);
        return { data: got.data, at: Date.now(), via: got.via };
      }
      return { data: hit?.data ?? null, at: Date.now(), via: hit?.via };
    } catch (error) {
      writeAttempt(key, error);
      return { data: hit?.data ?? null, at: hit?.at ?? 0, via: hit?.via, error };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

// Removes saved values, and their attempt records, whose key starts with prefix and fails
// keep(key). For caches keyed by day, which would otherwise pile up.
export function sweep(prefix, keep) {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) {
      if (!k?.startsWith(PREFIX + prefix)) continue;
      if (!keep(k.slice(PREFIX.length).replace(/:attempt$/, ''))) localStorage.removeItem(k);
    }
  } catch {
    // cache is only a speed-up
  }
}
