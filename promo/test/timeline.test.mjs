import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, TOTAL_FRAMES, BEAT, FPS, CHAR_FRAMES, sceneStarts, musicCues } from '../timeline.mjs';

const named = name => sceneStarts().find(s => s.name === name);

test('the video is 22 s at 30 fps', () => {
  assert.equal(TOTAL_FRAMES, 660);
  assert.equal(TOTAL_FRAMES / FPS, 22);
});

test('every cut lands on a beat', () => {
  for (const s of sceneStarts()) assert.equal(s.start % BEAT, 0, s.name);
});

test('headline cues, logos, pills and drags land on beats, inside their shot', () => {
  for (const s of sceneStarts()) {
    for (const w of s.words ?? []) {
      assert.ok(w.f >= 0 && w.f < s.frames, `${s.name}: ${w.text}`);
      if (!w.type) assert.equal((s.start + w.f) % BEAT, 0, `${s.name}: ${w.text}`);
      if (w.to != null) assert.equal(w.to % BEAT, 0, `${s.name}: ${w.text} leaves`);
    }
    if (s.logo) {
      assert.equal(s.logo.f % BEAT, 0, s.name);
      assert.equal(s.logo.pillF % BEAT, 0, s.name);
    }
    for (const d of s.drags ?? []) {
      assert.equal(d.from % BEAT, 0, s.name);
      assert.ok(d.to > d.from && d.to < s.frames, s.name);
    }
  }
});

test('the typed line finishes inside its shot', () => {
  const hook = named('hook');
  const typed = hook.words.find(w => w.type);
  assert.ok(typed.f + typed.text.replaceAll('*', '').length * CHAR_FRAMES < hook.frames);
});

test('camera keys run in order and stay inside their shot', () => {
  for (const s of SCENES.filter(x => x.camera)) {
    s.camera.forEach((k, i) => {
      assert.ok(k.f >= 0 && k.f < s.frames, s.name);
      if (i) assert.ok(k.f > s.camera[i - 1].f, s.name);
    });
  }
});

test('the music cues follow the shots', () => {
  const cues = musicCues();
  assert.equal(cues.length, 22);
  assert.equal(cues.bpm, 120);
  assert.equal(cues.kickFrom, named('tiles').start / FPS);
  assert.equal(cues.breakAt, named('light').start / FPS);
  assert.equal(cues.drop, named('end').start / FPS);
  assert.deepEqual(cues.cuts, sceneStarts().slice(1).map(s => s.start / FPS));
  assert.equal(cues.typing.length, 'Stillopeningtentabseverymorning?'.length);
  assert.ok(cues.typing.every((t, i) => i === 0 || t > cues.typing[i - 1]));
});

test('shot names are unique', () => {
  assert.equal(new Set(SCENES.map(s => s.name)).size, SCENES.length);
});
