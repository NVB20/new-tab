import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCountdowns, newTimer, newStopwatch, newDate, nameOf, dayOf, endOf, statusOf, leftOf, elapsedOf, tickFrom, nextUp,
  shownCountdown, shouldCelebrate, startTimer, pauseTimer, resetTimer, addMinute, dismiss, clockText, display, dateLabel,
  shortLeft, doneText, dayKey, daysBetween, MAX_DURATION,
} from '../js/countdown.js';

// Local times, so the tests hold in any time zone.
const at = (y, m, d, hh = 0, mm = 0, ss = 0) => new Date(y, m - 1, d, hh, mm, ss).getTime();
const NOW = at(2026, 10, 17, 12, 0);
const MIN = 60e3;

const timer = (over = {}) => ({ id: 't1', kind: 'timer', name: 'Pasta', duration: 10 * MIN, endsAt: null, left: null, seen: null, ...over });
const stopwatch = (over = {}) => ({ id: 's1', kind: 'stopwatch', name: 'Run', startedAt: null, elapsed: 0, seen: null, ...over });
const date = (over = {}) => ({ id: 'd1', kind: 'date', name: 'Trip', date: '2026-11-28', time: '', yearly: false, since: '', seen: null, ...over });

test('cleanCountdowns keeps valid timers and dates, and drops junk and repeated ids', () => {
  const list = cleanCountdowns([
    timer({ name: '  Pasta  ', duration: 1.5 }),
    date({ time: '25:00', yearly: 'yes', since: 'soon' }),
    { id: 't1', kind: 'timer', duration: 5000 },        // repeated id
    { id: 'x', kind: 'alarm', duration: 5000 },         // unknown kind
    { id: 'y', kind: 'date', date: '2026-13-40' },      // not a day
    { id: 'z', kind: 'timer' },                         // no duration
    { kind: 'timer', duration: 5000 },                  // no id
    'junk',
  ]);
  assert.deepEqual(list, [
    { id: 't1', kind: 'timer', name: 'Pasta', seen: null, duration: 1000, endsAt: null, left: null },
    { id: 'd1', kind: 'date', name: 'Trip', seen: null, date: '2026-11-28', time: '', yearly: false, since: '' },
  ]);
  assert.deepEqual(cleanCountdowns('nope'), []);
  assert.equal(cleanCountdowns(Array.from({ length: 60 }, (_, i) => timer({ id: `t${i}` }))).length, 50);
  assert.equal(cleanCountdowns([timer({ duration: 1e12 })])[0].duration, MAX_DURATION);
  // A running timer isn't paused too.
  assert.equal(cleanCountdowns([timer({ endsAt: NOW, left: 5000 })])[0].left, null);
});

test('new countdowns get an id; a yearly date counts from today', () => {
  const t = newTimer({ name: 'Tea', duration: 3 * MIN });
  assert.equal(t.kind, 'timer');
  assert.equal(typeof t.id, 'string');
  assert.equal(statusOf(t, NOW), 'ready');
  const d = newDate({ name: 'Mom', date: '1960-10-20', yearly: true }, NOW);
  assert.equal(d.since, '2026-10-17');
  assert.equal(dayOf(d), '2026-10-20');
  assert.equal(newDate({ date: '2026-12-01' }, NOW).since, '');
  assert.equal(nameOf(newTimer({ duration: MIN })), 'Timer');
  assert.equal(nameOf(newDate({ date: '2026-12-01' }, NOW)), 'Countdown');
});

test('a date ends at its time on its day, or at the start of the day', () => {
  assert.equal(endOf(date()), at(2026, 11, 28));
  assert.equal(endOf(date({ time: '09:30' })), at(2026, 11, 28, 9, 30));
  assert.equal(statusOf(date(), NOW), 'upcoming');
  assert.equal(statusOf(date({ date: '2026-10-17' }), NOW), 'done');
});

test('a yearly date falls on its first day from `since` on; Feb 29 is Feb 28 in other years', () => {
  assert.equal(dayOf(date({ date: '1990-10-20', yearly: true, since: '2026-10-17' })), '2026-10-20');
  assert.equal(dayOf(date({ date: '1990-10-20', yearly: true, since: '2026-10-21' })), '2027-10-20');
  assert.equal(dayOf(date({ date: '1990-10-17', yearly: true, since: '2026-10-17' })), '2026-10-17');   // today counts
  assert.equal(dayOf(date({ date: '2024-02-29', yearly: true, since: '2026-01-01' })), '2026-02-28');
  assert.equal(dayOf(date({ date: '2024-02-29', yearly: true, since: '2027-03-01' })), '2028-02-29');
  // Without `since`, the date itself.
  assert.equal(dayOf(date({ date: '2030-05-01', yearly: true })), '2030-05-01');
});

