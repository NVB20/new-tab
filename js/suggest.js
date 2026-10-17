// Tile suggestions for setup: the sites in Chrome's history ranked by visits, each named the way
// its own pages' titles name it, and the links and folders on the bookmarks bar. Pure
// (unit-tested in Node).

import { hostOf } from './util.js';

const WEB = /^https?:\/\//i;
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$|\.(local|localhost|internal|test)$/i;
// Search results and sign-in pages aren't places anyone goes back to on purpose.
const SEARCH_HOST = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|startpage)\.[a-z.]+$|(^|\.)search\.brave\.com$/i;
const SIGN_IN_HOST = /^(accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com|appleid\.apple\.com|(auth|login|signin|sso)\.)/i;
const SIGN_IN_PATH = /\/(log-?in|sign-?in|sign-?up|log-?out|auth|oauth2?|sso)(\/|$)/i;

const isSearch = u => SEARCH_HOST.test(u.hostname) && (u.pathname.startsWith('/search') || u.searchParams.has('q'));
const isSignIn = u => SIGN_IN_HOST.test(u.hostname) || SIGN_IN_PATH.test(u.pathname);

// History items ({ url, title, visitCount }) → the sites they belong to, most visited first:
// { host, url (the site's front page), title, visits }. Sites whose host is in `exclude` (any
// URLs, e.g. the tiles already on the page) are left out.
export function rankSites(items, { exclude = [], limit = 12 } = {}) {
  const skip = new Set(exclude.map(hostOf));
  const sites = new Map();
  for (const item of items) {
    if (!WEB.test(item?.url ?? '')) continue;
    let u;
    try {
      u = new URL(item.url);
    } catch {
      continue;
    }
    if (LOCAL.test(u.hostname) || isSearch(u) || isSignIn(u)) continue;
    const host = hostOf(item.url);
    if (skip.has(host)) continue;
    const visits = Math.max(1, item.visitCount || 0);
    let site = sites.get(host);
    if (!site) sites.set(host, site = { host, visits: 0, origin: u.origin, best: 0, pages: [] });
    site.visits += visits;
    site.pages.push({ title: item.title || '', visits });
    if (visits > site.best) Object.assign(site, { origin: u.origin, best: visits });
  }
  return [...sites.values()]
    .sort((a, b) => b.visits - a.visits || (a.host < b.host ? -1 : 1))
    .slice(0, limit)
    .map(s => ({ host: s.host, url: s.origin + '/', title: siteName(s.host, s.pages), visits: s.visits }));
}

const TLDS = new Set(['com', 'org', 'net', 'edu', 'gov', 'app', 'dev', 'info', 'biz']);
const GENERIC = new Set(['www', 'web', 'app', 'apps', 'home']);
const SEPARATOR = /\s+[-–—|·•]\s+|:\s+/;
const COUNTER = /^\(\d+\+?\)\s*/;   // "(3) Inbox": unread counts
const compact = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// A site's name: the part of its pages' titles ("Inbox - Gmail", "Pull requests · GitHub") that
// carries one of its host's labels, the most visited one first. Otherwise the host's own label
// ("Example" for example.co.il), otherwise the host.
export function siteName(host, pages) {
  const labels = host.split('.').filter(l => l.length >= 3 && !TLDS.has(l) && !GENERIC.has(l));
  const weight = new Map();
  for (const { title, visits = 1 } of pages) {
    const parts = new Set(String(title || '').replace(COUNTER, '').split(SEPARATOR).map(p => p.replace(COUNTER, '').trim()));
    for (const part of parts) {
      if (!part || part.length > 32 || part.includes('@')) continue;
      const c = compact(part);
      if (labels.some(l => c.includes(l))) weight.set(part, (weight.get(part) ?? 0) + visits);
    }
  }
  const best = [...weight].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0];
  if (best) return best[0];
  const label = labels.at(-1);
  return label ? label[0].toUpperCase() + label.slice(1) : host;
}

// Chrome's bookmark tree → the bookmarks bar: links { id, title, url }, and folders
// { id, title, links } with the links directly inside them (folders can't hold folders here).
export function barItems(tree, limit = 24) {
  const root = tree?.[0];
  const bar = root?.children?.find(n => n.id === '1') ?? root?.children?.[0];
  const isLink = n => typeof n.url === 'string' && WEB.test(n.url);
  const link = n => ({ id: n.id, title: (n.title || '').trim() || hostOf(n.url), url: n.url });
  return (bar?.children ?? []).flatMap(n => {
    if (isLink(n)) return [link(n)];
    if (n.url || !Array.isArray(n.children)) return [];
    const links = n.children.filter(isLink).slice(0, limit).map(link);
    return links.length ? [{ id: n.id, title: (n.title || '').trim() || 'Folder', links }] : [];
  }).slice(0, limit);
}
