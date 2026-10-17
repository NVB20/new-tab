// Website: a page from any site, live in a frame, logged in as you are in Chrome. Sites forbid
// being framed, so the extension lifts those headers for its own frames, site by site, once
// Chrome's prompt has granted access to the site (see website.js). Outside the extension nothing
// can lift them, and the widget is a link to the site.

import { el, icon, widgetEmpty } from './ui.js';
import { copyById, allLayouts, copiesOf, TYPES } from './layout.js';
import { MAX_SITES, siteUrl, siteDomain, sitePattern, siteDomains, frameRules, framePatterns, sameRules } from './website.js';
import {
  canFrameSites, framingNeedsReload, reloadExtension, extensionId, hasSiteAccess, requestSiteAccess, onSiteAccessChange, setFrameRules,
  frameRulesNow, syncFrameScript, faviconUrl, openUrl,
} from './chrome-api.js';

const RECONFIGURE_MS = 800;   // wait for typing to stop before loading a changed address
// Everything a site needs, except navigating the new tab page away.
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads';
const ALLOW = 'fullscreen; clipboard-write; autoplay; encrypted-media; picture-in-picture';

// The header rules and the frame script for every site a layout shows (the main one and every
// tab's own, so switching tabs rewrites nothing). Each is written only when Chrome doesn't hold
// it already, so a new tab usually just reads them.
async function syncSites(store) {
  const domains = siteDomains(allLayouts(store.get()).flatMap(copiesOf)).slice(0, MAX_SITES);
  const rules = frameRules(domains, extensionId);
  const syncRules = async () => {
    try {
      if (!sameRules(await frameRulesNow(MAX_SITES), rules)) await setFrameRules(rules, MAX_SITES);
    } catch (err) {
      console.warn('Could not update the Website rules', err);
    }
  };
  await Promise.all([syncRules(), syncFrameScript(framePatterns(domains))]);
}

// The frame script used to be registered for every site. Once, even with no Website widget on
// the page, a registration left from then is narrowed to the widgets' sites (or removed).
const TIDIED_KEY = 'newtab:frame-script-tidied';
export function tidyFrameScript(store) {
  if (!canFrameSites) return;
  try {
    if (localStorage.getItem(TIDIED_KEY)) return;
    localStorage.setItem(TIDIED_KEY, '1');
  } catch {
    return;
  }
  syncSites(store);
}

