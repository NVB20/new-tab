// Preferences panel. Every control writes straight to the store, so the page updates live, and
// the panel can be dragged aside by its sidebar to watch the change happen behind it.

import { el, icon, confirmDialog, alertDialog } from './ui.js';
import { normalizeUrl, clamp, backgroundImage } from './util.js';
import { CLOCK_FACES } from './clock-widget.js';
import { setTheme } from './store.js';
import { copyById, copyTitle, resetLayout, prefsSection, moveGithubPart, showGithubPart, partsSummary } from './layout.js';
import { iconsFor, addSavedIcons, clearSavedIcons } from './icon-cache.js';

// The GitHub widget's parts as Preferences → GitHub lists them.
const PART_NAMES = {
  stats: { name: 'Profile stats', hint: 'Followers, public repos and stars' },
  heatmap: { name: 'Activity map', hint: 'A year of contributions' },
  pulls: { name: 'Pull requests', hint: 'Open ones you opened, are assigned to or commented on' },
  reviews: { name: 'Review requests', hint: 'Open pull requests waiting for your review' },
  issues: { name: 'Issues', hint: 'Open ones you opened, are assigned to or commented on' },
  repos: { name: 'Latest repos', hint: 'The repos you committed to most recently' },
  commits: { name: 'Commits', hint: 'Your newest commits in every repo' },
};

const ACCENTS = ['#d97757', '#2563eb', '#10a37f', '#8b5cf6', '#e5484d', '#f5a524'];
// Chrome's own greys for the plain background. Text keeps the theme's colour, so the light
// theme gets light greys and the others dark ones, and each keeps its own pick.
const PLAIN_COLOURS = {
  dark: [
    { color: '#3c3c3c', label: 'Chrome toolbar' },
    { color: '#2b2b2b', label: 'Chrome tab strip' },
    { color: '#282828', label: 'Chrome address bar' },
    { color: '#202124', label: 'Chrome dark page' },
  ],
  light: [
    { color: '#ffffff', label: 'Chrome toolbar' },
    { color: '#dee1e6', label: 'Chrome tab strip' },
    { color: '#f1f3f4', label: 'Chrome address bar' },
    { color: '#e8eaed', label: 'Chrome grey' },
  ],
};
const TILE_PRESETS = [
  { label: 'White', color: '#ffffff', textColor: '#202124' },
  { label: 'Dark', color: '#30302e', textColor: '#faf9f5' },
];
const MAX_WALLPAPER_SIDE = 2560;
const BACKUP_FORMAT = 'new-tab-backup';
const OFFSET_KEY = 'newtab:prefs-offset';
const KEEP_VISIBLE = 120;   // px of the panel that stay inside the window while dragging

