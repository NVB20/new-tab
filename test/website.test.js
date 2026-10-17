import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SITES, siteUrl, siteDomain, sitePattern, siteDomains, frameRules, framePatterns, sameRules, pickRuleIds, forTab } from '../js/website.js';

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

test('frameRules lifts the frame-blocking headers per site, in the one tab, for frames this extension or the site starts', () => {
  const rules = frameRules(['pinterest.com', 'en.wikipedia.org'], 'abcdef', 7, [3, 5]);
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0], {
    id: 3,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'x-frame-options', operation: 'remove' },
        { header: 'content-security-policy', operation: 'remove' },
      ],
    },
    condition: { requestDomains: ['pinterest.com'], initiatorDomains: ['abcdef', 'pinterest.com'], resourceTypes: ['sub_frame'], tabIds: [7] },
  });
  assert.equal(rules[1].id, 5);
  assert.deepEqual(rules[1].condition.requestDomains, ['en.wikipedia.org']);
  assert.deepEqual(frameRules([], 'abcdef', 7, []), []);
});

test('every rule is scoped to a tab, so a site keeps its headers in every other tab', () => {
  for (const r of frameRules(['pinterest.com', 'github.com'], 'abcdef', 966511144, [1, 2])) assert.deepEqual(r.condition.tabIds, [966511144]);
});

test('frameRules stops at MAX_SITES rules', () => {
  const domains = Array.from({ length: MAX_SITES + 5 }, (_, i) => `site${i}.com`);
  const ids = Array.from({ length: MAX_SITES + 5 }, (_, i) => i + 1);
  assert.equal(frameRules(domains, 'abcdef', 2, ids).length, MAX_SITES);
});

test('pickRuleIds keeps a tab\'s own ids, then takes the lowest free ones', () => {
  const rule = (id, tab) => ({ id, condition: { tabIds: [tab] } });
  const all = [rule(1, 100), rule(2, 200), rule(4, 200), rule(5, 100)];
  assert.deepEqual(pickRuleIds(all, 200, 2), [2, 4]);
  assert.deepEqual(pickRuleIds(all, 200, 3), [2, 4, 3]);
  assert.deepEqual(pickRuleIds(all, 200, 1), [2]);
  assert.deepEqual(pickRuleIds(all, 300, 2), [3, 6]);
  assert.deepEqual(pickRuleIds([], 300, 0), []);
  // Big tab ids (Chrome's run past a rule id's range) don't matter.
  for (const id of pickRuleIds(all, 966511144, MAX_SITES)) assert.ok(Number.isInteger(id) && id >= 1 && id < 2 ** 31);
});

test('forTab finds a tab\'s own rules only', () => {
  assert.equal(forTab({ condition: { tabIds: [7] } }, 7), true);
  assert.equal(forTab({ condition: { tabIds: [7] } }, 8), false);
  assert.equal(forTab({ condition: { tabIds: [7, 8] } }, 7), false);
  assert.equal(forTab({ condition: {} }, 7), false);
  assert.equal(forTab(null, 7), false);
});

test('framePatterns are the sites the frame script runs on, each with its subdomains', () => {
  assert.deepEqual(framePatterns(['pinterest.com', 'en.wikipedia.org']), ['*://*.pinterest.com/*', '*://*.en.wikipedia.org/*']);
  assert.deepEqual(framePatterns([]), []);
});

test('sameRules compares the rules by id, sites and tab, whatever else Chrome adds', () => {
  const want = frameRules(['pinterest.com', 'github.com'], 'abcdef', 4, [1, 2]);
  const stored = structuredClone(want).reverse().map(r => ({ ...r, action: { ...r.action, extra: true } }));
  assert.equal(sameRules(stored, want), true);
  assert.equal(sameRules(stored.slice(1), want), false);
  assert.equal(sameRules(frameRules(['pinterest.com', 'x.com'], 'abcdef', 4, [1, 2]), want), false);
  const rescoped = structuredClone(want).map(r => ({ ...r, condition: { ...r.condition, tabIds: [5] } }));
  assert.equal(sameRules(rescoped, want), false);
  // The rules from before they were scoped to a tab.
  const shared = want.map(r => ({ ...r, condition: { ...r.condition, tabIds: undefined } }));
  assert.equal(sameRules(shared, want), false);
  assert.equal(sameRules([], []), true);
});
