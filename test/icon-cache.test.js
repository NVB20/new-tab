import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iconsToFetch, pruneIcons } from '../js/icon-cache.js';

const tile = (icon, extra = {}) => ({ id: icon, groupId: 'g', title: 't', url: 'https://a.com', icon, ...extra });

test('iconsToFetch lists each web icon link not saved yet, once', () => {
  const tiles = [
    tile('https://assets.speeddial2.com/logo/gmail.png'),
    tile('https://image.speeddial2.com/logo/abc'),
    tile('https://assets.speeddial2.com/logo/gmail.png', { id: 'dupe' }),
    tile('https://saved.example/logo.png'),
    tile(''),
    tile('data:image/png;base64,AAAA'),
    tile('chrome://favicon/x'),
  ];
  const saved = { 'https://saved.example/logo.png': 'data:image/png;base64,BBBB' };
  assert.deepEqual(iconsToFetch(tiles, saved), [
    'https://assets.speeddial2.com/logo/gmail.png',
    'https://image.speeddial2.com/logo/abc',
  ]);
});

test('iconsToFetch skips links that already failed this session', () => {
  const tiles = [tile('https://a.example/1.png'), tile('https://a.example/2.png')];
  assert.deepEqual(iconsToFetch(tiles, {}, new Set(['https://a.example/1.png'])), ['https://a.example/2.png']);
});

test('pruneIcons drops saved logos no tile uses', () => {
  const saved = { 'https://a.example/kept.png': 'data:1', 'https://a.example/gone.png': 'data:2' };
  assert.deepEqual(pruneIcons([tile('https://a.example/kept.png')], saved), { 'https://a.example/kept.png': 'data:1' });
});
