import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCalendars, cleanGcal, nextColor, colorAfter, calendarUrl, googleCalendarId, notIcalLink, parseCalendar, agenda,
  joinState, failureOf, NOT_A_CALENDAR, COLORS, MAX_CALENDARS, JOIN_EARLY_MS,
} from '../js/gcal.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const NOW = Date.parse('2026-10-18T09:00:00Z');   // a Sunday; New York goes back to EST on 1 Nov
const GOOGLE = 'https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc123/basic.ics';

// An iCal file around some VEVENT bodies (lines without BEGIN/END, indented 4 spaces; a folded
// line's continuation has one more), with CRLF line ends.
const ics = (events, head = 'X-WR-CALNAME:Personal\nX-WR-TIMEZONE:America/New_York') => [
  'BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'VERSION:2.0', head,
  ...events.map(body => `BEGIN:VEVENT\n${body.replace(/^\n+|\s+$/g, '').split('\n').map(l => l.replace(/^ {4}/, '')).join('\n')}\nEND:VEVENT`),
  'END:VCALENDAR',
].join('\n').replace(/\n/g, '\r\n');

const parse = (events, opts = {}) => parseCalendar(ics(events, opts.head), { url: GOOGLE, now: NOW, ...opts });
const starts = cal => cal.events.map(e => (e.allDay ? e.from : new Date(e.start).toISOString()));

test('reads a calendar: its name, folded lines and escapes, UTC times', () => {
  const cal = parse([`
    UID:a1@google.com
    DTSTART:20261020T130000Z
    DTEND:20261020T140000Z
    SUMMARY:Lunch\\, then a walk
    LOCATION:Café Nord\\; corner table
    DESCRIPTION:Bring the
      report\\nand the slides
  `]);
  assert.equal(cal.name, 'Personal');
  assert.equal(cal.events.length, 1);
  const [e] = cal.events;
  assert.equal(e.title, 'Lunch, then a walk');
  assert.equal(e.where, 'Café Nord; corner table');
  assert.equal(e.about, 'Bring the report\nand the slides');
  assert.equal(e.allDay, false);
  assert.equal(e.start, Date.parse('2026-10-20T13:00:00Z'));
  assert.equal(e.end, Date.parse('2026-10-20T14:00:00Z'));
});

test('is null for anything that isn’t a calendar', () => {
  assert.equal(parseCalendar('<!doctype html><title>Sign in</title>', { now: NOW }), null);
  assert.equal(parseCalendar(null, { now: NOW }), null);
});

test('times in a zone, floating, and a TZID Intl doesn’t know (the calendar’s zone)', () => {
  const cal = parse([`
    UID:z@google.com
    DTSTART;TZID=America/New_York:20261020T090000
    DTEND;TZID=America/New_York:20261020T093000
    SUMMARY:Zoned
  `, `
    UID:f@google.com
    DTSTART:20261021T090000
    SUMMARY:Floating
  `, `
    UID:w@google.com
    DTSTART;TZID=Eastern Standard Time:20261022T090000
    DTEND;TZID=Eastern Standard Time:20261022T100000
    SUMMARY:Windows zone
  `]);
  const by = Object.fromEntries(cal.events.map(e => [e.title, e]));
  assert.equal(by.Zoned.start, Date.parse('2026-10-20T13:00:00Z'));
  assert.equal(by.Zoned.end - by.Zoned.start, 30 * MIN);
  assert.equal(by.Floating.start, new Date(2026, 9, 21, 9, 0, 0).getTime());
  assert.equal(by.Floating.end, by.Floating.start);   // no DTEND, no DURATION
  assert.equal(by['Windows zone'].start, Date.parse('2026-10-22T13:00:00Z'));
});

test('all-day dates, several days, DURATION, and a day by default', () => {
  const cal = parse([`
    UID:d1@google.com
    DTSTART;VALUE=DATE:20261019
    DTEND;VALUE=DATE:20261022
    SUMMARY:Trip
  `, `
    UID:d2@google.com
    DTSTART;VALUE=DATE:20261025
    SUMMARY:Birthday
  `, `
    UID:d3@google.com
    DTSTART:20261023T150000Z
    DURATION:PT1H30M
    SUMMARY:Long call
  `]);
  const by = Object.fromEntries(cal.events.map(e => [e.title, e]));
  assert.deepEqual([by.Trip.allDay, by.Trip.from, by.Trip.to], [true, '2026-10-19', '2026-10-22']);
  assert.deepEqual([by.Birthday.from, by.Birthday.to], ['2026-10-25', '2026-10-26']);
  assert.equal(by['Long call'].end - by['Long call'].start, 90 * MIN);
});

