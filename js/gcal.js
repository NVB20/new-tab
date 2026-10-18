// Google Calendar: the calendars a page has and what a copy hides, a calendar's iCal feed (its
// private "secret address in iCal format") read into the events of the next two weeks, and the
// agenda a copy shows. An iCal reader of its own, for what Google's feeds use: time zones, all-day
// dates, repeating events with their exceptions and moved occurrences. Pure (unit-tested in Node).

import { dayKey, dayLabel } from './sports.js';

export const MAX_CALENDARS = 10;
// Google Calendar's own colours: a new calendar takes the first no other one has.
export const COLORS = ['#039be5', '#33b679', '#8e24aa', '#f4511e', '#e67c73', '#f6bf26', '#3f51b5', '#0b8043'];
export const DAYS = 14;                     // the agenda: today and the next 13
export const TTL_MS = 10 * 60e3;            // how long a fetched calendar stays fresh
export const JOIN_EARLY_MS = 10 * 60e3;     // a meeting's Join fills this long before it starts

const DAY = 86400e3;
const WINDOW = 16;          // whole UTC days kept after today's, so every time zone has its 13
const MAX_EVENTS = 400;     // per calendar, the earliest kept
const ABOUT_MAX = 500;      // characters of a description kept
const PERIODS = 60000;      // periods of a repeating event walked at most (a daily one since 1860)

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const ID = /^[\w-]{1,40}$/;

// ---- settings ----

// The page's calendars, [{ id, name, color }]: up to MAX_CALENDARS, each id once. A colour that
// isn't one of COLORS takes one by its place in the list.
export function cleanCalendars(list) {
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    if (!isObj(c) || typeof c.id !== 'string' || !ID.test(c.id) || out.some(o => o.id === c.id)) continue;
    out.push({ id: c.id, name: text(c.name, 60) || 'Calendar', color: COLORS.includes(c.color) ? c.color : COLORS[out.length % COLORS.length] });
    if (out.length === MAX_CALENDARS) break;
  }
  return out;
}

// A copy's settings: { hidden }, the ids of the calendars its chips turned off.
export const cleanGcal = s => ({
  hidden: [...new Set(Array.isArray(s?.hidden) ? s.hidden.filter(id => typeof id === 'string' && ID.test(id)) : [])].slice(0, MAX_CALENDARS),
});

export const nextColor = calendars => COLORS.find(c => !calendars.some(x => x.color === c)) ?? COLORS[calendars.length % COLORS.length];
export const colorAfter = color => COLORS[(COLORS.indexOf(color) + 1) % COLORS.length];

// ---- links ----

// The address fetched for a pasted link: webcal:// is https://; http(s) only, without a user name
// or password; null otherwise.
export function calendarUrl(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password && u.hostname.includes('.') ? u.href : null;
  } catch {
    return null;
  }
}

// The calendar's id in a Google link, 'me@gmail.com' from
// https://calendar.google.com/calendar/ical/me%40gmail.com/private-…/basic.ics; '' for other links.
export function googleCalendarId(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'calendar.google.com' && u.hostname !== 'www.google.com') return '';
    const m = /^\/calendar\/ical\/([^/]+)\//.exec(u.pathname);
    return m ? decodeURIComponent(m[1]) : '';
  } catch {
    return '';
  }
}

// A Google Calendar link that isn't an iCal address: the calendar's page, its embed or public
// URL, pasted instead of the secret address.
export const notIcalLink = url => /^https:\/\/(calendar|www)\.google\.com\//.test(url) && !googleCalendarId(url);

// What was pasted instead of an iCal address, or '' when it may be one: 'calendar-id' (the
// Calendar ID, which looks like an email address), 'page' (a link to Google Calendar itself) or
// 'not-link'.
export function pasteProblem(text) {
  const s = String(text ?? '').trim();
  if (/^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/.test(s)) return 'calendar-id';
  const url = calendarUrl(s);
  if (!url) return 'not-link';
  return notIcalLink(url) ? 'page' : '';
}

