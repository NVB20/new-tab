// Pure helpers. No DOM or Chrome access, so they can be unit-tested in Node.

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Runs fn once the page has a quiet moment (within timeoutMs at the latest). Safari has no
// requestIdleCallback, and Node neither, so there it runs on the next turn.
export function idle(fn, timeoutMs = 2000) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout: timeoutMs });
  else setTimeout(fn, 1);
}

// The image shown behind the page, or '' when the ASCII or plain background shows instead.
// wallpaper is null while the uploaded one is still being read, and so is the result then.
export function backgroundImage(background, wallpaper) {
  if (!background.showImage) return '';
  return background.useUpload ? wallpaper : background.url;
}

// "host:port" is not a scheme, so the lookahead rejects a digit right after the colon.
const SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

// Schemes that run script or carry a whole page in the address. A tile with one would do
// nothing (javascript:) or open a page someone else wrote (data:), so none is kept.
const UNSAFE_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'blob:'];

// Whether url (as typed, imported or restored) is free of those schemes. Browsers drop spaces,
// tabs and line breaks around and inside a scheme, so they're dropped before looking.
export function isSafeUrl(url) {
  if (typeof url !== 'string') return false;
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(url.replace(/[\u0000- ]/g, ''))?.[0].toLowerCase();
  return !UNSAFE_SCHEMES.includes(scheme);
}

// url when it starts with prefix (e.g. 'https://github.com/'), else ''. For links and images
// built from a response we don't control.
export const onlyFrom = (prefix, url) => (typeof url === 'string' && url.startsWith(prefix) ? url : '');

export function normalizeUrl(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s || /\s/.test(s) || !isSafeUrl(s)) return null;
  const added = !SCHEME.test(s);
  if (added) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (added && !u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch {
    return null;
  }
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

const BOUNDARY = /[\s\-_./:?#=&]/;

// 0 means no match. Substring matches beat scattered subsequence matches;
// matches at the start or at a word boundary score higher.
export function fuzzyScore(query, text) {
  const q = (query || '').toLowerCase().trim();
  const t = (text || '').toLowerCase();
  if (!q) return 1;

  const idx = t.indexOf(q);
  if (idx !== -1) {
    let score = 100 + q.length * 2 - Math.min(idx, 20);
    if (idx === 0) score += 50;
    else if (BOUNDARY.test(t[idx - 1])) score += 25;
    return score;
  }

  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, from);
    if (found === -1) return 0;
    score += found === prev + 1 ? 5 : 1;
    if (found === 0 || BOUNDARY.test(t[found - 1])) score += 3;
    prev = found;
    from = found + 1;
  }
  return score;
}
