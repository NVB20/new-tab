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

export function deleteTile(s, id) {
  s.tiles = s.tiles.filter(t => t.id !== id);
}

export function moveTileToGroup(s, id, groupId) {
  const i = s.tiles.findIndex(t => t.id === id);
  if (i < 0 || s.tiles[i].groupId === groupId || !s.groups.some(g => g.id === groupId)) return;
  const [tile] = s.tiles.splice(i, 1);
  tile.groupId = groupId;
  s.tiles.push(tile);
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
