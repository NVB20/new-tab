// The background script: rings the Countdown widget's timers and dates (js/countdown.js) when
// they end, with or without a new tab open. It reads the saved state, keeps one alarm per
// countdown that will end, and shows a notification when one does. The page never talks to it:
// starting, pausing or editing a countdown saves the state, and that's what it follows.
// It also takes away a tab's Website header rules once the tab isn't the new tab page any more.

import { cleanCountdowns, endOf, nameOf, doneText } from './js/countdown.js';
import { forTab } from './js/website.js';

// An alarm per countdown, named for its end: "countdown:<id>:<end ms>". A changed end is a new
// name, so nothing has to compare times.
const PREFIX = 'countdown:';
const alarmName = c => `${PREFIX}${c.id}:${endOf(c)}`;

async function savedCountdowns() {
  const { state } = await chrome.storage.local.get('state');
  return cleanCountdowns(state?.countdowns);
}

async function sync(list) {
  const now = Date.now();
  const want = new Map(list.filter(c => endOf(c) != null && endOf(c) > now).map(c => [alarmName(c), endOf(c)]));
  const have = (await chrome.alarms.getAll()).filter(a => a.name.startsWith(PREFIX));
  await Promise.all(have.filter(a => !want.has(a.name)).map(a => chrome.alarms.clear(a.name)));
  const names = new Set(have.map(a => a.name));
  await Promise.all([...want].filter(([name]) => !names.has(name)).map(([name, when]) => chrome.alarms.create(name, { when })));
}

const syncSaved = async () => sync(await savedCountdowns());

chrome.runtime.onInstalled.addListener(syncSaved);
chrome.runtime.onStartup.addListener(syncSaved);

// The page saves the whole state; only a change to the countdowns matters here.
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes.state;
  if (area !== 'local' || !change) return;
  const list = cleanCountdowns(change.newValue?.countdowns);
  if (JSON.stringify(list) === JSON.stringify(cleanCountdowns(change.oldValue?.countdowns))) return;
  sync(list);
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith(PREFIX)) return;
  const [, id, end] = alarm.name.split(':');
  const c = (await savedCountdowns()).find(x => x.id === id);
  // Paused, reset, edited or deleted since: that saved a new end (or none), and a new alarm.
  if (!c || endOf(c) !== Number(end)) return;
  chrome.notifications?.create(`${PREFIX}${id}`, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: nameOf(c),
    message: doneText(c),
    priority: 2,
    requireInteraction: c.kind === 'timer',
  });
});

// A click on the notification opens a new tab, where the countdown waits with Dismiss.
chrome.notifications?.onClicked.addListener(id => {
  if (!id.startsWith(PREFIX)) return;
  chrome.notifications.clear(id);
  chrome.tabs.create({});
});

// ---- Website widget ----

// A new tab page lifts its Website sites' frame-blocking headers in its own tab only (session
// rules, see js/website.js). When the tab closes, is swapped for another, or goes to a site, its
// rules go, so the sites keep their protection there.
const ownPage = url => url.startsWith('chrome://newtab') || url.startsWith(chrome.runtime.getURL(''));
async function dropFrameRules(tabId) {
  try {
    const ids = (await chrome.declarativeNetRequest.getSessionRules()).filter(r => forTab(r, tabId)).map(r => r.id);
    if (ids.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
  } catch {
    // no rules API (permissions from before the Website widget): nothing to drop
  }
}

chrome.tabs.onRemoved.addListener(tabId => dropFrameRules(tabId));
chrome.tabs.onReplaced.addListener((added, removed) => dropFrameRules(removed));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url && !ownPage(change.url)) dropFrameRules(tabId);
});
