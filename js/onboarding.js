// First-run setup: a card over the real page that builds the page as you answer. Every answer goes
// straight into the store, so the page behind the card changes as you go, and skipping keeps what
// was chosen. On a first run the page starts nearly empty: the clock arrives at Name, the tiles at
// Sites, everything else at Widgets. Loaded by main.js only while setup isn't done, or when
// Preferences → Setup runs it again, over the page as it is or as a first run shows it.
//
// Moves are noticed by watching the page (Jump's dialog opening, the search bar getting the cursor,
// Layout mode starting), so those modules don't need to know about setup.

import { el, icon, tileIcon } from './ui.js';
import { setTheme } from './store.js';
import { TYPES, firstFree, addCopy, removeCopy, placeDefaults, atDefaultPlaces, activeLayout, copyById, copiesOf } from './layout.js';
import { addTile, isFolder } from './actions.js';
import { hasChrome, historySearch, bookmarksTree, requestSiteAccess } from './chrome-api.js';
import { rankSites, barItems } from './suggest.js';
import { NBA_TEAMS, NFL_TEAMS, teamOf } from './sports.js';
import { siteUrl, sitePattern } from './website.js';
import { searchUrl, parsePlaces, placeLabel } from './weather.js';
import { fetchJson } from './net.js';
import { hostOf, normalizeUrl, uid } from './util.js';
import { addSavedIcons } from './icon-cache.js';
import { shrinkImage } from './prefs.js';
import { spellWord, rippleFrom, motionAllowed } from './onboarding-fx.js';
import { ABOUT } from './widget-about.js';

const STEPS = ['intro', 'name', 'look', 'sites', 'widgets', 'arrange', 'connect', 'moves', 'done'];
const LAYOUT_MIN_WIDTH = 900;   // Layout mode's own minimum (edit-mode.js); the card is a sheet below it
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
const BACKUP_FORMAT = 'new-tab-backup';
const HISTORY_DAYS = 90;
const PRETICK = 6;   // most visited sites ticked to start with, when the group has no tiles yet

