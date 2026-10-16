// Jump launcher (Ctrl+K): fuzzy search over tiles, open tabs, bookmarks, history and recently closed tabs.

import { el, icon, tileIcon } from './ui.js';
import { fuzzyScore } from './util.js';
import { openUrl, openTabs, focusTab, bookmarksSearch, historySearch, recentlyClosed, restoreSession, webSearch } from './chrome-api.js';

const LIMITS = { tiles: 6, tabs: 5, bookmarks: 6, history: 6, closed: 4 };

function rank(query, list, limit) {
  return list
    .map(item => ({ item, score: Math.max(fuzzyScore(query, item.title), fuzzyScore(query, item.url) * 0.6) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.item);
}

export function setupJump(store) {
  const input = el('input', {
    class: 'jump-input', type: 'text', placeholder: 'Search tiles, tabs, bookmarks and history…',
    autocomplete: 'off', spellcheck: false, dir: 'auto', 'aria-label': 'Search', role: 'combobox', 'aria-controls': 'jump-results',
  });
  const list = el('div', { class: 'jump-results', id: 'jump-results', role: 'listbox' });
  const dialog = el('dialog', { class: 'dlg jump-dlg', 'aria-label': 'Jump' },
    el('div', { class: 'jump-bar' }, icon('search', 20), input, el('kbd', { text: 'Esc' })),
    list);
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);

  let items = [];
  let nodes = [];   // the rendered row of each item
  let selected = 0;
  let seq = 0;
  let tabs = [];
  let closed = [];

  // Only the old and the new row change.
  function mark(node, on) {
    node?.classList.toggle('selected', on);
    node?.setAttribute('aria-selected', String(on));
  }

  function select(i) {
    mark(nodes[selected], false);
    selected = i;
    mark(nodes[i], true);
    nodes[i]?.scrollIntoView({ block: 'nearest' });
  }

  async function activate(item, newTab) {
    if (!item) return;
    dialog.close();
    if (item.tab) await focusTab(item.tab);
    else if (item.sessionId) await restoreSession(item.sessionId);
    else if (item.search) await webSearch(item.search, { newTab });
    else await openUrl(item.url, { newTab });
  }

  function render(sections) {
    items = sections.flatMap(s => s.items);
    nodes = [];
    if (!items.length) {
      list.replaceChildren(el('p', { class: 'jump-empty', text: input.value.trim() ? 'No matches' : 'Type to search' }));
      return;
    }
    list.replaceChildren(...sections.filter(s => s.items.length).map(s => el('div', { class: 'jump-group', role: 'group', 'aria-label': s.label },
      el('div', { class: 'jump-section', text: s.label }),
      s.items.map(item => {
        const i = nodes.length;
        return nodes[i] = el('div', {
          class: 'jump-item', role: 'option', 'aria-selected': 'false',
          onmousemove: () => { if (selected !== i) select(i); },
          onclick: e => activate(item, e.ctrlKey || e.metaKey),
        },
          el('span', { class: 'jump-ico' }, item.search ? icon('search', 16) : tileIcon(item.url, item.icon, item.title, { mini: true })),
          el('div', { class: 'jump-text' },
            el('div', { class: 'jump-title', dir: 'auto', text: item.title || item.url }),
            item.url && el('div', { class: 'jump-url', text: item.url })),
          el('span', { class: 'jump-kind', text: item.kind }));
      }))));
    select(Math.min(selected, items.length - 1));
  }

  async function refresh() {
    const my = ++seq;
    const q = input.value.trim();
    const s = store.get();
    const groupNames = new Map(s.groups.map(g => [g.id, g.title]));
    // Folders have no address; the tiles inside them are listed like any other tile.
    const tileItems = s.tiles.filter(t => t.kind !== 'folder')
      .map(t => ({ title: t.title, url: t.url, icon: t.icon, kind: groupNames.get(t.groupId) ?? '', groupId: t.groupId }));
    const tabItems = tabs.map(t => ({ title: t.title, url: t.url, kind: 'Open tab', tab: t }));
    const closedItems = closed.map(c => ({ title: c.title, url: c.url, kind: 'Closed', sessionId: c.sessionId }));

    if (!q) {
      render([
        { label: 'Tiles', items: tileItems.filter(t => t.groupId === s.activeGroupId).slice(0, 8) },
        { label: 'Open tabs', items: tabItems.slice(0, LIMITS.tabs) },
        { label: 'Recently closed', items: closedItems.slice(0, LIMITS.closed) },
      ]);
      return;
    }

    const quick = [
      { label: 'Tiles', items: rank(q, tileItems, LIMITS.tiles) },
      { label: 'Open tabs', items: rank(q, tabItems, LIMITS.tabs) },
      { label: 'Recently closed', items: rank(q, closedItems, LIMITS.closed) },
    ];
    const web = { label: 'Web', items: [{ title: `Search the web for “${q}”`, url: '', kind: 'Search', search: q }] };
    selected = 0;
    render([...quick, web]);

    const [bookmarks, history] = await Promise.all([bookmarksSearch(q), historySearch(q, 40)]);
    if (my !== seq) return;
    const seen = new Set(quick.flatMap(sec => sec.items.map(i => i.url)));
    const bookmarkItems = rank(q, bookmarks.filter(b => !seen.has(b.url)).map(b => ({ title: b.title, url: b.url, kind: 'Bookmark' })), LIMITS.bookmarks);
    bookmarkItems.forEach(b => seen.add(b.url));
    const historyItems = rank(q, history.filter(h => !seen.has(h.url)).map(h => ({ title: h.title, url: h.url, kind: 'History' })), LIMITS.history);
    render([quick[0], quick[1], { label: 'Bookmarks', items: bookmarkItems }, { label: 'History', items: historyItems }, quick[2], web]);
  }

  input.addEventListener('input', () => {
    selected = 0;
    refresh();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length) select((selected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(items[selected], e.ctrlKey || e.metaKey);
    }
  });
  dialog.addEventListener('close', () => {
    seq++;
    input.value = '';
  });

  return {
    async open() {
      if (dialog.open) return;
      selected = 0;
      dialog.showModal();
      input.focus();
      refresh();
      [tabs, closed] = await Promise.all([openTabs(), recentlyClosed(10)]);
      if (dialog.open) refresh();
    },
  };
}
