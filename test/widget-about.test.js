import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../js/layout.js';
import { ABOUT } from '../js/widget-about.js';

test('every widget type has a tagline and a few words on what it does, and no other type does', () => {
  assert.deepEqual(Object.keys(ABOUT).sort(), Object.keys(TYPES).sort());
  for (const [type, { tagline, about }] of Object.entries(ABOUT)) {
    assert.ok(typeof tagline === 'string' && tagline.trim(), `${type}: tagline`);
    assert.ok(typeof about === 'string' && about.trim(), `${type}: about`);
  }
});
