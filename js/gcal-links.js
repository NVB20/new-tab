// The Google Calendar widget's links: each calendar's secret iCal address, by calendar id. A link
// is a password to its calendar, so it's kept in this extension's own localStorage, out of the
// state: the content scripts that run on other sites (content/chat.js, content/site-frame.js) can
// read chrome.storage.local but not this page's localStorage, and a backup carries none. Outside
// the extension (the Live Server preview) nothing is kept: localStorage there belongs to the
// whole host and port, which other projects served from it can read.

import { hasChrome, releaseSiteAccess } from './chrome-api.js';
import { allLayouts, copiesOf } from './layout.js';
import { siteDomain, siteDomains, sitePattern } from './website.js';

const KEY = 'newtab:gcal-links';

function read() {
  if (!hasChrome) return {};
  try {
    const links = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return links && typeof links === 'object' && !Array.isArray(links) ? links : {};
  } catch {
    return {};
  }
}

function write(links) {
  try {
    if (Object.keys(links).length) localStorage.setItem(KEY, JSON.stringify(links));
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the widget asks for the link again
  }
}

// A calendar's link, or '' when this computer has none.
export function linkOf(id) {
  const url = read()[id];
  return typeof url === 'string' ? url : '';
}

export function setLink(id, url) {
  if (!hasChrome) return;
  write({ ...read(), [id]: url });
}

export function dropLink(id) {
  const links = read();
  delete links[id];
  write(links);
}

// The sites the links are on ('calendar.google.com'), once each.
export const linkDomains = () => [...new Set(Object.values(read()).filter(url => typeof url === 'string').map(siteDomain))];

// Gives back Chrome's access to a link's site once no other link and no Website widget (in any
// layout of `state`) is on it.
export async function releaseLinkSite(url, state) {
  const domain = siteDomain(url);
  const websites = siteDomains(allLayouts(state).flatMap(copiesOf));
  if (!linkDomains().includes(domain) && !websites.includes(domain)) await releaseSiteAccess(sitePattern(url));
}

// fn() when another tab adds or removes a link. Returns a function that stops it.
export function onLinksChange(fn) {
  const listener = e => {
    if (e.key === KEY || e.key === null) fn();
  };
  addEventListener('storage', listener);
  return () => removeEventListener('storage', listener);
}

// Reset everything: every link goes, and the access Chrome gave their sites.
export async function forgetLinks() {
  const urls = Object.values(read()).filter(url => typeof url === 'string');
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
  await Promise.all([...new Map(urls.map(url => [siteDomain(url), url])).values()].map(url => releaseSiteAccess(sitePattern(url))));
}