test('keeps only yesterday to 16 days on (UTC), in start order', () => {
  const cal = parse([`
    UID:old@google.com
    DTSTART:20261001T100000Z
    SUMMARY:Long ago
  `, `
    UID:late@google.com
    DTSTART:20261120T100000Z
    SUMMARY:Too far
  `, `
    UID:b@google.com
    DTSTART:20261019T100000Z
    SUMMARY:B
  `, `
    UID:a@google.com
    DTSTART:20261017T100000Z
    SUMMARY:A
  `, `
    UID:run@google.com
    DTSTART;VALUE=DATE:20261010
    DTEND;VALUE=DATE:20261020
    SUMMARY:Still running
  `]);
  assert.deepEqual(cal.events.map(e => e.title), ['Still running', 'A', 'B']);
});

test('weekly repeats keep their wall-clock time across a DST change', () => {
  const cal = parse([`
    UID:w1@google.com
    DTSTART;TZID=America/New_York:20261006T090000
    DTEND;TZID=America/New_York:20261006T093000
    RRULE:FREQ=WEEKLY;BYDAY=TU
    SUMMARY:Standup
  `]);
  assert.deepEqual(starts(cal), ['2026-10-20T13:00:00.000Z', '2026-10-27T13:00:00.000Z', '2026-11-03T14:00:00.000Z']);
  assert.ok(cal.events.every(e => e.end - e.start === 30 * MIN));
});

test('weekly with INTERVAL and several days', () => {
  const cal = parse([`
    UID:w2@google.com
    DTSTART:20261005T080000Z
    RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE
    SUMMARY:Gym
  `]);
  assert.deepEqual(starts(cal), ['2026-10-19T08:00:00.000Z', '2026-10-21T08:00:00.000Z', '2026-11-02T08:00:00.000Z']);
});

test('daily with COUNT (the start counts) and with UNTIL', () => {
  const cal = parse([`
    UID:c@google.com
    DTSTART:20261016T070000Z
    RRULE:FREQ=DAILY;COUNT=4
    SUMMARY:Course
  `, `
    UID:u@google.com
    DTSTART;TZID=America/New_York:20261017T200000
    RRULE:FREQ=DAILY;UNTIL=20261020T035959Z
    SUMMARY:Pills
  `]);
  const of = title => starts({ events: cal.events.filter(e => e.title === title) });
  assert.deepEqual(of('Course'), ['2026-10-17T07:00:00.000Z', '2026-10-18T07:00:00.000Z', '2026-10-19T07:00:00.000Z']);
  // 20:00 EDT is 00:00Z the next day: the 17th, 18th and 19th, not the 20th.
  assert.deepEqual(of('Pills'), ['2026-10-18T00:00:00.000Z', '2026-10-19T00:00:00.000Z', '2026-10-20T00:00:00.000Z']);
});

test('monthly by weekday ordinal and by day from the month’s end; yearly', () => {
  const cal = parse([`
    UID:m1@google.com
    DTSTART:20260130T160000Z
    RRULE:FREQ=MONTHLY;BYDAY=-1FR
    SUMMARY:Last Friday
  `, `
    UID:m2@google.com
    DTSTART:20260118T090000Z
    RRULE:FREQ=MONTHLY;BYDAY=3SU
    SUMMARY:Third Sunday
  `, `
    UID:m3@google.com
    DTSTART;VALUE=DATE:20260131
    RRULE:FREQ=MONTHLY;BYMONTHDAY=-1
    SUMMARY:Month end
  `, `
    UID:y1@google.com
    DTSTART;VALUE=DATE:19901025
    RRULE:FREQ=YEARLY
    SUMMARY:Anniversary
  `, `
    UID:y2@google.com
    DTSTART;VALUE=DATE:20240229
    RRULE:FREQ=YEARLY
    SUMMARY:Leap day
  `, `
    UID:y3@google.com
    DTSTART;VALUE=DATE:20201126
    RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH
    SUMMARY:Thanksgiving
  `]);
  const of = title => starts({ events: cal.events.filter(e => e.title === title) });
  assert.deepEqual(of('Last Friday'), ['2026-10-30T16:00:00.000Z']);
  assert.deepEqual(of('Third Sunday'), ['2026-10-18T09:00:00.000Z']);
  assert.deepEqual(of('Month end'), ['2026-10-31']);
  assert.deepEqual(of('Anniversary'), ['2026-10-25']);
  assert.deepEqual(of('Leap day'), []);
  assert.deepEqual(of('Thanksgiving'), []);   // 26 Nov, after the window
  const later = parseCalendar(ics([`
    UID:y3@google.com
    DTSTART;VALUE=DATE:20201126
    RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH
    SUMMARY:Thanksgiving
  `]), { now: Date.parse('2026-11-20T12:00:00Z') });
  assert.deepEqual(starts(later), ['2026-11-26']);
});