// Google's public iCal address (…/public/basic.ics), which answers only for a calendar made public.
export const isPublicAddress = url => !!googleCalendarId(url) && /\/public\/[^/]+$/.test(new URL(url).pathname);

// ---- reading the file ----

// One content line: NAME;PARAM=value;PARAM="quoted":value. Null when it isn't one.
function contentLine(raw) {
  const name = /^[A-Za-z0-9-]+/.exec(raw);
  if (!name) return null;
  let i = name[0].length;
  const params = {};
  while (raw[i] === ';') {
    const p = /^;([A-Za-z0-9-]+)=((?:"[^"]*"|[^;:"])*)/.exec(raw.slice(i));
    if (!p) return null;
    params[p[1].toUpperCase()] = p[2].replace(/"/g, '');
    i += p[0].length;
  }
  return raw[i] === ':' ? { name: name[0].toUpperCase(), params, value: raw.slice(i + 1) } : null;
}

// The calendar's own properties and its events, each { NAME: [lines] }. Folded lines (a line
// break then a space or tab) are joined first; an alarm's lines stay out of its event.
function components(ics) {
  const cal = {};
  const events = [];
  const stack = [];
  let event = null;
  for (const raw of ics.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')) {
    const line = contentLine(raw);
    if (!line) continue;
    if (line.name === 'BEGIN') {
      stack.push(line.value.trim().toUpperCase());
      if (stack.at(-1) === 'VEVENT') event = {};
    } else if (line.name === 'END') {
      if (stack.pop() === 'VEVENT' && event) {
        events.push(event);
        event = null;
      }
    } else {
      const into = stack.at(-1) === 'VEVENT' ? event : stack.at(-1) === 'VCALENDAR' ? cal : null;
      if (into) (into[line.name] ??= []).push(line);
    }
  }
  return { cal, events };
}

const one = (e, name) => e[name]?.[0] ?? null;
const unescape = v => v.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

// ---- time ----

const formats = new Map();
function partsAt(ms, timeZone) {
  let f = formats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    formats.set(timeZone, f);
  }
  return Object.fromEntries(f.formatToParts(ms).map(p => [p.type, Number(p.value)]));
}

const zones = new Map();
function knownZone(name) {
  if (!zones.has(name)) {
    let ok = false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: name });
      ok = true;
    } catch {
      // not a zone Intl knows
    }
    zones.set(name, ok);
  }
  return zones.get(name);
}

// A TZID as a zone Intl knows ('/mozilla.org/20050126_1/Europe/Berlin' is Europe/Berlin), else
// undefined.
function zoneNamed(tzid) {
  const name = typeof tzid === 'string' ? tzid.trim() : '';
  if (!name) return undefined;
  if (knownZone(name)) return name;
  const tail = name.split('/').slice(-2).join('/');
  return tail !== name && knownZone(tail) ? tail : undefined;
}