test('a timer is ready, running, paused or done', () => {
  const t = timer();
  assert.equal(statusOf(t, NOW), 'ready');
  assert.equal(leftOf(t, NOW), 10 * MIN);
  assert.equal(endOf(t), null);
  const running = startTimer(t, NOW);
  assert.equal(running.endsAt, NOW + 10 * MIN);
  assert.equal(statusOf(running, NOW + MIN), 'running');
  assert.equal(leftOf(running, NOW + MIN), 9 * MIN);
  assert.equal(startTimer(running, NOW + MIN), running);   // already running
  const paused = pauseTimer(running, NOW + 4 * MIN);
  assert.deepEqual([paused.endsAt, paused.left, statusOf(paused, NOW + 99 * MIN)], [null, 6 * MIN, 'paused']);
  const resumed = startTimer(paused, NOW + 20 * MIN);
  assert.deepEqual([resumed.endsAt, resumed.left], [NOW + 26 * MIN, null]);
  assert.equal(statusOf(resumed, NOW + 26 * MIN), 'done');
  assert.equal(leftOf(resumed, NOW + 30 * MIN), 0);
  assert.deepEqual(resetTimer({ ...resumed, seen: 5 }), { ...t, seen: null });
  assert.equal(pauseTimer(t, NOW), t);   // a ready timer has nothing to pause
});

test('+1 min adds to the time, and runs a finished timer again for a minute', () => {
  assert.equal(addMinute(timer(), NOW).duration, 11 * MIN);
  const running = addMinute(startTimer(timer(), NOW), NOW);
  assert.deepEqual([running.duration, running.endsAt], [11 * MIN, NOW + 11 * MIN]);
  const paused = addMinute(pauseTimer(startTimer(timer(), NOW), NOW + MIN), NOW);
  assert.equal(paused.left, 10 * MIN);
  const again = addMinute(startTimer(timer(), NOW), NOW + 20 * MIN);
  assert.deepEqual([again.duration, again.endsAt, statusOf(again, NOW + 20 * MIN)], [MIN, NOW + 21 * MIN, 'running']);
  assert.equal(addMinute(timer({ duration: MAX_DURATION }), NOW).duration, MAX_DURATION);
});

test('dismiss: a timer is ready again, a yearly date moves to next year, a one-off goes', () => {
  const done = startTimer(timer(), NOW - 20 * MIN);
  const yearly = date({ id: 'y', date: '1990-10-17', yearly: true, since: '2026-10-17', seen: 1 });
  const once = date({ id: 'o', date: '2026-10-17' });
  const list = [done, yearly, once];
  assert.equal(statusOf(dismiss(list, done.id)[0], NOW), 'ready');
  const rolled = dismiss(list, 'y')[1];
  assert.deepEqual([rolled.since, dayOf(rolled), rolled.seen, statusOf(rolled, NOW)], ['2026-10-18', '2027-10-17', null, 'upcoming']);
  assert.deepEqual(dismiss(list, 'o').map(c => c.id), [done.id, 'y']);
  assert.equal(dismiss(list, 'nope'), list);
});

test('cleanCountdowns keeps stopwatches, their elapsed time whole and not below zero', () => {
  assert.deepEqual(cleanCountdowns([stopwatch({ elapsed: 1500.4, startedAt: NOW })]), [
    { id: 's1', kind: 'stopwatch', name: 'Run', seen: null, startedAt: NOW, elapsed: 1500 },
  ]);
  assert.equal(cleanCountdowns([stopwatch({ elapsed: -5 })])[0].elapsed, 0);
  assert.equal(cleanCountdowns([stopwatch({ elapsed: 'lots', startedAt: 'now' })])[0].elapsed, 0);
  assert.equal(cleanCountdowns([stopwatch({ startedAt: 'now' })])[0].startedAt, null);
});

