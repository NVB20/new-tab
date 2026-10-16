import { createStore, pickAdapter } from './store.js';
import { icon } from './ui.js';
import { mountTheme } from './theme.js';
import { mountGroups } from './groups.js';
import { mountGrid } from './grid.js';
import { mountWidgets } from './widgets.js';
import { setupPrefs } from './prefs.js';
import { setupJump } from './jump.js';
import { setupSidebar } from './sidebar.js';

const store = createStore(pickAdapter());
await store.load();

mountTheme(store);
mountGroups(document.getElementById('groups'), store);
mountGrid(document.getElementById('grid'), store);
mountWidgets(document.getElementById('widgets'), store);
const prefs = setupPrefs(store);
const jump = setupJump(store);
const sidebar = setupSidebar();

const buttons = [
  ['btn-jump', 'search', () => jump.open()],
  ['btn-sidebar', 'sidebar', () => sidebar.toggle()],
  ['btn-prefs', 'menu', () => prefs.open()],
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
    jump.open();
  } else if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) {
    e.preventDefault();
    jump.open();
  }
});

// Save pending edits (e.g. notes typed just now) before the tab goes away.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush();
});
addEventListener('pagehide', () => store.flush());

document.body.classList.add('ready');
