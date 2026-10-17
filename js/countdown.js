// Countdowns: the page's list (state.countdowns), each a Timer or a Date, and what a Countdown
// widget shows of one. Pure: unit-tested in Node, and read by the background script, which rings
// them when they end.
//
// timer: { id, kind: 'timer', name, duration, endsAt, left, seen }
//   duration in ms. Ready: endsAt and left null. Running: endsAt (epoch ms). Paused: left (ms).
//   Done: endsAt has passed.
// date: { id, kind: 'date', name, date, time, yearly, since, seen }
//   date 'YYYY-MM-DD', time 'HH:MM' or '' (the start of the day). A yearly date falls on the
//   first of its days from `since` ('YYYY-MM-DD', or '' for the date itself) on; Dismiss moves
//   `since` past it. Feb 29 falls on Feb 28 in other years.
// seen: the end (epoch ms) whose confetti has played, so it plays once per finish.

import { uid, clamp } from './util.js';

export const KINDS = ['timer', 'date'];
export const KIND_LABELS = { timer: 'Timer', date: 'Date' };
export const KIND_ICONS = { timer: 'timer', date: 'calendar' };
export const PRESETS = [5, 10, 25, 60];   // minutes, for a new timer
export const MAX_DURATION = (99 * 3600 + 59 * 60 + 59) * 1000;
export const MAX_COUNTDOWNS = 50;
const MAX_NAME = 60;
const DAY = 864e5;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = v => (typeof v === 'string' ? v : '');
const num = v => (Number.isFinite(v) ? v : null);
const pad = n => String(n).padStart(2, '0');

