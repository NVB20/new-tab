# First-run setup (onboarding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-run setup card over the real page that builds the page as you answer, plus swaps in Layout mode so a full page can be rearranged.

**Architecture:** Pure helpers (site ranking, default placement, swaps, the `onboarding` state key) are unit-tested in Node. `js/onboarding.js` is a lazy module that drives the card and writes every answer through `store.update`, so the page re-renders live; `js/onboarding-fx.js` draws the opening word and the ending ripple on a canvas of its own laid on the ASCII background's grid. Moves are detected by watching the page (Jump's dialog, the search input's focus, `body.layout-editing`), so jump.js and searchbar.js are untouched.

**Tech Stack:** Plain ES modules, no build, `node --test`, Chrome extension APIs through `js/chrome-api.js`.

## Global Constraints

- No new dependencies, no manifest change (history, bookmarks, favicon are already granted).
- Copy follows the README's voice: plain sentences, the user's words, no em-dash asides.
- Every colour from the theme tokens (`--bg`, `--surface`, `--surface-2`, `--text`, `--muted`, `--border`, `--accent`, `--accent-soft`, `--shadow`).
- `prefers-reduced-motion: reduce` drops the word, the ripple and the shrink into ☰.
- Layout mode needs 900px; setup's Arrange step is skipped below that.
- A saved state without `onboarding` counts as done; no saved state starts setup.

---

### Task 1: Site suggestions (`js/suggest.js`)

**Files:** Create `js/suggest.js`, `test/suggest.test.js`.

**Interfaces — Produces:**
- `rankSites(items: {url, title, visitCount}[], { exclude?: string[], limit?: number }) → { host, url, title, visits }[]`
- `siteName(host: string, pages: { title, visits }[]) → string`
- `barItems(tree: BookmarkTreeNode[]) → ({ id, title, url } | { id, title, links: { id, title, url }[] })[]`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankSites, siteName, barItems } from '../js/suggest.js';

const visit = (url, title, visitCount = 1) => ({ url, title, visitCount });

test('rankSites groups pages by site and ranks the sites by visits', () => {
  const sites = rankSites([
    visit('https://mail.google.com/mail/u/0/#inbox', 'Inbox (3) - me@gmail.com - Gmail', 40),
    visit('https://mail.google.com/mail/u/0/#sent', 'Sent Mail - me@gmail.com - Gmail', 5),
    visit('https://www.youtube.com/', 'YouTube', 30),
    visit('https://www.youtube.com/watch?v=1', 'A video - YouTube', 20),
    visit('https://github.com/', 'GitHub', 3),
  ]);
  assert.deepEqual(sites.map(s => [s.host, s.visits]), [['youtube.com', 50], ['mail.google.com', 45], ['github.com', 3]]);
  assert.deepEqual(sites.map(s => s.title), ['YouTube', 'Gmail', 'GitHub']);
  assert.deepEqual(sites.map(s => s.url), ['https://www.youtube.com/', 'https://mail.google.com/', 'https://github.com/']);
});

test('rankSites leaves out non-web pages, local servers, search results and sign-in pages', () => {
  const sites = rankSites([
    visit('chrome://settings/', 'Settings', 50),
    visit('file:///C:/notes.txt', 'notes', 50),
    visit('http://localhost:5500/newtab.html', 'New Tab', 50),
    visit('http://127.0.0.1:8080/', 'Dev', 50),
    visit('https://www.google.com/search?q=cats', 'cats - Google Search', 50),
    visit('https://www.bing.com/search?q=dogs', 'dogs - Search', 50),
    visit('https://duckduckgo.com/?q=x', 'x at DuckDuckGo', 50),
    visit('https://accounts.google.com/signin/v2', 'Sign in - Google Accounts', 50),
    visit('https://example.com/login', 'Log in', 50),
    visit('https://example.com/', 'Example Domain', 2),
  ]);
  assert.deepEqual(sites.map(s => [s.host, s.visits]), [['example.com', 2]]);
});

test('rankSites leaves out sites already on a tile and keeps the top ones', () => {
  const items = Array.from({ length: 20 }, (_, i) => visit(`https://site${i}.com/`, `Site ${i}`, 100 - i));
  const sites = rankSites(items, { exclude: ['https://www.site0.com/page', 'https://site1.com'], limit: 5 });
  assert.deepEqual(sites.map(s => s.host), ['site2.com', 'site3.com', 'site4.com', 'site5.com', 'site6.com']);
});

