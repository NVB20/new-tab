# Setup tab and first-run replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preferences gets a Setup tab with Run setup again and Replay the first run (setup staged like a new install, nothing reset), and its search finds them as onboarding, tour, tutorial.

**Architecture:** The replay is today's `start({ again: true })` with `staged` on, so `reveal()` hides each frame until its step. Preferences moves its Setup group into a section of its own and passes `{ replay: true }` through `runSetup`. The panel search also reads `data-search` words.

**Tech Stack:** Plain ES modules, a Chrome MV3 extension; `node --test` for units; Playwright's Chromium driven over CDP (Node 22's built-in WebSocket) for the page.

Spec: `docs/superpowers/specs/2026-10-17-setup-replay-design.md`.

## Global Constraints

- Row labels: **Run setup again** (button *Run setup*), **Replay the first run** (button *Replay*).
- Tab: id `setup`, label `Setup`, icon `play`, after Backup.
- Search words on both buttons: `onboarding tour tutorial walkthrough welcome intro`.
- Closing notes say "Preferences → Setup", not "Preferences → Page".
- A replay resets only `onboarding`; tiles, widgets and settings stay.

---

### Task 1: The page check (fails first)

**Files:**
- Create: `<scratchpad>/check-setup.mjs` (not in the repo; the CDP harness from earlier sessions)

**Interfaces:**
- Produces: `node check-setup.mjs <cdp-port> <out-dir>` with `EXT=<worktree>`; prints `ok`/`FAIL` per check, exits 1 on any FAIL.

- [ ] **Step 1: Write the check.** Fresh profile, extension loaded, `chrome://newtab/`:
  1. Setup opens on its own; click `.ob-skip`; `body.ob-setup` goes.
  2. Record `.widget-frame` count and `tiles.length`.
  3. Open ☰: the nav has a `Setup` button; the Page section has no "Run setup again".
  4. Setup tab: rows "Run setup again" and "Replay the first run".
  5. Search `onboarding`, `tour`, `tutorial`: both rows listed.
  6. Replay: the dialog closes; every frame gets `ob-hidden`; the card shows; Begin → Name: only the clock is shown; Next → Look: still only the clock; Next → Sites: clock and tiles; Next → Widgets: all shown. Skip the rest: no frame hidden, no `ob-setup`, same frame and tile counts.
  7. Run setup: no frame ever gets `ob-hidden` at the opening; Skip.
  8. No page exceptions.
- [ ] **Step 2: Run it on the unchanged code.** Expected: FAIL at 3 (no Setup tab).

### Task 2: The replay and the Setup tab

**Files:**
- Modify: `js/onboarding.js` (header comment; `start()`; closing notes)
- Modify: `js/main.js` (`runSetup` passes options)
- Modify: `js/prefs.js` (Setup section; Page loses its group; search reads `data-search`)

- [ ] **Step 1: onboarding.js `start()`**

```js
    // again: from Preferences, over the page as it is (nothing hidden); replay stages it as a
    // first run shows it. Otherwise a first run, resumed at the step it stopped at; only the very
    // start plays the opening.
    async start({ again = false, replay = false } = {}) {
      …
      staged = !again || replay;
```

Header comment line 5: `Preferences → Setup runs it again, over the page as it is or as a first run shows it.`
Closing notes: `Preferences → Page` → `Preferences → Setup` (three strings).

- [ ] **Step 2: main.js**

```js
  runSetup: (opts = {}) => setup().then(s => s.start({ again: true, ...opts })),
```

- [ ] **Step 3: prefs.js.** Remove the two `runSetup &&` lines from `page()`. Add after `backup()`:

```js
  function setupSection() {
    const words = 'onboarding tour tutorial walkthrough welcome intro';
    const run = (text, opts) => el('button', { type: 'button', class: 'btn', 'data-search': words, onclick: () => { dialog.close(); runSetup(opts); } }, text);
    return [
      title('Setup'),
      el('p', { class: 'pref-hint pref-intro', text: 'The setup a new install opens with: your name, the look, sites, widgets and the moves worth knowing. What you pick changes this page.' }),
      row('Run setup again', run('Run setup'), 'Over the page as it is'),
      row('Replay the first run', run('Replay', { replay: true }), 'As a new install sees it: the page clears, then comes back step by step. Nothing is reset'),
    ];
  }
```

Sections: `runSetup && { id: 'setup', label: 'Setup', icon: 'play', build: setupSection }` after Backup, then `.filter(Boolean)`.
Search `matches()`: also read `[...node.querySelectorAll('[data-search]')].map(n => n.dataset.search)`.
Comment above `setupPrefs`: runSetup(opts) runs setup (`{ replay: true }`: as a first run).

- [ ] **Step 4: Run the check.** Expected: all ok.
- [ ] **Step 5: `npm test`.** Expected: all pass.

### Task 3: Docs, commit, land

**Files:**
- Modify: `docs/onboarding.md` (Who sees it rows; Adding a feature step 5)
- Modify: `README.md` (First run: the Run setup again line)

- [ ] **Step 1: docs/onboarding.md.** "Anyone, any time" row → Preferences → Setup → **Run setup again**, over the page as it is; a new row: Preferences → Setup → **Replay the first run**, staged like a new install, nothing reset. Step 5: "or with Preferences → Setup → Replay the first run".
- [ ] **Step 2: README.md** line 138: `- Preferences → Setup has **Run setup again** (over the page as it is) and **Replay the first run** (as a new install sees it; nothing is reset).`
- [ ] **Step 3: Commit** `feat: Preferences → Setup: …` (touches onboarding.js and docs/onboarding.md, so the commit check passes).
- [ ] **Step 4: Land.** `git merge main` in the worktree, re-run the check and `npm test`, ExitWorktree(keep), `git merge --ff-only setup-replay` from main's checkout, tell the peers.
