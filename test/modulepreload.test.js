import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

const ROOT = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, ROOT), 'utf8');

// Every module main.js loads through static imports, as paths from the page.
function staticGraph(entry) {
  const seen = new Set();
  const walk = path => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const [, spec] of read(path).matchAll(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)) {
      walk(posix.join(posix.dirname(path), spec));
    }
  };
  walk(entry);
  seen.delete(entry);
  return seen;
}

test('newtab.html preloads exactly the modules main.js imports, so they load in parallel rather than level by level', () => {
  const html = read('newtab.html');
  const preloaded = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m => m[1]);
  assert.equal(new Set(preloaded).size, preloaded.length, 'a module is listed twice');
  assert.deepEqual([...preloaded].sort(), [...staticGraph('js/main.js')].sort());
});