// A wall-clock time in a zone ('UTC', a zone Intl knows, or undefined for this computer's) as an
// instant. Across a DST change the second guess settles it.
function instant(w, zone) {
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  if (zone === 'UTC') return asUtc;
  if (!zone) return new Date(w.y, w.mo - 1, w.d, w.h, w.mi, w.s).getTime();
  const offset = ms => {
    const p = partsAt(ms, zone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  const first = asUtc - offset(asUtc);
  return asUtc - offset(first);
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const keyOf = (y, mo, d) => `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
const serialOf = (y, mo, d) => Date.UTC(y, mo - 1, d) / DAY;
const serialOfKey = key => Date.parse(`${key}T00:00:00Z`) / DAY;
const keyOfSerial = n => new Date(n * DAY).toISOString().slice(0, 10);
const plusDays = (key, n) => keyOfSerial(serialOfKey(key) + n);
function dateOfSerial(n) {
  const d = new Date(n * DAY);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() };
}
const weekdayOf = n => (((n + 4) % 7) + 7) % 7;   // 1970-01-01 was a Thursday
const daysIn = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

// A DTSTART-like value: { date: 'YYYY-MM-DD' } for a date, else { wall, zone }: 'UTC' for a time
// ending in Z, the TZID's zone (or the calendar's when Intl doesn't know it), or undefined for a
// floating time (this computer's zone). Null when it isn't one.
function parseTime(value, params, calZone) {
  const v = String(value).trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}` };
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const wall = { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +m[6] };
  if (params.VALUE === 'DATE') return { date: keyOf(wall.y, wall.mo, wall.d) };
  return { wall, zone: m[7] ? 'UTC' : params.TZID ? zoneNamed(params.TZID) ?? calZone : undefined };
}

const timeOf = (line, calZone) => (line ? parseTime(line.value, line.params, calZone) : null);

// A DURATION in ms ('PT1H30M', 'P1D', '-PT15M'), or null.
function duration(value) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(value ?? '').trim());
  if (!m || m[0].length <= 2) return null;
  const s = (+m[2] || 0) * 7 * 86400 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0);
  return (m[1] === '-' ? -s : s) * 1000;
}

// ---- repeats ----

const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const RULE_PARTS = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST']);

function intList(s, min, max) {
  if (!s) return [];
  const list = s.split(',').map(x => Number(x.trim()));
  return list.every(n => Number.isInteger(n) && n !== 0 && n >= min && n <= max) ? list : null;
}

// An RRULE as { freq, interval, count, until, byDay: [{ n, wd }], byMonthDay, byMonth, wkst }, or
// null when it has a part, or a use of one, this reader doesn't follow.
function parseRule(value, calZone) {
  const parts = {};
  for (const p of String(value).split(';')) {
    const [k, v = ''] = p.split('=');
    if (k.trim()) parts[k.trim().toUpperCase()] = v.trim().toUpperCase();
  }
  if (!FREQS.includes(parts.FREQ) || Object.keys(parts).some(k => !RULE_PARTS.has(k))) return null;
  const byMonthDay = intList(parts.BYMONTHDAY, -31, 31);
  const byMonth = intList(parts.BYMONTH, 1, 12);
  const byDay = [];
  for (const d of parts.BYDAY ? parts.BYDAY.split(',') : []) {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d.trim());
    if (!m || (m[1] && (Math.abs(+m[1]) < 1 || Math.abs(+m[1]) > 5))) return null;
    byDay.push({ n: m[1] ? +m[1] : 0, wd: WEEKDAYS.indexOf(m[2]) });
  }
  if (!byMonthDay || !byMonth) return null;
  const freq = parts.FREQ;
  const ordinals = byDay.some(d => d.n);
  if (ordinals && (freq === 'DAILY' || freq === 'WEEKLY' || (freq === 'YEARLY' && !byMonth.length))) return null;
  if (freq === 'WEEKLY' && byMonthDay.length) return null;
  const interval = Number(parts.INTERVAL || 1);
  const count = parts.COUNT ? Number(parts.COUNT) : null;
  if (!Number.isInteger(interval) || interval < 1 || (count !== null && (!Number.isInteger(count) || count < 1))) return null;
  const until = parts.UNTIL ? parseTime(parts.UNTIL, {}, calZone) : null;
  if (parts.UNTIL && !until) return null;
  const wkst = parts.WKST ? WEEKDAYS.indexOf(parts.WKST) : 1;
  if (wkst < 0) return null;
  return { freq, interval, count, until, byDay, byMonthDay, byMonth, wkst };
}

