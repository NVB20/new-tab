// Adding a Google calendar: a window that walks through finding the calendar's secret iCal
// address (Google Calendar's settings open in a new tab, and a drawing of that page shows where to
// click) and adds the calendar the moment the address is pasted. Coming back to this tab puts the
// cursor in the paste box. Chrome's prompt for the calendar's site needs the paste or the click
// that asks for it, so it's asked before anything is awaited.

import { el, icon, openDialog } from './ui.js';
import { feed, sweep } from './net.js';
import { uid } from './util.js';
import { requestSiteAccess } from './chrome-api.js';
import { siteDomain, sitePattern } from './website.js';
import { linkOf, setLink, releaseLinkSite, calendarKey, fetchCalendar } from './gcal-links.js';
import { MAX_CALENDARS, NOT_A_CALENDAR, calendarUrl, pasteProblem, isPublicAddress, failureOf, nextColor } from './gcal.js';

const SETTINGS = 'https://calendar.google.com/calendar/r/settings';
const CLOSE_MS = 1200;   // how long "Added" shows before the window closes
const PASTE_KEYS = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '') ? '⌘V' : 'Ctrl+V';

const PROBLEMS = {
  'not-link': 'That isn’t an address. Copy the “Secret address in iCal format”: it starts with https:// and ends in basic.ics.',
  'calendar-id': 'That’s the Calendar ID. The secret address is further down, under “Integrate calendar”, and ends in basic.ics.',
  page: 'That’s a link to Google Calendar itself. Copy the “Secret address in iCal format”: it ends in basic.ics.',
};

// Google Calendar's settings page, drawn small in the page's colours: the calendar under
// "Settings for my calendars" (step 2) and the copy button of the secret address (step 3).
const DRAWING = `<svg viewBox="0 0 396 150" role="img" aria-label="Google Calendar settings: your calendar on the left, the secret address's copy button on the right">
  <rect class="s-frame" x="0.5" y="0.5" width="395" height="149" rx="9"/>
  <path class="s-line" d="M0.5 22.5h395M132.5 22.5v127"/>
  <text class="s-muted" x="12" y="15">Settings</text>
  <text class="s-muted" x="12" y="41">General</text>
  <text class="s-muted" x="12" y="57">Add calendar</text>
  <text class="s-label" x="12" y="79">Settings for my calendars</text>
  <rect class="s-hl" x="6" y="86" width="120" height="19" rx="9.5"/>
  <circle class="s-dot" cx="18" cy="95.5" r="4"/>
  <text class="s-strong" x="28" y="99">Your calendar</text>
  <circle class="s-badge" cx="114" cy="95.5" r="7.5"/>
  <text class="s-badge-n" x="114" y="99">2</text>
  <text class="s-muted" x="12" y="125">Settings for other calendars</text>
  <text class="s-head" x="146" y="42">Integrate calendar</text>
  <text class="s-muted" x="146" y="61">Public address in iCal format</text>
  <rect class="s-field" x="146" y="66" width="236" height="17" rx="4"/>
  <text class="s-faint" x="152" y="77.5">https://calendar.google.com/…/public/basic.ics</text>
  <text class="s-strong" x="146" y="103">Secret address in iCal format</text>
  <rect class="s-field s-field-hl" x="146" y="108" width="236" height="21" rx="4"/>
  <text class="s-faint" x="153" y="122">••••••••••••••••••••••••••••••</text>
  <rect class="s-copy" x="354" y="111" width="22" height="15" rx="3"/>
  <path class="s-icon" d="M361.5 114.5h6v6h-6zM364.5 117.5h6v6h-6z"/>
  <circle class="s-badge" cx="382" cy="108" r="7.5"/>
  <text class="s-badge-n" x="382" y="111.5">3</text>
</svg>`;

function drawing() {
  const box = el('div', { class: 'gc-shot' });
  box.innerHTML = DRAWING;
  return box;
}

