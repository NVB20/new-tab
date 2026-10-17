// State mutations for tiles and groups. Called inside store.update(); pure (unit-tested in Node).
// Tile order only matters within a group, so tiles of different groups may interleave in the array.

import { uid } from './util.js';

export function addTile(s, { title, url, icon = '', groupId }) {
  const tile = { id: uid(), groupId: groupId ?? s.activeGroupId, title, url, icon };
  s.tiles.push(tile);
  return tile;
}

export function updateTile(s, id, patch) {
  const tile = s.tiles.find(t => t.id === id);
  if (tile) Object.assign(tile, patch);
}

// Deleting a folder keeps its tiles; deleting a folder's last tile removes the empty folder.
export function deleteTile(s, id) {
  const tile = s.tiles.find(t => t.id === id);
  if (!tile) return;
  if (isFolder(tile)) {
    dissolveFolder(s, id);
    return;
  }
  s.tiles = s.tiles.filter(t => t.id !== id);
  if (tile.folderId) dropIfEmpty(s, tile.folderId);
}

// A folder moves with its tiles; a tile inside a folder leaves the folder.
export function moveTileToGroup(s, id, groupId) {
  const i = s.tiles.findIndex(t => t.id === id);
  if (i < 0 || s.tiles[i].groupId === groupId || !s.groups.some(g => g.id === groupId)) return;
  const tile = s.tiles[i];
  if (tile.folderId) removeFromFolder(s, id);
  const moving = new Set(isFolder(tile) ? [tile, ...folderChildren(s, tile.id)] : [tile]);
  s.tiles = s.tiles.filter(t => !moving.has(t));
  moving.forEach(t => { t.groupId = groupId; });
  s.tiles.push(...moving);
}

// ---- folders ----
// A folder is a tile with kind 'folder' (no url); its tiles carry folderId and keep their own
// order in the array. Folders hold plain tiles only, never other folders.

export const isFolder = t => t?.kind === 'folder';

export function folderChildren(s, folderId) {
  return s.tiles.filter(t => t.folderId === folderId);
}

// Tiles shown on the group's grid: plain tiles and folders, not the tiles inside folders.
export function topLevel(s, groupId) {
  return s.tiles.filter(t => t.groupId === groupId && !t.folderId);
}

function dropIfEmpty(s, folderId) {
  if (!folderChildren(s, folderId).length) s.tiles = s.tiles.filter(t => t.id !== folderId);
}

// Dropping `draggedId` onto `targetId` makes a folder where the target was, holding both.
export function createFolder(s, targetId, draggedId, title = 'Folder') {
  const target = s.tiles.find(t => t.id === targetId);
  const dragged = s.tiles.find(t => t.id === draggedId);
  if (!target || !dragged || target === dragged || isFolder(target) || isFolder(dragged) || target.folderId) return null;
  if (dragged.folderId) removeFromFolder(s, draggedId);
  const folder = { id: uid(), groupId: target.groupId, kind: 'folder', title, url: '', icon: '' };
  target.folderId = folder.id;
  dragged.folderId = folder.id;
  dragged.groupId = target.groupId;
  const rest = s.tiles.filter(t => t !== dragged);
  rest.splice(rest.indexOf(target), 1, folder, target, dragged);
  s.tiles = rest;
  return folder;
}

export function addToFolder(s, tileId, folderId) {
  const tile = s.tiles.find(t => t.id === tileId);
  const folder = s.tiles.find(t => t.id === folderId);
  if (!tile || !isFolder(folder) || isFolder(tile) || tile.folderId === folderId) return;
  if (tile.folderId) removeFromFolder(s, tileId);
  tile.folderId = folderId;
  tile.groupId = folder.groupId;
  s.tiles = [...s.tiles.filter(t => t !== tile), tile];
}

// Takes a tile out of its folder and puts it right after the folder. Returns the tiles left.
export function removeFromFolder(s, tileId) {
  const tile = s.tiles.find(t => t.id === tileId);
  if (!tile?.folderId) return 0;
  const folderId = tile.folderId;
  delete tile.folderId;
  const rest = s.tiles.filter(t => t !== tile);
  const at = rest.findIndex(t => t.id === folderId);
  rest.splice(at < 0 ? rest.length : at + 1, 0, tile);
  s.tiles = rest;
  return folderChildren(s, folderId).length;
}

// Removes a folder and puts its tiles, in order, where the folder was.
export function dissolveFolder(s, folderId) {
  const children = folderChildren(s, folderId);
  const rest = s.tiles.filter(t => t.folderId !== folderId);
  children.forEach(t => { delete t.folderId; });
  const at = rest.findIndex(t => t.id === folderId);
  if (at >= 0) rest.splice(at, 1, ...children);
  s.tiles = rest;
}

// Places tile `id` right before tile `beforeId`; null puts it last in its group.
export function reorderTile(s, id, beforeId) {
  const tile = s.tiles.find(t => t.id === id);
  if (!tile || id === beforeId) return;
  const rest = s.tiles.filter(t => t.id !== id);
  const at = beforeId == null ? -1 : rest.findIndex(t => t.id === beforeId);
  if (at >= 0) {
    rest.splice(at, 0, tile);
  } else {
    const last = rest.findLastIndex(t => t.groupId === tile.groupId);
    rest.splice(last + 1, 0, tile);
  }
  s.tiles = rest;
}

export function addGroup(s, title) {
  const group = { id: uid(), title };
  s.groups.push(group);
  s.activeGroupId = group.id;
  return group;
}

export function renameGroup(s, id, title) {
  const group = s.groups.find(g => g.id === id);
  if (group) group.title = title;
}

// mode 'move' sends the group's tiles to the end of the first remaining group; 'delete' drops them.
export function deleteGroup(s, id, mode = 'move') {
  if (s.groups.length <= 1) return false;
  s.groups = s.groups.filter(g => g.id !== id);
  const target = s.groups[0].id;
  const own = s.tiles.filter(t => t.groupId === id);
  s.tiles = s.tiles.filter(t => t.groupId !== id);
  if (mode === 'move') {
    own.forEach(t => { t.groupId = target; });
    s.tiles.push(...own);
  }
  if (s.activeGroupId === id) s.activeGroupId = target;
  // Its own layout goes, and a tiles block pinned to it, in any layout, goes back to following the tabs.
  if (s.prefs?.layouts) delete s.prefs.layouts[id];
  const layouts = [s.prefs?.layout, ...Object.values(s.prefs?.layouts ?? {})].filter(Boolean);
  for (const c of layouts.flatMap(l => l.widgets)) if (c.type === 'tiles' && c.settings.group === id) c.settings.group = null;
  return true;
}

export function reorderGroups(s, id, beforeId) {
  const group = s.groups.find(g => g.id === id);
  if (!group || id === beforeId) return;
  const rest = s.groups.filter(g => g.id !== id);
  const at = beforeId == null ? -1 : rest.findIndex(g => g.id === beforeId);
  rest.splice(at < 0 ? rest.length : at, 0, group);
  s.groups = rest;
}