// The days of month (y, mo) a MONTHLY or YEARLY rule picks (1–31, ascending): BYMONTHDAY and
// BYDAY (an ordinal counts within the month), both when both are given, else the start's day.
function monthDays(y, mo, rule, startDay) {
  const n = daysIn(y, mo);
  let days = null;
  if (rule.byMonthDay.length) days = rule.byMonthDay.map(d => (d > 0 ? d : n + d + 1)).filter(d => d >= 1 && d <= n);
  if (rule.byDay.length) {
    const first = weekdayOf(serialOf(y, mo, 1));
    const picked = [];
    for (const { n: ord, wd } of rule.byDay) {
      const all = [];
      for (let d = 1 + ((wd - first + 7) % 7); d <= n; d += 7) all.push(d);
      if (!ord) picked.push(...all);
      else if (all[ord > 0 ? ord - 1 : all.length + ord]) picked.push(all[ord > 0 ? ord - 1 : all.length + ord]);
    }
    days = days ? days.filter(d => picked.includes(d)) : picked;
  }
  days ??= startDay <= n ? [startDay] : [];
  return [...new Set(days)].sort((a, b) => a - b);
}

// Period k of a rule from the start (a serial day): { from: its first day, days: the serial days
// it picks, ascending }.
function period(rule, start, k) {
  const { y, mo, d } = dateOfSerial(start);
  const inMonths = m => !rule.byMonth.length || rule.byMonth.includes(m);
  if (rule.freq === 'DAILY') {
    const day = start + k * rule.interval;
    const at = dateOfSerial(day);
    const n = daysIn(at.y, at.mo);
    const ok = inMonths(at.mo)
      && (!rule.byMonthDay.length || rule.byMonthDay.some(x => (x > 0 ? x : n + x + 1) === at.d))
      && (!rule.byDay.length || rule.byDay.some(x => x.wd === weekdayOf(day)));
    return { from: day, days: ok ? [day] : [] };
  }
  if (rule.freq === 'WEEKLY') {
    const week = start - ((weekdayOf(start) - rule.wkst + 7) % 7) + 7 * rule.interval * k;
    const wds = rule.byDay.length ? rule.byDay.map(x => x.wd) : [weekdayOf(start)];
    const days = [...new Set(wds.map(wd => week + ((wd - rule.wkst + 7) % 7)))].sort((a, b) => a - b);
    return { from: week, days: days.filter(s => inMonths(dateOfSerial(s).mo)) };
  }
  if (rule.freq === 'MONTHLY') {
    const index = y * 12 + (mo - 1) + k * rule.interval;
    const [yy, mm] = [Math.floor(index / 12), (index % 12) + 1];
    return { from: serialOf(yy, mm, 1), days: inMonths(mm) ? monthDays(yy, mm, rule, d).map(x => serialOf(yy, mm, x)) : [] };
  }
  const yy = y + k * rule.interval;
  const months = rule.byMonth.length ? [...rule.byMonth].sort((a, b) => a - b)
    : rule.byMonthDay.length || rule.byDay.length ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [mo];
  return { from: serialOf(yy, 1, 1), days: months.flatMap(m => monthDays(yy, m, rule, d).map(x => serialOf(yy, m, x))) };
}

// The serial days a repeating event starts on, from `first` to `last`: the start always counts as
// the first occurrence, then the rule's days until COUNT, UNTIL (within(day) says) or `last`.
function repeatDays(rule, start, first, last, within) {
  const out = start >= first && start <= last ? [start] : [];
  let count = 1;
  for (let k = 0; k < PERIODS; k++) {
    const p = period(rule, start, k);
    if (p.from > last) break;
    for (const day of p.days) {
      if (day <= start) continue;
      if (day > last || !within(day) || (rule.count && count >= rule.count)) return out;
      count++;
      if (day >= first) out.push(day);
    }
  }
  return out;
}

// ---- events ----