test('siteName finds the site’s own name in its pages’ titles', () => {
  assert.equal(siteName('calendar.google.com', [{ title: 'Google Calendar - Week of 12 October 2026', visits: 3 }]), 'Google Calendar');
  assert.equal(siteName('linkedin.com', [{ title: '(5) Feed | LinkedIn', visits: 9 }]), 'LinkedIn');
  assert.equal(siteName('github.com', [{ title: 'NVB20/new-tab: A new tab page', visits: 9 }, { title: 'Pull requests · GitHub', visits: 2 }]), 'GitHub');
  assert.equal(siteName('web.whatsapp.com', [{ title: '(12) WhatsApp', visits: 4 }]), 'WhatsApp');
  assert.equal(siteName('news.ycombinator.com', [{ title: 'Hacker News', visits: 4 }]), 'Hacker News');
  assert.equal(siteName('mail.google.com', [{ title: 'Inbox (3) - me@gmail.com - Gmail', visits: 4 }]), 'Gmail');
});

test('siteName falls back to the site’s own label, or its host', () => {
  assert.equal(siteName('example.co.il', [{ title: 'Welcome', visits: 1 }]), 'Example');
  assert.equal(siteName('x.com', [{ title: '', visits: 1 }]), 'x.com');
});

test('barItems reads the bookmarks bar: links, and folders with their links one level down', () => {
  const tree = [{ id: '0', children: [
    { id: '1', title: 'Bookmarks bar', children: [
      { id: '10', title: 'Drive', url: 'https://drive.google.com/' },
      { id: '11', title: '', url: 'https://developer.mozilla.org/en-US/' },
      { id: '12', title: 'Reading', children: [
        { id: '20', title: 'A', url: 'https://a.com/' },
        { id: '21', title: 'Deeper', children: [{ id: '30', title: 'B', url: 'https://b.com/' }] },
      ] },
      { id: '13', title: 'Empty', children: [] },
      { id: '14', title: 'Script', url: 'javascript:void(0)' },
    ] },
    { id: '2', title: 'Other bookmarks', children: [] },
  ] }];
  assert.deepEqual(barItems(tree), [
    { id: '10', title: 'Drive', url: 'https://drive.google.com/' },
    { id: '11', title: 'developer.mozilla.org', url: 'https://developer.mozilla.org/en-US/' },
    { id: '12', title: 'Reading', links: [{ id: '20', title: 'A', url: 'https://a.com/' }] },
  ]);
  assert.deepEqual(barItems([]), []);
});
```

- [ ] **Step 2: Run `node --test test/suggest.test.js`.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `js/suggest.js`** (pure; imports `hostOf` from util.js). Titles split on ` - `, ` | `, ` · `, ` — `, `: `; a leading `(3)` counter goes; segments with `@` or over 32 characters are ignored; the segment that contains one of the host's labels (3+ characters, not `www`, `web`, `app` or a TLD) wins by summed visits, shorter first on a tie; otherwise the last such label capitalised, otherwise the host.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit** `feat: suggest.js ranks the sites in Chrome's history and reads the bookmarks bar for setup`.

### Task 2: Default places and swaps (`js/layout.js`)

**Files:** Modify `js/layout.js` (FAR gains `website: 6`; add exports), `test/layout.test.js`.

**Interfaces — Produces:**
- `placeDefaults(layout, types: string[]) → copy[]` — one copy per type in its default place, keeping the id and settings of the first copy of each type already there, the clock column's side and a bottom search bar.
- `atDefaultPlaces(layout) → boolean`
- `swapPlan(layout, id, rect) → { a: rect, b: { id, x, y, w, h } } | null`
- `swapCopy(layout, id, rect) → boolean`

- [ ] **Step 1: Write the failing tests** (added to `test/layout.test.js`; import the four names):

