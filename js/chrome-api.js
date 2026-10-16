// Thin wrappers over the Chrome extension APIs. Outside an extension (plain browser tab)
// every call degrades to an empty result or a normal web navigation.

import { HANDOFF_KEY, CHAT_PAGES, addHandoff, chatUrl } from './ask.js';

const c = globalThis.chrome;

export const hasChrome = !!c?.runtime?.id;
const can = {
  bookmarks: hasChrome && !!c.bookmarks,
  history: hasChrome && !!c.history,
  sessions: hasChrome && !!c.sessions,
  tabs: hasChrome && !!c.tabs,
  search: hasChrome && !!c.search,
};

const isOwnPage = url => !url || url.startsWith(location.origin) || url.startsWith('chrome://newtab');

export function faviconUrl(pageUrl, size = 32) {
  if (!hasChrome || !pageUrl) return '';
  const u = new URL(c.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(size));
  return u.href;
}

export async function openUrl(url, { newTab = false } = {}) {
  try {
    if (can.tabs) {
      if (newTab) await c.tabs.create({ url });
      else await c.tabs.update({ url });
    } else if (newTab) {
      window.open(url, '_blank', 'noopener');
    } else {
      location.href = url;
    }
  } catch (err) {
    console.warn('Could not open', url, err);
  }
}

export async function closeCurrentTab() {
  if (!can.tabs) return;
  const tab = await c.tabs.getCurrent();
  if (tab) await c.tabs.remove(tab.id);
}

export async function bookmarksSearch(query) {
  if (!can.bookmarks || !query) return [];
  const found = await c.bookmarks.search(query);
  return found.filter(b => b.url);
}

export async function bookmarksTree() {
  return can.bookmarks ? c.bookmarks.getTree() : [];
}

export async function historySearch(text, maxResults = 20, startTime = 0) {
  if (!can.history) return [];
  const items = await c.history.search({ text, maxResults, startTime });
  return items.filter(h => !isOwnPage(h.url));
}

export async function openTabs() {
  if (!can.tabs) return [];
  const [all, current] = await Promise.all([c.tabs.query({}), c.tabs.getCurrent()]);
  return all.filter(t => t.id !== current?.id && !isOwnPage(t.url));
}

export async function focusTab(tab) {
  await c.tabs.update(tab.id, { active: true });
  await c.windows.update(tab.windowId, { focused: true });
  await closeCurrentTab();
}

export async function recentlyClosed(maxResults = 10) {
  if (!can.sessions) return [];
  const sessions = await c.sessions.getRecentlyClosed({ maxResults: Math.min(25, maxResults + 5) });
  return sessions
    .map(s => {
      if (s.tab) return { sessionId: s.tab.sessionId, title: s.tab.title || s.tab.url, url: s.tab.url, time: s.lastModified };
      if (s.window) {
        const n = s.window.tabs?.length ?? 0;
        return { sessionId: s.window.sessionId, title: `Window with ${n} tab${n === 1 ? '' : 's'}`, url: s.window.tabs?.[0]?.url ?? '', time: s.lastModified, isWindow: true };
      }
      return null;
    })
    .filter(s => s && (s.isWindow || !isOwnPage(s.url)))
    .slice(0, maxResults);
}

export async function restoreSession(sessionId) {
  await c.sessions.restore(sessionId);
  await closeCurrentTab();
}

// Opens a new chat with `engine` ('claude' | 'chatgpt' | 'gemini') and runs `text` in it: the
// message waits in extension storage and content/chat.js types it in and sends it. Only an id goes
// in the address.
export async function askChat(engine, text, { newTab = false } = {}) {
  if (hasChrome && c.storage) {
    const id = crypto.randomUUID();
    const now = Date.now();
    const list = (await c.storage.local.get(HANDOFF_KEY))[HANDOFF_KEY];
    await c.storage.local.set({ [HANDOFF_KEY]: addHandoff(list, { id, engine, text, at: now }, now) });
    await openUrl(chatUrl(engine, id), { newTab });
    return;
  }
  // Outside the extension nothing runs on the chat site, so the message goes to the clipboard.
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // no clipboard access; the chat still opens
  }
  await openUrl(CHAT_PAGES[engine], { newTab });
}

export async function webSearch(text, { newTab = false } = {}) {
  if (can.search) {
    await c.search.query({ text, disposition: newTab ? 'NEW_TAB' : 'CURRENT_TAB' });
    return;
  }
  await openUrl('https://www.google.com/search?q=' + encodeURIComponent(text), { newTab });
}