test('EXDATE removes occurrences; RECURRENCE-ID moves one or cancels it', () => {
  const cal = parse([`
    UID:r@google.com
    DTSTART;TZID=America/New_York:20261006T090000
    DTEND;TZID=America/New_York:20261006T100000
    RRULE:FREQ=WEEKLY;BYDAY=TU
    EXDATE;TZID=America/New_York:20261013T090000,20261103T090000
    SUMMARY:Review
  `, `
    UID:r@google.com
    RECURRENCE-ID;TZID=America/New_York:20261020T090000
    DTSTART;TZID=America/New_York:20261021T110000
    DTEND;TZID=America/New_York:20261021T120000
    SUMMARY:Review (moved)
  `, `
    UID:r@google.com
    RECURRENCE-ID;TZID=America/New_York:20261027T090000
    DTSTART;TZID=America/New_York:20261027T090000
    STATUS:CANCELLED
    SUMMARY:Review
  `]);
  assert.deepEqual(cal.events.map(e => [e.title, new Date(e.start).toISOString()]), [['Review (moved)', '2026-10-21T15:00:00.000Z']]);
});

test('EXDATE as dates on an all-day repeat', () => {
  const cal = parse([`
    UID:x@google.com
    DTSTART;VALUE=DATE:20261017
    RRULE:FREQ=DAILY;COUNT=5
    EXDATE;VALUE=DATE:20261018
    EXDATE;VALUE=DATE:20261020
    SUMMARY:Holiday camp
  `]);
  assert.deepEqual(starts(cal), ['2026-10-17', '2026-10-19', '2026-10-21']);
});

test('a rule with parts it doesn’t follow gives only its first occurrence', () => {
  const cal = parse([`
    UID:s@google.com
    DTSTART:20261019T090000Z
    RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1
    SUMMARY:Last workday
  `, `
    UID:h@google.com
    DTSTART:20261019T090000Z
    RRULE:FREQ=HOURLY
    SUMMARY:Hourly
  `]);
  assert.deepEqual(cal.events.map(e => e.title).sort(), ['Hourly', 'Last workday']);
});

test('leaves out cancelled events and the ones the calendar’s owner declined', () => {
  const cal = parse([`
    UID:k1@google.com
    DTSTART:20261019T090000Z
    STATUS:CANCELLED
    SUMMARY:Cancelled
  `, `
    UID:k2@google.com
    DTSTART:20261019T100000Z
    ATTENDEE;CN=me@gmail.com;PARTSTAT=DECLINED:mailto:me@gmail.com
    SUMMARY:Declined
  `, `
    UID:k3@google.com
    DTSTART:20261019T110000Z
    ATTENDEE;CN=Dana;PARTSTAT=DECLINED:mailto:dana@example.com
    ATTENDEE;CN=me@gmail.com;PARTSTAT=ACCEPTED:mailto:me@gmail.com
    SUMMARY:Kept
  `]);
  assert.deepEqual(cal.events.map(e => e.title), ['Kept']);
});

