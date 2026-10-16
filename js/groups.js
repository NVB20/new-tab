// Group tabs in the header: switch, add, rename, delete, drag to reorder, and drop target for tiles.

import { el, icon, showMenu, askText, askChoice, confirmDialog, alertDialog, TILE_MIME, GROUP_MIME } from './ui.js';
import { addGroup, renameGroup, deleteGroup, reorderGroups, moveTileToGroup } from './actions.js';

export function mountGroups(root, store) {
  async function create() {
    const title = await askText({ title: 'New group', label: 'Name', placeholder: 'Work', confirmLabel: 'Create' });
    if (title) store.update(s => addGroup(s, title));
  }

  async function rename(group) {
    const title = await askText({ title: 'Rename group', label: 'Name', value: group.title });
    if (title) store.update(s => renameGroup(s, group.id, title));
  }

  async function remove(group) {
    const s = store.get();
    if (s.groups.length <= 1) {
      alertDialog('You need at least one group.', 'Can’t delete the last group');
      return;
    }
    const count = s.tiles.filter(t => t.groupId === group.id).length;
    const first = s.groups.find(g => g.id !== group.id);
    if (!count) {
      if (await confirmDialog(`Delete the group “${group.title}”?`, { title: 'Delete group', confirmLabel: 'Delete', danger: true })) {
        store.update(st => deleteGroup(st, group.id, 'delete'));
      }
      return;
    }
    const mode = await askChoice({
      title: 'Delete group',
      message: `“${group.title}” has ${count} tile${count === 1 ? '' : 's'}. Move them to “${first.title}”, or delete them too?`,
      choices: [
        { label: 'Delete tiles', danger: true, value: 'delete' },
        { label: `Move to ${first.title}`, primary: true, value: 'move' },
      ],
    });
    if (mode) store.update(st => deleteGroup(st, group.id, mode));
  }

  function render() {
    const { groups, activeGroupId } = store.get();
    root.replaceChildren(
      ...groups.map(g => el('button', {
        class: 'group-tab' + (g.id === activeGroupId ? ' active' : ''),
        type: 'button',
        draggable: true,
        dir: 'auto',
        dataset: { id: g.id },
        'aria-current': g.id === activeGroupId ? 'page' : null,
        text: g.title,
        onclick: () => store.update(s => { s.activeGroupId = g.id; }),
        ondblclick: () => rename(g),
        oncontextmenu: e => {
          e.preventDefault();
          showMenu(e.clientX, e.clientY, [
            { label: 'Rename', icon: 'edit', action: () => rename(g) },
            { label: 'New group', icon: 'plus', action: create },
            { separator: true },
            { label: 'Delete group', icon: 'trash', danger: true, action: () => remove(g) },
          ]);
        },
      })),
      el('button', { class: 'group-add icon-btn', type: 'button', title: 'New group', 'aria-label': 'New group', onclick: create }, icon('plus', 16)),
    );
  }

  let marked = null;   // the tab showing a drop mark
  const clearMarks = () => {
    marked?.classList.remove('drop-target', 'drop-before', 'drop-after');
    marked = null;
  };
  const tabAt = e => e.target.closest?.('.group-tab');
  const isAfter = (tab, e) => {
    const r = tab.getBoundingClientRect();
    return e.clientX > r.left + r.width / 2;
  };

  root.addEventListener('dragstart', e => {
    const tab = tabAt(e);
    if (!tab) return;
    e.dataTransfer.setData(GROUP_MIME, tab.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
  });

  root.addEventListener('dragover', e => {
    const tab = tabAt(e);
    const types = e.dataTransfer.types;
    if (!tab || !(types.includes(TILE_MIME) || types.includes(GROUP_MIME))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearMarks();
    if (types.includes(TILE_MIME)) tab.classList.add('drop-target');
    else tab.classList.add(isAfter(tab, e) ? 'drop-after' : 'drop-before');
    marked = tab;
  });

  root.addEventListener('dragleave', e => {
    if (!root.contains(e.relatedTarget)) clearMarks();
  });
  root.addEventListener('dragend', clearMarks);

  root.addEventListener('drop', e => {
    const tab = tabAt(e);
    clearMarks();
    if (!tab) return;
    e.preventDefault();
    const tileId = e.dataTransfer.getData(TILE_MIME);
    const groupId = e.dataTransfer.getData(GROUP_MIME);
    if (tileId) {
      store.update(s => moveTileToGroup(s, tileId, tab.dataset.id));
    } else if (groupId) {
      const beforeId = isAfter(tab, e) ? (tab.nextElementSibling?.dataset.id ?? null) : tab.dataset.id;
      store.update(s => reorderGroups(s, groupId, beforeId));
    }
  });

  store.subscribe(render, ['groups', 'activeGroupId']);
  render();
  return { create };
}