const ACCENTS = ['#d97757', '#2563eb', '#10a37f', '#8b5cf6', '#e5484d', '#f5a524'];
const THEMES = [['auto', 'Auto', 'auto'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['blue', 'Blue', 'drop'], ['github', 'GitHub', 'branch']];
const BACKGROUNDS = [['ascii', 'ASCII'], ['none', 'Plain'], ['image', 'Image']];
const NEAR = ['clock', 'weather', 'countdown', 'tasks', 'notes', 'claude', 'marvel'];   // the clock column (layout.js)
// The widgets setup offers, in its order, with their taglines. Keep it a literal: the commit check
// (.claude/hooks/onboarding-check.mjs) reads these keys as the types setup offers.
const WIDGETS = {
  clock: ABOUT.clock.tagline, weather: ABOUT.weather.tagline, search: ABOUT.search.tagline, tasks: ABOUT.tasks.tagline,
  notes: ABOUT.notes.tagline, countdown: ABOUT.countdown.tagline, markets: ABOUT.markets.tagline, github: ABOUT.github.tagline,
  sports: ABOUT.sports.tagline, website: ABOUT.website.tagline, claude: ABOUT.claude.tagline,
  marvel: ABOUT.marvel.tagline,
};
const CONNECTS = ['search', 'weather', 'github', 'markets', 'sports', 'website'];
const ENGINES = [['google', 'Google'], ['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['gemini', 'Gemini']];
const MARKETS = [
  ['Coins', ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']], ['US indexes', ['SPY', 'QQQ', 'DJIA']],
  ['Commodities', ['GOLD', 'SILVER', 'OIL', 'CORN']], ['Currencies', ['USD/ILS', 'EUR/ILS', 'EUR/USD']],
];
const MESSI = [['soccer:20232', 'Inter Miami'], ['soccer:202', 'Argentina'], ['f1', 'F1']];
const MOVES = [
  { key: 'jump', keys: ['Ctrl', 'K'], title: 'Jump', text: 'Find any tile, open tab, bookmark or page you’ve visited.' },
  { key: 'search', keys: ['Ctrl', 'Space'], title: 'Search bar', text: 'Type a search, or a message for Claude, from anywhere on the page.' },
  { key: 'layout', keys: ['Right-click'], title: 'Layout mode', text: 'Right-click empty space to move, resize, add or remove widgets.' },
];
// Outside the extension (the Live Server preview) there's no history to read; these stand in.
const SAMPLES = [
  ['https://mail.google.com/mail/u/0/', 'Inbox - Gmail', 412], ['https://github.com/', 'GitHub', 377],
  ['https://www.youtube.com/', 'YouTube', 305], ['https://claude.ai/new', 'Claude', 288],
  ['https://calendar.google.com/', 'Google Calendar', 176], ['https://web.whatsapp.com/', 'WhatsApp', 151],
  ['https://www.linkedin.com/feed/', 'Feed | LinkedIn', 97], ['https://www.notion.so/', 'Notion', 88],
].map(([url, title, visitCount]) => ({ url, title, visitCount }));

// ctx: { openJump(), enterLayout(), exitLayout() }. Returns { start({ again }) }.
export function setupOnboarding(store, canvas, ctx) {
  const prefs = () => store.get().prefs;
  const layout = () => activeLayout(store.get());   // setup sets up the page you're on
  const copyOf = type => copiesOf(layout()).find(c => c.type === type) ?? null;
  const has = type => !!copyOf(type);
  const layoutOn = () => document.body.classList.contains('layout-editing');
  const narrow = () => innerWidth < LAYOUT_MIN_WIDTH;
  const setPrefs = fn => store.update(s => fn(s.prefs), ['prefs']);
  const setCopy = (id, patch) => store.update(s => {
    const copy = copyById(s, id);
    if (copy) Object.assign(copy.settings, patch);
  }, ['prefs']);
  const groupTiles = () => {
    const s = store.get();
    return s.tiles.filter(t => t.groupId === s.activeGroupId && !t.folderId);
  };
  // The letters are behind the page and allowed to move: the opening and the ripple play on them.
  const lettersBehind = () => {
    const bg = prefs().background;
    return bg.pattern === 'ascii' && !(bg.showImage && (bg.useUpload || bg.url)) && bg.motion !== false && motionAllowed();
  };

  let open = false;
  let staged = false;      // a first run: the page appears step by step
  let step = 'intro';
  let leaving = null;      // where Arrange goes once Layout mode has closed
  let folded = false;      // out of the way while Layout mode runs outside Arrange
  let sources = null;      // the Sites lists, read once per run
  let source = null;       // the Sites tab shown
  let wantImage = false;   // Image picked in Look, no picture yet
  let layoutWas = false;
  const tried = new Set(); // the Moves done

  // ---- the card ----

  const prog = el('div', { class: 'ob-prog' });
  const count = el('span', { class: 'ob-count' });
  const head = el('div', { class: 'ob-head' }, prog, count);
  const body = el('div', { class: 'ob-body' });
  const skip = el('button', { type: 'button', class: 'ob-skip', onclick: () => finish({ skipped: true }) });
  const back = el('button', { type: 'button', class: 'btn', text: 'Back', onclick: () => go(neighbour(-1)) });
  const next = el('button', { type: 'button', class: 'btn btn-primary', onclick: () => go(neighbour(1)) });
  const card = el('section', { class: 'ob-card', role: 'dialog', 'aria-label': 'Set up your new tab', hidden: true },
    head, body, el('div', { class: 'ob-foot' }, skip, el('span', { class: 'ob-gap' }), back, next));
  const resume = el('button', { type: 'button', class: 'ob-resume', hidden: true, onclick: unfold }, icon('chevron', 16), 'Resume setup');
  const toast = el('div', { class: 'ob-toast', role: 'status', hidden: true });

  // The steps this page has: Name needs a clock, Arrange the room Layout mode needs, Connect a
  // widget that asks for something.
  function steps() {
    return STEPS.filter(s => (s === 'name' ? has('clock') : s === 'arrange' ? !narrow() : s === 'connect' ? CONNECTS.some(has) : true));
  }
  function neighbour(dir) {
    const at = STEPS.indexOf(step);
    const list = steps();
    return dir > 0 ? list.find(s => STEPS.indexOf(s) > at) ?? 'done' : list.findLast(s => STEPS.indexOf(s) < at) ?? 'intro';
  }

  // Away from what the step changes: opposite the clock column while the page fills in, beside it
  // for Connect and Moves (the far column is what they fill), above the tray in Layout mode.
  function placement() {
    if (narrow()) return 'sheet';
    if (step === 'intro') return 'center';
    if (step === 'arrange') return 'dock';
    const near = layout().widgets.find(c => NEAR.includes(c.type));
    const nearSide = near && near.x >= 6 ? 'right' : 'left';
    const farSide = nearSide === 'left' ? 'right' : 'left';
    // Weather fills in under the clock: with nothing to fill in the far column, the card goes there.
    const weatherNear = layout().widgets.some(c => c.type === 'weather' && (c.x >= 6) === (nearSide === 'right'));
    if (step === 'connect' && weatherNear && !['github', 'markets', 'sports', 'website'].some(has)) return farSide;
    if (step === 'connect' || step === 'moves') return nearSide;
    return farSide;
  }

  function go(to) {
    if (to === 'done') {
      finish();
      return;
    }
    // Arrange runs in Layout mode: leaving it closes Layout mode first, and the close comes back here.
    if (step === 'arrange' && to !== 'arrange' && layoutOn()) {
      leaving = to;
      ctx.exitLayout();
      return;
    }
    step = to;
    store.update(s => { s.onboarding.step = to; }, ['onboarding']);
    render();
    if (to === 'arrange' && !layoutOn()) ctx.enterLayout();
  }

  function render() {
    const mids = steps().slice(1, -1);
    const i = mids.indexOf(step);
    card.dataset.pos = placement();
    card.dataset.step = step;
    head.hidden = i < 0;
    prog.replaceChildren(...mids.map((_, j) => el('i', { class: j <= i ? 'on' : '' })));
    count.textContent = i >= 0 ? `Step ${i + 1} of ${mids.length}` : '';
    body.replaceChildren(...VIEWS[step]());
    body.classList.remove('ob-swap');
    void body.offsetWidth;   // restarts the step's entrance
    body.classList.add('ob-swap');
    body.scrollTop = 0;
    back.hidden = step === 'intro';
    skip.textContent = step === 'intro' ? 'Skip, keep the defaults' : 'Skip the rest';
    next.textContent = step === 'intro' ? 'Begin' : i === mids.length - 1 ? 'Finish' : step === 'arrange' ? 'Done arranging' : 'Next';
    watchMoves(step === 'moves');
    reveal();
    if (step !== 'intro' && !card.hidden) (body.querySelector('[data-autofocus]') ?? body.querySelector('.ob-title'))?.focus({ preventScroll: true });
  }
  const refresh = () => body.replaceChildren(...VIEWS[step]());

  // On a first run each widget shows from the step that brings it; hidden ones take no clicks or Tab.
  function reveal() {
    const at = STEPS.indexOf(step);
    for (const frame of canvas.frames().values()) {
      const type = frame.dataset.type;
      const shown = !staged || at >= STEPS.indexOf('widgets')
        || (type === 'clock' && at >= STEPS.indexOf('name'))
        || (type === 'tiles' && at >= STEPS.indexOf('sites'));
      frame.classList.toggle('ob-hidden', !shown);
      frame.inert = !shown;
    }
    document.body.classList.remove('ob-fresh');
  }
  canvas.onFrame(() => { if (open) reveal(); });

  // ---- pieces of a step ----

  const title = text => el('h2', { class: 'ob-title', tabindex: '-1', text });
  const para = text => el('p', { class: 'ob-text', text });
  const label = text => el('div', { class: 'ob-label', text });
  const hint = (...children) => el('p', { class: 'ob-hint' }, ...children);
  const part = (iconName, name, ...children) => el('section', { class: 'ob-part' }, el('h3', {}, icon(iconName, 16), name), ...children);

  // One of several, shown with aria-pressed.
  function choices(name, current, options, pick, className = 'seg') {
    return el('div', { class: className, role: 'group', 'aria-label': name }, options.map(([value, text, iconName]) => el('button', {
      type: 'button', 'aria-pressed': String(value === current),
      onclick: e => {
        for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        pick(value);
      },
    }, iconName && icon(iconName, 16), el('span', { text }))));
  }

  // On or off; toggle() makes the change and returns the new state.
  function chip(text, on, toggle) {
    const b = el('button', { type: 'button', class: 'ob-chip', 'aria-pressed': String(on), onclick: () => b.setAttribute('aria-pressed', String(toggle())) }, text);
    return b;
  }

  // A ticked list with Tick all / Clear. Each item: { title, sub, meta, url | folder, on(), set(on) }.
  function pickList(caption, items, onChange) {
    let all = null;
    const update = () => {
      all.textContent = rows.every(r => r.on()) ? 'Clear' : 'Tick all';
      onChange();
    };
    const rows = items.map(item => {
      const box = el('input', { type: 'checkbox', checked: item.on(), onchange: () => { item.set(box.checked); update(); } });
      const row = el('label', { class: 'ob-pick' }, box,
        item.folder ? el('span', { class: 'ob-pick-icon' }, icon('folder', 18)) : tileIcon(item.url, '', item.title, { mini: true }),
        el('span', { class: 'ob-pick-name' }, el('b', { text: item.title }), el('small', { text: item.sub })),
        el('span', { class: 'ob-pick-meta', text: item.meta ?? '' }));
      row.on = () => box.checked;
      row.turn = value => {
        if (box.checked === value) return;
        box.checked = value;
        item.set(value);
      };
      return row;
    });
    all = el('button', { type: 'button', class: 'ob-link', onclick: () => {
      const value = !rows.every(r => r.on());
      for (const r of rows) r.turn(value);
      update();
    } });
    update();
    return [el('div', { class: 'ob-pane-head' }, el('span', { text: caption }), all), el('div', { class: 'ob-picks' }, rows)];
  }

  // ---- the steps ----

  const VIEWS = {
    intro() {
      const n = steps().length - 2;
      return [
        title('Let’s make this tab yours'),
        para(`${WORDS[n] ?? n} short steps, a minute or two. What you pick shows up on the page behind this card as you go, and all of it can be changed later in Preferences.`),
      ];
    },

    name() {
      const clock = copyOf('clock');
      const input = el('input', {
        type: 'text', class: 'pref-input', maxLength: 40, autocomplete: 'off', spellcheck: false, dir: 'auto',
        placeholder: 'First name', value: clock.settings.name, 'aria-label': 'Your name', dataset: { autofocus: '' },
        oninput: () => setCopy(clock.id, { name: input.value }),
        onkeydown: e => { if (e.key === 'Enter') go(neighbour(1)); },
      });
      return [
        title('What should the clock call you?'),
        label('Your name'), input,
        label('Time'),
        choices('Clock format', clock.settings.hour24 ? '24' : '12', [['24', '24-hour'], ['12', '12-hour']], v => setCopy(clock.id, { hour24: v === '24' })),
        hint('It shows under the time, after the greeting. Leave it empty for the greeting alone.'),
      ];
    },

    look() {
      const accents = el('div', { class: 'swatches' });
      const drawAccents = () => accents.replaceChildren(...ACCENTS.map(c => el('button', {
        type: 'button', class: 'swatch', title: c, 'aria-label': `Accent ${c}`, 'aria-pressed': String(prefs().accent === c), style: `background:${c}`,
        onclick: () => {
          setPrefs(p => { p.accent = c; });
          drawAccents();
        },
      })));
      drawAccents();
      const hasImage = () => {
        const bg = prefs().background;
        return bg.showImage && (bg.useUpload || !!bg.url);
      };
      const shown = () => (hasImage() || wantImage ? 'image' : prefs().background.pattern);
      const image = el('div', { class: 'ob-image' });
      const drawImage = () => {
        image.hidden = shown() !== 'image';
        image.replaceChildren(...imageRows());
      };
      drawImage();
      return [
        title('Pick a look'),
        label('Theme'),
        // A theme brings its own accent, unless a different one was picked by hand.
        choices('Theme', prefs().theme, THEMES, v => {
          store.update(s => setTheme(s.prefs, v), ['prefs']);
          drawAccents();
        }, 'ob-themes'),
        label('Accent'), accents,
        label('Background'),
        choices('Background', shown(), BACKGROUNDS, v => {
          wantImage = v === 'image';
          setPrefs(p => {
            if (v !== 'image') Object.assign(p.background, { showImage: false, pattern: v });
            else if (p.background.useUpload || p.background.url) p.background.showImage = true;
          });
          drawImage();
        }),
        image,
      ];
    },

    sites() {
      const tabs = el('div', { class: 'ob-tabs', role: 'tablist', 'aria-label': 'Where tiles come from' });
      const pane = el('div', { class: 'ob-pane' });
      const tally = hint();
      const recount = () => { tally.textContent = tallyText(); };
      const draw = () => {
        const list = [
          sources.visited.length && ['visited', 'Most visited'],
          sources.bar.length && ['bar', 'Bookmarks bar'],
          ['file', 'From a file'],
        ].filter(Boolean);
        if (!list.some(([v]) => v === source)) source = list[0][0];
        tabs.replaceChildren(...list.map(([v, text]) => el('button', {
          type: 'button', role: 'tab', 'aria-selected': String(v === source),
          onclick: () => {
            source = v;
            draw();
          },
        }, text)));
        pane.replaceChildren(...PANES[source](recount));
        recount();
      };
      if (sources) {
        draw();
      } else {
        pane.append(hint('Reading your history and bookmarks…'));
        loadSources().then(() => { if (open && step === 'sites' && pane.isConnected) draw(); });
      }
      return [title('Start with the sites you already use'), tabs, pane, tally];
    },

    widgets() {
      return [
        title('What else belongs on the page?'),
        el('div', { class: 'ob-widgets' },
          el('button', { type: 'button', class: 'ob-widget', disabled: true, 'aria-pressed': 'true' }, icon('grid', 18), el('b', { text: 'Tiles' }), el('span', { text: 'Always here' })),
          Object.entries(WIDGETS).map(([type, note]) => {
            const b = el('button', {
              type: 'button', class: 'ob-widget', 'aria-pressed': String(has(type)),
              onclick: () => {
                toggleWidget(type);
                b.setAttribute('aria-pressed', String(has(type)));
              },
            }, icon(TYPES[type].icon, 18), el('b', { text: TYPES[type].label }), el('span', { text: note }));
            return b;
          })),
        hint('Layout mode moves and resizes all of it later.'),
      ];
    },

    arrange() {
      const full = !Object.values(TYPES).some(t => firstFree(layout(), ...t.min));
      return [
        title('Arrange it your way'),
        el('ul', { class: 'ob-tips' }, [['Drag', ' to move'], ['Edges and corners', ' resize'], ['×', ' removes'], ['The tray', ' adds; hover to preview'], ['Onto another’s middle', ' stacks them']]
          .map(([b, text]) => el('li', {}, el('b', { text: b }), text))),
        hint(full
          ? 'Every cell is taken on a new page, so adding from the tray shrinks the biggest widget to make room. Drop a widget near a neighbour’s edge to swap them.'
          : 'Drop a widget near a neighbour’s edge to swap them.'),
      ];
    },

    connect() {
      const parts = [];
      if (has('search')) {
        parts.push(part('search', 'Search bar',
          el('div', { class: 'ob-chips' }, ENGINES.map(([v, name]) => chip(name, prefs().search[v], () => toggleEngine(v)))),
          hint('Claude, ChatGPT and Gemini open a new chat and send what you typed.')));
      }
      if (has('weather')) parts.push(part('cloud-sun', 'Weather', weatherField()));
      if (has('github')) {
        parts.push(part('branch', 'GitHub', githubField(),
          hint('Public activity shows straight away. Private repos need a token, which stays in Preferences → GitHub.')));
      }
      if (has('markets')) {
        parts.push(part('trend', 'Markets',
          MARKETS.map(([group, ids]) => [label(group), el('div', { class: 'ob-chips' }, ids.map(id => chip(id, marketItems().includes(id), () => toggleMarket(id))))]),
          hint('Any Bybit coin, more commodities and the order, from ✎ on the widget.')));
      }
      if (has('sports')) parts.push(part('trophy', 'Sports', sportsPicker()));
      if (has('website')) parts.push(part('globe', 'Website', websiteField()));
      return [title('Fill in what your widgets need'), ...parts];
    },

    moves() {
      const items = MOVES.filter(m => m.key !== 'search' || has('search'));
      const done = items.filter(m => tried.has(m.key)).length;
      return [
        title(`${WORDS[items.length]} moves worth knowing`),
        para('Try each one on the page. They work any time.'),
        el('ul', { class: 'ob-moves' }, items.map(m => el('li', { class: tried.has(m.key) ? 'ob-move done' : 'ob-move' },
          el('span', { class: 'ob-keys' }, m.keys.map(k => el('kbd', { text: k }))),
          el('span', { class: 'ob-move-text' }, el('b', { text: m.title }), m.text),
          el('button', { type: 'button', class: 'btn ob-show', onclick: () => showMove(m.key) }, 'Show me'),
          el('span', { class: 'ob-done', title: 'Done' }, icon('check', 18))))),
        hint(done === items.length ? 'All tried. That’s everything.' : `${done} of ${items.length} tried`),
      ];
    },
  };

  // ---- Look ----

  function imageRows() {
    const status = hint();
    const file = el('input', {
      type: 'file', accept: 'image/*', hidden: true,
      onchange: async () => {
        if (!file.files[0]) return;
        status.textContent = 'Loading the picture…';
        try {
          await store.setWallpaper(await shrinkImage(file.files[0]));
          setPrefs(p => Object.assign(p.background, { useUpload: true, showImage: true }));
          status.textContent = 'Your picture is behind the page.';
        } catch (err) {
          status.textContent = `Couldn’t use that image: ${err.message}`;
        }
      },
    });
    const link = el('input', { type: 'text', class: 'pref-input', placeholder: 'https://… image link', spellcheck: false, autocomplete: 'off', 'aria-label': 'Image link' });
    const apply = () => {
      const href = normalizeUrl(link.value);
      if (!href) {
        status.textContent = 'That doesn’t look like a link.';
        return;
      }
      setPrefs(p => Object.assign(p.background, { url: href, useUpload: false, showImage: true }));
      status.textContent = 'The picture from that link is behind the page.';
    };
    link.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
    return [
      el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn', onclick: () => file.click() }, icon('upload', 16), 'Upload a picture'), file),
      el('div', { class: 'ob-row' }, link, el('button', { type: 'button', class: 'btn', onclick: apply }, 'Apply')),
      status,
    ];
  }

  // ---- Sites ----

  async function loadSources() {
    const since = Date.now() - HISTORY_DAYS * 864e5;
    const [history, tree] = hasChrome
      ? await Promise.all([historySearch('', 5000, since).catch(() => []), bookmarksTree().catch(() => [])])
      : [SAMPLES, []];
    const exclude = store.get().tiles.map(t => t.url).filter(Boolean);
    sources = { visited: rankSites(history, { exclude, limit: 12 }), bar: barItems(tree), sample: !hasChrome };
    // An empty group starts with the top sites ticked, so the page fills in as the list appears.
    if (!groupTiles().length && sources.visited.length) {
      store.update(s => {
        for (const site of sources.visited.slice(0, PRETICK)) addTile(s, { title: site.title, url: site.url });
      }, ['tiles']);
    }
  }

  const PANES = {
    visited(onChange) {
      const caption = sources.sample ? 'Samples. In the extension, your own most visited.' : `Your most visited sites, last ${HISTORY_DAYS} days`;
      return pickList(caption, sources.visited.map(site => ({
        title: site.title, sub: site.host, url: site.url, meta: `${site.visits} visit${site.visits === 1 ? '' : 's'}`,
        on: () => groupTiles().some(t => !isFolder(t) && hostOf(t.url) === site.host),
        set: on => store.update(s => {
          if (on) addTile(s, { title: site.title, url: site.url });
          else s.tiles = s.tiles.filter(t => !(t.groupId === s.activeGroupId && !t.folderId && !isFolder(t) && hostOf(t.url) === site.host));
        }, ['tiles']),
      })), onChange);
    },

    bar(onChange) {
      return pickList('Your bookmarks bar. Its folders stay folders.', sources.bar.map(item => (item.links ? {
        title: item.title, sub: `${item.links.length} inside`, folder: true,
        on: () => groupTiles().some(t => isFolder(t) && t.title === item.title),
        set: on => store.update(s => (on ? addFolder(s, item) : removeFolder(s, item.title)), ['tiles']),
      } : {
        title: item.title, sub: hostOf(item.url), url: item.url,
        on: () => groupTiles().some(t => t.url === item.url),
        set: on => store.update(s => {
          if (on) addTile(s, { title: item.title, url: item.url });
          else s.tiles = s.tiles.filter(t => !(t.groupId === s.activeGroupId && !t.folderId && t.url === item.url));
        }, ['tiles']),
      })), onChange);
    },

    file() {
      const status = hint();
      const input = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: () => importFile(input.files[0], status) });
      const drop = el('div', { class: 'ob-drop' },
        icon('upload', 22),
        el('b', { text: 'A Speed Dial 2 export or a New Tab backup' }),
        el('span', { text: 'Speed Dial 2 brings its groups, tiles and logos, and setup carries on. A backup restores a whole page and ends setup.' }),
        el('button', { type: 'button', class: 'btn', onclick: () => input.click() }, 'Choose a file'),
        input);
      drop.addEventListener('dragover', e => {
        e.preventDefault();
        drop.classList.add('over');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('over');
        importFile(e.dataTransfer.files[0], status);
      });
      return [drop, status];
    },
  };

  function addFolder(s, item) {
    const groupId = s.activeGroupId;
    const folder = { id: uid(), groupId, kind: 'folder', title: item.title, url: '', icon: '' };
    s.tiles.push(folder, ...item.links.map(l => ({ id: uid(), groupId, title: l.title, url: l.url, icon: '', folderId: folder.id })));
  }

  function removeFolder(s, title) {
    const folder = s.tiles.find(t => t.groupId === s.activeGroupId && isFolder(t) && t.title === title);
    if (folder) s.tiles = s.tiles.filter(t => t.id !== folder.id && t.folderId !== folder.id);
  }

  function tallyText() {
    const s = store.get();
    const n = groupTiles().length;
    const group = s.groups.find(g => g.id === s.activeGroupId)?.title ?? 'this group';
    return n ? `${n} tile${n === 1 ? '' : 's'} on ${group}.` : 'No tiles yet. Starting empty is fine: the + adds them one at a time.';
  }

  async function importFile(file, status) {
    if (!file) return;
    let json;
    try {
      json = JSON.parse(await file.text());
    } catch {
      status.textContent = 'That file isn’t valid JSON.';
      return;
    }
    if (json?.format === BACKUP_FORMAT && json.state) {
      const n = Array.isArray(json.state.tiles) ? json.state.tiles.length : 0;
      status.replaceChildren(`Restore this backup (${n} tiles)? It replaces everything on this page. `,
        el('button', { type: 'button', class: 'ob-link', onclick: () => restore(json) }, 'Restore'));
      return;
    }
    const { fromSpeedDial2 } = await import('./importer.js');
    let imported;
    try {
      imported = fromSpeedDial2(json);
    } catch (err) {
      status.textContent = `${err.message} Use a Speed Dial 2 export or a backup from this page.`;
      return;
    }
    // As Preferences imports it: tiles, groups and settings come over; the layout, the GitHub
    // token, tasks and notes stay. Setup carries on at Widgets.
    const apply = () => {
      const { tasks, taskHistory, taskStats, notes, marvel, countdowns, prefs: { layout: kept, github } } = structuredClone(store.get());
      const block = copiesOf(kept).find(c => c.type === 'tiles' && c.settings.group === null);
      if (block) block.settings.columns = imported.prefs.columns;
      store.replace({ ...imported, tasks, taskHistory, taskStats, notes, marvel, countdowns, onboarding: { done: false, step: 'widgets' }, prefs: { ...imported.prefs, layout: kept, github } });
      sources = null;
      go('widgets');
    };
    const n = store.get().tiles.length;
    if (!n) {
      apply();
      return;
    }
    status.replaceChildren(`Import ${imported.tiles.length} tiles in ${imported.groups.length} group${imported.groups.length === 1 ? '' : 's'}? It replaces the ${n} tile${n === 1 ? '' : 's'} and groups here. `,
      el('button', { type: 'button', class: 'ob-link', onclick: apply }, 'Import'));
  }

  async function restore(json) {
    store.replace({ ...json.state, onboarding: { done: true, step: 'done' } });
    await store.setWallpaper(typeof json.wallpaper === 'string' ? json.wallpaper : '');
    await addSavedIcons(json.icons);
    finish({ restored: true });
  }

  // ---- Widgets ----

  // A page still in its default places flows again around the change; one arranged by hand gets a
  // copy where it fits, or loses the type's copies, and nothing else moves.
  function toggleWidget(type) {
    let noRoom = false;
    store.update(s => {
      const l = activeLayout(s);
      const on = copiesOf(l).some(c => c.type === type);
      if (atDefaultPlaces(l)) {
        const types = [...new Set(l.widgets.map(c => c.type))].filter(t => t !== type);
        // A spare type (layout.js) is left out when both columns are full.
        const placed = placeDefaults(l, on ? types : [...types, type]);
        noRoom = !on && !placed.some(c => c.type === type);
        if (!noRoom) l.widgets = placed;
      } else if (on) {
        for (const c of copiesOf(l).filter(c => c.type === type)) removeCopy(l, c.id);
      } else {
        noRoom = !addCopy(l, type, undefined, s.groups, s.activeGroupId);
      }
    }, ['prefs']);
    if (noRoom) say('No room for it. Shrink or remove a widget in Layout mode first.');
  }

  // ---- Connect ----

  function toggleEngine(engine) {
    const search = prefs().search;
    if (search[engine] && ENGINES.filter(([e]) => search[e]).length === 1) return true;   // one stays on
    setPrefs(p => { p.search[engine] = !p.search[engine]; });
    return prefs().search[engine];
  }

  const marketItems = () => copyOf('markets')?.settings.items ?? [];
  function toggleMarket(id) {
    const copy = copyOf('markets');
    const items = copy.settings.items;
    setCopy(copy.id, { items: items.includes(id) ? items.filter(i => i !== id) : [...items, id] });
    return marketItems().includes(id);
  }

  function githubField() {
    let timer = 0;
    const save = () => {
      clearTimeout(timer);
      const user = input.value.trim().replace(/^@/, '');
      if (user !== prefs().github.user) setPrefs(p => { p.github.user = user; });
    };
    // Saved once typing pauses: every change starts a fetch from GitHub.
    const input = el('input', {
      type: 'text', class: 'pref-input', placeholder: 'Your GitHub username', value: prefs().github.user,
      spellcheck: false, autocomplete: 'off', 'aria-label': 'GitHub username',
      oninput: () => {
        clearTimeout(timer);
        timer = setTimeout(save, 800);
      },
      onchange: save,
    });
    return input;
  }

  function sportsPicker() {
    const follow = () => copyOf('sports')?.settings.follow ?? [];
    const setFollow = list => setCopy(copyOf('sports').id, { follow: list, edited: true });
    const toggle = id => {
      const f = follow();
      setFollow(f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
      return follow().includes(id);
    };
    const teams = el('div', { class: 'ob-chips' });
    const drawTeams = () => teams.replaceChildren(...follow().filter(id => /^(nba|nfl):/.test(id)).map(id => {
      const team = teamOf(id);
      return el('button', {
        type: 'button', class: 'ob-chip', 'aria-pressed': 'true', title: `Stop following the ${team.name}`,
        onclick: () => {
          toggle(id);
          drawTeams();
        },
      }, team.name, icon('x', 12));
    }));
    const picker = (sport, list, text) => el('select', {
      class: 'pref-input ob-select', 'aria-label': text,
      onchange: e => {
        const id = e.target.value;
        e.target.value = '';
        if (!id || follow().includes(id)) return;
        setFollow([...follow(), id]);
        drawTeams();
      },
    }, el('option', { value: '', text }), list.map(t => el('option', { value: `${sport}:${t.id}`, text: t.name })));
    drawTeams();
    return [
      el('div', { class: 'ob-chips' }, MESSI.map(([id, name]) => chip(name, follow().includes(id), () => toggle(id)))),
      el('div', { class: 'ob-row' }, picker('nba', NBA_TEAMS, 'Add an NBA team…'), picker('nfl', NFL_TEAMS, 'Add an NFL team…')),
      teams,
    ];
  }

  function websiteField() {
    const copy = copyOf('website');
    const status = hint('Chrome asks once to let the widget show that site.');
    const input = el('input', {
      type: 'text', class: 'pref-input', placeholder: 'pinterest.com', value: copy.settings.url,
      spellcheck: false, autocomplete: 'off', 'aria-label': 'Website address',
      onkeydown: e => { if (e.key === 'Enter') show(); },
    });
    function show() {
      const url = siteUrl(input.value);
      if (!url) {
        status.textContent = 'That doesn’t look like an address.';
        return;
      }
      const asking = requestSiteAccess(sitePattern(url));   // first: Chrome's prompt needs this click
      setCopy(copy.id, { url });
      asking.then(ok => {
        status.textContent = ok ? `${hostOf(url)} is in the widget.`
          : hasChrome ? 'Chrome wasn’t given access, so the widget offers Allow access.'
            : 'Outside the extension the widget is a link to the site.';
      });
    }
    return [el('div', { class: 'ob-row' }, input, el('button', { type: 'button', class: 'btn', onclick: show }, 'Show')), status];
  }

  // A city search: each result is a chip, and picking one puts it in the widget.
  function weatherField() {
    const settings = () => copyOf('weather')?.settings;
    const status = hint(settings()?.place ? `Showing ${placeLabel(settings().place)}.` : 'Type a city, then pick it.');
    const results = el('div', { class: 'ob-chips' });
    let seq = 0;
    let timer = 0;
    async function search() {
      clearTimeout(timer);
      const q = input.value.trim();
      const my = ++seq;
      if (q.length < 2) return;
      let places = null;
      try {
        places = parsePlaces(await fetchJson(searchUrl(q)));
      } catch {
        // said below
      }
      if (my !== seq) return;
      status.textContent = places == null ? 'Couldn’t search. Check the connection and try again.' : places.length ? '' : `Nothing found for “${q}”.`;
      results.replaceChildren(...(places ?? []).map(p => el('button', {
        type: 'button', class: 'ob-chip', 'aria-pressed': String(placeLabel(settings()?.place) === placeLabel(p)),
        onclick: () => {
          setCopy(copyOf('weather').id, { place: p });
          for (const b of results.children) b.setAttribute('aria-pressed', 'false');
          results.children[places.indexOf(p)]?.setAttribute('aria-pressed', 'true');
          status.textContent = `Showing ${placeLabel(p)}.`;
        },
      }, placeLabel(p, { region: true }))));
    }
    const input = el('input', {
      type: 'text', class: 'pref-input', placeholder: 'Your city', value: settings()?.place?.name ?? '',
      spellcheck: false, autocomplete: 'off', 'aria-label': 'City for the weather', maxLength: 100,
      oninput: () => {
        clearTimeout(timer);
        timer = setTimeout(search, 400);
      },
      onkeydown: e => { if (e.key === 'Enter') search(); },
    });
    const unit = el('div', { class: 'ob-chips' }, [['c', '°C'], ['f', '°F']].map(([value, text]) => el('button', {
      type: 'button', class: 'ob-chip', 'aria-pressed': String(settings()?.unit === value),
      onclick: e => {
        setCopy(copyOf('weather').id, { unit: value });
        for (const b of unit.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      },
    }, text)));
    return [el('div', { class: 'ob-row' }, input, unit), results, status];
  }

  // ---- Moves ----

  function showMove(key) {
    if (key === 'jump') {
      ctx.openJump();
    } else if (key === 'search') {
      const input = document.querySelector('.sb-input');
      input?.focus();
      input?.select();
    } else {
      ctx.enterLayout();
    }
  }

  function markTried(key) {
    if (tried.has(key)) return;
    tried.add(key);
    if (open && step === 'moves') refresh();
  }

  const dialogs = new MutationObserver(records => {
    if (records.some(r => r.target.classList?.contains('jump-dlg') && r.target.open)) markTried('jump');
  });
  const onFocus = e => { if (e.target.matches?.('.sb-input')) markTried('search'); };
  let watching = false;
  function watchMoves(on) {
    if (on === watching) return;
    watching = on;
    if (on) {
      dialogs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
      document.addEventListener('focusin', onFocus);
    } else {
      dialogs.disconnect();
      document.removeEventListener('focusin', onFocus);
    }
  }

  // Layout mode starting and stopping, from Arrange, the top bar or a right-click.
  const classes = new MutationObserver(() => {
    const on = layoutOn();
    if (on === layoutWas) return;
    layoutWas = on;
    if (on) {
      if (step === 'moves') markTried('layout');   // Arrange doesn't count: Moves teaches the way in
      if (step !== 'arrange' && !card.hidden) {
        card.hidden = true;
        folded = true;
      }
      return;
    }
    if (folded) {
      folded = false;
      card.hidden = false;
    }
    if (open && step === 'arrange') {
      const to = leaving ?? neighbour(1);
      leaving = null;
      go(to);
    }
  });

  // ---- folding, other tabs, the end ----

  function fold() {
    card.hidden = true;
    resume.hidden = false;
    resume.focus({ preventScroll: true });
  }

  function unfold() {
    resume.hidden = true;
    card.hidden = false;
    render();
  }

  // Esc folds the card into Resume setup; Layout mode and dialogs keep their own Esc.
  function onKey(e) {
    if (e.key !== 'Escape' || card.hidden || layoutOn() || document.querySelector('dialog[open]')) return;
    fold();
  }

  function onResize() {
    if (open) card.dataset.pos = placement();
  }

  // Setup finished in another tab: take that tab's page and close this card quietly.
  function fromOtherTab(state) {
    if (!open || state?.onboarding?.done !== true) return;
    finish({ quiet: true });
    store.replace(state);
  }
  const onChromeChange = (changes, area) => {
    if (area === 'local' && changes.state) fromOtherTab(changes.state.newValue);
  };
  const onStorage = e => {
    if (e.key !== 'newtab:state' || !e.newValue) return;
    try {
      fromOtherTab(JSON.parse(e.newValue));
    } catch {
      // not a state this page wrote
    }
  };

  function listen(on) {
    const method = on ? 'addEventListener' : 'removeEventListener';
    globalThis[method]('keydown', onKey);
    globalThis[method]('resize', onResize);
    if (hasChrome) chrome.storage.onChanged[on ? 'addListener' : 'removeListener'](onChromeChange);
    else globalThis[method]('storage', onStorage);
    if (on) classes.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    else classes.disconnect();
  }

  let toastTimer = 0;
  function say(message) {
    toast.textContent = message;
    toast.hidden = false;
    document.body.append(toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 6500);
  }

  // The card shrinks into ☰, where setup lives from now on.
  function flyTo(target) {
    if (!target || card.hidden || narrow() || !motionAllowed()) {
      card.remove();
      return Promise.resolve();
    }
    const a = card.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const base = getComputedStyle(card).transform;
    const from = base === 'none' ? '' : base;
    return card.animate([
      { transform: from || 'none', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) ${from} scale(0.04)`, opacity: 0.1 },
    ], { duration: 700, easing: 'cubic-bezier(.6, 0, .2, 1)', fill: 'forwards' }).finished.catch(() => {}).then(() => card.remove());
  }

  async function finish({ skipped = false, restored = false, quiet = false } = {}) {
    if (!open) return;
    open = false;
    step = 'done';
    watchMoves(false);
    listen(false);
    for (const frame of canvas.frames().values()) {
      frame.classList.remove('ob-hidden');
      frame.inert = false;
    }
    document.body.classList.remove('ob-setup', 'ob-fresh');
    resume.remove();
    if (layoutOn()) ctx.exitLayout();
    if (quiet) {
      card.remove();
      return;
    }
    if (!restored) store.update(s => { s.onboarding = { done: true, step: 'done' }; }, ['onboarding']);
    const menu = document.getElementById('btn-prefs');
    await flyTo(menu);
    if (menu) {
      menu.classList.add('ob-pulse');
      setTimeout(() => menu.classList.remove('ob-pulse'), 4200);
      const r = menu.getBoundingClientRect();
      if (lettersBehind()) rippleFrom(r.left + r.width / 2, r.top + r.height / 2);
    }
    say(restored ? 'Backup restored. Setup is in Preferences → Setup if you want it again.'
      : skipped ? 'Setup skipped. It’s in Preferences → Setup whenever you want it.'
        : 'All set. Setup is in Preferences → Setup if you want it again.');
  }

  return {
    // again: from Preferences, over the page as it is (nothing hidden); replay stages it as a
    // first run shows it. Otherwise a first run, resumed at the step it stopped at; only the very
    // start plays the opening.
    async start({ again = false, replay = false } = {}) {
      if (open) {
        unfold();
        return;
      }
      open = true;
      if (again) store.update(s => { s.onboarding = { done: false, step: 'intro' }; }, ['onboarding']);
      staged = !again || replay;
      const saved = store.get().onboarding.step;
      step = STEPS.includes(saved) && saved !== 'done' ? saved : 'intro';
      if (!steps().includes(step)) step = neighbour(1) === 'done' ? 'intro' : neighbour(1);
      tried.clear();
      sources = source = null;
      wantImage = false;
      leaving = null;
      folded = false;
      layoutWas = layoutOn();
      document.body.classList.add('ob-setup');
      document.body.append(card, resume);
      card.hidden = true;
      resume.hidden = true;
      listen(true);
      render();
      if (step === 'arrange' && !layoutOn()) ctx.enterLayout();
      if (step === 'intro' && lettersBehind()) {
        await new Promise(r => setTimeout(r, 300));   // the background's own first frame
        await spellWord('hello');
      }
      if (!open) return;
      card.hidden = false;
      if (motionAllowed()) card.animate([{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }], { duration: 520, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      if (step !== 'intro') render();
    },
  };
}
