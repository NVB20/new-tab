import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, hostOf, fuzzyScore, clamp, uid, backgroundImage, idle } from '../js/util.js';

test('idle runs the function later, also without requestIdleCallback', async () => {
  let ran = false;
  idle(() => { ran = true; });
  assert.equal(ran, false);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(ran, true);
});

test('normalizeUrl adds https when there is no scheme', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
  assert.equal(normalizeUrl('  github.com/NVB20 '), 'https://github.com/NVB20');
});

test('normalizeUrl keeps existing schemes', () => {
  assert.equal(normalizeUrl('http://localhost:3000/x'), 'http://localhost:3000/x');
  assert.equal(normalizeUrl('chrome://settings'), 'chrome://settings');
});

test('normalizeUrl rejects empty and unparseable input', () => {
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl('   '), null);
  assert.equal(normalizeUrl('not a url'), null);
  assert.equal(normalizeUrl(undefined), null);
});

test('hostOf strips www and falls back to input', () => {
  assert.equal(hostOf('https://www.netflix.com/browse'), 'netflix.com');
  assert.equal(hostOf('garbage'), 'garbage');
});

test('fuzzyScore ranks prefix matches above scattered ones', () => {
  assert.ok(fuzzyScore('gm', 'Gmail') > fuzzyScore('gm', 'Program'));
  assert.ok(fuzzyScore('git', 'Github NVB20') > fuzzyScore('git', 'Google Drive digital'));
  assert.equal(fuzzyScore('xyz', 'Gmail'), 0);
  assert.ok(fuzzyScore('', 'Gmail') > 0);
});

test('fuzzyScore is case-insensitive and handles Hebrew', () => {
  assert.ok(fuzzyScore('GMAIL', 'gmail') > 0);
  assert.ok(fuzzyScore('יומן', 'יומן מסחר') > 0);
});

test('clamp bounds numbers', () => {
  assert.equal(clamp(5, 2, 10), 5);
  assert.equal(clamp(50, 2, 10), 10);
  assert.equal(clamp(-1, 2, 10), 2);
});

test('uid returns distinct strings', () => {
  assert.notEqual(uid(), uid());
  assert.equal(typeof uid(), 'string');
});

test('backgroundImage is the upload or the link while showImage is on', () => {
  const bg = { showImage: true, useUpload: false, url: 'https://x/a.jpg' };
  assert.equal(backgroundImage(bg, 'data:w'), 'https://x/a.jpg');
  assert.equal(backgroundImage({ ...bg, useUpload: true }, 'data:w'), 'data:w');
  assert.equal(backgroundImage({ ...bg, showImage: false }, 'data:w'), '');
});
