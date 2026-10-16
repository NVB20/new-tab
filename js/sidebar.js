// Slide-out panel with Chrome bookmarks, recent history and recently closed tabs.

import { el, icon, tileIcon } from './ui.js';
import { hasChrome, bookmarksTree, historySearch, recentlyClosed, restoreSession, openUrl } from './chrome-api.js';

const VIEWS = [
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'history', label: 'History' },
  { id: 'closed', label: 'Closed' },
];
const BOOKMARKS_BAR_ID = '1';

const timeLabel = ms => {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function linkRow(url, title, meta, onActivate) {
  return el('a', {
    class: 'side-link',
    href: url,
    title: url,
    onclick: e => {
      if (!onActivate && /^https?:/i.test(url)) return;
      e.preventDefault();
      (onActivate ?? (() => openUrl(url, { newTab: e.ctrlKey || e.metaKey })))();
    },
  },
    tileIcon(url, '', title, { mini: true }),
    el('span', { class: 'side-title', dir: 'auto', text: title || url }),
    meta && el('span', { class: 'side-meta', text: meta }));
}

// A folder's contents are built the first time it opens, so a big bookmark tree costs nothing
// (no rows, no favicon requests) until it is browsed.
function folderNode(node, open) {
  const children = el('div', { class: 'side-children' });
  let filled = false;
  const fill = () => {
    if (filled || !details.open) return;
    filled = true;
    children.append(...(node.children ?? []).map(child => (child.url
      ? linkRow(child.url, child.title)
      : folderNode(child, false))));
  };
  const details = el('details', { class: 'side-folder', open, ontoggle: fill },
    el('summary', {}, icon('chevron', 14), icon('folder', 16), el('span', { class: 'side-title', dir: 'auto', text: node.title || 'Folder' })),
    children);
  fill();
  return details;
}

export function setupSidebar() {
  const panel = document.getElementById('sidebar');
  const toggleButton = document.getElementById('btn-sidebar');
  let view = 'bookmarks';

  const tabs = el('div', { class: 'seg sidebar-tabs', role: 'tablist' });
  const body = el('div', { class: 'sidebar-body' });
  panel.append(
    el('div', { class: 'sidebar-head' }, tabs, el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close sidebar', onclick: close }, icon('x'))),
    body);

  async function render() {
    tabs.replaceChildren(...VIEWS.map(v => el('button', {
      type: 'button', role: 'tab', 'aria-selected': String(v.id === view), 'aria-pressed': String(v.id === view),
      text: v.label,
      onclick: () => { view = v.id; render(); },
    })));

    if (!hasChrome) {
      body.replaceChildren(el('p', { class: 'side-empty', text: 'Bookmarks, history and recently closed tabs appear here when this page runs as the installed extension.' }));
      return;
    }

    let nodes = [];
    if (view === 'bookmarks') {
      const [root] = await bookmarksTree();
      nodes = (root?.children ?? []).map(n => folderNode(n, n.id === BOOKMARKS_BAR_ID));
    } else if (view === 'history') {
      const items = await historySearch('', 50, Date.now() - 7 * 24 * 3600 * 1000);
      nodes = items.map(h => linkRow(h.url, h.title, timeLabel(h.lastVisitTime)));
    } else {
      const items = await recentlyClosed(25);
      nodes = items.map(c => linkRow(c.url, c.title, c.time ? timeLabel(c.time * 1000) : '', () => restoreSession(c.sessionId)));
    }
    body.replaceChildren(...(nodes.length ? nodes : [el('p', { class: 'side-empty', text: 'Nothing here yet.' })]));
  }

  function open() {
    panel.inert = false;
    panel.classList.add('open');
    render();
  }

  function close() {
    panel.classList.remove('open');
    panel.inert = true;
  }

  const isOpen = () => panel.classList.contains('open');

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen() && !document.querySelector('dialog[open]')) close();
  });
  document.addEventListener('pointerdown', e => {
    if (isOpen() && !panel.contains(e.target) && !toggleButton.contains(e.target) && !e.target.closest?.('.menu, dialog')) close();
  });

  return { toggle: () => (isOpen() ? close() : open()) };
}
