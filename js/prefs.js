// Preferences modal. Every control writes straight to the store, so the page updates live.

import { el, icon, field, confirmDialog, alertDialog } from './ui.js';
import { normalizeUrl } from './util.js';
import { fromSpeedDial2 } from './importer.js';

const ACCENTS = ['#d97757', '#2563eb', '#10a37f', '#8b5cf6', '#e5484d', '#f5a524'];
const TILE_PRESETS = [
  { label: 'White tiles', color: '#ffffff', textColor: '#202124' },
  { label: 'Dark tiles', color: '#30302e', textColor: '#faf9f5' },
];
const MAX_WALLPAPER_SIDE = 2560;
const BACKUP_FORMAT = 'new-tab-backup';

export function setupPrefs(store) {
  const getPref = path => path.split('.').reduce((o, k) => o[k], store.get().prefs);
  const setPref = (path, value) => store.update(s => {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], s.prefs)[last] = value;
  });

  // ---- control builders ----

  const title = text => el('h3', { class: 'pref-section-title', text });

  const row = (label, control, hint) => el('div', { class: 'pref-row' },
    el('div', { class: 'pref-text' }, el('div', { text: label }), hint && el('div', { class: 'pref-hint', text: hint })),
    control);

  function toggle(label, path, hint) {
    const input = el('input', {
      type: 'checkbox', class: 'switch', role: 'switch', checked: getPref(path), 'aria-label': label,
      onchange: () => setPref(path, input.checked),
    });
    return row(label, input, hint);
  }

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

  function segmented(label, path, options) {
    const buttons = options.map(o => el('button', {
      type: 'button',
      'aria-pressed': String(getPref(path) === o.value),
      onclick: () => {
        setPref(path, o.value);
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === o.value)));
      },
    }, o.icon && icon(o.icon, 16), el('span', { text: o.label })));
    return row(label, el('div', { class: 'seg', role: 'group', 'aria-label': label }, buttons));
  }

  function color(label, path) {
    const input = el('input', { type: 'color', value: getPref(path), 'aria-label': label, oninput: () => setPref(path, input.value) });
    return row(label, input);
  }

  function textInput(label, path, placeholder) {
    const input = el('input', {
      type: 'text', class: 'pref-input', value: getPref(path), placeholder, dir: 'auto', maxLength: 60, 'aria-label': label,
      oninput: () => setPref(path, input.value),
    });
    return row(label, input);
  }

  // ---- sections ----

  function general() {
    return [
      title('Layout'),
      segmented('Theme', 'theme', [
        { value: 'auto', label: 'Auto', icon: 'auto' },
        { value: 'light', label: 'Light', icon: 'sun' },
        { value: 'dark', label: 'Dark', icon: 'moon' },
      ]),
      slider('Number of columns', 'columns', 2, 10),
      slider('Spacing', 'spacing', 0, 40, { unit: 'px' }),
      slider('Width', 'width', 480, 1600, { step: 10, unit: 'px' }),
      toggle('Center vertically', 'centerVertically'),
      toggle('Show + button', 'showAddButton'),
      toggle('Compact layout', 'compact', 'Shorter tiles'),
      toggle('Open tiles in a new tab', 'openInNewTab', 'Ctrl+click or middle-click always opens a new tab'),
      toggle('Sidebar button', 'sidebar.enabled', 'Bookmarks, history and recently closed tabs'),
      el('p', { class: 'pref-footnote', text: 'Ctrl+K or / opens Jump. Right-click a tile or group for more options; drag tiles to reorder or onto a group to move them.' }),
    ];
  }

  function appearance() {
    const swatches = ACCENTS.map(c => el('button', {
      type: 'button', class: 'swatch', title: c, 'aria-label': `Accent ${c}`,
      'aria-pressed': String(getPref('accent') === c),
      style: `background:${c}`,
      onclick: () => { setPref('accent', c); show('appearance'); },
    }));
    const custom = el('input', { type: 'color', value: getPref('accent'), 'aria-label': 'Custom accent colour', oninput: () => setPref('accent', custom.value) });

    const bg = store.get().prefs.background;
    const source = bg.useUpload && store.wallpaper ? 'Uploaded image' : bg.url ? 'Image from a link' : 'Theme colour (no wallpaper)';
    const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: () => uploadWallpaper(fileInput.files[0]) });
    const urlInput = el('input', { type: 'text', class: 'pref-input wide', value: bg.url, placeholder: 'https://… image link', spellcheck: false, autocomplete: 'off' });
    const urlHint = el('div', { class: 'field-hint' });
    const applyUrl = () => {
      const raw = urlInput.value.trim();
      if (!raw) return;
      const href = normalizeUrl(raw);
      if (!href) {
        urlHint.textContent = 'That doesn’t look like a link.';
        return;
      }
      store.update(s => {
        s.prefs.background.url = href;
        s.prefs.background.useUpload = false;
      });
      show('appearance');
    };
    urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyUrl(); });

    return [
      title('Accent'),
      row('Accent colour', el('div', { class: 'swatches' }, swatches, custom)),
      title('Background'),
      row('Wallpaper', el('div', { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, icon('upload', 16), 'Upload image'),
        el('button', { type: 'button', class: 'btn', onclick: clearWallpaper }, 'Remove'),
        fileInput), source),
      el('div', { class: 'pref-row pref-stack' },
        el('div', { text: 'Or use an image link' }),
        el('div', { class: 'btn-row' }, urlInput, el('button', { type: 'button', class: 'btn', onclick: applyUrl }, 'Apply')),
        urlHint),
      slider('Blur', 'background.blur', 0, 20, { unit: 'px' }),
      slider('Dim', 'background.dim', 0, 80, { unit: '%' }),
    ];
  }

  function tiles() {
    return [
      title('Tiles'),
      slider('Corner radius', 'tiles.radius', 0, 24, { unit: 'px' }),
      toggle('Show titles', 'tiles.showTitle'),
      color('Tile colour', 'tiles.color'),
      color('Title colour', 'tiles.textColor'),
      row('Presets', el('div', { class: 'btn-row' }, TILE_PRESETS.map(p => el('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          store.update(s => Object.assign(s.prefs.tiles, { color: p.color, textColor: p.textColor }));
          show('tiles');
        },
      }, p.label)))),
    ];
  }

  function widgets() {
    return [
      title('Widgets'),
      toggle('Show widgets', 'widgets.enabled'),
      segmented('Position', 'widgets.position', [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]),
      title('Clock'),
      toggle('Clock', 'widgets.clock.enabled'),
      textInput('Your name', 'widgets.clock.name', 'Niv'),
      toggle('24-hour clock', 'widgets.clock.hour24'),
      toggle('Greeting', 'widgets.clock.greeting'),
      title('Lists'),
      toggle('Tasks', 'widgets.tasks.enabled'),
      toggle('Notes', 'widgets.notes.enabled'),
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
      store.update(s => { s.prefs.background.useUpload = true; });
      show('appearance');
    } catch (err) {
      alertDialog(`Couldn’t use that image: ${err.message}`);
    }
  }

  async function clearWallpaper() {
    await store.setWallpaper('');
    store.update(s => {
      s.prefs.background.useUpload = false;
      s.prefs.background.url = '';
    });
    show('appearance');
  }

  function exportBackup() {
    const payload = { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), state: store.get(), wallpaper: store.wallpaper };
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
      show('backup');
      return;
    }

    let imported;
    try {
      imported = fromSpeedDial2(json);
    } catch (err) {
      alertDialog(`${err.message} Use a backup from this page or a Speed Dial 2 export.`, 'Import failed');
      return;
    }
    const message = `Import ${imported.tiles.length} tiles in ${imported.groups.length} group${imported.groups.length === 1 ? '' : 's'} from Speed Dial 2? This replaces your current tiles, groups and settings. Tasks and notes are kept.`;
    if (!await confirmDialog(message, { title: 'Import from Speed Dial 2', confirmLabel: 'Import' })) return;
    const { tasks, notes } = store.get();
    store.replace({ ...imported, tasks, notes });
    show('backup');
  }

  async function resetAll() {
    if (!await confirmDialog('This deletes all tiles, groups, settings, tasks, notes and the wallpaper. Download a backup first if you might want them back.', { title: 'Reset everything?', confirmLabel: 'Reset', danger: true })) return;
    store.replace(null);
    await store.setWallpaper('');
    show('general');
  }

  // ---- modal ----

  const sections = [
    { id: 'general', label: 'General', icon: 'sliders', build: general },
    { id: 'appearance', label: 'Appearance', icon: 'palette', build: appearance },
    { id: 'tiles', label: 'Tiles', icon: 'grid', build: tiles },
    { id: 'widgets', label: 'Widgets', icon: 'layout', build: widgets },
    { id: 'backup', label: 'Backup', icon: 'database', build: backup },
  ];
  let current = 'general';

  const nav = el('nav', { class: 'prefs-nav', 'aria-label': 'Preference sections' });
  const content = el('div', { class: 'prefs-content' });
  const dialog = el('dialog', { class: 'dlg prefs-dlg', 'aria-label': 'Preferences' },
    el('div', { class: 'prefs-head' },
      el('h2', { text: 'Preferences' }),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('x'))),
    el('div', { class: 'prefs-body' }, nav, content));
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);

  function show(id) {
    current = id;
    nav.replaceChildren(...sections.map(s => el('button', {
      type: 'button',
      'aria-current': String(s.id === id),
      onclick: () => show(s.id),
    }, icon(s.icon, 17), el('span', { text: s.label }))));
    const scroll = content.scrollTop;
    content.replaceChildren(...sections.find(s => s.id === id).build());
    content.scrollTop = scroll;
  }

  return {
    open(id = current) {
      show(id);
      dialog.showModal();
      content.scrollTop = 0;
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