```js
test('Website has a default place in the far column', () => {
  const l = { cols: COLS, rows: ROWS, widgets: [] };
  l.widgets = placeDefaults(l, ['clock', 'markets', 'website', 'search', 'tiles']);
  assert.deepEqual(rect(byType(l).website), [9, 5, 3, 6]);
});

test('placeDefaults puts the given types in their default places, keeping copies already there', () => {
  const l = defaultLayout(legacy());
  const clock = byType(l).clock;
  moveCopy(l, clock.id, { x: 0, y: 0, w: 2, h: 2 });
  l.widgets = placeDefaults(l, ['clock', 'website', 'tiles']);
  const t = byType(l);
  assert.equal(t.clock.id, clock.id);
  assert.equal(t.clock.settings.name, 'Niv');
  assert.deepEqual(rect(t.clock), [0, 0, 3, 4]);
  assert.deepEqual(rect(t.website), [9, 0, 3, 12]);
  assert.deepEqual(t.website.settings, { url: '', zoom: 100 });
  assert.deepEqual(rect(t.tiles), [3, 0, 6, 12]);
  assert.equal(l.widgets.length, 3);
});

test('placeDefaults keeps the clock column’s side and a search bar at the bottom', () => {
  const l = defaultLayout(legacy({ search: { enabled: true, row: -1 }, widgets: { ...legacy().widgets, position: 'right' } }));
  l.widgets = placeDefaults(l, ['clock', 'search', 'tiles']);
  assert.equal(byType(l).clock.x, 9);
  assert.deepEqual(rect(byType(l).search), [0, 11, 9, 1]);
});

test('atDefaultPlaces tells a page in its default places from one arranged by hand', () => {
  const l = defaultLayout(legacy());
  assert.equal(atDefaultPlaces(l), true);
  moveCopy(l, byType(l).clock.id, { x: 0, y: 0, w: 3, h: 3 });
  assert.equal(atDefaultPlaces(l), false);
  l.widgets = placeDefaults(l, l.widgets.map(c => c.type));
  assert.equal(atDefaultPlaces(l), true);
});

test('a drop on a column neighbour swaps their order', () => {
  const l = defaultLayout(legacy());
  const t = byType(l);
  const drop = { x: 9, y: 2, w: 3, h: 5 };
  assert.equal(moveCopy(l, t.markets.id, drop), false);
  assert.deepEqual(swapPlan(l, t.markets.id, drop), { a: { x: 9, y: 7, w: 3, h: 5 }, b: { id: t.github.id, x: 9, y: 0, w: 3, h: 7 } });
  assert.equal(swapCopy(l, t.markets.id, drop), true);
  assert.deepEqual(rect(byType(l).github), [9, 0, 3, 7]);
  assert.deepEqual(rect(byType(l).markets), [9, 7, 3, 5]);
});

test('row neighbours swap order; other pairs trade corners, each keeping its size', () => {
  const row = { cols: COLS, rows: ROWS, widgets: [
    { id: 'a', type: 'notes', x: 0, y: 0, w: 3, h: 3, settings: {} },
    { id: 'b', type: 'claude', x: 3, y: 0, w: 4, h: 3, settings: {} },
  ] };
  assert.equal(swapCopy(row, 'a', { x: 2, y: 0, w: 3, h: 3 }), true);
  assert.deepEqual(row.widgets.map(rect), [[4, 0, 3, 3], [0, 0, 4, 3]]);
  const apart = { cols: COLS, rows: ROWS, widgets: [
    { id: 'a', type: 'notes', x: 0, y: 0, w: 3, h: 3, settings: {} },
    { id: 'b', type: 'claude', x: 6, y: 6, w: 3, h: 3, settings: {} },
  ] };
  assert.equal(swapCopy(apart, 'a', { x: 5, y: 5, w: 3, h: 3 }), true);
  assert.deepEqual(apart.widgets.map(rect), [[5, 5, 3, 3], [0, 0, 3, 3]]);
});

test('swapPlan refuses drops on two copies, off the canvas, or trades that don’t fit', () => {
  const l = defaultLayout(legacy());
  const t = byType(l);
  assert.equal(swapPlan(l, t.clock.id, { x: 2, y: 0, w: 3, h: 4 }), null);
  assert.equal(swapPlan(l, t.markets.id, { x: 10, y: 0, w: 3, h: 5 }), null);
  const tight = { cols: COLS, rows: ROWS, widgets: [
    { id: 'a', type: 'notes', x: 0, y: 0, w: 2, h: 2, settings: {} },
    { id: 'b', type: 'website', x: 6, y: 0, w: 6, h: 12, settings: {} },
  ] };
  assert.equal(swapPlan(tight, 'a', { x: 5, y: 0, w: 2, h: 2 }), null);
  assert.equal(swapCopy(tight, 'a', { x: 5, y: 0, w: 2, h: 2 }), false);
});
```

- [ ] **Step 2: Run `node --test test/layout.test.js`.** Expected: FAIL (`placeDefaults` is not exported).
- [ ] **Step 3: Implement** the four functions under "what Layout mode does"; `swapPlan` checks `inside` and overlaps against every copy but the two.
- [ ] **Step 4: Run `npm test`.** Expected: all pass (Reset layout now keeps Website copies in the far column).
- [ ] **Step 5: Commit** `feat: layout.js places widgets in their default places for setup, gives Website one, and plans swaps`.

### Task 3: The `onboarding` key (`js/store.js`)

**Files:** Modify `js/store.js` (KEYS, defaultState, normalizeState), `test/store.test.js`.

- [ ] **Step 1: Failing test**