test('a stopwatch is ready, running or paused, counts up, and never ends', () => {
  const s = newStopwatch({ name: 'Run' });
  assert.deepEqual([s.kind, s.name, s.startedAt, s.elapsed, statusOf(s, NOW)], ['stopwatch', 'Run', null, 0, 'ready']);
  assert.equal(nameOf(newStopwatch({})), 'Stopwatch');
  const running = startTimer(s, NOW);
  assert.equal(running.startedAt, NOW);
  assert.equal(statusOf(running, NOW + MIN), 'running');
  assert.equal(elapsedOf(running, NOW + MIN), MIN);
  assert.equal(startTimer(running, NOW + MIN), running);   // already running
  const paused = pauseTimer(running, NOW + 4 * MIN);
  assert.deepEqual([paused.startedAt, paused.elapsed, statusOf(paused, NOW + 99 * MIN)], [null, 4 * MIN, 'paused']);
  assert.equal(elapsedOf(paused, NOW + 99 * MIN), 4 * MIN);
  const resumed = startTimer(paused, NOW + 20 * MIN);
  assert.equal(elapsedOf(resumed, NOW + 21 * MIN), 5 * MIN);
  assert.deepEqual(resetTimer({ ...resumed, seen: 5 }), { ...s, seen: null });
  assert.equal(pauseTimer(s, NOW), s);   // a ready stopwatch has nothing to pause
  // No end: no alarm, no confetti, no +1 min, and Dismiss doesn't take it off the list.
  assert.equal(endOf(running), null);
  assert.equal(statusOf(running, NOW + 1e12), 'running');
  assert.equal(shouldCelebrate(running, NOW + 1e12), false);
  assert.equal(addMinute(running, NOW), running);
  assert.deepEqual(dismiss([paused], paused.id).map(c => [c.id, statusOf(c, NOW)]), [[paused.id, 'ready']]);
});

test('how a stopwatch reads: whole seconds counting up, live while it runs', () => {
  assert.deepEqual(display(stopwatch(), NOW), { big: '0:00', unit: '', live: false });
  assert.deepEqual(display(stopwatch({ startedAt: NOW - 65_900 }), NOW), { big: '1:05', unit: '', live: true });
  assert.deepEqual(display(stopwatch({ elapsed: 3600e3 + 5 * MIN }), NOW), { big: '1:05:00', unit: '', live: false });
  assert.equal(display(stopwatch({ elapsed: 120 * 3600e3 }), NOW).big, '120:00:00');
  assert.equal(shortLeft(stopwatch(), NOW), 'Ready');
  assert.equal(shortLeft(stopwatch({ startedAt: NOW - 12 * MIN }), NOW), '12:00');
  assert.equal(shortLeft(stopwatch({ elapsed: 4 * MIN + 999 }), NOW), 'Paused · 4:00');
});

test('tickFrom: when the seconds shown tick over', () => {
  // A countdown's at its end; a stopwatch's at the moment it would have started without pauses.
  assert.equal(tickFrom(timer({ endsAt: NOW + 65_500 })), NOW + 65_500);
  assert.equal(tickFrom(date({ date: '2026-10-18' })), at(2026, 10, 18));
  assert.equal(tickFrom(stopwatch({ startedAt: NOW, elapsed: 2500 })), NOW - 2500);
});

test('Next up: a finished one first, then the soonest end, then paused, then ready timers', () => {
  const ready = timer({ id: 'ready' });
  const paused = timer({ id: 'paused', left: MIN });
  const soon = date({ id: 'soon', date: '2026-10-20' });
  const later = date({ id: 'later', date: '2026-12-25' });
  const running = timer({ id: 'running', endsAt: NOW + 5 * MIN });
  const done = timer({ id: 'done', endsAt: NOW - MIN });
  assert.equal(nextUp([ready, paused, later, soon, running, done], NOW).id, 'done');
  assert.equal(nextUp([ready, paused, later, soon, running], NOW).id, 'running');
  assert.equal(nextUp([ready, paused, later, soon], NOW).id, 'soon');
  assert.equal(nextUp([ready, paused], NOW).id, 'paused');
  assert.equal(nextUp([ready], NOW).id, 'ready');
  assert.equal(nextUp([], NOW), null);
  // Running stopwatches come after anything that ends (the latest started first), before paused ones.
  const lap = stopwatch({ id: 'lap', startedAt: NOW - 2 * MIN });
  const run = stopwatch({ id: 'run', startedAt: NOW - MIN });
  const held = stopwatch({ id: 'held', elapsed: MIN });
  assert.equal(nextUp([ready, paused, held, lap, run, later], NOW).id, 'later');
  assert.equal(nextUp([ready, paused, held, lap, run], NOW).id, 'run');
  assert.equal(nextUp([ready, held, stopwatch({ id: 'new' })], NOW).id, 'held');
  assert.equal(nextUp([stopwatch({ id: 'new' }), ready], NOW).id, 'new');
  assert.equal(shownCountdown([soon, later], 'later', NOW).id, 'later');
  assert.equal(shownCountdown([soon, later], 'gone', NOW).id, 'soon');
  assert.equal(shownCountdown([soon, later], 'next', NOW).id, 'soon');
});

