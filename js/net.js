// Fetching with a timeout, and a small cache shared by every open new tab (localStorage is per
// extension origin), so opening many tabs doesn't hammer the APIs or GitHub's rate limit.

const PREFIX = 'newtab:cache:';

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

// Last stored value for a key, however old ({ at, data } or null).
export function peek(key) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null');
  } catch {
    return null;
  }
}

function store(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // cache is only a speed-up
  }
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

// Saved value if fetched less than ttlMs ago, else fetched and parsed fresh. Every attempt is
// recorded before it starts, so a failure (or a fetch already running in another tab) isn't
// retried until ttlMs has passed. On failure the last good value is returned with error set.
// ttlMs = 0 always fetches (manual refresh).
export async function feed(key, ttlMs, load) {
  const hit = peek(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return { data: hit.data, at: hit.at };
  const attempt = readAttempt(key);
  if (attempt && now - attempt.at < ttlMs) {
    return { data: hit?.data ?? null, at: hit?.at ?? 0, error: attempt.error ?? undefined };
  }
  writeAttempt(key, null);
  try {
    const data = await load();
    if (data != null) store(key, data);
    return { data: data ?? hit?.data ?? null, at: Date.now() };
  } catch (error) {
    writeAttempt(key, error);
    return { data: hit?.data ?? null, at: hit?.at ?? 0, error };
  }
}
