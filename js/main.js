import { createStore, pickAdapter } from './store.js';
import { icon, showMenu } from './ui.js';
import { mountTheme } from './theme.js';
import { mountGroups } from './groups.js';
import { mountCanvas } from './canvas.js';
import { startIconCache } from './icon-cache.js';
import { idle } from './util.js';
import { tidyFrameScript } from './website-widget.js';

const store = createStore(pickAdapter());
await store.load();

// Jump, Preferences, the sidebar and Layout mode aren't needed to show the page: each loads on
// first use (the first three also once the page is idle).
const lazy = load => {
  let promise = null;
  return () => (promise ??= load());
};
const jump = lazy(() => import('./jump.js').then(m => m.setupJump(store)));
const prefs = lazy(() => import('./prefs.js').then(m => m.setupPrefs(store, {
  enterLayoutMode: () => layout().then(l => l.enter()),
  runSetup: () => setup().then(s => s.start({ again: true })),
})));
const sidebar = lazy(() => import('./sidebar.js').then(m => m.setupSidebar()));
const layout = lazy(() => import('./edit-mode.js').then(m => m.setupEditMode(store, canvas, ctx)));
const ctx = { openPrefs: (id, anchor) => prefs().then(p => p.open(id, anchor)) };
const openJump = () => jump().then(j => j.open());
// First-run setup, and Preferences → Run setup again: a card over the page that builds it as you
// answer. Loaded only when it's needed.
const setup = lazy(() => import('./onboarding.js').then(m => m.setupOnboarding(store, canvas, {
  openJump,
  enterLayout: () => layout().then(l => l.enter()),
  exitLayout: () => layout().then(l => l.exit()),
})));

// A first run keeps the widgets hidden until setup decides which to show, so the full page doesn't
// flash first.
const firstRun = !store.get().onboarding.done;
if (firstRun) document.body.classList.add('ob-setup', 'ob-fresh');

mountTheme(store);
mountGroups(document.getElementById('groups'), store);
const canvasRoot = document.getElementById('canvas');
const canvas = mountCanvas(canvasRoot, store, ctx);
if (firstRun) {
  setup().then(s => s.start(), err => {
    console.warn('Setup didn’t load.', err);
    document.body.classList.remove('ob-setup', 'ob-fresh');
  });
}
// The tiles draw their saved logos from the localStorage copy; reading the full set from
// chrome.storage (and fetching new ones) waits for a quiet moment.
idle(() => startIconCache(store));

const buttons = [
  ['btn-jump', 'search', openJump],
  ['btn-layout', 'layout', () => layout().then(l => l.toggle())],
  ['btn-sidebar', 'sidebar', () => sidebar().then(s => s.toggle())],
  ['btn-prefs', 'menu', () => prefs().then(p => p.open())],
];
for (const [id, iconName, action] of buttons) {
  const button = document.getElementById(id);
  button.append(icon(iconName, 20));
  button.addEventListener('click', action);
}

// Right-click on the empty canvas: the way into Layout mode without the top bar.
canvasRoot.addEventListener('contextmenu', e => {
  if (e.target !== canvasRoot) return;
  e.preventDefault();
  showMenu(e.clientX, e.clientY, [{ label: 'Edit layout', icon: 'layout', action: () => layout().then(l => l.enter()) }]);
});

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
  idle(() => {
    [jump, prefs, sidebar].forEach(load => load());
    tidyFrameScript(store);
  });
}));
