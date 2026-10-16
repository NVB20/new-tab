// Search bar helpers: which engine the bar is on, where Enter goes, the message handed to a chat
// site, and where the bar sits among the tile rows. Touches no browser globals (unit-tested in Node).

// Engines in the order the bar offers them. The chat engines open a new chat and send the message.
const ENGINES = ['google', 'claude', 'chatgpt', 'gemini'];
export const CHAT_PAGES = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
};

// Messages for chat sites wait in chrome.storage.local under this key until content/chat.js
// picks them up. Keep both values in step with content/chat.js.
export const HANDOFF_KEY = 'chatHandoffs';
export const HANDOFF_TTL = 2 * 60e3;

export const enginesOn = search => ENGINES.filter(m => search[m]);

// The engine Enter goes to: the saved one while it's on, else the first one on; null hides the bar.
export function activeMode(search) {
  if (!search.enabled) return null;
  const on = enginesOn(search);
  return on.includes(search.mode) ? search.mode : on[0] ?? null;
}

export function nextMode(search) {
  const on = enginesOn(search);
  return on[(on.indexOf(activeMode(search)) + 1) % on.length];
}

export const googleUrl = query => 'https://www.google.com/search?q=' + encodeURIComponent(query);

// Only the id goes in the address (in the fragment, which never reaches the server).
export const chatUrl = (engine, id) => CHAT_PAGES[engine] + '#nt=' + id;

// Adds a message to the stored list, dropping any too old to be picked up any more.
export function addHandoff(list, entry, now) {
  return [...(Array.isArray(list) ? list : []).filter(h => now - h?.at < HANDOFF_TTL), entry];
}

// ---- where the bar sits ----
// prefs.search.row is how many rows of tiles are above the bar; BOTTOM keeps it under every tile.
// A slot is a gap the bar can take in the group on screen: 0 is the top, tileRows the bottom.

export const BOTTOM = -1;

// Tile rects (anything with top and bottom) → rows, top to bottom. A rect that starts above the
// bottom of the row before it is in that row (the shorter + button sits centred in its row).
export function rowBands(rects) {
  const bands = [];
  for (const r of [...rects].filter(r => r.bottom > r.top).sort((a, b) => a.top - b.top)) {
    const last = bands.at(-1);
    if (last && r.top < last.bottom) last.bottom = Math.max(last.bottom, r.bottom);
    else bands.push({ top: r.top, bottom: r.bottom });
  }
  return bands;
}

// Where the line for slot k goes: the top edge, the middle of a gap between rows, the bottom edge.
export function gapY(bands, k) {
  if (k <= 0) return bands[0]?.top ?? 0;
  if (k >= bands.length) return bands.at(-1)?.bottom ?? 0;
  return (bands[k - 1].bottom + bands[k].top) / 2;
}

export function nearestSlot(y, bands) {
  let best = 0;
  for (let k = 1; k <= bands.length; k++) {
    if (Math.abs(y - gapY(bands, k)) < Math.abs(y - gapY(bands, best))) best = k;
  }
  return best;
}

export function barSlot(row, tileRows) {
  if (row === BOTTOM) return tileRows;
  if (!Number.isInteger(row) || row < 0) return 0;
  return Math.min(row, tileRows);
}

export const slotToRow = (slot, tileRows) => (tileRows > 0 && slot >= tileRows ? BOTTOM : slot);