test('meeting links: Google’s conference, else Meet, Zoom or Teams in the place or description', () => {
  const cal = parse([`
    UID:j1@google.com
    DTSTART:20261019T090000Z
    X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij
    SUMMARY:Meet
  `, `
    UID:j2@google.com
    DTSTART:20261019T100000Z
    LOCATION:https://us02web.zoom.us/j/8812345678?pwd=xyz.
    SUMMARY:Zoom
  `, `
    UID:j3@google.com
    DTSTART:20261019T110000Z
    DESCRIPTION:Join: <a href="https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0?context=1">Click here</a>
    SUMMARY:Teams
  `, `
    UID:j4@google.com
    DTSTART:20261019T120000Z
    LOCATION:Room 4
    SUMMARY:None
  `]);
  const by = Object.fromEntries(cal.events.map(e => [e.title, e.meet]));
  assert.equal(by.Meet, 'https://meet.google.com/abc-defg-hij');
  assert.equal(by.Zoom, 'https://us02web.zoom.us/j/8812345678?pwd=xyz');
  assert.equal(by.Teams, 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0?context=1');
  assert.equal(by.None, '');
});

test('descriptions: HTML to text, Google’s Meet block removed, cut at 500 characters', () => {
  const block = '-::~:~::~:~:~:~:~:~:~::~:~::-\\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\\n\\nPlease do not edit this section.\\n-::~:~::~:~:~:~:~:~:~::~:~::-';
  const cal = parse([`
    UID:t1@google.com
    DTSTART:20261019T090000Z
    DESCRIPTION:<b>Agenda</b><br>1. Budget &amp; plans<br><ul><li>Q4</li></ul>\\n\\n\\n\\n${block}
    SUMMARY:HTML
  `, `
    UID:t2@google.com
    DTSTART:20261019T100000Z
    DESCRIPTION:${'x'.repeat(700)}
    SUMMARY:Long
  `]);
  const by = Object.fromEntries(cal.events.map(e => [e.title, e]));
  assert.equal(by.HTML.about, 'Agenda\n1. Budget & plans\n• Q4');
  assert.equal(by.HTML.meet, 'https://meet.google.com/abc-defg-hij');
  assert.equal(by.Long.about.length, 500);
  assert.ok(by.Long.about.endsWith('…'));
});

test('event links: Google’s eid for an event and for one occurrence of a repeat, else the URL or the day', () => {
  const cal = parse([`
    UID:single1@google.com
    DTSTART:20261019T090000Z
    SUMMARY:Single
  `, `
    UID:rep1@google.com
    DTSTART:20261012T090000Z
    RRULE:FREQ=WEEKLY
    SUMMARY:Repeat
  `, `
    UID:rep2@google.com
    DTSTART;VALUE=DATE:20261012
    RRULE:FREQ=WEEKLY
    SUMMARY:All-day repeat
  `, `
    UID:040000008200E00074C5B7101A82E008@outlook.com
    DTSTART:20261020T090000Z
    SUMMARY:Imported
  `]);
  const eid = link => Buffer.from(new URL(link).searchParams.get('eid').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
  const by = title => cal.events.find(e => e.title === title);
  assert.equal(eid(by('Single').link), 'single1 me@gmail.com');
  assert.equal(eid(by('Repeat').link), 'rep1_20261019T090000Z me@gmail.com');
  assert.equal(eid(by('All-day repeat').link), 'rep2_20261019 me@gmail.com');
  assert.ok(!new URL(by('Single').link).searchParams.get('eid').includes('='));   // no padding
  assert.equal(by('Imported').link, 'https://calendar.google.com/calendar/r/day/2026/10/20');
  const other = parseCalendar(ics([`
    UID:o1@icloud.com
    DTSTART:20261019T090000Z
    URL:https://example.com/event/1
    SUMMARY:With URL
  `, `
    UID:o2@icloud.com
    DTSTART:20261019T100000Z
    URL:javascript:alert(1)
    SUMMARY:Bad URL
  `]), { url: 'https://p01-caldav.icloud.com/published/2/abc', now: NOW });
  assert.deepEqual(other.events.map(e => e.link), ['https://example.com/event/1', '']);
});

test('links: webcal becomes https, only http(s) without credentials; the Google calendar id', () => {
  assert.equal(calendarUrl(' webcal://p01-caldav.icloud.com/published/2/abc '), 'https://p01-caldav.icloud.com/published/2/abc');
  assert.equal(calendarUrl(GOOGLE), GOOGLE);
  assert.equal(calendarUrl('javascript:alert(1)'), null);
  assert.equal(calendarUrl('https://user:pw@calendar.google.com/x.ics'), null);
  assert.equal(calendarUrl('ftp://calendar.google.com/x.ics'), null);
  assert.equal(calendarUrl('not a link'), null);
  assert.equal(googleCalendarId(GOOGLE), 'me@gmail.com');
  assert.equal(googleCalendarId('https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics'), 'en.usa#holiday@group.v.calendar.google.com');
  assert.equal(googleCalendarId('https://outlook.office365.com/owa/calendar/x/reachcalendar.ics'), '');
  assert.equal(notIcalLink('https://calendar.google.com/calendar/embed?src=me%40gmail.com'), true);
  assert.equal(notIcalLink('https://calendar.google.com/calendar/u/0/r'), true);
  assert.equal(notIcalLink(GOOGLE), false);
  assert.equal(notIcalLink('https://outlook.office365.com/owa/calendar/x/reachcalendar.ics'), false);
});

test('calendars and a copy’s settings, cleaned', () => {
  const list = cleanCalendars([
    { id: 'a1', name: '  Work  ', color: COLORS[2] },
    { id: 'a1', name: 'Duplicate' },
    { id: 'b2', name: '', color: 'red' },
    { id: '<script>', name: 'Bad id' },
    'nope',
  ]);
  assert.deepEqual(list, [{ id: 'a1', name: 'Work', color: COLORS[2] }, { id: 'b2', name: 'Calendar', color: COLORS[1] }]);
  assert.equal(cleanCalendars(Array.from({ length: 15 }, (_, i) => ({ id: `c${i}`, name: `C${i}` }))).length, MAX_CALENDARS);
  assert.deepEqual(cleanGcal({ hidden: ['a1', 'a1', 7, '<x>'] }), { hidden: ['a1'] });
  assert.deepEqual(cleanGcal({}), { hidden: [] });
  assert.equal(nextColor([{ color: COLORS[0] }, { color: COLORS[1] }]), COLORS[2]);
  assert.equal(colorAfter(COLORS.at(-1)), COLORS[0]);
});

const TZ = 'America/New_York';
const timed = (title, startIso, minutes, extra = {}) => ({ id: title, title, allDay: false, start: Date.parse(startIso), end: Date.parse(startIso) + minutes * MIN, cal: 'a', ...extra });
const allDay = (title, from, to) => ({ id: title, title, allDay: true, from, to, cal: 'a' });

test('agenda: today always, then each day with something, all-day first; past, now and next', () => {
  const now = Date.parse('2026-10-18T14:00:00Z');   // 10:00 in New York
  const days = agenda([
    timed('Breakfast', '2026-10-18T12:00:00Z', 30),
    timed('Call', '2026-10-18T13:30:00Z', 60),
    timed('Dentist', '2026-10-18T19:00:00Z', 60),
    timed('Dinner', '2026-10-18T23:00:00Z', 90),
    allDay('Holiday', '2026-10-18', '2026-10-19'),
    timed('Far', '2026-11-20T15:00:00Z', 60),
    timed('Thursday', '2026-10-22T15:00:00Z', 60),
  ], { now, timeZone: TZ });
  assert.deepEqual(days.map(d => [d.day, d.label]), [['2026-10-18', 'Today'], ['2026-10-22', 'Thu 22 Oct']]);
  assert.deepEqual(days[0].events.map(e => [e.title, e.state]), [
    ['Holiday', 'allday'], ['Breakfast', 'past'], ['Call', 'now'], ['Dentist', 'next'], ['Dinner', 'later'],
  ]);
  const empty = agenda([], { now, timeZone: TZ });
  assert.deepEqual(empty.map(d => [d.label, d.events.length]), [['Today', 0]]);
});

test('agenda: an event over several days shows on each, with its part', () => {
  const now = Date.parse('2026-10-18T14:00:00Z');
  const days = agenda([
    allDay('Trip', '2026-10-17', '2026-10-20'),
    timed('Night shift', '2026-10-19T02:00:00Z', 60 * 14),   // 22:00 Sun to 12:00 Mon, New York
    timed('Conference', '2026-10-20T13:00:00Z', 60 * 24 * 2 + 60),   // Tue 9:00 to Thu 10:00
  ], { now, timeZone: TZ });
  const rows = Object.fromEntries(days.map(d => [d.day, d.events.map(e => `${e.title}:${e.part}:${e.state}`)]));
  assert.deepEqual(rows['2026-10-18'], ['Trip:middle:allday', 'Night shift:start:next']);
  assert.deepEqual(rows['2026-10-19'], ['Trip:end:allday', 'Night shift:end:later']);
  assert.deepEqual(rows['2026-10-20'], ['Conference:start:later']);
  assert.deepEqual(rows['2026-10-21'], ['Conference:middle:allday']);
  assert.deepEqual(rows['2026-10-22'], ['Conference:end:later']);
});

test('Join fills from 10 minutes before until the end', () => {
  const e = timed('Sync', '2026-10-18T15:00:00Z', 30, { meet: 'https://meet.google.com/abc-defg-hij' });
  assert.equal(joinState(e, e.start - JOIN_EARLY_MS - MIN), 'later');
  assert.equal(joinState(e, e.start - JOIN_EARLY_MS), 'soon');
  assert.equal(joinState(e, e.start + 10 * MIN), 'soon');
  assert.equal(joinState(e, e.end), '');
  assert.equal(joinState({ ...e, meet: '' }, e.start), '');
  assert.equal(HOUR, 60 * MIN);
});

test('a failed fetch: gone when the link no longer gives the calendar, else down', () => {
  assert.equal(failureOf({ status: 404 }), 'gone');
  assert.equal(failureOf({ status: 403 }), 'gone');
  assert.equal(failureOf({ message: NOT_A_CALENDAR }), 'gone');
  assert.equal(failureOf({ status: 429 }), 'down');
  assert.equal(failureOf({ status: 503 }), 'down');
  assert.equal(failureOf(new Error('Failed to fetch')), 'down');
});