test('confetti plays once per finish, and not for one that ended over a day ago', () => {
  const done = timer({ endsAt: NOW - MIN });
  assert.equal(shouldCelebrate(done, NOW), true);
  assert.equal(shouldCelebrate({ ...done, seen: done.endsAt }, NOW), false);
  assert.equal(shouldCelebrate({ ...done, seen: done.endsAt - 5 }, NOW), true);   // an earlier run's
  assert.equal(shouldCelebrate(timer({ endsAt: NOW - 25 * 3600e3 }), NOW), false);
  assert.equal(shouldCelebrate(timer({ endsAt: NOW + MIN }), NOW), false);
});

test('how it reads: days to go, then the last 24 hours live, then Today', () => {
  assert.deepEqual(display(date(), NOW), { big: '42', unit: 'days', live: false });
  assert.deepEqual(display(date({ date: '2026-10-19' }), NOW), { big: '2', unit: 'days', live: false });
  assert.deepEqual(display(date({ date: '2026-10-18', time: '18:00' }), NOW), { big: '1', unit: 'day', live: false });
  assert.deepEqual(display(date({ date: '2026-10-18' }), NOW), { big: '12:00:00', unit: '', live: true });
  assert.deepEqual(display(date({ date: '2026-10-17' }), NOW), { big: 'Today', unit: '', live: false });
  assert.equal(display(date({ date: '2026-10-16' }), NOW).big, 'Yesterday');
  assert.equal(display(date({ date: '2026-10-14' }), NOW).big, '3 days ago');
  assert.deepEqual(display(timer(), NOW), { big: '10:00', unit: '', live: false });
  assert.deepEqual(display(timer({ endsAt: NOW + 65e3 }), NOW), { big: '1:05', unit: '', live: true });
  assert.equal(display(timer({ endsAt: NOW }), NOW).big, 'Time’s up');
});

test('clockText rounds up to whole seconds', () => {
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(1), '0:01');
  assert.equal(clockText(59_001), '1:00');
  assert.equal(clockText(25 * MIN), '25:00');
  assert.equal(clockText(3600e3 + 5 * MIN), '1:05:00');
  assert.equal(clockText(-5), '0:00');
  // Counting up, a second shows once it's whole.
  assert.equal(clockText(999, false), '0:00');
  assert.equal(clockText(59_999, false), '0:59');
});

test('labels: the date line, the list row, the notification', () => {
  assert.equal(dateLabel(date(), NOW), 'Sat, Nov 28');
  assert.equal(dateLabel(date({ time: '09:05' }), NOW), 'Sat, Nov 28 · 09:05');
  assert.equal(dateLabel(date({ time: '21:05' }), NOW, false), 'Sat, Nov 28 · 9:05 PM');
  assert.equal(dateLabel(date({ date: '2027-01-02' }), NOW), 'Sat, Jan 2, 2027');
  assert.equal(shortLeft(date(), NOW), '42 days');
  assert.equal(shortLeft(timer(), NOW), '10:00');
  assert.equal(shortLeft(timer({ left: 4 * MIN }), NOW), 'Paused · 4:00');
  assert.equal(shortLeft(timer({ endsAt: NOW - 1 }), NOW), 'Done');
  assert.equal(doneText(timer()), 'Time’s up');
  assert.equal(doneText(date()), 'It’s today');
  assert.equal(doneText(date({ time: '09:00' })), 'It’s time');
});

test('dayKey and daysBetween count local calendar days', () => {
  assert.equal(dayKey(NOW), '2026-10-17');
  assert.equal(daysBetween(at(2026, 10, 17, 23, 59), at(2026, 10, 18, 0, 1)), 1);
  assert.equal(daysBetween(at(2026, 10, 18), at(2026, 10, 17)), -1);
  assert.equal(daysBetween(at(2026, 3, 1), at(2026, 4, 1)), 31);   // across a clock change
});
