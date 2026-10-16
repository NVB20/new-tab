// Search bar helpers: which engine the bar is on, where Enter goes, the message handed to a chat
// site. Touches no browser globals (unit-tested in Node).

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

// The engine Enter goes to: the saved one while it's on, else the first one on; null when no
// engine is on.
export function activeMode(search) {
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

