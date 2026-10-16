# Website widget: any site, live, in a frame

Date: 2026-10-16
Status: approved

A new widget type, **Website**, shows a page from any site (Pinterest was the ask) in a frame on
the canvas, logged in as you are in Chrome. Up to five copies, each with its own address and zoom.

## Why sites refuse, and how the widget gets past it

Most big sites forbid other pages from framing them. Pinterest sends `X-Frame-Options:
SAMEORIGIN` and `Content-Security-Policy: … frame-ancestors 'self'`, so a plain `<iframe>` shows
Chrome's "refused to connect" page. An extension can remove response headers with
`declarativeNetRequest`, which is what the widget does, scoped as tightly as the API allows:

- **One dynamic rule per site in use** (ids 1–20), rebuilt from the layout whenever a Website copy
  mounts, changes address or is removed: it removes `x-frame-options` and
  `content-security-policy` from `sub_frame` responses of that site (`requestDomains`, which also
  covers its subdomains), and only when the frame load was started by this extension or by the
  site itself (`initiatorDomains: [extension id, site]`). The site's own entry is there for full
  page loads inside the frame (a login redirect, a reload). Anywhere else in Chrome the site keeps
  its headers. Removing the whole CSP (the API can't edit one directive) drops the site's script
  policy inside the widget only.
- **Access per site.** The rules only act on hosts the extension may access
  (`declarativeNetRequestWithHostAccess`), and access is asked for per site:
  `optional_host_permissions: ["*://*/*"]`, and `chrome.permissions.request` for
  `*://*.<site>/*` from a click in the widget. Chrome's prompt reads "Read and change your data on
  …pinterest.com". The extension never holds access to a site that isn't in a widget (access
  granted for a site stays granted after its widget goes; chrome://extensions removes it).
- **Logins carry over.** Chrome sends a site's cookies, `SameSite=Strict` included, to frames of an
  extension page that has access to the site, even with third-party cookies blocked (checked on
  2026-10-16 with httpbin.org/cookies and `--test-third-party-cookie-phaseout`). Logging in once in
  a normal tab is enough.

Checked on 2026-10-16 in Playwright's Chromium with a throwaway extension: Pinterest renders in the
frame with the rule and doesn't break out; YouTube without a rule shows "refused to connect".
Rejected: a static ruleset (only covers sites known in advance), fetching the page and drawing it
from `srcdoc` (breaks scripts and logins).

## The widget

`website`: label Website, icon `globe`, size 4 × 6, min 2 × 3, max 5, not in the default layout.
Settings: `url` (the start address, `''` until set) and `zoom` (percent, 50–100, step 5, default
100). Its title in Layout mode and Preferences is `Website · pinterest.com` (`Website · no
address`).

What the widget shows, in order of precedence:

1. **The extension, not reloaded since the update** (the APIs are missing: Chrome reads new files
   on every new tab but a new manifest only on a reload): it says so, with **Reload the
   extension** (`chrome.runtime.reload()`). The new permissions add no install warning, so the
   reload grants them without a prompt (unpacked extensions need Developer mode on to reload,
   which they have, since that's how they're loaded).
   **Outside the extension** (Live Server preview): "Websites show in the extension only." and a
   link to the address.
2. **No address:** an address field and **Show**. Show asks Chrome for access to the site (the
   prompt needs the click), saves the address and, once access is granted, loads it.
3. **Not a web address** (typed in Preferences): "That isn't a web address." and a link to the
   settings. Web addresses are `http(s)` only, without a user name or password.
4. **No access to the site:** "Show pinterest.com here? Chrome asks once." and **Allow access**.
   Access granted or removed anywhere (another tab, chrome://extensions) redraws every widget.
5. **The site:** the frame, under a slim head: the site's favicon and name, then **Home** (back to
   the start address), **Reload**, **Open** (the page the frame is on now, in a new tab or this
   one as the Open links in a new tab preference says) and **Settings** (this copy's group in
   Preferences → Layout).

Head buttons other than Settings exist only while the site shows. The frame is
`sandbox`ed with everything a site needs (scripts, same origin, forms, popups that escape the
sandbox, modals, downloads) except top navigation, so no site can navigate the new tab page away.

**Zoom** draws the frame at `100 / zoom` % of the widget's size and scales it down
(`transform: scale`), so at 67% a 400 px widget lays the site out 600 px wide. Changing zoom
doesn't reload the site; changing the address does (after typing stops, 800 ms).

**The page the frame is on.** A frame on another site hides its address from the page, so the
site tells it: `content/site-frame.js`, registered once with `chrome.scripting` for `*://*/*`
(`allFrames`, `document_start`, kept across restarts), which Chrome only injects where the
extension has access, i.e. the widgets' sites. It does nothing unless it's a direct child frame of
this extension's page (`location.ancestorOrigins[0]`), and then posts `{ type: 'newtab:site-page',
url }` to the parent on load and on every Navigation API `currententrychange` (pushState, hash,
back and forward). The widget takes the message only from its own frame (`event.source`), and only
an http(s) address. Reload and Open use it. A site's own scripts can post the same message, but
only about their own frame.

Rejected: `chrome.webNavigation` matched to the frame with `runtime.getFrameId(iframe)`, which
Chrome doesn't have (it's Firefox's); matching by URL breaks with two copies of one site.

## Known limits

- Some sign-ins refuse to run in a frame (Google's, among others): log in in a normal tab.
- A site can still detect it's framed and blank itself; Open shows it in a tab.
- Links inside the frame to another site load in the frame only if that site allows framing
  (no rule is made for it).
- Keyboard shortcuts of the new tab page don't fire while the site has the focus.

## Files

- `js/website.js` (pure, tested): `siteUrl` (the address a copy shows, or null), `sitePattern`
  (the access pattern for its site), `siteDomains(widgets)` and `frameRules(domains,
  extensionId)`.
- `js/chrome-api.js`: `canFrameSites`, `hasSiteAccess`, `requestSiteAccess`,
  `onSiteAccessChange`, `setFrameRules`, `registerFrameScript`.
- `content/site-frame.js`: tells the widget the page its frame is on.
- `js/website-widget.js`: the widget. `js/layout.js` (type, title), `js/registry.js`,
  `js/prefs.js` (Address, Zoom), `js/ui.js` (`home`, `refresh` icons), `css/newtab.css`,
  `manifest.json` (`declarativeNetRequestWithHostAccess`, `scripting`,
  `optional_host_permissions`; neither permission adds an install warning), `README.md`.
- Tests: `test/website.test.js`; `test/layout.test.js` (title, clean).
