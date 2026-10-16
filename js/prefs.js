// Preferences panel. Every control writes straight to the store, so the page updates live, and
// the panel can be dragged aside by its sidebar to watch the change happen behind it.

import { el, icon, confirmDialog, alertDialog } from './ui.js';
import { normalizeUrl, clamp, backgroundImage } from './util.js';
import { CLOCK_FACES } from './widgets.js';
import { setTheme } from './store.js';
import { iconsFor, addSavedIcons, clearSavedIcons } from './icon-cache.js';

const ACCENTS = ['#d97757', '#2563eb', '#10a37f', '#8b5cf6', '#e5484d', '#f5a524'];
const TILE_PRESETS = [
  { label: 'White', color: '#ffffff', textColor: '#202124' },
  { label: 'Dark', color: '#30302e', textColor: '#faf9f5' },
];
const MAX_WALLPAPER_SIDE = 2560;
const BACKUP_FORMAT = 'new-tab-backup';
const OFFSET_KEY = 'newtab:prefs-offset';
const KEEP_VISIBLE = 120;   // px of the panel that stay inside the window while dragging

export function setupPrefs(store) {
  const prefs = () => store.get().prefs;
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
      sub(shown === 'image', imageRows(image)),
      title('Search bar'),
      toggle('Search bar', 'search.enabled', 'Above the tiles. With Google and Claude both on, a switch picks one'),
      sub(p.search.enabled,
        toggle('Google', 'search.google'),
        toggle('Claude', 'search.claude', 'Sends what you type to claude.ai and runs it')),
      title('Top bar'),
      toggle('Sidebar button', 'sidebar.enabled', 'Bookmarks, history and recently closed tabs'),
    ];
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
      title('Layout'),
      slider('Columns', 'columns', 2, 10),
      slider('Width', 'width', 480, 1600, { step: 10, unit: 'px' }),
      slider('Spacing', 'spacing', 0, 40, { unit: 'px' }),
      toggle('Center vertically', 'centerVertically'),
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

  function widgets() {
    const w = prefs().widgets;
    const [near, far] = w.position === 'right' ? ['Right', 'Left'] : ['Left', 'Right'];
    return [
      segmented('Clock side', 'widgets.position', [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }],
        'Markets and GitHub take the other side'),
      title(`${near} column`),
      toggle('Clock', 'widgets.clock.enabled', 'Or use ✎ on the clock to pick a style'),
      sub(w.clock.enabled,
        clockStyle(w.clock.face),
        toggle('24-hour clock', 'widgets.clock.hour24'),
        row('Greeting', el('div', { class: 'btn-row' },
          w.clock.greeting && textField('Your name', 'widgets.clock.name', 'Your name'),
          switchInput('Greeting', 'widgets.clock.greeting')), 'Good morning, and your name')),
      toggle('Tasks', 'widgets.tasks.enabled'),
      toggle('Notes', 'widgets.notes.enabled'),
      toggle('Claude', 'widgets.claude.enabled', 'A box that sends a message to a new chat on claude.ai'),
      title(`${far} column`),
      toggle('Markets', 'widgets.markets.enabled', 'Use ✎ on the widget to choose coins and currency pairs'),
      row('GitHub', el('button', { type: 'button', class: 'btn', onclick: () => show('github') }, 'Settings'),
        `${w.github.enabled ? 'On' : 'Off'} · set up in its own section`),
    ];
  }

  function github() {
    const on = prefs().widgets.github.enabled;
    return [
      // The widget's ✎ and Set up button open this group; an empty Username box gets the cursor.
      group('github',
        title('GitHub'),
        toggle('GitHub widget', 'widgets.github.enabled', 'A year of activity, open pull requests, and your issues and commits'),
        sub(on,
          textInput('Username', 'widgets.github.user', 'NVB20'),
          segmented('Show', 'widgets.github.show', [
            { value: 'commits', label: 'Commits' },
            { value: 'issues', label: 'Issues' },
            { value: 'both', label: 'Both' },
          ], 'Listed under your open pull requests'))),
      on && title('Private repos'),
      on && textInput('Access token (optional)', 'widgets.github.token', 'github_pat_…', {
        type: 'password',
        maxLength: 300,
        hint: 'Only needed for private repos. Kept only in this browser and left out of backups.',
      }),
      on && tokenHelp(),
    ];
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
  function clockStyle(faceId) {
    const face = CLOCK_FACES.find(f => f.id === faceId) ?? CLOCK_FACES[0];
    const font = face.font ?? face.id;
    const lineOf = f => CLOCK_FACES.find(x => x.font === f)?.id;
    const fonts = CLOCK_FACES.filter(f => !f.font).map(f => ({ value: f.id, label: f.label }));
    return [
      row('Style', choice('Clock style', font, fonts, f => setPref('widgets.clock.face', face.font && lineOf(f) ? lineOf(f) : f))),
      lineOf(font) && row('Hours over minutes', switchFor('Hours over minutes', 'clock-stacked', !face.font,
        on => setPref('widgets.clock.face', on ? font : lineOf(font)))),
      !face.stacked && toggle('Colon', 'widgets.clock.colon', '15:41, or 1541 without it'),
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
    state.prefs.widgets.github.token = '';   // a backup file shouldn't carry a credential
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
    const { tasks, taskHistory, taskStats, notes } = store.get();
    store.replace({ ...imported, tasks, taskHistory, taskStats, notes });
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
    { id: 'tiles', label: 'Tiles', icon: 'grid', build: tiles },
    { id: 'widgets', label: 'Widgets', icon: 'layout', build: widgets },
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
  // The sidebar's empty space is the handle for dragging the panel aside.
  const side = el('div', { class: 'prefs-side', title: 'Drag to move · double-click to centre' },
    el('label', { class: 'prefs-search' }, icon('search', 16), search),
    el('h2', { class: 'prefs-side-title', text: 'Preferences' }),
    nav);
  const dialog = el('dialog', { class: 'dlg prefs-dlg', 'aria-label': 'Preferences' }, side, content,
    el('button', { class: 'icon-btn prefs-close', type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('x')));
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

  side.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, .prefs-search')) return;
    e.preventDefault();
    const start = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    const move = ev => place(ev.clientX - start.x, ev.clientY - start.y);
    side.setPointerCapture(e.pointerId);
    side.classList.add('dragging');
    side.addEventListener('pointermove', move);
    side.addEventListener('lostpointercapture', () => {
      side.removeEventListener('pointermove', move);
      side.classList.remove('dragging');
      saveOffset();
    }, { once: true });
  });
  side.addEventListener('dblclick', e => {
    if (e.target.closest('button, .prefs-search')) return;
    place(0, 0);
    saveOffset();
  });
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
        target.scrollIntoView({ block: 'start' });
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
