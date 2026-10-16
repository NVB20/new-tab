import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addTile, updateTile, deleteTile, moveTileToGroup, reorderTile,
  addGroup, renameGroup, deleteGroup, reorderGroups,
} from '../js/actions.js';

function state() {
  return {
    groups: [{ id: 'home', title: 'Home' }, { id: 'dev', title: 'dev' }],
    activeGroupId: 'home',
    tiles: [
      { id: 'a', groupId: 'home', title: 'A', url: 'https://a.com', icon: '' },
      { id: 'x', groupId: 'dev', title: 'X', url: 'https://x.com', icon: '' },
      { id: 'b', groupId: 'home', title: 'B', url: 'https://b.com', icon: '' },
      { id: 'c', groupId: 'home', title: 'C', url: 'https://c.com', icon: '' },
      { id: 'y', groupId: 'dev', title: 'Y', url: 'https://y.com', icon: '' },
    ],
  };
}

const order = (s, groupId) => s.tiles.filter(t => t.groupId === groupId).map(t => t.id);

test('addTile appends to the given group, defaulting to the active one', () => {
  const s = state();
  const t = addTile(s, { title: 'N', url: 'https://n.com' });
  assert.equal(t.groupId, 'home');
  assert.deepEqual(order(s, 'home'), ['a', 'b', 'c', t.id]);
  const u = addTile(s, { title: 'D', url: 'https://d.com', groupId: 'dev' });
  assert.deepEqual(order(s, 'dev'), ['x', 'y', u.id]);
});

test('updateTile patches fields and deleteTile removes', () => {
  const s = state();
  updateTile(s, 'b', { title: 'Bee' });
  assert.equal(s.tiles.find(t => t.id === 'b').title, 'Bee');
  deleteTile(s, 'b');
  assert.deepEqual(order(s, 'home'), ['a', 'c']);
});

test('reorderTile moves before another tile within the group', () => {
  const s = state();
  reorderTile(s, 'c', 'a');
  assert.deepEqual(order(s, 'home'), ['c', 'a', 'b']);
  assert.deepEqual(order(s, 'dev'), ['x', 'y']);
});

test('reorderTile with null puts the tile at the end of its group', () => {
  const s = state();
  reorderTile(s, 'a', null);
  assert.deepEqual(order(s, 'home'), ['b', 'c', 'a']);
});

test('reorderTile onto itself is a no-op', () => {
  const s = state();
  reorderTile(s, 'b', 'b');
  assert.deepEqual(order(s, 'home'), ['a', 'b', 'c']);
});

test('moveTileToGroup appends to the target group', () => {
  const s = state();
  moveTileToGroup(s, 'a', 'dev');
  assert.deepEqual(order(s, 'dev'), ['x', 'y', 'a']);
  assert.deepEqual(order(s, 'home'), ['b', 'c']);
});

test('moveTileToGroup ignores unknown groups and same-group moves', () => {
  const s = state();
  moveTileToGroup(s, 'a', 'nope');
  moveTileToGroup(s, 'a', 'home');
  assert.deepEqual(order(s, 'home'), ['a', 'b', 'c']);
});

test('addGroup appends and activates; renameGroup renames', () => {
  const s = state();
  const g = addGroup(s, 'Work');
  assert.equal(s.groups.at(-1).title, 'Work');
  assert.equal(s.activeGroupId, g.id);
  renameGroup(s, g.id, 'Job');
  assert.equal(s.groups.at(-1).title, 'Job');
});

test('deleteGroup with move sends tiles to the first remaining group', () => {
  const s = state();
  assert.equal(deleteGroup(s, 'home', 'move'), true);
  assert.deepEqual(s.groups.map(g => g.id), ['dev']);
  assert.deepEqual(order(s, 'dev'), ['x', 'y', 'a', 'b', 'c']);
  assert.equal(s.activeGroupId, 'dev');
});

test('deleteGroup with delete removes its tiles', () => {
  const s = state();
  deleteGroup(s, 'dev', 'delete');
  assert.deepEqual(s.tiles.map(t => t.id), ['a', 'b', 'c']);
  assert.equal(s.activeGroupId, 'home');
});

test('deleteGroup refuses to delete the last group', () => {
  const s = state();
  deleteGroup(s, 'dev', 'delete');
  assert.equal(deleteGroup(s, 'home', 'delete'), false);
  assert.equal(s.groups.length, 1);
});

test('reorderGroups moves a group before another or to the end', () => {
  const s = state();
  addGroup(s, 'Work');
  const work = s.groups.at(-1).id;
  reorderGroups(s, work, 'home');
  assert.deepEqual(s.groups.map(g => g.title), ['Work', 'Home', 'dev']);
  reorderGroups(s, work, null);
  assert.deepEqual(s.groups.map(g => g.title), ['Home', 'dev', 'Work']);
});