// Opens the window. Resolves, once it's closed, with the calendar added ({ id, name, color }) or
// null.
export function openAddCalendar(store) {
  const calendars = () => store.get().prefs.gcal.calendars;
  let added = null;
  let busy = false;

  const input = el('input', {
    type: 'text', class: 'pref-input', placeholder: 'https://calendar.google.com/calendar/ical/…/basic.ics', maxLength: 2000,
    spellcheck: false, autocomplete: 'off', 'aria-label': 'Secret address in iCal format',
  });
  const button = el('button', { type: 'button', class: 'btn', text: 'Add', onclick: () => add(input.value) });
  const status = el('p', { class: 'gc-status', 'aria-live': 'polite' });
  const say = (text, kind = '') => {
    status.textContent = text;
    status.className = `gc-status${kind ? ` ${kind}` : ''}`;
  };

  async function add(text) {
    if (busy || added) return;
    const problem = pasteProblem(text);
    if (problem) return say(PROBLEMS[problem], 'bad');
    const url = calendarUrl(text);
    if (calendars().length >= MAX_CALENDARS) return say(`That’s ${MAX_CALENDARS} calendars, the most there can be. Remove one in ✎ to add another.`, 'bad');
    if (calendars().some(c => linkOf(c.id) === url)) return say('That calendar is on the page already.', 'bad');
    const asking = requestSiteAccess(sitePattern(url));
    busy = true;
    button.disabled = true;
    say('Checking the address…');
    try {
      if (!await asking) return say(`Chrome needs access to ${siteDomain(url)} to read the calendar. Press Add to be asked again.`, 'bad');
      const id = uid();
      const r = await feed(calendarKey(id), 0, () => fetchCalendar(url));
      if (!r.data) {
        sweep(calendarKey(id), key => key !== calendarKey(id));
        await releaseLinkSite(url, store.get());
        if (r.error?.message === NOT_A_CALENDAR) return say('That address doesn’t give a calendar. Copy the “Secret address in iCal format”: it ends in basic.ics.', 'bad');
        if (failureOf(r.error) !== 'gone') return say(`Couldn’t reach ${siteDomain(url)}. Check the connection and press Add.`, 'bad');
        return say(isPublicAddress(url)
          ? 'That’s the public address, and this calendar isn’t public. Copy the secret address, just below it.'
          : 'Google doesn’t know that address. Copy it again: it may have been cut short, or reset.', 'bad');
      }
      setLink(id, url);
      added = { id, name: r.data.name || siteDomain(url) };
      store.update(s => {
        const list = s.prefs.gcal.calendars;
        added.color = nextColor(list);
        list.push({ ...added });
      }, ['prefs']);
      input.value = '';
      say(`Added ${added.name}.`, 'good');
      setTimeout(() => input.closest('dialog')?.close(), CLOSE_MS);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  // A paste adds at once; Enter adds what was typed.
  input.addEventListener('paste', ev => {
    const text = ev.clipboardData?.getData('text') ?? '';
    if (!text.trim()) return;
    ev.preventDefault();
    input.value = text.trim();
    add(input.value);
  });
  input.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();   // the window's own form would close it
    add(input.value);
  });

  // Back from Google Calendar's tab: the cursor waits in the box.
  function back() {
    if (document.visibilityState !== 'visible' || !input.isConnected || input.value.trim() || busy || added) return;
    input.focus();
    input.classList.remove('gc-ready');
    void input.offsetWidth;   // restarts the glow
    input.classList.add('gc-ready');
    say(`Now paste it here: ${PASTE_KEYS}`, 'hint');
  }
  addEventListener('focus', back);
  document.addEventListener('visibilitychange', back);

  const open = el('a', {
    class: 'btn btn-primary', href: SETTINGS, target: '_blank', rel: 'noopener',
    onclick: () => say('Copy the secret address there, then come back to this tab.'),
  }, icon('external', 15), 'Open Google Calendar settings');

  const steps = el('ol', { class: 'gc-steps' },
    el('li', {}, el('span', { text: 'Open your Google Calendar’s settings. They open in a new tab.' }), el('div', {}, open)),
    el('li', {}, 'On the left, under ', el('b', { text: 'Settings for my calendars' }), ', click your calendar.'),
    el('li', {}, 'Scroll to ', el('b', { text: 'Integrate calendar' }), '. Next to ', el('b', { text: 'Secret address in iCal format' }),
      ', click the copy button.', drawing()),
    el('li', {}, 'Come back here and paste it. The calendar is added at once.', el('div', { class: 'gc-paste' }, input, button), status));

  const done = openDialog({
    title: 'Add a Google calendar',
    className: 'gc-add-dlg',
    body: [
      steps,
      el('p', { class: 'dlg-message gc-fine', text: 'The secret address lets anyone who has it see the calendar, so it stays on this computer: not in backups, not synced. No secret address? On a work or school account, the admin may have turned it off. Outlook and iCloud calendars work the same way with their iCal address.' }),
    ],
    actions: [{ label: 'Close', value: null }],
  });
  return done.then(() => {
    removeEventListener('focus', back);
    document.removeEventListener('visibilitychange', back);
    return added;
  });
}
