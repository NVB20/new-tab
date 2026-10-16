import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enginesOn, activeMode, nextMode, googleUrl, chatUrl, addHandoff, HANDOFF_TTL,
  BOTTOM, rowBands, gapY, nearestSlot, barSlot, slotToRow,
} from '../js/ask.js';

const search = over => ({ enabled: true, google: true, claude: true, chatgpt: false, gemini: false, mode: 'google', ...over });

// ---- engines ----

test('enginesOn lists the engines that are on, in bar order', () => {
  assert.deepEqual(enginesOn(search({ gemini: true, chatgpt: true })), ['google', 'claude', 'chatgpt', 'gemini']);
  assert.deepEqual(enginesOn(search({ google: false, gemini: true })), ['claude', 'gemini']);
});

test('activeMode is the saved engine while it is on', () => {
  assert.equal(activeMode(search({ mode: 'claude' })), 'claude');
  assert.equal(activeMode(search({ chatgpt: true, mode: 'chatgpt' })), 'chatgpt');
  assert.equal(activeMode(search({ gemini: true, mode: 'gemini' })), 'gemini');
});

test('activeMode falls back to the first engine that is on', () => {
  assert.equal(activeMode(search({ mode: 'chatgpt' })), 'google');
  assert.equal(activeMode(search({ mode: 'google', google: false, claude: false, gemini: true })), 'gemini');
});

test('activeMode treats an unknown saved mode as the first one on', () => {
  assert.equal(activeMode(search({ mode: 'bing' })), 'google');
});

test('activeMode is null when the bar is off or has no engine on', () => {
  assert.equal(activeMode(search({ enabled: false })), null);
  assert.equal(activeMode(search({ google: false, claude: false })), null);
});

test('nextMode steps through the engines that are on and wraps around', () => {
  const all = search({ chatgpt: true, gemini: true });
  assert.equal(nextMode({ ...all, mode: 'google' }), 'claude');
  assert.equal(nextMode({ ...all, mode: 'claude' }), 'chatgpt');
  assert.equal(nextMode({ ...all, mode: 'chatgpt' }), 'gemini');
  assert.equal(nextMode({ ...all, mode: 'gemini' }), 'google');
});

test('nextMode skips engines that are off', () => {
  assert.equal(nextMode(search({ claude: false, gemini: true, mode: 'google' })), 'gemini');
});

test('nextMode stays put with only one engine on', () => {
  assert.equal(nextMode(search({ claude: false })), 'google');
});

test('googleUrl encodes the query', () => {
  assert.equal(googleUrl('a&b c/ü'), 'https://www.google.com/search?q=a%26b%20c%2F%C3%BC');
});

test('chatUrl opens each engine\'s new chat with only the id, in the fragment', () => {
  assert.equal(chatUrl('claude', 'abc-123'), 'https://claude.ai/new#nt=abc-123');
  assert.equal(chatUrl('chatgpt', 'abc-123'), 'https://chatgpt.com/#nt=abc-123');
  assert.equal(chatUrl('gemini', 'abc-123'), 'https://gemini.google.com/app#nt=abc-123');
});

// ---- handoff ----

test('addHandoff appends the new message', () => {
  const now = 1_000_000;
  const out = addHandoff([{ id: 'a', text: 'old', at: now - 1000 }], { id: 'b', text: 'new', at: now }, now);
  assert.deepEqual(out.map(h => h.id), ['a', 'b']);
});

test('addHandoff drops messages that are too old to be picked up', () => {
  const now = 1_000_000;
  const out = addHandoff([{ id: 'a', text: 'stale', at: now - HANDOFF_TTL }], { id: 'b', text: 'new', at: now }, now);
  assert.deepEqual(out.map(h => h.id), ['b']);
});

test('addHandoff starts a list when storage holds none', () => {
  const entry = { id: 'b', text: 'new', at: 5 };
  assert.deepEqual(addHandoff(undefined, entry, 5), [entry]);
  assert.deepEqual(addHandoff('junk', entry, 5), [entry]);
});

// ---- where the bar sits ----

const rect = (top, height = 80) => ({ top, bottom: top + height });

test('rowBands groups tile rects into rows, top to bottom', () => {
  const rects = [rect(100), rect(100), rect(100.4), rect(190), rect(190), rect(280, 60)];
  assert.deepEqual(rowBands(rects), [{ top: 100, bottom: 180.4 }, { top: 190, bottom: 270 }, { top: 280, bottom: 340 }]);
});

test('rowBands keeps a shorter item that sits inside a row (the + button) in that row', () => {
  const rects = [rect(100), rect(100), rect(190), { top: 215, bottom: 245 }];
  assert.deepEqual(rowBands(rects), [{ top: 100, bottom: 180 }, { top: 190, bottom: 270 }]);
});

test('rowBands still splits rows that touch, with no gap between them', () => {
  assert.deepEqual(rowBands([rect(0), rect(80)]), [{ top: 0, bottom: 80 }, { top: 80, bottom: 160 }]);
});

test('rowBands ignores empty rects and copes with no tiles', () => {
  assert.deepEqual(rowBands([]), []);
  assert.deepEqual(rowBands([{ top: 0, bottom: 0 }, rect(10)]), [{ top: 10, bottom: 90 }]);
});

const bands = [{ top: 100, bottom: 180 }, { top: 200, bottom: 280 }, { top: 300, bottom: 380 }];

test('gapY is the top edge, the middle of each gap, then the bottom edge', () => {
  assert.deepEqual([0, 1, 2, 3].map(k => gapY(bands, k)), [100, 190, 290, 380]);
});

test('nearestSlot picks the gap closest to the pointer', () => {
  assert.equal(nearestSlot(20, bands), 0);
  assert.equal(nearestSlot(130, bands), 0);
  assert.equal(nearestSlot(150, bands), 1);
  assert.equal(nearestSlot(285, bands), 2);
  assert.equal(nearestSlot(900, bands), 3);
});

test('nearestSlot is the top when there are no tile rows', () => {
  assert.equal(nearestSlot(500, []), 0);
});

test('barSlot places the saved row, clamped to the rows this group has', () => {
  assert.equal(barSlot(0, 3), 0);
  assert.equal(barSlot(2, 3), 2);
  assert.equal(barSlot(5, 3), 3);
  assert.equal(barSlot(BOTTOM, 3), 3);
  assert.equal(barSlot(1, 0), 0);
});

test('barSlot treats a malformed row as the top', () => {
  assert.equal(barSlot(1.5, 3), 0);
  assert.equal(barSlot(-4, 3), 0);
  assert.equal(barSlot(NaN, 3), 0);
});

test('slotToRow saves the last gap as the bottom, so the bar stays under new tiles', () => {
  assert.equal(slotToRow(0, 3), 0);
  assert.equal(slotToRow(2, 3), 2);
  assert.equal(slotToRow(3, 3), BOTTOM);
  assert.equal(slotToRow(0, 0), 0);
});