```js
test('a new install starts setup; a page saved before setup counts as done; a saved key is kept', () => {
  assert.deepEqual(normalizeState(null).onboarding, { done: false, step: 'intro' });
  assert.deepEqual(normalizeState({ groups: [] }).onboarding, { done: true, step: 'done' });
  assert.deepEqual(normalizeState({ onboarding: { done: false, step: 'sites' } }).onboarding, { done: false, step: 'sites' });
  assert.deepEqual(normalizeState({ onboarding: { done: true, step: 'moves' } }).onboarding, { done: true, step: 'moves' });
  assert.deepEqual(normalizeState({ onboarding: { done: 'yes', step: 7 } }).onboarding, { done: false, step: 'intro' });
});
```

- [ ] **Step 2: Run, expect FAIL.** - [ ] **Step 3: Implement.** - [ ] **Step 4: `npm test` passes.**
- [ ] **Step 5: Commit** `feat: the state remembers whether setup is done and where it stopped`.

### Task 4: Swaps and Page full in Layout mode (`js/edit-mode.js`, `css/newtab.css`)

**Consumes:** `swapPlan`, `swapCopy` (Task 2).

- [ ] While dragging (moves only, not resizes): when the target doesn't fit, `swapPlan` decides; a plan shows the ghost at `plan.a` (not red) and a second dashed ghost (`.canvas-ghost.other`) at `plan.b`; the frame isn't marked bad.
- [ ] On drop: `moveCopy` when it fits, else `swapCopy` when there's a plan, else back.
- [ ] `renderTray`: when every chip is disabled and at least one only for lack of room, a `.tray-note` says "Page full: shrink or remove a widget to add one."
- [ ] Check in headless Chrome: drag Markets onto GitHub on a new page; they trade places.
- [ ] Commit `feat: Layout mode swaps a widget with the neighbour it's dropped on, and says when the page is full`.

### Task 5: Opening word and ending ripple (`js/onboarding-fx.js`)

**Produces:** `spellWord(word, { ms }) → Promise<void>`, `rippleFrom(x, y) → void`, `fxReady() → boolean` (ASCII background showing and motion allowed).

- [ ] One fixed canvas (`.ob-fx`, `z-index: -1`, after `#ascii`), the background's cell grid (7 × 14 px, rounded to device pixels as in ascii-bg.js), its font, the theme's glow colour (the `glowTo` of ascii-bg.js's palettes). Word: drawn squashed into a cols × rows mask, cells lit from the centre outwards, held, faded; each lit cell is cleared to the page background first so the glyphs underneath don't show through. Ripple: a ring of lit cells, 0.32 px/ms to 480 px. The canvas is removed when idle.
- [ ] Commit with Task 6.

### Task 6: The setup card (`js/onboarding.js`, `js/main.js`, `js/prefs.js`, `css/newtab.css`)

**Consumes:** Tasks 1–3, 5; `setTheme`, `addTile`, `isFolder`, `fromSpeedDial2`, `addSavedIcons`, `shrinkImage` (exported from prefs.js), `requestSiteAccess`, `sitePattern`, `siteUrl`, `NBA_TEAMS`, `NFL_TEAMS`, `SOCCER_TEAMS`.

**Produces:** `setupOnboarding(store, canvas, ctx) → { start({ again }) }` with `ctx = { openJump, enterLayout, exitLayout }`.

- [ ] main.js: when `store.get().onboarding.done` is false, add `ob-setup ob-fresh` to `<body>` before first paint and `import('./onboarding.js')` → `start()`; Preferences gets `runSetup` → `start({ again: true })`.
- [ ] prefs.js: Page section row "Setup — Run setup again", closing the panel first; `export async function shrinkImage`.
- [ ] onboarding.js: steps, card positions (far side of the clock for Name/Look/Sites/Widgets, near side for Connect/Moves, docked above the tray for Arrange, a bottom sheet under 900px), staged reveal (`.ob-hidden` frames; `ob-fresh` cleared once applied), Moves detection, Esc → Resume setup, other tabs, Done.
- [ ] css: the `ob-` section at the end of the file.
- [ ] Check in Playwright's Chromium with the extension loaded: fresh profile → card at intro; Begin → Name; typing changes the greeting; Sites lists history; Widgets re-flows; Arrange enters Layout mode; Moves ticks on Ctrl+K; Done sets `onboarding.done` in chrome.storage.
- [ ] Commit `feat: first-run setup: a card over the real page that builds it as you answer`.

### Task 7: README and landing

- [ ] README: a "First run" section and the agent prompt's step 3 mention setup; Layout mode mentions swaps and Page full.
- [ ] `npm test`; merge main into the branch; re-test; `git merge --ff-only` from main's checkout.
