// Tile grid for the active group: open, drag to reorder, drop a tile on another to make a folder,
// context menu, add/edit dialog.

import { el, icon, tileIcon, showMenu, openDialog, confirmDialog, field, TILE_MIME } from './ui.js';
import {
  addTile, updateTile, deleteTile, moveTileToGroup, reorderTile,
  isFolder, folderChildren, topLevel, createFolder, addToFolder, removeFromFolder, dissolveFolder,
} from './actions.js';
import { openFolder, settleFolder } from './folders.js';
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
      ...(tile.folderId
        ? [{
          label: 'Move out of folder', icon: 'folder',
          action: () => {
            const folderId = tile.folderId;
            let left = 0;
            store.update(s => { left = removeFromFolder(s, tile.id); });
            settleFolder(store, folderId, left);
          },
        }]
        : []),
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

  function folderMenu(e, folder) {
    const others = store.get().groups.filter(g => g.id !== folder.groupId);
    showMenu(e.clientX, e.clientY, [
      { label: 'Open', icon: 'folder', action: () => open(folder) },
      { label: 'Rename', icon: 'edit', action: () => open(folder, true) },
      ...(others.length
        ? [{ separator: true }, { heading: 'Move to' },
          ...others.map(g => ({ label: g.title, icon: 'folder', action: () => store.update(s => moveTileToGroup(s, folder.id, g.id)) }))]
        : []),
      { separator: true },
      { label: 'Remove folder (keep tiles)', icon: 'trash', danger: true, action: () => store.update(s => dissolveFolder(s, folder.id)) },
    ]);
  }

  const open = (folder, focusName = false) => openFolder(store, folder.id, { tileNode, focusName });

  // A folder shows up to four of its tiles' icons in a rounded box.
  function folderNode(folder, prefs) {
    const kids = folderChildren(store.get(), folder.id);
    return el('div', {
      class: 'tile tile-folder',
      role: 'button',
      tabIndex: 0,
      draggable: true,
      dataset: { id: folder.id },
      title: `${folder.title} (${kids.length} tile${kids.length === 1 ? '' : 's'})`,
      onclick: () => open(folder),
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(folder); } },
      oncontextmenu: e => {
        e.preventDefault();
        folderMenu(e, folder);
      },
    },
      el('div', { class: 'tile-thumb' },
        el('div', { class: 'folder-thumb' }, kids.slice(0, 4).map(k => el('span', { class: 'folder-cell' },
          tileIcon(k.url, k.icon, k.title, { mini: true, preferSite: prefs.tiles.icons === 'site' }))))),
      el('div', { class: 'tile-title', dir: 'auto', text: folder.title }));
  }

  function tileNode(tile, prefs) {
    if (isFolder(tile)) return folderNode(tile, prefs);
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
      el('div', { class: 'tile-thumb' }, tileIcon(tile.url, tile.icon, tile.title, { preferSite: prefs.tiles.icons === 'site' })),
      el('div', { class: 'tile-title', dir: 'auto', text: tile.title }));
  }

  function render() {
    const { tiles, activeGroupId, prefs } = store.get();
    const list = topLevel({ tiles }, activeGroupId);
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

  const clearMarks = () => root.querySelectorAll('.drop-before, .drop-after, .drop-into')
    .forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-into'));

  root.addEventListener('dragstart', e => {
    const tile = e.target.closest?.('.tile[data-id]');
    if (!tile) return;
    dragId = tile.dataset.id;
    e.dataTransfer.setData(TILE_MIME, dragId);
    if (tile.href) {
      e.dataTransfer.setData('text/uri-list', tile.href);
      e.dataTransfer.setData('text/plain', tile.href);
    }
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
    // Edges reorder; the middle drops the tile into the target (making a folder if needed).
    // Folders can't go inside folders.
    const r = tile.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const dragged = store.get().tiles.find(t => t.id === dragId);
    const canNest = !isFolder(dragged);
    if (canNest && x > 0.28 && x < 0.72) tile.classList.add('drop-into');
    else tile.classList.add(x < 0.5 ? 'drop-before' : 'drop-after');
  });

  root.addEventListener('drop', e => {
    if (!dragId) return;
    e.preventDefault();
    const into = root.querySelector('.drop-into');
    if (into) {
      const id = dragId;
      const targetId = into.dataset.id;
      clearMarks();
      const target = store.get().tiles.find(t => t.id === targetId);
      if (isFolder(target)) {
        store.update(s => addToFolder(s, id, targetId));
        return;
      }
      let folder = null;
      store.update(s => { folder = createFolder(s, targetId, id); });
      if (folder) open(folder, true);   // name it right away
      return;
    }
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
