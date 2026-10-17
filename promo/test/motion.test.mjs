import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeOutBack, easeInOutCubic, easeOutCubic, pathAt } from '../lib/motion.mjs';

test('eases start at 0 and end at 1', () => {
  for (const ease of [easeOutBack, easeInOutCubic, easeOutCubic]) {
    assert.ok(Math.abs(ease(0)) < 1e-9);
    assert.ok(Math.abs(ease(1) - 1) < 1e-9);
  }
});

test('easeOutBack overshoots before it settles', () => {
  assert.ok(Math.max(...Array.from({ length: 21 }, (_, i) => easeOutBack(i / 20))) > 1.05);
});

test('eases hold outside 0..1', () => {
  assert.equal(easeOutCubic(-1), 0);
  assert.equal(easeOutCubic(2), 1);
});

test('pathAt holds before the first key and after the last, and eases between', () => {
  const keys = [{ f: 10, x: 0, y: 0 }, { f: 20, x: 100, y: 50 }];
  assert.deepEqual(pathAt(keys, 0), { x: 0, y: 0 });
  assert.deepEqual(pathAt(keys, 30), { x: 100, y: 50 });
  assert.deepEqual(pathAt(keys, 15), { x: 50, y: 25 });
});

test('pathAt copes with two keys on one frame', () => {
  assert.deepEqual(pathAt([{ f: 5, x: 0, y: 0 }, { f: 5, x: 9, y: 9 }, { f: 9, x: 9, y: 9 }], 7), { x: 9, y: 9 });
});
