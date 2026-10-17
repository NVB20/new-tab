// The Website widget's pure part: the address a copy shows, the access pattern for its site, and
// the header rules that let the site show in this extension's frames. Pure (unit-tested in Node).

import { normalizeUrl, hostOf } from './util.js';

export const MAX_SITES = 20;   // sites per tab; dynamic rules 1–20 held them before they moved to session rules

// The address a copy shows: http(s) only, without a user name or password; null otherwise.
export function siteUrl(input) {
  const href = normalizeUrl(input);
  if (!href) return null;
  const u = new URL(href);
  return /^https?:$/.test(u.protocol) && !u.username && !u.password ? href : null;
}

// A site is its host without "www.". Access and the header rule cover it and every subdomain,
// since sites move between www, bare and regional hosts.
export const siteDomain = url => hostOf(url);
const domainPattern = domain => `*://*.${domain}/*`;
export const sitePattern = url => domainPattern(siteDomain(url));

// The sites the layout's Website copies show, once each.
export const siteDomains = widgets => [...new Set(widgets
  .filter(c => c.type === 'website')
  .map(c => siteUrl(c.settings?.url))
  .filter(Boolean)
  .map(siteDomain))];

// Whether a session rule is a tab's own (frameRules scopes each to one tab). background.js drops
// a tab's rules when it closes or leaves the new tab page.
export const forTab = (rule, tabId) => rule?.condition?.tabIds?.length === 1 && rule.condition.tabIds[0] === tabId;

// Ids for a tab's `count` rules, given every session rule Chrome holds: the ones the tab holds
// already, then the lowest that no rule holds. (Tab ids run past what a rule id can hold, so the
// ids can't come from them.) Two tabs may pick the same free id at once; Chrome then refuses the
// later write, and that tab picks again.
export function pickRuleIds(rules, tabId, count) {
  const ids = rules.filter(r => forTab(r, tabId)).map(r => r.id).sort((a, b) => a - b).slice(0, count);
  const taken = new Set(rules.map(r => r.id));
  for (let id = 1; ids.length < count; id++) if (!taken.has(id)) ids.push(id);
  return ids;
}

// One rule per site, in this tab only: its frame-blocking headers go from frames this extension
// starts, and from loads the site starts inside them (a login redirect, a reload). In every
// other tab the site keeps them, even where it frames itself. The API can't edit one CSP
// directive, so the whole CSP goes, in the frame only. ids: from pickRuleIds.
export function frameRules(domains, extensionId, tabId, ids) {
  return domains.slice(0, MAX_SITES).map((domain, i) => ({
    id: ids[i],
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'x-frame-options', operation: 'remove' },
        { header: 'content-security-policy', operation: 'remove' },
      ],
    },
    condition: { requestDomains: [domain], initiatorDomains: [extensionId, domain], resourceTypes: ['sub_frame'], tabIds: [tabId] },
  }));
}

// Whether the rules Chrome holds for a tab are already `rules` (as frameRules makes them), so
// they needn't be written again. Compared by id, sites and tab: Chrome may fill in other fields.
export function sameRules(stored, rules) {
  const key = list => JSON.stringify(list
    .map(r => [r.id, r.condition?.requestDomains, r.condition?.initiatorDomains, r.condition?.tabIds])
    .sort((a, b) => a[0] - b[0]));
  return key(stored) === key(rules);
}

// Where content/site-frame.js runs: the Website copies' sites (with their subdomains) only.
export const framePatterns = domains => domains.map(domainPattern);
