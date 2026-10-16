import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, hash2, valueNoise, streakField, streakBlend, streakSway, falloff, ringOffset, level } from '../js/ascii-field.js';

test('GLYPHS are letters and digits', () => {
  assert.match(GLYPHS, /^[A-Za-z0-9]+$/);
  assert.equal(GLYPHS.length, 62);
});

test('hash2 is deterministic and in [0, 1)', () => {
  assert.equal(hash2(3, 7, 1), hash2(3, 7, 1));
  assert.notEqual(hash2(3, 7, 1), hash2(7, 3, 1));
  for (let i = 0; i < 500; i++) {
    const v = hash2(i, i * 31, 5);
    assert.ok(v >= 0 && v < 1);
  }
});

test('valueNoise is smooth and bounded', () => {
  for (let i = 0; i < 300; i++) {
    const x = i * 0.137, y = i * 0.071;
    const v = valueNoise(x, y, 2);
    assert.ok(v >= 0 && v <= 1);
    assert.ok(Math.abs(valueNoise(x + 0.001, y, 2) - v) < 0.01);
  }
});

test('streakField is deterministic, bounded and mostly empty', () => {
  assert.equal(streakField(10, 4, 2, 9), streakField(10, 4, 2, 9));
  const values = [];
  for (let r = 0; r < 48; r++) for (let c = 0; c < 213; c++) values.push(streakField(c, r, 0, 9));
  assert.ok(values.every(v => v >= 0 && v <= 1));
  const empty = values.filter(v => v === 0).length / values.length;
  assert.ok(empty > 0.6 && empty < 0.95, `empty share ${empty.toFixed(2)} should leave sparse streaks`);
  assert.ok(values.some(v => v > 0.4), 'streaks have brighter middles');
});

test('streakField gives the same value with precomputed blend and sway', () => {
  for (let i = 0; i < 300; i++) {
    const c = i % 40, r = Math.floor(i / 40), t = i * 0.07;
    assert.equal(streakField(c, r, t, 9, streakBlend(c, r, 9), streakSway(c, t)), streakField(c, r, t, 9));
  }
});

function changedShare(t0, t1, threshold) {
  let changed = 0, cells = 0;
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 200; c++) {
      cells++;
      if (Math.abs(streakField(c, r, t0, 3) - streakField(c, r, t1, 3)) > threshold) changed++;
    }
  }
  return changed / cells;
}

test('streakField flows: a second later the streaks have visibly moved', () => {
  const share = changedShare(0, 1, 0.2);
  assert.ok(share > 0.08, `only ${(share * 100).toFixed(1)}% of cells changed in a second`);
});

test('streakField flows smoothly between 0.1s animation steps', () => {
  const share = changedShare(2, 2.1, 0.3);
  assert.ok(share < 0.05, `${(share * 100).toFixed(1)}% of cells jumped in 0.1s`);
});

test('falloff is 1 at the centre, 0 at the radius and decreasing', () => {
  assert.equal(falloff(0, 200), 1);
  assert.equal(falloff(200, 200), 0);
  assert.equal(falloff(500, 200), 0);
  assert.ok(falloff(50, 200) > falloff(100, 200));
});

test('ringOffset is 0 at the wavefront, 1 at the tail, -1 outside the ring', () => {
  assert.equal(ringOffset(100, 100, 20), 0);
  assert.equal(ringOffset(90, 100, 20), 0.5);
  assert.equal(ringOffset(80, 100, 20), 1);
  assert.equal(ringOffset(101, 100, 20), -1);
  assert.equal(ringOffset(70, 100, 20), -1);
});

test('level maps 0..1 onto level indexes', () => {
  assert.equal(level(0, 8), 0);
  assert.equal(level(1, 8), 7);
  assert.equal(level(2, 8), 7);
  assert.equal(level(-1, 8), 0);
  assert.equal(level(0.5, 3), 1);
});
