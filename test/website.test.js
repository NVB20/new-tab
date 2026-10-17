import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SITES, siteUrl, siteDomain, sitePattern, siteDomains, frameRules, framePatterns, sameRules } from '../js/website.js';

test('siteUrl takes a web address, adding https when there is no scheme', () => {
  assert.equal(siteUrl('pinterest.com'), 'https://pinterest.com/');
  assert.equal(siteUrl('  https://www.pinterest.com/ideas/ '), 'https://www.pinterest.com/ideas/');
  assert.equal(siteUrl('http://example.com/a?b=1'), 'http://example.com/a?b=1');
  assert.equal(siteUrl('localhost:5500/newtab.html'), 'https://localhost:5500/newtab.html');
});

test('siteUrl refuses anything that is not a plain http(s) address', () => {
  for (const input of ['', '   ', 'pinterest', 'not a site', 'javascript:alert(1)', 'chrome://settings',
    'ftp://example.com', 'mailto:me@example.com', 'https://me:secret@example.com', null, undefined, 42]) {
    assert.equal(siteUrl(input), null, String(input));
  }
});

test('a site is its host without www, and access covers its subdomains', () => {
  assert.equal(siteDomain('https://www.pinterest.com/ideas/'), 'pinterest.com');
  assert.equal(siteDomain('https://il.pinterest.com/'), 'il.pinterest.com');
  assert.equal(sitePattern('https://www.pinterest.com/ideas/'), '*://*.pinterest.com/*');
  assert.equal(sitePattern('http://news.ycombinator.com/'), '*://*.news.ycombinator.com/*');
});

test('siteDomains lists the sites of the layout\'s Website copies once each', () => {
  const widgets = [
    { type: 'website', settings: { url: 'https://www.pinterest.com/' } },
    { type: 'website', settings: { url: 'pinterest.com/ideas' } },
    { type: 'website', settings: { url: '' } },
    { type: 'website', settings: { url: 'javascript:alert(1)' } },
    { type: 'website', settings: { url: 'en.wikipedia.org' } },
    { type: 'website' },
    { type: 'github', settings: { url: 'https://github.com/' } },
  ];
  assert.deepEqual(siteDomains(widgets), ['pinterest.com', 'en.wikipedia.org']);
  assert.deepEqual(siteDomains([]), []);
});

test('frameRules lifts the frame-blocking headers per site, for frames this extension or the site starts', () => {
  const rules = frameRules(['pinterest.com', 'en.wikipedia.org'], 'abcdef');
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0], {
    id: 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'x-frame-options', operation: 'remove' },
        { header: 'content-security-policy', operation: 'remove' },
      ],
    },
    condition: { requestDomains: ['pinterest.com'], initiatorDomains: ['abcdef', 'pinterest.com'], resourceTypes: ['sub_frame'] },
  });
  assert.equal(rules[1].id, 2);
  assert.deepEqual(rules[1].condition.requestDomains, ['en.wikipedia.org']);
  assert.deepEqual(frameRules([], 'abcdef'), []);
});

test('frameRules stops at MAX_SITES rules', () => {
  const domains = Array.from({ length: MAX_SITES + 5 }, (_, i) => `site${i}.com`);
  const rules = frameRules(domains, 'abcdef');
  assert.equal(rules.length, MAX_SITES);
  assert.equal(rules.at(-1).id, MAX_SITES);
});

test('framePatterns are the sites the frame script runs on, each with its subdomains', () => {
  assert.deepEqual(framePatterns(['pinterest.com', 'en.wikipedia.org']), ['*://*.pinterest.com/*', '*://*.en.wikipedia.org/*']);
  assert.deepEqual(framePatterns([]), []);
});

test('sameRules compares the rules by id and sites, whatever else Chrome adds', () => {
  const want = frameRules(['pinterest.com', 'github.com'], 'abcdef');
  const stored = structuredClone(want).reverse().map(r => ({ ...r, action: { ...r.action, extra: true } }));
  assert.equal(sameRules(stored, want), true);
  assert.equal(sameRules(stored.slice(1), want), false);
  assert.equal(sameRules(frameRules(['pinterest.com', 'x.com'], 'abcdef'), want), false);
  assert.equal(sameRules([], []), true);
});
