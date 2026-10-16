// Tile logos saved in this Chrome profile, so a tile keeps its logo when the site serving it goes
// away (above all Speed Dial 2's image servers). They live under their own chrome.storage key
// ('icons': { link: data URL }), out of the state written on every edit, plus a localStorage copy
// so a new tab's first paint can use them without waiting for chrome.storage.
// Touches no browser globals at import time (the pure helpers are unit-tested in Node).

import { pickAdapter } from './store.js';

const KEY = 'icons';
const COPY = 'newtab:icon-copy';
const MAX_BYTES = 2 * 1024 * 1024;   // per logo
const MAX_COPY = 3 * 1024 * 1024;    // characters; past this only chrome.storage keeps them
const PARALLEL = 4;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isWebLink = v => typeof v === 'string' && /^https?:\/\//i.test(v);
const clean = map => Object.fromEntries(Object.entries(isObj(map) ? map : {})
  .filter(([url, data]) => isWebLink(url) && typeof data === 'string' && data.startsWith('data:image/')));

// Custom icon links on tiles that aren't saved yet (and didn't already fail), each once.
export function iconsToFetch(tiles, saved, failed = new Set()) {
  return [...new Set(tiles.filter(t => t.kind !== 'folder').map(t => t.icon))]
    .filter(url => isWebLink(url) && !saved[url] && !failed.has(url));
}

// The saved logos the given tiles use.
export function pruneIcons(tiles, saved) {
  const used = new Set(tiles.map(t => t.icon));
  return Object.fromEntries(Object.entries(saved).filter(([url]) => used.has(url)));
}

// Nothing is ever dropped automatically: a link always stands for the same image, and a logo
// whose server is gone can't be fetched again. Backups carry only the ones in use.
let saved = null;
let adapter = null;
const failed = new Set();   // tried again on the next new tab

function readCopy() {
  try {
    return clean(JSON.parse(localStorage.getItem(COPY) ?? 'null'));
  } catch {
    return {};
  }
}

function writeCopy() {
  try {
    const json = JSON.stringify(saved);
    if (json.length <= MAX_COPY) localStorage.setItem(COPY, json);
    else localStorage.removeItem(COPY);
  } catch {
    try {
      localStorage.removeItem(COPY);
    } catch {
      // storage unavailable; chrome.storage still has them
    }
  }
}

const all = () => (saved ??= readCopy());

async function persist() {
  try {
    await (adapter ??= pickAdapter()).set(KEY, saved);
  } catch (err) {
    console.warn('Could not save tile logos.', err);
  }
  writeCopy();
}

// The saved copy of an icon link, or ''.
export const localIcon = url => (url && all()[url]) || '';

// Saved logos for these tiles, for a backup file.
export const iconsFor = tiles => pruneIcons(tiles, all());

// Logos from a restored backup join the saved ones.
export async function addSavedIcons(map) {
  const extra = clean(map);
  if (!Object.keys(extra).length) return;
  saved = { ...all(), ...extra };
  await persist();
  showSaved();
}

export async function clearSavedIcons() {
  saved = {};
  failed.clear();
  await persist();
}

// Tiles on screen switch to their saved logo (an <img> keeps showing the old picture until the
// new one is ready, so nothing flickers). tileIcon marks images showing a custom icon link.
function showSaved() {
  if (typeof document === 'undefined') return;
  for (const img of document.querySelectorAll('img[data-icon]')) {
    const copy = all()[img.dataset.icon];
    if (copy && img.getAttribute('src') !== copy) img.src = copy;
  }
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/') || blob.size > MAX_BYTES) throw new Error('not a usable image');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchMissing(store) {
  const todo = iconsToFetch(store.get().tiles, all(), failed);
  if (!todo.length) return;
  const got = {};
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const url = todo[next++];
      try {
        got[url] = await download(url);
      } catch {
        failed.add(url);   // no CORS headers, server gone, not an image…
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
  if (!Object.keys(got).length) return;
  // Another tab may have saved logos in the meantime; keep those too.
  let stored = {};
  try {
    stored = clean(await adapter.get(KEY));
  } catch {
    // keep what this tab has
  }
  saved = { ...stored, ...all(), ...got };
  await persist();
  showSaved();
}

// Changes that arrive while a download round runs start one more round afterwards.
let running = null;
let again = false;
function sync(store) {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await fetchMissing(store);
    } while (again);
  })().finally(() => { running = null; });
  return running;
}

// Reads the saved logos, then fetches missing ones now and whenever the tiles change.
export async function startIconCache(store) {
  adapter ??= pickAdapter();
  let stored = {};
  try {
    stored = clean(await adapter.get(KEY));
  } catch {
    // the localStorage copy still works
  }
  const copy = all();
  saved = { ...stored, ...copy };
  const n = Object.keys(saved).length;
  if (n > Object.keys(stored).length) await persist();
  else if (n > Object.keys(copy).length) writeCopy();
  showSaved();

  let timer = null;
  store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => sync(store), 500);
  }, ['tiles']);
  await sync(store);
}