export const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00`).getTime());
export const isTime = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
// The local day of a moment, 'YYYY-MM-DD'.
export const dayKey = ms => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const parts = day => day.split('-').map(Number);
const daysIn = (y, m) => new Date(y, m, 0).getDate();
// Calendar days from one moment's day to another's (negative when `to` is earlier).
export function daysBetween(from, to) {
  const [a, b] = [new Date(from), new Date(to)];
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
}

// ---- the list ----

export function cleanCountdown(c) {
  if (!isObj(c) || typeof c.id !== 'string' || !c.id || !KINDS.includes(c.kind)) return null;
  const base = { id: c.id.slice(0, 40), kind: c.kind, name: str(c.name).trim().slice(0, MAX_NAME), seen: num(c.seen) };
  if (c.kind === 'timer') {
    if (!Number.isFinite(c.duration)) return null;
    const duration = clamp(Math.round(c.duration), 1000, MAX_DURATION);
    const endsAt = num(c.endsAt);
    const left = endsAt == null && num(c.left) != null ? clamp(c.left, 0, MAX_DURATION) : null;
    return { ...base, duration, endsAt, left };
  }
  if (!isDay(c.date)) return null;
  return { ...base, date: c.date, time: isTime(c.time) ? c.time : '', yearly: c.yearly === true, since: isDay(c.since) ? c.since : '' };
}

// The saved list, whole and valid: junk and repeated ids dropped, at most 50.
export function cleanCountdowns(raw) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const c = cleanCountdown(item);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
    if (out.length === MAX_COUNTDOWNS) break;
  }
  return out;
}

export const newTimer = ({ name = '', duration }) => cleanCountdown({ id: uid(), kind: 'timer', name, duration, endsAt: null, left: null });

// A yearly date counts from today: its next day on or after it.
export const newDate = ({ name = '', date, time = '', yearly = false }, now = Date.now()) =>
  cleanCountdown({ id: uid(), kind: 'date', name, date, time, yearly, since: yearly ? dayKey(now) : '' });

// What a countdown is called when it has no name.
export const nameOf = c => c.name || (c.kind === 'timer' ? 'Timer' : 'Countdown');

// ---- when it ends ----

// The day a date falls on: its own, or for a yearly one the first of its days from `since` on.
export function dayOf(c) {
  if (!c.yearly) return c.date;
  const since = c.since || c.date;
  const [, m, d] = parts(c.date);
  for (let y = parts(since)[0]; ; y++) {
    const day = `${y}-${pad(m)}-${pad(Math.min(d, daysIn(y, m)))}`;
    if (day >= since) return day;
  }
}

// When it ends (epoch ms), or null for a timer that isn't running. A date ends at its time on its
// day, or at the start of the day without one. Doesn't depend on the time now, so the background
// script can tell whether an alarm it set still matches.
export function endOf(c) {
  if (c.kind === 'timer') return c.endsAt;
  const [y, m, d] = parts(dayOf(c));
  const [hh, mm] = c.time ? c.time.split(':').map(Number) : [0, 0];
  return new Date(y, m - 1, d, hh, mm).getTime();
}

// 'ready' | 'running' | 'paused' | 'done' for a timer, 'upcoming' | 'done' for a date.
export function statusOf(c, now) {
  if (c.kind === 'timer') {
    if (c.left != null) return 'paused';
    if (c.endsAt == null) return 'ready';
    return c.endsAt <= now ? 'done' : 'running';
  }
  return endOf(c) <= now ? 'done' : 'upcoming';
}

// What's left (ms): a ready timer's whole duration, a paused one's rest, 0 once done.
export function leftOf(c, now) {
  if (c.kind === 'timer') {
    if (c.left != null) return c.left;
    if (c.endsAt == null) return c.duration;
  }
  return Math.max(0, endOf(c) - now);
}

// The countdown "Next up" shows: one that ended and wasn't dismissed (the latest), else the one
// ending soonest, else a paused timer, else a ready one; the list's order breaks ties.
export function nextUp(list, now) {
  const rank = c => {
    const s = statusOf(c, now);
    if (s === 'done') return [0, -endOf(c)];
    if (s === 'running' || s === 'upcoming') return [1, endOf(c)];
    return [s === 'paused' ? 2 : 3, 0];
  };
  let best = null;
  let bestRank = null;
  for (const c of list) {
    const r = rank(c);
    if (!best || r[0] < bestRank[0] || (r[0] === bestRank[0] && r[1] < bestRank[1])) {
      best = c;
      bestRank = r;
    }
  }
  return best;
}

// The one a copy shows: the countdown it picked, or Next up when it picked that or the one it
// picked is gone.
export function shownCountdown(list, show, now) {
  return (show !== 'next' && list.find(c => c.id === show)) || nextUp(list, now);
}

// Whether a finish is new enough for confetti: not played yet, and less than a day ago.
export const shouldCelebrate = (c, now) => statusOf(c, now) === 'done' && c.seen !== endOf(c) && now - endOf(c) < DAY;

// ---- what changes it (each returns a new countdown, or a new list) ----

export function startTimer(c, now) {
  if (c.kind !== 'timer') return c;
  const s = statusOf(c, now);
  if (s === 'running') return c;
  const left = s === 'paused' ? c.left : c.duration;
  return { ...c, endsAt: now + Math.max(1000, left), left: null };
}

export function pauseTimer(c, now) {
  if (c.kind !== 'timer' || statusOf(c, now) !== 'running') return c;
  return { ...c, endsAt: null, left: c.endsAt - now };
}

export const resetTimer = c => (c.kind === 'timer' ? { ...c, endsAt: null, left: null, seen: null } : c);

// +1 min: more time on a running, paused or ready timer; a finished one runs again for a minute.
export function addMinute(c, now) {
  if (c.kind !== 'timer') return c;
  const s = statusOf(c, now);
  if (s === 'done') return { ...c, duration: 60e3, endsAt: now + 60e3, left: null };
  const duration = Math.min(MAX_DURATION, c.duration + 60e3);
  const more = duration - c.duration;
  if (s === 'running') return { ...c, duration, endsAt: c.endsAt + more };
  if (s === 'paused') return { ...c, duration, left: c.left + more };
  return { ...c, duration };
}

// Dismissing a finished countdown: a timer is ready to start again, a yearly date counts to its
// next year, a one-off date leaves the list.
export function dismiss(list, id) {
  const c = list.find(x => x.id === id);
  if (!c) return list;
  if (c.kind === 'timer') return list.map(x => (x === c ? resetTimer(x) : x));
  if (!c.yearly) return list.filter(x => x !== c);
  const [y, m, d] = parts(dayOf(c));
  return list.map(x => (x === c ? { ...x, since: dayKey(new Date(y, m - 1, d + 1).getTime()), seen: null } : x));
}

// ---- how it reads ----

// "24:13", "1:05:00": a timer's time, or a date's last day, in whole seconds rounded up.
export function clockText(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// What the widget shows big: { big, unit, live }. live: it changes every second. A date shows the
// days to go until its last 24 hours, then the time left; once it's passed, "Today" or "3 days ago".
export function display(c, now) {
  const s = statusOf(c, now);
  if (c.kind === 'timer') return s === 'done' ? { big: 'Time’s up', unit: '', live: false } : { big: clockText(leftOf(c, now)), unit: '', live: s === 'running' };
  const end = endOf(c);
  if (s === 'done') {
    const ago = daysBetween(end, now);
    return { big: ago <= 0 ? 'Today' : ago === 1 ? 'Yesterday' : `${ago} days ago`, unit: '', live: false };
  }
  if (end - now < DAY) return { big: clockText(end - now), unit: '', live: true };
  const days = daysBetween(now, end);
  return { big: String(days), unit: days === 1 ? 'day' : 'days', live: false };
}

// "Sat, Nov 28 · 09:00" (or "9:00 AM"), with the year when it isn't this one.
export function dateLabel(c, now, hour24 = true) {
  const end = new Date(endOf(c));
  const sameYear = end.getFullYear() === new Date(now).getFullYear();
  const day = end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  if (!c.time) return day;
  const time = hour24 ? c.time : end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

// The short "time left" a list row shows: "42 days", "18:05:12", "Paused · 4:00", "Done".
export function shortLeft(c, now) {
  const s = statusOf(c, now);
  if (s === 'done') return 'Done';
  if (s === 'paused') return `Paused · ${clockText(c.left)}`;
  if (s === 'ready') return clockText(c.duration);
  const d = display(c, now);
  return d.unit ? `${d.big} ${d.unit}` : d.big;
}

// The notification's line when it ends.
export const doneText = c => (c.kind === 'timer' ? 'Time’s up' : c.time ? 'It’s time' : 'It’s today');
