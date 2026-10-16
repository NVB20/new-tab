// Tile grid for the active group: open, drag to reorder, context menu, add/edit dialog.

import { el, icon, tileIcon, showMenu, openDialog, confirmDialog, field, TILE_MIME } from './ui.js';
import { addTile, updateTile, deleteTile, moveTileToGroup, reorderTile } from './actions.js';
import { openUrl } from './chrome-api.js';
import { normalizeUrl, hostOf } from './util.js';

const isWeb = url => /^https?:/i.test(url);

export function mountGrid(root, store) {
  let dragId = null;

  function tileMenu(e, tile) {
    const others = store.get().groups.filter(g => g.id !== tile.groupId);
    showMenu(e.clientX, e.clientY, [
      { label: 'Open in new tab', icon: 'external', action: () => openUrl(tile.url, { newTab: true }) },
      { label: 'Edit', icon: 'edit', action: () => openTileDialog(store, tile) },
      ...(others.length
        ? [{ separator: true }, { heading: 'Move to' },
          ...others.map(g => ({ label: g.title, icon: 'folder', action: () => store.update(s => moveTileToGroup(s, tile.id, g.id)) }))]
        : []),
      { separator: true },
      {
        label: 'Delete', icon: 'trash', danger: true,
        action: async () => {
          if (await confirmDialog(`Delete “${tile.title}”?`, { title: 'Delete tile', confirmLabel: 'Delete', danger: true })) {
            store.update(s => deleteTile(s, tile.id));
          }
        },
      },
    ]);
  }

  function tileNode(tile, prefs) {
    return el('a', {
      class: 'tile',
      href: tile.url,
      draggable: true,
      dataset: { id: tile.id },
      title: `${tile.title}\n${tile.url}`,
      target: prefs.openInNewTab ? '_blank' : null,
      rel: prefs.openInNewTab ? 'noopener' : null,
      // Pages can't navigate to chrome:// and similar URLs themselves; the tabs API can.
      onclick: e => {
        if (isWeb(tile.url)) return;
        e.preventDefault();
        openUrl(tile.url, { newTab: prefs.openInNewTab || e.ctrlKey || e.metaKey });
      },
      oncontextmenu: e => {
        e.preventDefault();
        tileMenu(e, tile);
      },
    },
      el('div', { class: 'tile-thumb' }, tileIcon(tile.url, tile.icon, tile.title)),
      el('div', { class: 'tile-title', dir: 'auto', text: tile.title }));
  }

  function render() {
    const { tiles, activeGroupId, prefs } = store.get();
    const list = tiles.filter(t => t.groupId === activeGroupId);
    const nodes = list.map(t => tileNode(t, prefs));
    if (prefs.showAddButton) {
      nodes.push(el('button', {
        class: 'tile tile-add',
        type: 'button',
        title: 'Add a tile',
        'aria-label': 'Add a tile',
        onclick: () => openTileDialog(store),
      }, icon('plus', 28)));
    }
    if (!nodes.length) {
      nodes.push(el('p', { class: 'grid-empty', text: 'No tiles in this group. Turn on the + button in Preferences to add some.' }));
    }
    root.replaceChildren(...nodes);
  }

  const clearMarks = () => root.querySelectorAll('.drop-before, .drop-after')
    .forEach(n => n.classList.remove('drop-before', 'drop-after'));

  root.addEventListener('dragstart', e => {
    const tile = e.target.closest?.('.tile[data-id]');
    if (!tile) return;
    dragId = tile.dataset.id;
    e.dataTransfer.setData(TILE_MIME, dragId);
    e.dataTransfer.setData('text/uri-list', tile.href);
    e.dataTransfer.setData('text/plain', tile.href);
    e.dataTransfer.effectAllowed = 'copyMove';
    tile.classList.add('dragging');
  });

  root.addEventListener('dragend', () => {
    dragId = null;
    clearMarks();
    root.querySelector('.dragging')?.classList.remove('dragging');
  });

  root.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearMarks();
    const tile = e.target.closest?.('.tile[data-id]');
    if (!tile || tile.dataset.id === dragId) return;
    const r = tile.getBoundingClientRect();
    tile.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
  });

  root.addEventListener('drop', e => {
    if (!dragId) return;
    e.preventDefault();
    const mark = root.querySelector('.drop-before, .drop-after');
    if (!mark) return;
    const beforeId = mark.classList.contains('drop-after')
      ? (mark.nextElementSibling?.dataset?.id ?? null)
      : mark.dataset.id;
    const id = dragId;
    clearMarks();
    store.update(s => reorderTile(s, id, beforeId));
  });

  store.subscribe(render, ['tiles', 'groups', 'activeGroupId', 'prefs']);
  render();
}

export async function openTileDialog(store, tile = null) {
  const s = store.get();
  const title = el('input', { type: 'text', value: tile?.title ?? '', placeholder: 'Netflix', dir: 'auto', maxLength: 200 });
  const url = el('input', { type: 'text', value: tile?.url ?? '', placeholder: 'netflix.com', inputMode: 'url', autocomplete: 'off', spellcheck: false });
  const iconUrl = el('input', { type: 'text', value: tile?.icon ?? '', placeholder: 'Leave empty to use the site icon', autocomplete: 'off', spellcheck: false });
  const group = el('select', {}, s.groups.map(g => el('option', {
    value: g.id,
    text: g.title,
    selected: g.id === (tile?.groupId ?? s.activeGroupId),
  })));
  const urlHint = el('span', { class: 'field-hint' });
  const iconHint = el('span', { class: 'field-hint' });

  const validate = () => {
    const href = normalizeUrl(url.value);
    const iconOk = !iconUrl.value.trim() || !!normalizeUrl(iconUrl.value);
    urlHint.textContent = url.value.trim() && !href ? 'Enter a valid address, like netflix.com' : '';
    iconHint.textContent = iconOk ? '' : 'Enter a valid image address or leave it empty';
    title.placeholder = href ? hostOf(href) : 'Netflix';
    return !!href && iconOk;
  };

  // When adding, the address comes first so it can be typed straight away.
  const body = tile
    ? [field('Title', title), field('Address', url, urlHint), field('Icon image URL (optional)', iconUrl, iconHint), field('Group', group)]
    : [field('Address', url, urlHint), field('Title', title), field('Icon image URL (optional)', iconUrl, iconHint), field('Group', group)];

  const result = await openDialog({
    title: tile ? 'Edit tile' : 'Add tile',
    body,
    actions: [{ label: 'Cancel', value: null }, { label: tile ? 'Save' : 'Add', primary: true, value: 'save' }],
    validate,
  });
  if (result !== 'save') return;

  const href = normalizeUrl(url.value);
  const data = {
    title: title.value.trim() || hostOf(href),
    url: href,
    icon: iconUrl.value.trim() ? normalizeUrl(iconUrl.value) : '',
  };
  store.update(st => {
    if (!tile) {
      addTile(st, { ...data, groupId: group.value });
      return;
    }
    updateTile(st, tile.id, data);
    moveTileToGroup(st, tile.id, group.value);
  });
}