const MEETING = /https:\/\/(?:meet\.google\.com\/[\w-]+|(?:[\w-]+\.)*zoom\.us\/(?:j|my|w|s)\/[^\s<>"')\]]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"')\]]+|teams\.live\.com\/meet\/[^\s<>"')\]]+|(?:[\w-]+\.)*webex\.com\/[^\s<>"')\]]+)/i;

// The call to join: Google's own conference property, else the first Meet, Zoom, Teams or Webex
// link in the place, then in the description.
function meetingLink(e, where, about) {
  const google = one(e, 'X-GOOGLE-CONFERENCE')?.value.trim() ?? '';
  if (/^https:\/\/\S+$/.test(google)) return google;
  const found = MEETING.exec(where) ?? MEETING.exec(about);
  return found ? found[0].replace(/[.,;:!?]+$/, '') : '';
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

// A description as plain text: Google's Meet block (between its -::~:~::~ lines) goes, HTML
// becomes text, blank runs close up, and it's cut at ABOUT_MAX.
function plainText(raw) {
  let s = raw.replace(/-::~[:~]*::-[\s\S]*?-::~[:~]*::-/g, '');
  if (/<\/?[a-z][^>]*>/i.test(s)) {
    s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]*>/g, '')
      .replace(/&(#\d+|[a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? (name[0] === '#' ? String.fromCodePoint(Number(name.slice(1)) || 32) : m));
  }
  s = s.replace(/[ \t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.length > ABOUT_MAX ? `${s.slice(0, ABOUT_MAX - 1).trimEnd()}…` : s;
}

const base64url = s => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Google Calendar's page for an event: eid is "<event id> <calendar id>" in base64url, the event
// id being the UID without @google.com, plus _<original start> for one occurrence of a repeating
// event. '' when that can't be built (not a Google link, or an event Google didn't make).
function googleLink(uid, calendarId, instanceKey) {
  if (!calendarId || !uid.endsWith('@google.com')) return '';
  const id = uid.slice(0, -'@google.com'.length) + (instanceKey ? `_${instanceKey}` : '');
  try {
    return `https://calendar.google.com/calendar/event?eid=${base64url(`${id} ${calendarId}`)}`;
  } catch {
    return '';   // a calendar id btoa can't take
  }
}

// An occurrence's original start as Google names it in event ids: 20261020T070000Z, or 20261020.
const instanceKeyOf = original => (typeof original === 'string' ? original.replaceAll('-', '')
  : new Date(original).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''));

// What every occurrence of a VEVENT shares, or null for one with no start, cancelled, or declined
// by the calendar's owner (me: their address).
function details(e, calZone, me) {
  const start = timeOf(one(e, 'DTSTART'), calZone);
  if (!start) return null;
  const uid = one(e, 'UID')?.value.trim() ?? '';
  const declined = me && (e.ATTENDEE ?? []).some(a => a.value.trim().toLowerCase() === `mailto:${me}` && a.params.PARTSTAT?.toUpperCase() === 'DECLINED');
  if (declined || one(e, 'STATUS')?.value.trim().toUpperCase() === 'CANCELLED') return { start, uid, cancelled: true };
  const end = timeOf(one(e, 'DTEND'), calZone);
  const span = duration(one(e, 'DURATION')?.value);
  let length;   // whole days for a date, ms for a time
  if (start.date) {
    length = end?.date ? serialOfKey(end.date) - serialOfKey(start.date) : span ? Math.round(span / DAY) : 1;
    length = Math.max(1, length);
  } else {
    length = end && !end.date ? instant(end.wall, end.zone) - instant(start.wall, start.zone) : span ?? 0;
    length = Math.max(0, length);
  }
  const rawAbout = unescape(one(e, 'DESCRIPTION')?.value ?? '');
  const where = text(unescape(one(e, 'LOCATION')?.value ?? ''), 200);
  const url = one(e, 'URL')?.value.trim() ?? '';
  return {
    start,
    length,
    uid,
    title: text(unescape(one(e, 'SUMMARY')?.value ?? ''), 200) || '(No title)',
    where,
    about: plainText(rawAbout),
    meet: meetingLink(e, where, rawAbout),
    url: /^https?:\/\/\S+$/i.test(url) ? url : '',
  };
}

// One event of the agenda: { id, title, allDay, from/to (dates, to exclusive) or start/end (ms),
// where, about, meet, link }.
function occurrence(d, at, original, { calendarId, recurring }) {
  const key = original ?? (at.date ?? at.ms);
  const link = googleLink(d.uid, calendarId, recurring ? instanceKeyOf(key) : '') || d.url
    || (calendarId ? `https://calendar.google.com/calendar/r/day/${(at.date ?? new Date(at.ms).toISOString().slice(0, 10)).replaceAll('-', '/')}` : '');
  const common = { id: `${d.uid || d.title}|${key}`, title: d.title, where: d.where, about: d.about, meet: d.meet, link };
  return at.date
    ? { ...common, allDay: true, from: at.date, to: plusDays(at.date, d.length) }
    : { ...common, allDay: false, start: at.ms, end: at.ms + d.length };
}

// The calendar in an iCal file, { name, events } with the events from yesterday to WINDOW days
// on (UTC) in start order, or null when it isn't one. url: the link it came from (a Google link
// gives the owner's address, for declined events and event links).
export function parseCalendar(ics, { url = '', now = Date.now() } = {}) {
  if (typeof ics !== 'string' || !/^\s*BEGIN:VCALENDAR/i.test(ics)) return null;
  const { cal, events } = components(ics);
  const calZone = zoneNamed(one(cal, 'X-WR-TIMEZONE')?.value);
  const calendarId = googleCalendarId(url);
  const me = calendarId.toLowerCase();
  const today = Math.floor(now / DAY);
  const [firstDay, lastDay] = [today - 1, today + WINDOW];
  const [fromMs, toMs] = [firstDay * DAY, (lastDay + 1) * DAY];
  const [fromKey, toKey] = [keyOfSerial(firstDay), keyOfSerial(lastDay + 1)];
  const overlaps = o => (o.allDay ? o.to > fromKey && o.from < toKey : o.end > fromMs && o.start < toMs) || (!o.allDay && o.start === o.end && o.start >= fromMs && o.start < toMs);
  const out = [];
  // Moved and cancelled occurrences, by UID and original start (a date, or ms).
  const replaced = new Set();
  for (const e of events.filter(x => x['RECURRENCE-ID'])) {
    const original = timeOf(one(e, 'RECURRENCE-ID'), calZone);
    const d = details(e, calZone, me);
    if (!original || !d) continue;
    const key = original.date ?? instant(original.wall, original.zone);
    replaced.add(`${d.uid}|${key}`);
    if (d.cancelled) continue;
    const at = d.start.date ? { date: d.start.date } : { ms: instant(d.start.wall, d.start.zone) };
    const o = occurrence(d, at, key, { calendarId, recurring: true });
    if (overlaps(o)) out.push(o);
  }
  for (const e of events.filter(x => !x['RECURRENCE-ID'])) {
    const d = details(e, calZone, me);
    if (!d || d.cancelled) continue;
    const ruleLine = one(e, 'RRULE');
    const rule = ruleLine ? parseRule(ruleLine.value, calZone) : null;
    const { start } = d;
    const startDay = start.date ? serialOfKey(start.date) : serialOf(start.wall.y, start.wall.mo, start.wall.d);
    const atDay = day => {
      if (start.date) return { date: keyOfSerial(day) };
      const { y, mo, d: dd } = dateOfSerial(day);
      return { ms: instant({ ...start.wall, y, mo, d: dd }, start.zone) };
    };
    const untilOk = day => {
      const u = rule?.until;
      if (!u) return true;
      if (u.date) return day <= serialOfKey(u.date);
      const at = atDay(day);
      return (at.ms ?? day * DAY) <= instant(u.wall, u.zone);
    };
    const reach = start.date ? d.length : Math.ceil(d.length / DAY) + 1;   // days an occurrence may run into
    const days = rule ? repeatDays(rule, startDay, firstDay - reach - 1, lastDay + 1, untilOk) : [startDay];
    const exDates = new Set();
    const exTimes = new Set();
    for (const line of e.EXDATE ?? []) {
      for (const v of line.value.split(',')) {
        const t = parseTime(v, line.params, calZone);
        if (t?.date) exDates.add(t.date);
        else if (t) exTimes.add(instant(t.wall, t.zone));
      }
    }
    for (const day of days) {
      const at = atDay(day);
      const key = at.date ?? at.ms;
      if (exDates.has(keyOfSerial(day)) || exTimes.has(at.ms) || replaced.has(`${d.uid}|${key}`)) continue;
      const o = occurrence(d, at, key, { calendarId, recurring: !!ruleLine });
      if (overlaps(o)) out.push(o);
    }
  }
  const startOf = o => (o.allDay ? Date.parse(`${o.from}T00:00:00Z`) : o.start);
  out.sort((a, b) => startOf(a) - startOf(b) || a.title.localeCompare(b.title));
  return { name: text(unescape(one(cal, 'X-WR-CALNAME')?.value ?? ''), 60), events: out.slice(0, MAX_EVENTS) };
}

// ---- the agenda ----

// What a row is now: an all-day one (or a day a longer event covers whole); past, now (going on),
// next (the first ahead, on the day it starts) or later.
function stateOf(e, part, now, nextAt) {
  if (e.allDay || part === 'middle') return 'allday';
  if (now >= e.end) return 'past';
  if (now >= e.start) return 'now';
  return e.start === nextAt && part === 'start' ? 'next' : 'later';
}

// A copy's rows by local day: today always, then each day up to `days` on with an event
// ([{ day, label, events }]). events: every calendar shown, each event with its `cal`. An event
// shows on every day it covers: part 'start' on its first, 'end' on its last (when that isn't its
// first), 'middle' in between. All-day rows first, then by start.
export function agenda(events, { now, timeZone, days = DAYS }) {
  const today = dayKey(now, timeZone);
  const last = plusDays(today, days - 1);
  const ahead = events.filter(e => !e.allDay && e.start > now).map(e => e.start);
  const nextAt = ahead.length ? Math.min(...ahead) : null;
  const groups = new Map([[today, []]]);
  for (const e of events) {
    const first = e.allDay ? e.from : dayKey(e.start, timeZone);
    const final = e.allDay ? plusDays(e.to, -1) : dayKey(Math.max(e.start, e.end - 1), timeZone);
    for (let day = first < today ? today : first; day <= final && day <= last; day = plusDays(day, 1)) {
      const part = day === first ? 'start' : day === final ? 'end' : 'middle';
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push({ ...e, part, state: stateOf(e, part, now, nextAt) });
    }
  }
  const order = e => (e.state === 'allday' ? 0 : 1);
  const startOf = e => (e.allDay ? 0 : e.start);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({
    day,
    label: dayLabel(day, today),
    events: list.sort((a, b) => order(a) - order(b) || startOf(a) - startOf(b) || a.title.localeCompare(b.title)),
  }));
}

// A meeting's Join: 'soon' from JOIN_EARLY_MS before it starts until it ends, 'later' before that,
// '' with no link or once it's over.
export function joinState(e, now) {
  if (!e.meet || e.allDay || now >= e.end) return '';
  return now >= e.start - JOIN_EARLY_MS ? 'soon' : 'later';
}

// The error a link that answers something other than a calendar fails with (a sign-in page, say).
export const NOT_A_CALENDAR = 'Not a calendar';

// Why a calendar's fetch failed, from its error (or the attempt record net.js kept of it): 'gone'
// when the link no longer gives the calendar (a 4xx, or something else answered), else 'down'.
export function failureOf(error) {
  if (error?.message === NOT_A_CALENDAR) return 'gone';
  return error?.status >= 400 && error.status < 500 && error.status !== 429 ? 'gone' : 'down';
}
