// Fetching with a timeout, and a small cache shared by every open new tab (localStorage is per
// extension origin), so opening many tabs doesn't hammer the APIs or GitHub's rate limit.

const PREFIX = 'newtab:cache:';

export async function fetchJson(url, headers = {}, timeoutMs = 10000) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.rateLimited = res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0';
    throw err;
  }
  return res.json();
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

// Cached value if younger than ttlMs, else fetched and parsed fresh. On failure the last value
// is returned with error set, so widgets keep showing something while offline.
export async function feed(key, ttlMs, load) {
  const hit = peek(key);
  if (hit && Date.now() - hit.at < ttlMs) return { data: hit.data, at: hit.at };
  try {
    const data = await load();
    if (data != null) store(key, data);
    return { data: data ?? hit?.data ?? null, at: Date.now() };
  } catch (error) {
    return { data: hit?.data ?? null, at: hit?.at ?? 0, error };
  }
}
