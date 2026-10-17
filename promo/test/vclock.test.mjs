import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const EPOCH = Date.UTC(2026, 9, 20, 6, 41);
const SOURCE = readFileSync(new URL('../lib/vclock.js', import.meta.url), 'utf8').replace('__EPOCH__', String(EPOCH));

// A bare page: the clock script run in its own global, then held.
function page(animations = []) {
  const ctx = {
    performance: { now: () => 0 }, document: { getAnimations: () => animations },
    Date, console, setTimeout, setInterval, clearTimeout, clearInterval,
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  ctx.__vclock.hold();
  return ctx;
}

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('a step moves performance.now and Date by exactly that much', () => {
  const p = page();
  const t0 = p.performance.now();
  p.__vclock.step(1000 / 120);
  assert.ok(close(p.performance.now() - t0, 1000 / 120));
  assert.equal(p.Date.now(), Math.floor(EPOCH + p.performance.now()));
  assert.equal(new p.Date().getTime(), Math.floor(EPOCH + p.performance.now()));
  assert.equal(new p.Date(0).getTime(), 0);
});

test('timers wait for the steps that reach them', () => {
  const p = page();
  let fired = 0;
  p.setTimeout(() => fired++, 100);
  p.__vclock.step(60);
  assert.equal(fired, 0);
  p.__vclock.step(60);
  assert.equal(fired, 1);
});

test('intervals repeat until cleared', () => {
  const p = page();
  let fired = 0;
  const id = p.setInterval(() => fired++, 50);
  p.__vclock.step(130);
  assert.equal(fired, 2);
  p.clearInterval(id);
  p.__vclock.step(130);
  assert.equal(fired, 2);
});

test('animation frames run every 1/60 s with the virtual time', () => {
  const p = page();
  const seen = [];
  const tick = t => {
    seen.push(t);
    p.requestAnimationFrame(tick);
  };
  p.requestAnimationFrame(tick);
  p.__vclock.step(1000 / 30);
  assert.equal(seen.length, 2);
  assert.ok(close(seen[1] - seen[0], 1000 / 60));
});

test('CSS animations are paused and follow the virtual time, whatever the step', () => {
  const anim = { currentTime: 250, paused: false, pause() { this.paused = true; } };
  const p = page([anim]);
  for (let i = 0; i < 8; i++) p.__vclock.step(1000 / 120);
  assert.equal(anim.paused, true);
  assert.ok(close(anim.currentTime, 250 + 8000 / 120));
});
