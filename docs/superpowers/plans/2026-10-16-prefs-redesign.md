# Preferences Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup Preferences into Page / Tiles / Widgets / Backup with options shown only when they apply, and make the panel draggable with nothing dimming the page behind it.

**Architecture:** Data stays as is apart from one new flag (`background.showImage`) and a load-time migration of the old widgets master switch. A shared `backgroundImage()` helper decides what image the page shows. `prefs.js` builds each section from the current prefs and redraws it after any switch or choice, so dependent rows appear and disappear; the dialog header drags the panel by a CSS `translate` offset kept in `localStorage`.

**Tech Stack:** Plain ES modules, no build step, `node --test`, headless Chrome for the visual check.

Spec: `docs/superpowers/specs/2026-10-16-prefs-redesign-design.md`

## Global Constraints

- Every existing setting stays reachable. Removed only: the "Show widgets" master switch and the shortcuts footnote.
- `setupPrefs(store)` keeps returning `{ open(id?) }`.
- The Speed Dial 2 importer is loaded with `import('./importer.js')` inside `importFile`, not statically.
- Rows for features not yet merged (search bar, Claude widget, clock faces, market items) render only when their prefs exist.
- Work happens in the worktree `.claude/worktrees/prefs-redesign` on branch `worktree-prefs-redesign`.

---

### Task 1: Data: `showImage`, `backgroundImage()`, widgets master-switch migration

**Files:**
- Modify: `js/util.js` (add `backgroundImage`)
- Modify: `js/store.js` (`DEFAULT_PREFS.background`, `DEFAULT_PREFS.widgets.enabled` comment, `normalizeState`)
- Modify: `js/theme.js` (use the helper; blur/dim only with an image; `widgets-off` from the widget switches)
- Modify: `js/ascii-bg.js:258-259` (use the helper)
- Test: `test/util.test.js`, `test/store.test.js`

**Interfaces:**
- Produces: `backgroundImage(background, wallpaper) → string` ('' when no image is shown).

- [ ] **Step 1: Write the failing tests**

`test/util.test.js` (add `backgroundImage` to the import from `../js/util.js`):

```js
test('backgroundImage is the upload or the link while showImage is on', () => {
  const bg = { showImage: true, useUpload: false, url: 'https://x/a.jpg' };
  assert.equal(backgroundImage(bg, 'data:w'), 'https://x/a.jpg');
  assert.equal(backgroundImage({ ...bg, useUpload: true }, 'data:w'), 'data:w');
  assert.equal(backgroundImage({ ...bg, showImage: false }, 'data:w'), '');
});
```

`test/store.test.js`:

```js
test('the old switch that hid every widget becomes each widget switched off', () => {
  const w = normalizeState({ prefs: { widgets: { enabled: false, tasks: { enabled: true } } } }).prefs.widgets;
  assert.equal(w.enabled, true);
  for (const name of ['clock', 'tasks', 'notes', 'markets', 'github']) assert.equal(w[name].enabled, false, name);
});

test('each widget keeps its own switch when the old master switch was on', () => {
  const w = normalizeState({ prefs: { widgets: { enabled: true, notes: { enabled: false } } } }).prefs.widgets;
  assert.equal(w.notes.enabled, false);
  assert.equal(w.clock.enabled, true);
});

test('saved backgrounds from before showImage keep showing their image', () => {
  const bg = normalizeState({ prefs: { background: { url: 'https://x/a.jpg' } } }).prefs.background;
  assert.equal(bg.showImage, true);
  assert.equal(bg.url, 'https://x/a.jpg');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test`
Expected: FAIL: `backgroundImage` is not exported; widget switches stay `true`; `showImage` is `undefined`.

- [ ] **Step 3: Implement**

`js/util.js`:

```js
// The image shown behind the page, or '' when the ASCII or plain background shows instead.
export function backgroundImage(background, wallpaper) {
  if (!background.showImage) return '';
  return background.useUpload ? wallpaper : background.url;
}
```

`js/store.js` `DEFAULT_PREFS`:

```js
  // pattern 'ascii' is the animated letter field. An image (the upload when useUpload, else url)
  // covers it while showImage is on; picking a pattern turns showImage off and keeps the image.
  background: { pattern: 'ascii', motion: true, url: '', useUpload: false, showImage: true, blur: 0, dim: 0 },
  widgets: {
    enabled: true,   // always true: an old false is turned into every widget switched off on load
```

`js/store.js` `normalizeState`, right after `s.prefs = deepMerge(DEFAULT_PREFS, raw.prefs);`:

```js
  // Older versions had one switch that hid every widget; it becomes each widget switched off.
  if (!s.prefs.widgets.enabled) {
    for (const w of Object.values(s.prefs.widgets)) if (isObj(w)) w.enabled = false;
    s.prefs.widgets.enabled = true;
  }
```

`js/theme.js`: import `backgroundImage` from `./util.js`; compute `const image = backgroundImage(p.background, store.wallpaper);` before `vars`; set
`'--bg-blur': (image ? p.background.blur : 0) + 'px'` and `'--bg-dim': image ? p.background.dim / 100 : 0`;
replace the `widgets-off` line with
`cl.toggle('widgets-off', !Object.values(p.widgets).some(w => w?.enabled === true));`.

`js/ascii-bg.js` `sync()`: replace the two lines computing `wallpaper` / `want` with
`const want = p.background.pattern === 'ascii' && !backgroundImage(p.background, store.wallpaper);`
and import `backgroundImage` from `./util.js`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass (84 + 4).

- [ ] **Step 5: Commit**

```bash
git add js/util.js js/store.js js/theme.js js/ascii-bg.js test/util.test.js test/store.test.js
git commit -m "feat: background image can be hidden without losing it; widget master switch becomes per-widget"
```