// enterLayoutMode() opens Layout mode (the panel closes first).
export function setupPrefs(store, { enterLayoutMode = () => {} } = {}) {
  const prefs = () => store.get().prefs;
  // One setting of a widget copy on the canvas (see layout.js).
  const setCopy = (id, key, value) => store.update(s => {
    const own = copyById(s, id);
    if (own) own.settings[key] = value;
  });
  const getPref = path => path.split('.').reduce((o, k) => o?.[k], prefs());
  const setPref = (path, value) => store.update(s => {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], s.prefs)[last] = value;
  });
  const redraw = () => show(current);
  // Image was picked but nothing is set yet (or it was just removed): keep its boxes up.
  let wantImage = false;
  // What's typed in the search box. While it holds something, the panel lists matches from every section.
  let query = '';

  // ---- control builders ----
  // Switches and choices redraw the section, so the options that depend on them appear or go.

  const title = text => el('h3', { class: 'pref-section-title', text });

  const row = (label, control, hint) => el('div', { class: 'pref-row' },
    el('div', { class: 'pref-text' }, el('div', { text: label }), hint && el('div', { class: 'pref-hint', text: hint })),
    control);

  // Options that only matter while the switch or choice above them is on, indented under it.
  // A search finds them even while it's off, dimmed, so it's clear what to turn on first.
  const sub = (on, ...rows) => (on || query ? el('div', { class: on ? 'pref-sub' : 'pref-sub pref-off' }, rows) : false);

  // Rows that open(id, anchor) can scroll to, e.g. from a widget's own "set up" button.
  const group = (anchor, ...rows) => el('div', { dataset: { anchor } }, rows);

  function switchFor(label, key, checked, set) {
    const input = el('input', {
      type: 'checkbox', class: 'switch', role: 'switch', checked, 'aria-label': label,
      dataset: { key },
      onchange: () => {
        set(input.checked);
        redraw();
      },
    });
    return input;
  }

  const switchInput = (label, path) => switchFor(label, path, getPref(path), on => setPref(path, on));

  const toggle = (label, path, hint) => row(label, switchInput(label, path), hint);

  const choice = (label, value, options, pick) => el('div', { class: 'seg', role: 'group', 'aria-label': label, dataset: { key: label } },
    options.map(o => el('button', {
      type: 'button',
      'aria-pressed': String(value === o.value),
      onclick: () => {
        pick(o.value);
        redraw();
      },
    }, o.icon && icon(o.icon, 16), el('span', { text: o.label }))));

  const segmented = (label, path, options, hint) => row(label, choice(label, getPref(path), options, v => setPref(path, v)), hint);

  function slider(label, path, min, max, { step = 1, unit = '' } = {}) {
    const out = el('output', { class: 'range-value', text: getPref(path) + unit });
    const input = el('input', {
      type: 'range', min, max, step, value: getPref(path), 'aria-label': label,
      oninput: () => {
        out.textContent = input.value + unit;
        setPref(path, Number(input.value));
      },
    });
    return el('div', { class: 'pref-row pref-slider' }, el('div', { class: 'pref-label' }, el('span', { text: label }), out), input);
  }

  function colorInput(label, path) {
    const input = el('input', { type: 'color', value: getPref(path), title: label, 'aria-label': label, oninput: () => setPref(path, input.value) });
    return input;
  }

  function textField(label, path, placeholder, { type = 'text', maxLength = 60 } = {}) {
    const input = el('input', {
      type, class: 'pref-input', value: getPref(path), placeholder, dir: 'auto', maxLength, 'aria-label': label,
      autocomplete: 'off', spellcheck: false,
      oninput: () => setPref(path, input.value),
    });
    return input;
  }

  const textInput = (label, path, placeholder, { hint, ...opts } = {}) => row(label, textField(label, path, placeholder, opts), hint);

  // The same controls for a value that isn't at a prefs path (a widget copy's settings).
  function textFor(label, key, value, placeholder, set, { maxLength = 60 } = {}) {
    const input = el('input', {
      type: 'text', class: 'pref-input', value, placeholder, dir: 'auto', maxLength, 'aria-label': label,
      autocomplete: 'off', spellcheck: false, dataset: { key },
      oninput: () => set(input.value),
    });
    return input;
  }

  function sliderFor(label, key, value, min, max, set, { step = 1, unit = '' } = {}) {
    const out = el('output', { class: 'range-value', text: value + unit });
    const input = el('input', {
      type: 'range', min, max, step, value, 'aria-label': label, dataset: { key },
      oninput: () => {
        out.textContent = input.value + unit;
        set(Number(input.value));
      },
    });
    return el('div', { class: 'pref-row pref-slider' }, el('div', { class: 'pref-label' }, el('span', { text: label }), out), input);
  }

  // ---- sections ----

  function page() {
    const p = prefs();
    const image = backgroundImage(p.background, store.wallpaper);
    const shown = image || wantImage ? 'image' : p.background.pattern;
    const swatches = ACCENTS.map(c => el('button', {
      type: 'button', class: 'swatch', title: c, 'aria-label': `Accent ${c}`,
      'aria-pressed': String(p.accent === c),
      style: `background:${c}`,
      onclick: () => {
        setPref('accent', c);
        redraw();
      },
    }));
    const custom = el('input', { type: 'color', value: p.accent, title: 'Any colour', 'aria-label': 'Custom accent colour', oninput: () => setPref('accent', custom.value) });

    return [
      title('Colours'),
      // A theme brings its own accent, unless a different accent was picked by hand.
      row('Theme', choice('Theme', p.theme, [
        { value: 'auto', label: 'Auto', icon: 'auto' },
        { value: 'light', label: 'Light', icon: 'sun' },
        { value: 'dark', label: 'Dark', icon: 'moon' },
        { value: 'blue', label: 'Blue', icon: 'drop' },
        { value: 'github', label: 'GitHub', icon: 'branch' },
      ], value => store.update(s => setTheme(s.prefs, value)))),
      row('Accent', el('div', { class: 'swatches' }, swatches, custom)),
      title('Background'),
      row('Style', choice('Background', shown, [
        { value: 'ascii', label: 'ASCII' },
        { value: 'none', label: 'Plain' },
        { value: 'image', label: 'Image' },
      ], pickBackground)),
      sub(shown === 'ascii', toggle('Animate and react to the mouse', 'background.motion', 'Stays still if Windows is set to reduce animations')),
      sub(shown === 'none', plainColour()),
      sub(shown === 'image', imageRows(image)),
      title('Top bar'),
      toggle('Sidebar button', 'sidebar.enabled', 'Bookmarks, history and recently closed tabs'),
    ];
  }

  function searchBar() {
    return [
      title('Engines'),
      el('p', { class: 'pref-hint pref-intro', text: 'The engines the search bar offers. Ctrl+Space jumps to the bar; Tab or its icon picks an engine. The bar is a widget of its own: move it, resize it or remove it in Layout mode.' }),
      toggle('Google', 'search.google'),
      toggle('Claude', 'search.claude', 'Sends what you type to claude.ai and runs it'),
      toggle('ChatGPT', 'search.chatgpt', 'Sends what you type to chatgpt.com and runs it'),
      toggle('Gemini', 'search.gemini', 'Sends what you type to gemini.google.com and runs it'),
    ];
  }

  // '' is the theme's own background (the first swatch).
  function plainColour() {
    const family = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const path = `background.color.${family}`;
    const current = getPref(path);
    const pick = color => {
      setPref(path, color);
      redraw();
    };
    const options = [{ color: '', label: 'Theme colour' }, ...PLAIN_COLOURS[family]];
    const swatches = options.map(o => el('button', {
      type: 'button', class: 'swatch', title: o.color ? `${o.label} ${o.color}` : o.label, 'aria-label': o.label,
      'aria-pressed': String(current === o.color),
      style: `background:${o.color || 'var(--bg)'}`,
      onclick: () => pick(o.color),
    }));
    const custom = el('input', {
      type: 'color', value: current || options[1].color, title: 'Any colour', 'aria-label': 'Custom background colour',
      oninput: () => setPref(path, custom.value),
    });
    return row('Colour', el('div', { class: 'swatches' }, swatches, custom),
      'The theme’s, Chrome’s greys or any colour. Light and the dark themes keep their own');
  }

  function imageRows(image) {
    const bg = prefs().background;
    const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: () => uploadWallpaper(fileInput.files[0]) });
    const urlInput = el('input', {
      type: 'text', class: 'pref-input wide', value: bg.url, placeholder: 'https://… image link',
      spellcheck: false, autocomplete: 'off', 'aria-label': 'Image link',
    });
    const urlHint = el('div', { class: 'field-hint' });
    const applyUrl = () => {
      const raw = urlInput.value.trim();
      if (!raw) return;
      const href = normalizeUrl(raw);
      if (!href) {
        urlHint.textContent = 'That doesn’t look like a link.';
        return;
      }
      store.update(s => Object.assign(s.prefs.background, { url: href, useUpload: false, showImage: true }));
      redraw();
    };
    urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyUrl(); });

    return [
      row('Image', el('div', { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, icon('upload', 16), 'Upload'),
        el('button', { type: 'button', class: 'btn', disabled: !image, onclick: clearWallpaper }, 'Remove'),
        fileInput),
      image ? (bg.useUpload ? 'Your uploaded image' : 'Image from a link') : 'Upload one, or paste a link below'),
      el('div', { class: 'pref-row pref-stack' },
        el('div', { text: 'Image link' }),
        el('div', { class: 'btn-row' }, urlInput, el('button', { type: 'button', class: 'btn', onclick: applyUrl }, 'Apply')),
        urlHint),
      slider('Blur', 'background.blur', 0, 20, { unit: 'px' }),
      slider('Dim', 'background.dim', 0, 80, { unit: '%' }),
    ];
  }

  // ASCII and Plain hide the image but keep it, so choosing Image again brings it back.
  function pickBackground(value) {
    wantImage = value === 'image';
    store.update(s => {
      s.prefs.background.showImage = wantImage;
      if (!wantImage) s.prefs.background.pattern = value;
    });
  }

  function tiles() {
    const t = prefs().tiles;
    return [
      title('Grid'),
      el('p', { class: 'pref-hint pref-intro', text: 'Each tiles block’s columns and group are under Layout; its size and place are set in Layout mode.' }),
      slider('Spacing', 'spacing', 0, 40, { unit: 'px' }),
      toggle('Compact layout', 'compact', 'Shorter tiles'),
      title('Look'),
      segmented('Style', 'tiles.style', [{ value: 'flat', label: 'Flat' }, { value: 'card', label: 'Cards' }]),
      sub(t.style === 'card',
        slider('Corner radius', 'tiles.radius', 0, 24, { unit: 'px' }),
        row('Colours', el('div', { class: 'btn-row' },
          TILE_PRESETS.map(p => el('button', {
            type: 'button', class: 'btn',
            onclick: () => {
              store.update(s => Object.assign(s.prefs.tiles, { color: p.color, textColor: p.textColor }));
              redraw();
            },
          }, p.label)),
          colorInput('Card colour', 'tiles.color'),
          colorInput('Title colour', 'tiles.textColor')), 'A preset, or pick the card and title colours')),
      segmented('Icons', 'tiles.icons', [{ value: 'logo', label: 'Logos' }, { value: 'site', label: 'Site icons' }],
        'Site icons come from Chrome (installed extension only)'),
      toggle('Show titles', 'tiles.showTitle'),
      title('Behaviour'),
      toggle('Open tiles in a new tab', 'openInNewTab', 'Ctrl+click or middle-click always opens a new tab'),
      toggle('Show + button', 'showAddButton', 'The last tile in the grid, for adding a new one'),
    ];
  }

  // Layout mode, and one group per widget copy on the canvas that has settings of its own. A
  // widget's ✎ opens its group (the anchor is the copy's id).
  function layout() {
    const s = store.get();
    const own = s.prefs.layout.widgets.filter(copy => prefsSection(copy.type) === 'layout');
    return [
      row('Layout', el('button', { type: 'button', class: 'btn', onclick: () => { dialog.close(); enterLayoutMode(); } }, icon('layout', 16), 'Edit layout'),
        'Drag, resize, add, duplicate and remove the widgets on the page'),
      row('Reset layout', el('button', { type: 'button', class: 'btn', text: 'Reset', onclick: resetAllLayout }),
        'Back to the default places, keeping each widget’s settings'),
      ...own.map(copy => group(copy.id, title(copyTitle(copy, s.groups)), ...copyRows(copy, s.groups))),
    ];
  }

  function copyRows(copy, groups) {
    const s = copy.settings;
    const set = (key, value) => setCopy(copy.id, key, value);
    switch (copy.type) {
      case 'clock':
        return [
          ...clockStyle(copy),
          row('24-hour clock', switchFor('24-hour clock', `${copy.id}.hour24`, s.hour24, on => set('hour24', on))),
          row('Greeting', el('div', { class: 'btn-row' },
            s.greeting && textFor('Your name', `${copy.id}.name`, s.name, 'Your name', v => set('name', v)),
            switchFor('Greeting', `${copy.id}.greeting`, s.greeting, on => set('greeting', on))), 'Good morning, and your name'),
        ];
      case 'tiles': {
        const groupSelect = el('select', {
          class: 'pref-input', 'aria-label': 'Group', dataset: { key: `${copy.id}.group` },
          onchange: () => {
            set('group', groupSelect.value || null);
            redraw();
          },
        },
        el('option', { value: '', text: 'Follow the tabs', selected: s.group === null }),
        groups.map(g => el('option', { value: g.id, text: g.title, selected: g.id === s.group })));
        return [
          row('Group', groupSelect, 'The group this block shows'),
          sliderFor('Columns', `${copy.id}.columns`, s.columns, 2, 10, v => set('columns', v)),
        ];
      }
      case 'markets':
        return [row('Coins and pairs', el('span'), 'Use ✎ on the widget to choose them')];
      case 'sports':
        return [row('Teams and F1', el('span'), 'Use ✎ on the widget to choose them')];
      case 'website':
        return [
          row('Address', textFor('Address', `${copy.id}.url`, s.url, 'pinterest.com', v => set('url', v), { maxLength: 2000 }),
            'The page the widget starts on. A new site asks for access in the widget'),
          sliderFor('Zoom', `${copy.id}.zoom`, s.zoom, 50, 100, v => set('zoom', v), { step: 5, unit: '%' }),
        ];
      default:
        return [row('No settings', el('span'))];
    }
  }

  async function resetAllLayout() {
    const s = store.get();
    const names = resetLayout(structuredClone(s.prefs.layout)).map(c => copyTitle(c, s.groups)).join(', ');
    const ok = await confirmDialog(
      names ? `Put every widget back in its default place? ${names} will be removed.` : 'Put every widget back in its default place?',
      { title: 'Reset layout', confirmLabel: 'Reset' },
    );
    if (!ok) return;
    store.update(st => { resetLayout(st.prefs.layout); });
    redraw();
  }

  // open('github', 'account') scrolls to the username and puts the cursor in it while it's empty;
  // open('github', <copy id>) to that widget's parts.
  function github() {
    const s = store.get();
    const copies = s.prefs.layout.widgets.filter(copy => copy.type === 'github');
    return [
      title('Account'),
      group('account', textInput('Username', 'github.user', 'NVB20', { hint: 'Whose activity every GitHub widget shows' })),
      // One list per copy; when there are several, each is numbered and says what it shows.
      ...copies.flatMap((copy, i) => [
        title(copies.length > 1 ? `Widget ${i + 1} · ${partsSummary(copy.settings.parts)}` : 'What the widget shows'),
        group(copy.id, ...partRows(copy)),
      ]),
      ...(copies.length ? [] : [title('What the widget shows'), row('No GitHub widget on the page', el('button', {
        type: 'button', class: 'btn', onclick: () => { dialog.close(); enterLayoutMode(); },
      }, icon('layout', 16), 'Edit layout'), 'Add one from the tray in Layout mode')]),
      title('Private repos'),
      textInput('Access token (optional)', 'github.token', 'github_pat_…', {
        type: 'password',
        maxLength: 300,
        hint: 'One token for every GitHub widget. Only needed for private repos. Kept only in this browser and left out of backups.',
      }),
      tokenHelp(),
    ];
  }

  // A GitHub copy's parts in its order, shown or not: ↑ and ↓ move one, the switch shows it.
  function partRows(copy) {
    const s = copy.settings;
    const save = ({ order, parts }) => store.update(st => {
      const own = copyById(st, copy.id);
      if (own) Object.assign(own.settings, { order, parts });
    });
    const arrow = (part, step, i) => {
      const dir = step < 0 ? 'up' : 'down';
      const key = `${copy.id}.${part}.`;
      return el('button', {
        type: 'button', class: 'icon-btn pref-move', disabled: step < 0 ? i === 0 : i === s.order.length - 1,
        title: `Move ${dir}`, 'aria-label': `Move ${PART_NAMES[part].name} ${dir}`, dataset: { key: key + dir },
        onclick: () => {
          save(moveGithubPart(s, part, step));
          redraw();
          // At the top or bottom this arrow is off: the focus goes to the other one.
          const find = k => content.querySelector(`[data-key="${CSS.escape(k)}"]`);
          if (find(key + dir)?.disabled) find(key + (step < 0 ? 'down' : 'up'))?.focus();
        },
      }, icon(`arrow-${dir}`, 15));
    };
    return s.order.map((part, i) => row(PART_NAMES[part].name, el('div', { class: 'btn-row pref-part' },
      arrow(part, -1, i), arrow(part, 1, i),
      switchFor(PART_NAMES[part].name, `${copy.id}.${part}`, s.parts.includes(part), on => save(showGithubPart(s, part, on)))),
    PART_NAMES[part].hint));
  }

  function tokenHelp() {
    const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener', text });
    return el('div', { class: 'pref-help' },
      el('div', { class: 'pref-help-title', text: 'How to get a token' }),
      el('ol', {},
        el('li', {}, 'Open ', link('https://github.com/settings/personal-access-tokens/new', 'a new fine-grained token'), ' on GitHub.'),
        el('li', { text: 'Pick the owner (you or an organisation) and the repos it may see.' }),
        el('li', { text: 'Under Permissions, add Contents, Issues and Pull requests, each Read-only.' }),
        el('li', { text: 'Generate it, copy it and paste it above.' })),
      el('div', {}, 'Private repos under more than one owner? ',
        link('https://github.com/NVB20/new-tab#tokens-for-private-repos', 'See the README'), '.'));
  }

  // Style picks the font. Stencil, Rounded and Serif come stacked or on one line (their `-line`
  // face), so a switch picks which, and changing font keeps that choice.
  function clockStyle(copy) {
    const face = CLOCK_FACES.find(f => f.id === copy.settings.face) ?? CLOCK_FACES[0];
    const font = face.font ?? face.id;
    const lineOf = f => CLOCK_FACES.find(x => x.font === f)?.id;
    const fonts = CLOCK_FACES.filter(f => !f.font).map(f => ({ value: f.id, label: f.label }));
    const setFace = id => setCopy(copy.id, 'face', id);
    return [
      row('Style', choice('Clock style', font, fonts, f => setFace(face.font && lineOf(f) ? lineOf(f) : f))),
      lineOf(font) && row('Hours over minutes', switchFor('Hours over minutes', 'clock-stacked', !face.font,
        on => setFace(on ? font : lineOf(font)))),
      !face.stacked && row('Colon', switchFor('Colon', `${copy.id}.colon`, copy.settings.colon, on => setCopy(copy.id, 'colon', on)), '15:41, or 1541 without it'),
    ];
  }

  function backup() {
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: () => importFile(fileInput.files[0]) });
    const s = store.get();
    return [
      title('Backup'),
      row('Export', el('button', { type: 'button', class: 'btn', onclick: exportBackup }, icon('download', 16), 'Download backup'),
        `${s.tiles.length} tiles in ${s.groups.length} group${s.groups.length === 1 ? '' : 's'}, plus settings, tasks and notes`),
      row('Import', el('div', { class: 'btn-row' }, el('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, icon('upload', 16), 'Import file'), fileInput),
        'A backup from this page, or a Speed Dial 2 export (.json)'),
      title('Danger zone'),
      row('Reset everything', el('button', { type: 'button', class: 'btn btn-danger', onclick: resetAll }, 'Reset'),
        'Deletes all tiles, groups, settings, tasks, notes and the wallpaper'),
    ];
  }

  // ---- actions ----

  async function uploadWallpaper(file) {
    if (!file) return;
    try {
      const dataUrl = await shrinkImage(file);
      await store.setWallpaper(dataUrl);
      store.update(s => Object.assign(s.prefs.background, { useUpload: true, showImage: true }));
      redraw();
    } catch (err) {
      alertDialog(`Couldn’t use that image: ${err.message}`);
    }
  }

  async function clearWallpaper() {
    await store.setWallpaper('');
    store.update(s => Object.assign(s.prefs.background, { useUpload: false, url: '' }));
    wantImage = true;
    redraw();
  }

  function exportBackup() {
    const state = structuredClone(store.get());
    state.prefs.github.token = '';   // a backup file shouldn't carry a credential
    const payload = { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), state, wallpaper: store.wallpaper, icons: iconsFor(state.tiles) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `new-tab-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importFile(file) {
    if (!file) return;
    let json;
    try {
      json = JSON.parse(await file.text());
    } catch {
      alertDialog('That file isn’t valid JSON.', 'Import failed');
      return;
    }

    if (json?.format === BACKUP_FORMAT && json.state) {
      const n = Array.isArray(json.state.tiles) ? json.state.tiles.length : 0;
      if (!await confirmDialog(`Replace everything here with this backup (${n} tiles)?`, { title: 'Restore backup', confirmLabel: 'Restore' })) return;
      store.replace(json.state);
      await store.setWallpaper(typeof json.wallpaper === 'string' ? json.wallpaper : '');
      await addSavedIcons(json.icons);
      redraw();
      return;
    }

    // Only needed for this rare path, so it isn't loaded with the page.
    const { fromSpeedDial2 } = await import('./importer.js');
    let imported;
    try {
      imported = fromSpeedDial2(json);
    } catch (err) {
      alertDialog(`${err.message} Use a backup from this page or a Speed Dial 2 export.`, 'Import failed');
      return;
    }
    const message = `Import ${imported.tiles.length} tiles in ${imported.groups.length} group${imported.groups.length === 1 ? '' : 's'} from Speed Dial 2? This replaces your current tiles, groups and settings. Tasks, task history and notes are kept.`;
    if (!await confirmDialog(message, { title: 'Import from Speed Dial 2', confirmLabel: 'Import' })) return;
    // The layout and the token stay; only the export's column count goes to the block that
    // follows the tabs. Blocks pinned to the old groups go back to following the tabs on load.
    const { tasks, taskHistory, taskStats, notes, prefs: { layout, github } } = structuredClone(store.get());
    const block = layout.widgets.find(c => c.type === 'tiles' && c.settings.group === null);
    if (block) block.settings.columns = imported.prefs.columns;
    store.replace({ ...imported, tasks, taskHistory, taskStats, notes, prefs: { ...imported.prefs, layout, github } });
    redraw();
  }

  async function resetAll() {
    if (!await confirmDialog('This deletes all tiles, groups, settings, tasks, notes and the wallpaper. Download a backup first if you might want them back.', { title: 'Reset everything?', confirmLabel: 'Reset', danger: true })) return;
    store.replace(null);
    await store.setWallpaper('');
    await clearSavedIcons();
    show('page');
  }

  // ---- panel ----

  const sections = [
    { id: 'page', label: 'Page', icon: 'palette', build: page },
    { id: 'search', label: 'Search bar', icon: 'search', build: searchBar },
    { id: 'tiles', label: 'Tiles', icon: 'grid', build: tiles },
    { id: 'layout', label: 'Layout', icon: 'layout', build: layout },
    { id: 'github', label: 'GitHub', icon: 'branch', build: github },
    { id: 'backup', label: 'Backup', icon: 'database', build: backup },
  ];
  let current = 'page';

  const nav = el('nav', { class: 'prefs-nav', 'aria-label': 'Preference sections' });
  const content = el('div', { class: 'prefs-content' });
  const search = el('input', {
    type: 'search', class: 'pref-input', placeholder: 'Search', 'aria-label': 'Search preferences',
    autocomplete: 'off', spellcheck: false,
    oninput: () => {
      setQuery(search.value);
      redraw();
    },
    onkeydown: e => {
      // Esc empties the box first; once it's empty, Esc closes the panel as usual.
      if (e.key !== 'Escape' || !search.value) return;
      e.preventDefault();
      setQuery('');
      redraw();
    },
  });
  // The empty strip along the top and the sidebar's empty space are handles for dragging the panel aside.
  const dragHint = 'Drag to move · double-click to centre';
  const side = el('div', { class: 'prefs-side', title: dragHint },
    el('label', { class: 'prefs-search' }, icon('search', 16), search),
    el('h2', { class: 'prefs-side-title', text: 'Preferences' }),
    nav);
  const top = el('div', { class: 'prefs-top', title: dragHint },
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('x')));
  const dialog = el('dialog', { class: 'dlg prefs-dlg', 'aria-label': 'Preferences' },
    side, el('div', { class: 'prefs-main' }, top, content));
  // Close on a click outside, but not when a drag that began inside (a slider, the sidebar) ends there.
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', e => { pressedOutside = e.target === dialog; });
  dialog.addEventListener('click', e => { if (e.target === dialog && pressedOutside) dialog.close(); });
  // Ctrl+F searches the preferences rather than the page behind them.
  dialog.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f') return;
    e.preventDefault();
    search.focus();
    search.select();
  });
  document.body.append(dialog);

  function setQuery(text) {
    search.value = text;
    query = text.trim();
  }

  let shownQuery = '';
  function show(id) {
    const same = id === current && query === shownQuery;
    current = id;
    shownQuery = query;
    // Redrawing replaces the controls, so focus goes back to the one that was just used.
    const active = document.activeElement;
    const navFocused = nav.contains(active);
    const key = content.contains(active) ? active.closest('[data-key]')?.dataset.key : null;

    nav.replaceChildren(...sections.map(s => el('button', {
      type: 'button',
      'aria-current': String(!query && s.id === id),
      onclick: () => {
        setQuery('');
        show(s.id);
      },
    }, icon(s.icon, 17), el('span', { text: s.label }))));
    const scroll = content.scrollTop;
    content.replaceChildren(...(query ? results() : sections.find(s => s.id === id).build().filter(Boolean)));
    content.scrollTop = same ? scroll : 0;

    if (navFocused) nav.querySelector('[aria-current="true"]').focus();
    const target = key && [...content.querySelectorAll('[data-key]')].find(n => n.dataset.key === key);
    if (target) (target.classList.contains('seg') ? target.querySelector('[aria-pressed="true"]') : target).focus({ preventScroll: true });
  }

  // The panel spells colour and behaviour the British way; either spelling finds them.
  const fold = text => text.toLowerCase().replace(/colour/g, 'color').replace(/behaviour/g, 'behavior');

  // Rows from every section that contain each word typed, under "Section · Group" titles.
  function results() {
    const words = fold(query).split(/\s+/);
    const matches = (node, group) => {
      const labels = [...node.querySelectorAll('[aria-label]')].map(n => n.ariaLabel);
      const text = fold([group, node.textContent, ...labels].join(' '));
      return words.every(w => text.includes(w));
    };
    const label = row => row.querySelector('.pref-text > div, .pref-label > span')?.textContent ?? '';
    // Drops the rows that don't match, from nested groups too, and returns the nodes left.
    const keep = (nodes, group) => {
      // Sub-options hang from the nearest row above them, and are found by its name too.
      const parentOf = i => nodes[nodes.findLastIndex((m, j) => j < i && !m.matches('.pref-sub'))];
      const hit = nodes.map((n, i) => {
        if (n.matches('.pref-section-title')) return false;   // a title inside a group: the result titles say it
        if (n.matches('.pref-row') || !n.querySelector('.pref-row')) return matches(n, group);
        const parent = n.matches('.pref-sub') && parentOf(i);
        return keep([...n.children], parent ? `${group} ${label(parent)}` : group).length > 0;
      });
      // A sub-option that's kept keeps its row too, so it's clear what it belongs to.
      nodes.forEach((n, i) => {
        const parent = hit[i] && n.matches('.pref-sub') && parentOf(i);
        if (parent) hit[nodes.indexOf(parent)] = true;
      });
      nodes.forEach((n, i) => { if (!hit[i]) n.remove(); });
      return nodes.filter((n, i) => hit[i]);
    };

    const found = sections.flatMap(s => {
      const out = [];
      let group = s.label;
      let rows = [];
      const flush = () => {
        const kept = keep(rows, group);
        if (kept.length) out.push(title(group), ...kept);
        rows = [];
      };
      for (const node of s.build().filter(Boolean)) {
        if (!node.matches('.pref-section-title')) {
          rows.push(node);
          continue;
        }
        flush();
        group = node.textContent === s.label ? s.label : `${s.label} · ${node.textContent}`;
      }
      flush();
      return out;
    });
    return found.length ? found : [el('p', { class: 'prefs-empty', text: `No preferences match “${query}”` })];
  }

  // ---- moving the panel ----
  // The offset from the centred position is kept for next time and re-fitted to the window.

  let offset = { x: 0, y: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(OFFSET_KEY));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) offset = { x: saved.x, y: saved.y };
  } catch {
    // nothing saved: start in the middle
  }

  function place(x, y) {
    const r = dialog.getBoundingClientRect();
    const left = r.left - offset.x;   // where the panel sits when centred
    const top = r.top - offset.y;
    offset = {
      x: Math.round(clamp(x, KEEP_VISIBLE - r.width - left, innerWidth - KEEP_VISIBLE - left)),
      y: Math.round(clamp(y, -top, innerHeight - KEEP_VISIBLE - top)),
    };
    dialog.style.translate = `${offset.x}px ${offset.y}px`;
  }

  function saveOffset() {
    try {
      localStorage.setItem(OFFSET_KEY, JSON.stringify(offset));
    } catch {
      // only a convenience
    }
  }

  for (const handle of [side, top]) {
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button, .prefs-search')) return;
      e.preventDefault();
      const start = { x: e.clientX - offset.x, y: e.clientY - offset.y };
      const move = ev => place(ev.clientX - start.x, ev.clientY - start.y);
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('dragging');
      handle.addEventListener('pointermove', move);
      handle.addEventListener('lostpointercapture', () => {
        handle.removeEventListener('pointermove', move);
        handle.classList.remove('dragging');
        saveOffset();
      }, { once: true });
    });
    handle.addEventListener('dblclick', e => {
      if (e.target.closest('button, .prefs-search')) return;
      place(0, 0);
      saveOffset();
    });
  }
  addEventListener('resize', () => { if (dialog.open) place(offset.x, offset.y); });

  return {
    // Opens with the cursor in the search box. anchor: a group to scroll to; its first empty text
    // box gets the focus instead.
    open(id = current, anchor) {
      wantImage = false;
      setQuery('');
      show(id);
      dialog.showModal();
      search.focus();
      content.scrollTop = 0;
      place(offset.x, offset.y);
      const target = anchor && [...content.querySelectorAll('[data-anchor]')].find(n => n.dataset.anchor === anchor);
      if (target) {
        // A group right under its title comes into view with it.
        const above = target.previousElementSibling;
        (above?.matches('.pref-section-title') ? above : target).scrollIntoView({ block: 'start' });
        [...target.querySelectorAll('input.pref-input')].find(i => !i.value)?.focus();
      }
    },
  };
}

// Large photos are scaled down so the stored wallpaper stays a few MB at most.
async function shrinkImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('it isn’t an image file.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WALLPAPER_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 4 * 1024 * 1024) {
    bitmap.close();
    return readAsDataUrl(file);
  }
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return readAsDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }));
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
