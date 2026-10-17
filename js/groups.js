// Group tabs in the header: switch, add, rename, delete, drag to reorder, drop target for tiles,
// and a layout of the tab's own.

import { el, icon, showMenu, askText, askChoice, confirmDialog, alertDialog, TILE_MIME, GROUP_MIME } from './ui.js';
import { addGroup, renameGroup, deleteGroup, reorderGroups, moveTileToGroup } from './actions.js';
import { ownLayout, giveOwnLayout, dropOwnLayout } from './layout.js';

// Gives a tab its own layout, starting from a copy of the main one or an empty page, shows the
// tab and calls then() (Layout mode, to fill it). Resolves true when it did.
export async function askOwnLayout(store, group, then) {
  const from = await askChoice({
    title: `Own layout for “${group.title}”`,
    message: `“${group.title}” shows the main layout, like every tab. Give it one of its own, starting from an empty page or a copy of the main layout?`,
    choices: [
      { label: 'Empty page', value: 'empty' },
      { label: 'Copy of the main', primary: true, value: 'copy' },
    ],
  });
  if (!from) return false;
  store.update(s => {
    giveOwnLayout(s, group.id, from);
    s.activeGroupId = group.id;
  });
  then?.();
  return true;
}

export async function askMainLayout(store, group) {
  const ok = await confirmDialog(`“${group.title}” goes back to the main layout, and its own layout is deleted.`,
    { title: 'Use the main layout', confirmLabel: 'Use the main layout', danger: true });
  if (ok) store.update(s => { dropOwnLayout(s, group.id); });
  return ok;
}

// ctx: { enterLayout() }, for a tab given its own layout.
export function mountGroups(root, store, ctx = {}) {
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
    const layoutToo = ownLayout(s, group.id) ? ' Its own layout goes too.' : '';
    if (!count) {
      if (await confirmDialog(`Delete the group “${group.title}”?${layoutToo}`, { title: 'Delete group', confirmLabel: 'Delete', danger: true })) {
        store.update(st => deleteGroup(st, group.id, 'delete'));
      }
      return;
    }
    const mode = await askChoice({
      title: 'Delete group',
      message: `“${group.title}” has ${count} tile${count === 1 ? '' : 's'}. Move them to “${first.title}”, or delete them too?${layoutToo}`,
      choices: [
        { label: 'Delete tiles', danger: true, value: 'delete' },
        { label: `Move to ${first.title}`, primary: true, value: 'move' },
      ],
    });
    if (mode) store.update(st => deleteGroup(st, group.id, mode));
  }

  // What the tabs were last drawn from: a prefs change that doesn't give or take a tab's own
  // layout leaves them alone.
  let drawn = '';

  function render(state) {
    const { groups, activeGroupId } = state;
    const next = JSON.stringify([groups, activeGroupId, Object.keys(state.prefs.layouts ?? {})]);
    if (next === drawn) return;
    drawn = next;
    root.replaceChildren(
      ...groups.map(g => el('button', {
        class: 'group-tab' + (g.id === activeGroupId ? ' active' : '') + (ownLayout(state, g.id) ? ' own-layout' : ''),
        type: 'button',
        draggable: true,
        dir: 'auto',
        dataset: { id: g.id },
        'aria-current': g.id === activeGroupId ? 'page' : null,
        title: ownLayout(state, g.id) ? `${g.title} has its own layout` : null,
        onclick: () => store.update(s => { s.activeGroupId = g.id; }),
        ondblclick: () => rename(g),
        oncontextmenu: e => {
          e.preventDefault();
          const own = !!ownLayout(store.get(), g.id);
          showMenu(e.clientX, e.clientY, [
            { label: 'Rename', icon: 'edit', action: () => rename(g) },
            { label: 'New group', icon: 'plus', action: create },
            own
              ? { label: 'Use the main layout', icon: 'layout', action: () => askMainLayout(store, g) }
              : { label: 'Own layout…', icon: 'layout', action: () => askOwnLayout(store, g, ctx.enterLayout) },
            { separator: true },
            { label: 'Delete group', icon: 'trash', danger: true, action: () => remove(g) },
          ]);
        },
      }, g.title, ownLayout(state, g.id) ? icon('layout', 13) : null)),
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

  store.subscribe(render, ['groups', 'activeGroupId', 'prefs']);
  render(store.get());
  return { create };
}
