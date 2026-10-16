// Folder window: shows a folder's tiles, renames it, reorders inside it, and takes a tile out
// when it is dragged outside the window.

import { el, icon, openDialog, TILE_MIME } from './ui.js';
import { folderChildren, removeFromFolder, dissolveFolder, reorderTile } from './actions.js';

const isOutside = (node, e) => {
  const r = node.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};

// After a tile leaves a folder: an empty folder goes away; with one tile left, ask.
export async function settleFolder(store, folderId, left) {
  if (left === 0) {
    store.update(s => dissolveFolder(s, folderId));
    return;
  }
  if (left !== 1) return;
  const folder = store.get().tiles.find(t => t.id === folderId);
  const choice = await openDialog({
    title: 'One tile left',
    body: [el('p', { class: 'dlg-message', text: `“${folder?.title ?? 'Folder'}” has one tile left. Remove the folder and put the tile in its place, or keep the folder?` })],
    actions: [
      { label: 'Keep folder', value: 'keep' },
      { label: 'Remove folder', primary: true, value: 'remove' },
    ],
  });
  if (choice === 'remove') store.update(s => dissolveFolder(s, folderId));
}

// tileNode(tile, prefs) renders a tile exactly like the main grid does.
export function openFolder(store, folderId, { tileNode, focusName = false }) {
  const folder = store.get().tiles.find(t => t.id === folderId);
  if (!folder) return;

  const nameInput = el('input', {
    type: 'text', class: 'folder-name', value: folder.title, placeholder: 'Folder name', dir: 'auto', maxLength: 60, 'aria-label': 'Folder name',
    oninput: () => store.update(s => {
      const f = s.tiles.find(t => t.id === folderId);
      if (f) f.title = nameInput.value.trim() || 'Folder';
    }),
    onkeydown: e => { if (e.key === 'Enter') nameInput.blur(); },
  });
  const grid = el('div', { class: 'grid folder-grid' });
  const hint = el('p', { class: 'folder-hint', text: 'Drag a tile outside this window to take it out of the folder.' });
  const dialog = el('dialog', { class: 'dlg folder-dlg', 'aria-label': 'Folder' },
    el('div', { class: 'folder-head' },
      icon('folder', 18),
      nameInput,
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('x'))),
    grid,
    hint);

  function render() {
    const s = store.get();
    if (!s.tiles.some(t => t.id === folderId)) {
      dialog.close();
      return;
    }
    grid.replaceChildren(...folderChildren(s, folderId).map(t => tileNode(t, s.prefs)));
  }

  // ---- drag: reorder inside, or drop outside the window to take the tile out ----
  let dragId = null;
  const clearMarks = () => grid.querySelectorAll('.drop-before, .drop-after')
    .forEach(n => n.classList.remove('drop-before', 'drop-after'));
  const setOutside = on => {
    dialog.classList.toggle('drag-out', on);
    hint.textContent = on ? 'Release to take it out of the folder' : 'Drag a tile outside this window to take it out of the folder.';
  };

  grid.addEventListener('dragstart', e => {
    const tile = e.target.closest?.('.tile[data-id]');
    if (!tile) return;
    e.stopPropagation();
    dragId = tile.dataset.id;
    e.dataTransfer.setData(TILE_MIME, dragId);
    e.dataTransfer.effectAllowed = 'move';
    tile.classList.add('dragging');
  });
  dialog.addEventListener('dragend', () => {
    dragId = null;
    clearMarks();
    setOutside(false);
    grid.querySelector('.dragging')?.classList.remove('dragging');
  });
  // Over the backdrop, drag events target the dialog itself, outside its box.
  dialog.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearMarks();
    const outside = isOutside(dialog, e);
    setOutside(outside);
    const tile = !outside && e.target.closest?.('.tile[data-id]');
    if (!tile || tile.dataset.id === dragId) return;
    const r = tile.getBoundingClientRect();
    tile.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
  });
  dialog.addEventListener('drop', async e => {
    if (!dragId) return;
    e.preventDefault();
    const id = dragId;
    if (isOutside(dialog, e)) {
      let left = 0;
      store.update(s => { left = removeFromFolder(s, id); });
      setOutside(false);
      await settleFolder(store, folderId, left);
      return;
    }
    const mark = grid.querySelector('.drop-before, .drop-after');
    if (!mark) return;
    const beforeId = mark.classList.contains('drop-after') ? (mark.nextElementSibling?.dataset?.id ?? null) : mark.dataset.id;
    clearMarks();
    store.update(s => reorderTile(s, id, beforeId));
  });

  dialog.addEventListener('click', e => { if (e.target === dialog && isOutside(dialog, e)) dialog.close(); });
  const unsubscribe = store.subscribe(render, ['tiles', 'prefs']);
  dialog.addEventListener('close', () => {
    unsubscribe();
    dialog.remove();
  });

  document.body.append(dialog);
  render();
  dialog.showModal();
  if (focusName) {
    nameInput.focus();
    nameInput.select();
  } else {
    dialog.querySelector('.icon-btn')?.focus();
  }
}