// fn(url) runs whenever the site in `iframe` reports the page it's on (content/site-frame.js). A
// site's own scripts could post the same message, but only about their own frame.
function watchFrame(iframe, fn) {
  const listener = e => {
    if (e.source === iframe.contentWindow && e.data?.type === 'newtab:site-page' && siteUrl(e.data.url)) fn(e.data.url);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

export function mountWebsite(root, store, copy, ctx) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.website.defaults();
  const openSettings = () => ctx.openPrefs('layout', copy.id);

  const button = (name, title, onclick) =>
    el('button', { type: 'button', class: 'icon-btn site-btn', title, 'aria-label': title, onclick }, icon(name, 15));
  const mark = el('span', { class: 'site-mark' });
  const name = el('span', { class: 'site-name' });
  // Home, Reload and Open only while the site shows.
  const pageTools = el('span', { class: 'site-tools' },
    button('home', 'Back to the start page', () => go(start)),
    button('refresh', 'Reload', () => go(current)),
    button('external', 'Open this page', e => openUrl(current, { newTab: store.get().prefs.openInNewTab || e.ctrlKey || e.metaKey })));
  const head = el('h2', { class: 'widget-head site-head' }, mark, name, pageTools, button('settings', 'Website settings', openSettings));
  const body = el('div', { class: 'site-body' });
  const section = el('section', { class: 'widget widget-website' }, head, body);
  root.append(section);

  let shown = '';       // what the body holds: 'site:<url>', 'ask:<url>', 'setup', …
  let frame = null;
  let start = null;     // the address the frame started on
  let current = null;   // the page it's on now, as the frame reports it
  let stopWatching = () => {};
  let seq = 0;

  function setHead(url) {
    const favicon = url && faviconUrl(url, 32);
    mark.replaceChildren(favicon ? el('img', { class: 'site-favicon', src: favicon, alt: '' }) : icon('globe', 18));
    name.textContent = url ? siteDomain(url) : 'Website';
    pageTools.hidden = !frame;
  }

  // Anything but the site. The same message isn't redrawn, so a half-typed address survives.
  function showMessage(key, url, ...children) {
    if (key === shown) return;
    shown = key;
    stopWatching();
    frame = start = current = null;
    body.replaceChildren(...children);
    setHead(url);
  }

  function showSite(url) {
    if (shown === `site:${url}`) return;
    shown = `site:${url}`;
    stopWatching();
    start = current = url;
    frame = el('iframe', {
      class: 'site-frame', src: url, title: siteDomain(url), sandbox: SANDBOX, allow: ALLOW, referrerpolicy: 'strict-origin-when-cross-origin',
    });
    body.replaceChildren(el('div', { class: 'site-view' }, frame));
    stopWatching = watchFrame(frame, u => { current = u; });
    setHead(url);
  }

  // Setting src loads the address even when it's the one already there.
  function go(url) {
    if (!frame || !url) return;
    current = url;
    frame.src = url;
  }

  function setupForm() {
    const input = el('input', {
      type: 'text', class: 'pref-input', placeholder: 'pinterest.com', maxLength: 2000,
      spellcheck: false, autocomplete: 'off', 'aria-label': 'Website address',
    });
    const note = el('p', { class: 'widget-note', text: 'Chrome asks once to let this page show the site.' });
    const form = el('form', {
      class: 'site-setup',
      onsubmit: e => {
        e.preventDefault();
        const url = siteUrl(input.value);
        if (!url) {
          note.textContent = 'That isn’t a web address.';
          input.focus();
          return;
        }
        const asking = requestSiteAccess(sitePattern(url));   // first: the prompt needs this click
        conf = url;
        store.update(s => {
          const own = copyById(s, copy.id);
          if (own) own.settings.url = url;
        });
        show();
        asking.then(show);
      },
    }, input, el('button', { type: 'submit', class: 'btn', text: 'Show' }));
    return [widgetEmpty('Which site should this widget show?'), form, note];
  }

  async function show() {
    const my = ++seq;
    const raw = settings().url;
    const url = siteUrl(raw);
    if (framingNeedsReload) {
      showMessage('reload', url,
        widgetEmpty('Chrome is still running this extension without the permissions Website widgets need. Reloading it once turns them on.'),
        el('button', { type: 'button', class: 'btn btn-primary', text: 'Reload the extension', onclick: reloadExtension }));
      return;
    }
    if (!canFrameSites) {
      showMessage(`outside:${url}`, url, widgetEmpty('Websites show in the extension only. ',
        url && el('a', { href: url, target: '_blank', rel: 'noopener', text: `Open ${siteDomain(url)}` })));
      return;
    }
    if (!raw.trim()) {
      showMessage('setup', null, ...setupForm());
      return;
    }
    if (!url) {
      showMessage('bad', null, widgetEmpty('That isn’t a web address. ',
        el('button', { type: 'button', class: 'link-btn', text: 'Change it', onclick: openSettings })));
      return;
    }
    const allowed = await hasSiteAccess(sitePattern(url));
    if (my !== seq) return;
    if (!allowed) {
      showMessage(`ask:${url}`, url,
        widgetEmpty(`Show ${siteDomain(url)} here? Chrome asks once for access to the site.`),
        el('button', { type: 'button', class: 'btn btn-primary', text: 'Allow access', onclick: () => requestSiteAccess(sitePattern(url)).then(show) }));
      return;
    }
    await syncSites(store);
    if (my === seq && !gone) showSite(url);
  }

  // ---- wiring ----

  let conf = null;
  let timer = 0;
  let gone = false;

  function onPrefs(state) {
    const own = copyById(state, copy.id);
    if (!own) return;
    section.style.setProperty('--zoom', String(own.settings.zoom / 100));
    if (own.settings.url === conf) return;
    const first = conf === null;
    conf = own.settings.url;
    clearTimeout(timer);
    // A new tab's first paint doesn't wait for a whole other site: its frame starts after it.
    if (first) requestAnimationFrame(() => { if (!gone) timer = setTimeout(show); });
    else timer = setTimeout(show, RECONFIGURE_MS);
  }

  const unsubscribe = store.subscribe(onPrefs, ['prefs']);
  const stopAccess = onSiteAccessChange(show);
  onPrefs(store.get());

  return {
    destroy() {
      seq++;   // a show still running draws nothing
      gone = true;
      clearTimeout(timer);
      stopWatching();
      stopAccess();
      unsubscribe();
      if (canFrameSites) syncSites(store);   // the site of a removed copy loses its rule and script
    },
  };
}