### Task 2: Regrouped Preferences sections

**Files:**
- Modify: `js/prefs.js` (builders, sections, `show()`)
- Modify: `css/newtab.css` (`.pref-sub`)

**Interfaces:**
- Consumes: `backgroundImage` (Task 1), `clamp` from `js/util.js`.
- Produces: `redraw()` inside `setupPrefs`; every switch and choice control carries `data-key` (pref path for switches, label for choices) so focus returns to it after a redraw.

- [ ] **Step 1: Builders.** `getPref` tolerates missing paths (`o?.[k]`). Add `sub(on, ...rows)` → `el('div', { class: 'pref-sub' }, rows)` or `false`. `switchInput(label, path)` returns the bare switch (sets the pref, then `redraw()`); `toggle()` wraps it in a row. `choice(label, value, options, pick)` returns a `.seg` group whose buttons call `pick(value)` then `redraw()`; `segmented()` wraps `choice` bound to a pref path. `colorInput(label, path)` and `textField(label, path, placeholder, opts)` return bare inputs; `textInput()` wraps `textField` in a row.

- [ ] **Step 2: Sections.**
  - `page()`: Colours (Theme, Accent); Background (Style: ASCII · Plain · Image via `pickBackground`; with ASCII the motion switch; with Image the Upload/Remove row, the link row, Blur, Dim); Search bar when `prefs.search` exists (switch, then Google and Claude under it); Top bar (Sidebar button).
  - `pickBackground(value)`: `wantImage = value === 'image'`; set `showImage = wantImage`; for ASCII/Plain also set `pattern`. Upload and Apply link set `showImage = true`. Remove clears the file and link and sets `wantImage = true`.
  - `tiles()`: Layout (Columns, Width, Spacing, Center vertically, Compact layout); Look (Style Flat · Cards, under Cards: Corner radius and one Colours row with White/Dark presets and the two pickers; Icons; Show titles); Behaviour (Open tiles in a new tab, Show + button).
  - `widgets()`: Clock side; "<side> column" heading with Clock (under it: Style when `clock.face` exists, 24-hour clock, Greeting row with the name box while Greeting is on), Tasks, Notes, Claude when `widgets.claude` exists; "<other side> column" heading with Markets (Coins and USD/ILS under it only when `markets.items` doesn't exist) and GitHub (Username, Access token under it).
  - `backup()`: unchanged; the importer is loaded with `import()` inside `importFile`.
  - Sections list: `page` (palette), `tiles` (grid), `widgets` (layout), `backup` (database); start on `page`.

- [ ] **Step 3: `show(id)`** filters out `false` rows, keeps the scroll position only when redrawing the same section, and puts focus back on the control with the same `data-key` (the pressed button for a choice) or on the current nav button.

- [ ] **Step 4: CSS.** `.pref-sub` indents its rows behind a 2px rail; the parent row loses its bottom border; rows inside are tighter.

```css
.pref-sub {
  padding: 0 0 8px 18px;
  border-bottom: 1px solid var(--border);
  /* a rail down the left ties these options to the switch or choice above */
  background: linear-gradient(var(--border), var(--border)) 3px 0 / 2px calc(100% - 14px) no-repeat;
}
.pref-row:has(+ .pref-sub) { border-bottom: 0; }
.pref-sub:has(+ .pref-section-title), .pref-sub:last-child { border-bottom: 0; }
.pref-sub .pref-row { padding: 8px 0; border-bottom: 0; }
```

- [ ] **Step 5: Check** `npm test` still passes, then load the static preview and walk each section (Task 4 covers the full visual pass).

- [ ] **Step 6: Commit**

```bash
git add js/prefs.js css/newtab.css
git commit -m "feat: Preferences regrouped into Page, Tiles, Widgets and Backup; options show only when they apply"
```

### Task 3: Movable panel

**Files:**
- Modify: `js/prefs.js` (header, drag, double-click, resize, outside-click guard)
- Modify: `js/ui.js` (add a `grip` icon)
- Modify: `css/newtab.css` (`.prefs-head`, `.prefs-grab`, `.prefs-dlg::backdrop`)

- [ ] **Step 1:** Header = `.prefs-grab` (grip icon + "Preferences", tooltip "Drag to move · double-click to centre") and the close button.
- [ ] **Step 2:** `place(x, y)` clamps the offset so ≥120px of the panel and the whole header stay in the window, sets `dialog.style.translate`. Pointer drag on the header (not on buttons) with pointer capture; `dblclick` → `place(0, 0)`; `resize` re-fits while open; `open()` re-fits after `showModal()`. Offset saved to `localStorage['newtab:prefs-offset']` in try/catch.
- [ ] **Step 3:** Close on outside click only when the press also started outside (a slider dragged past the edge no longer closes the panel).
- [ ] **Step 4:** CSS: backdrop `background: none; backdrop-filter: none`; header `cursor: grab` (`grabbing` while dragging), `user-select: none`, `touch-action: none`.
- [ ] **Step 5: Commit**

```bash
git add js/prefs.js js/ui.js css/newtab.css
git commit -m "feat: drag Preferences by its header; the page behind stays undimmed"
```

### Task 4: Visual check

- [ ] Serve the worktree (`python -m http.server 5518 --bind 127.0.0.1`), drive headless Chrome over the DevTools protocol with a Node script kept in the scratchpad: open Preferences, screenshot each section in dark and light, toggle Clock / GitHub / Cards / Background Image to see their rows appear, drag the header and confirm the offset and that the page is visible, double-click to recentre, reload and confirm the position is remembered.
- [ ] Fix anything found, re-run `npm test`, commit.
