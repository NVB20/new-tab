// Search bar and Claude helpers: which mode the bar is in, where Enter goes, and the message
// handed to claude.ai. Touches no browser globals (unit-tested in Node).

const MODES = ['google', 'claude'];

// Messages for claude.ai wait in chrome.storage.local under this key until content/claude.js
// picks them up. Keep both values in step with content/claude.js.
export const HANDOFF_KEY = 'claudeHandoffs';
export const HANDOFF_TTL = 2 * 60e3;

const modesOn = search => MODES.filter(m => search[m]);

// The mode Enter goes to: the saved one while it's on, else the first one on; null hides the bar.
export function activeMode(search) {
  if (!search.enabled) return null;
  const on = modesOn(search);
  return on.includes(search.mode) ? search.mode : on[0] ?? null;
}

export function nextMode(search) {
  const on = modesOn(search);
  return on[(on.indexOf(activeMode(search)) + 1) % on.length];
}

export const googleUrl = query => 'https://www.google.com/search?q=' + encodeURIComponent(query);

// Only the id goes in the address (in the fragment, which never reaches the server).
export const claudeUrl = id => 'https://claude.ai/new#nt=' + id;

// Adds a message to the stored list, dropping any too old to be picked up any more.
export function addHandoff(list, entry, now) {
  return [...(Array.isArray(list) ? list : []).filter(h => now - h?.at < HANDOFF_TTL), entry];
}
