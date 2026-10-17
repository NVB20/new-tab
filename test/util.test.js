import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, hostOf, fuzzyScore, clamp, uid, backgroundImage, idle, isSafeUrl, onlyFrom } from '../js/util.js';

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

test('normalizeUrl refuses addresses that run script or carry a whole page', () => {
  for (const input of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<h1>hi</h1>', 'vbscript:msgbox(1)', 'blob:https://x.com/1']) {
    assert.equal(normalizeUrl(input), null, input);
  }
  assert.equal(normalizeUrl('obsidian://open?vault=x'), 'obsidian://open?vault=x');
  assert.equal(normalizeUrl('data.example.com'), 'https://data.example.com/');
});

test('isSafeUrl sees through the spaces and tabs browsers drop from a scheme', () => {
  for (const url of ['javascript:x', ' javascript:x', 'java\tscript:x', 'java\nscript:x', '\u0001javascript:x', 'DATA:text/html,x']) {
    assert.equal(isSafeUrl(url), false, JSON.stringify(url));
  }
  for (const url of ['https://example.com/', 'chrome://settings', 'example.com', 'localhost:3000/x', 'mailto:me@example.com']) {
    assert.equal(isSafeUrl(url), true, url);
  }
  assert.equal(isSafeUrl(null), false);
});

test('onlyFrom keeps a link only when it starts with the prefix', () => {
  assert.equal(onlyFrom('https://github.com/', 'https://github.com/a/b'), 'https://github.com/a/b');
  assert.equal(onlyFrom('https://github.com/', 'https://github.com.evil.example/'), '');
  assert.equal(onlyFrom('https://github.com/', 'javascript:alert(1)'), '');
  assert.equal(onlyFrom('https://github.com/', undefined), '');
});
