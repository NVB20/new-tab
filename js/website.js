// The Website widget's pure part: the address a copy shows, the access pattern for its site, and
// the header rules that let the site show in this extension's frames. Pure (unit-tested in Node).

import { normalizeUrl, hostOf } from './util.js';

export const MAX_SITES = 20;   // dynamic rule ids 1–20 are the Website widget's

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

// One rule per site: its frame-blocking headers go from frames this extension starts, and from
// loads the site starts inside them (a login redirect, a reload). Anywhere else in Chrome the
// site keeps them. The API can't edit one CSP directive, so the whole CSP goes, in the frame only.
export function frameRules(domains, extensionId) {
  return domains.slice(0, MAX_SITES).map((domain, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'x-frame-options', operation: 'remove' },
        { header: 'content-security-policy', operation: 'remove' },
      ],
    },
    condition: { requestDomains: [domain], initiatorDomains: [extensionId, domain], resourceTypes: ['sub_frame'] },
  }));
}

// Whether the dynamic rules Chrome holds are already `rules` (as frameRules makes them), so a
// new tab needn't write them again. Compared by id and sites: Chrome may fill in other fields.
export function sameRules(stored, rules) {
  const key = list => JSON.stringify(list
    .map(r => [r.id, r.condition?.requestDomains, r.condition?.initiatorDomains])
    .sort((a, b) => a[0] - b[0]));
  return key(stored) === key(rules);
}

// Where content/site-frame.js runs: the Website copies' sites (with their subdomains) only.
export const framePatterns = domains => domains.map(domainPattern);
