import { createStore, pickAdapter } from './store.js';
import { icon } from './ui.js';
import { mountTheme } from './theme.js';
import { mountGroups } from './groups.js';
import { mountGrid } from './grid.js';
import { mountWidgets } from './widgets.js';
import { mountSideWidgets } from './side-widgets.js';
import { startIconCache } from './icon-cache.js';

const store = createStore(pickAdapter());
await store.load();

mountTheme(store);
mountGroups(document.getElementById('groups'), store);
mountGrid(document.getElementById('grid'), store);
startIconCache(store);
mountWidgets(document.getElementById('widgets'), store);
mountSideWidgets(document.getElementById('side-widgets'), store, (id, anchor) => prefs().then(p => p.open(id, anchor)));

// Jump, Preferences and the sidebar aren't needed to show the page: each loads on first use,
// or once the page is idle, whichever comes first.
const lazy = load => {
  let promise = null;
  return () => (promise ??= load());
};
const jump = lazy(() => import('./jump.js').then(m => m.setupJump(store)));
const prefs = lazy(() => import('./prefs.js').then(m => m.setupPrefs(store)));
const sidebar = lazy(() => import('./sidebar.js').then(m => m.setupSidebar()));
const openJump = () => jump().then(j => j.open());

const buttons = [
  ['btn-jump', 'search', openJump],
  ['btn-sidebar', 'sidebar', () => sidebar().then(s => s.toggle())],
  ['btn-prefs', 'menu', () => prefs().then(p => p.open())],
];
for (const [id, iconName, action] of buttons) {
  const button = document.getElementById(id);
  button.append(icon(iconName, 20));
  button.addEventListener('click', action);
}

document.addEventListener('keydown', e => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openJump();
  } else if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) {
    e.preventDefault();
    openJump();
  }
});

// Save pending edits (e.g. notes typed just now) before the tab goes away.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush();
});
addEventListener('pagehide', () => store.flush());

document.body.classList.add('ready');

// The ASCII background starts right after the first paint, so the tiles don't wait for it.
requestAnimationFrame(() => setTimeout(async () => {
  const { mountAsciiBackground } = await import('./ascii-bg.js');
  mountAsciiBackground(document.getElementById('ascii'), store);
  requestIdleCallback(() => [jump, prefs, sidebar].forEach(load => load()));
}));
