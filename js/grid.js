// A tiles block: the tiles of one group (the active one, or a pinned group). Open, drag to
// reorder, drop a tile on another to make a folder, drag a tile to another block to move it there,
// context menu, add/edit dialog.

import { el, icon, tileIcon, showMenu, openDialog, confirmDialog, field, TILE_MIME, tileDrag } from './ui.js';
import {
  addTile, updateTile, deleteTile, moveTileToGroup, reorderTile,
  isFolder, topLevel, createFolder, addToFolder, removeFromFolder, dissolveFolder,
} from './actions.js';
import { openFolder, settleFolder } from './folders.js';
import { openUrl } from './chrome-api.js';
import { normalizeUrl, hostOf } from './util.js';
import { copyById, TYPES } from './layout.js';

const isWeb = url => /^https?:/i.test(url);
const MARKS = ['drop-before', 'drop-after', 'drop-into'];
// The only prefs the tiles themselves use; the rest are CSS variables set by theme.js.
const tilePrefs = p => `${p.showAddButton}|${p.openInNewTab}|${p.tiles.icons}`;

export function mountTiles(root, store, copy, ctx) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.tiles.defaults();
  // The group shown: the pinned one, or whichever tab is active.
  const groupId = () => settings().group ?? store.get().activeGroupId;

  const headTitle = el('span');
  const heading = el('h2', { class: 'widget-head tiles-head', hidden: true }, icon('grid', 18), headTitle);
  const grid = el('div', { class: 'grid' });
  const wrap = el('div', { class: 'grid-wrap' }, grid);
  const section = el('section', { class: 'widget widget-tiles' }, heading, wrap);
  root.append(section);

  let canNest = false;
  let marked = null;   // the tile showing a drop mark
  let shown = '';

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
  function folderNode(folder, prefs, kids) {
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

  // kids: a folder's tiles (only used for folders).
  function tileNode(tile, prefs, kids = []) {
    if (isFolder(tile)) return folderNode(tile, prefs, kids);
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

  // What the block looks like apart from its tiles: redrawn only when this changes.
  function key(state) {
    const s = settings();
    const group = state.groups.find(g => g.id === s.group);
    return [tilePrefs(state.prefs), s.group, s.columns, group?.title ?? '', s.group ? '' : state.activeGroupId].join('|');
  }

  function render() {
    const state = store.get();
    const { tiles, prefs } = state;
    const s = settings();
    const gid = groupId();
    const group = state.groups.find(g => g.id === s.group);
    shown = key(state);
    heading.hidden = !group;
    headTitle.textContent = group?.title ?? '';
    wrap.style.setProperty('--cols', String(s.columns));

    const kids = Map.groupBy(tiles.filter(t => t.folderId), t => t.folderId);
    const nodes = topLevel({ tiles }, gid).map(t => tileNode(t, prefs, kids.get(t.id)));
    if (prefs.showAddButton) {
      nodes.push(el('button', {
        class: 'tile tile-add',
        type: 'button',
        title: 'Add a tile',
        'aria-label': 'Add a tile',
        onclick: () => openTileDialog(store, null, gid),
      }, icon('plus', 28)));
    }
    if (!nodes.length) {
      nodes.push(el('p', { class: 'grid-empty', text: 'No tiles in this group. Turn on the + button in Preferences to add some.' }));
    }
    grid.replaceChildren(...nodes);
    fadeSoon();
  }

  // A soft fade along the bottom edge while there are more rows below. After a redraw it's measured
  // in the next frame, once every widget is on the page, rather than forcing a layout mid-mount.
  const fade = () => wrap.classList.toggle('more-below', wrap.scrollTop + wrap.clientHeight < wrap.scrollHeight - 2);
  let fadeFrame = 0;
  const fadeSoon = () => {
    fadeFrame ||= requestAnimationFrame(() => {
      fadeFrame = 0;
      fade();
    });
  };
  wrap.addEventListener('scroll', fade, { passive: true });
  const sizes = new ResizeObserver(fade);
  sizes.observe(wrap);

  const clearMarks = () => {
    marked?.classList.remove(...MARKS);
    marked = null;
  };

  grid.addEventListener('dragstart', e => {
    const tile = e.target.closest?.('.tile[data-id]');
    if (!tile) return;
    tileDrag.id = tile.dataset.id;
    // Folders can't go inside folders.
    tileDrag.folder = tile.classList.contains('tile-folder');
    e.dataTransfer.setData(TILE_MIME, tileDrag.id);
    if (tile.href) {
      e.dataTransfer.setData('text/uri-list', tile.href);
      e.dataTransfer.setData('text/plain', tile.href);
    }
    e.dataTransfer.effectAllowed = 'copyMove';
    tile.classList.add('dragging');
  });

  grid.addEventListener('dragend', () => {
    tileDrag.id = null;
    clearMarks();
    grid.querySelector('.dragging')?.classList.remove('dragging');
  });

  grid.addEventListener('dragover', e => {
    if (!tileDrag.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearMarks();
    const tile = e.target.closest?.('.tile[data-id]');
    if (!tile || tile.dataset.id === tileDrag.id) return;
    canNest = !tileDrag.folder;
    // Edges reorder; the middle drops the tile into the target (making a folder if needed).
    const r = tile.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (canNest && x > 0.28 && x < 0.72) tile.classList.add('drop-into');
    else tile.classList.add(x < 0.5 ? 'drop-before' : 'drop-after');
    marked = tile;
  });

  // Also leaving the block clears its marks (the drop may land in another block).
  grid.addEventListener('dragleave', e => {
    if (!grid.contains(e.relatedTarget)) clearMarks();
  });

  grid.addEventListener('drop', e => {
    const id = tileDrag.id;
    if (!id) return;
    e.preventDefault();
    const mark = marked;
    const gid = groupId();
    clearMarks();
    const fromOtherGroup = store.get().tiles.find(t => t.id === id)?.groupId !== gid;
    if (!mark) {
      // Dropped on the block's empty space: a tile from another group moves here, last.
      if (fromOtherGroup) store.update(s => moveTileToGroup(s, id, gid));
      return;
    }
    const targetId = mark.dataset.id;
    const into = mark.classList.contains('drop-into');
    const after = mark.classList.contains('drop-after');
    if (into) {
      if (mark.classList.contains('tile-folder')) {
        store.update(s => addToFolder(s, id, targetId));
        return;
      }
      let folder = null;
      store.update(s => { folder = createFolder(s, targetId, id); });
      if (folder) open(folder, true);   // name it right away
      return;
    }
    const beforeId = after ? (mark.nextElementSibling?.dataset?.id ?? null) : targetId;
    store.update(s => {
      if (fromOtherGroup) moveTileToGroup(s, id, gid);
      reorderTile(s, id, beforeId);
    });
  });

  const unsubscribe = store.subscribe((s, changed) => {
    if (changed.every(k => k === 'prefs' || k === 'activeGroupId' || k === 'groups') && key(s) === shown) return;
    render();
  }, ['tiles', 'groups', 'activeGroupId', 'prefs']);
  render();

  return {
    destroy() {
      unsubscribe();
      sizes.disconnect();
      cancelAnimationFrame(fadeFrame);
    },
  };
}

// groupId: the group a new tile goes to by default (the block's group).
export async function openTileDialog(store, tile = null, groupId = null) {
  const s = store.get();
  const title = el('input', { type: 'text', value: tile?.title ?? '', placeholder: 'Netflix', dir: 'auto', maxLength: 200 });
  const url = el('input', { type: 'text', value: tile?.url ?? '', placeholder: 'netflix.com', inputMode: 'url', autocomplete: 'off', spellcheck: false });
  const iconUrl = el('input', { type: 'text', value: tile?.icon ?? '', placeholder: 'Leave empty to use the site icon', autocomplete: 'off', spellcheck: false });
  const group = el('select', {}, s.groups.map(g => el('option', {
    value: g.id,
    text: g.title,
    selected: g.id === (tile?.groupId ?? groupId ?? s.activeGroupId),
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
