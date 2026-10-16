// Quick-add shorthand for the Tasks add bar: "Call bank !high tomorrow" → text, importance, due
// date and repeat. Importance words count anywhere; date and repeat phrases only at the end, so
// "Watch Friday night lights" stays as typed. English only. Pure (unit-tested in Node).

import { dayKey, isDay, addDays } from './tasks.js';

const LEVELS = {
  '!high': 'high', '!h': 'high', '!1': 'high',
  '!medium': 'medium', '!med': 'medium', '!m': 'medium', '!2': 'medium',
  '!low': 'low', '!l': 'low', '!3': 'low',
};
const DAYS = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const REPEAT_WORDS = { daily: 'daily', weekdays: 'weekdays', weekly: 'weekly', monthly: 'monthly', yearly: 'yearly' };
const EVERY = { day: 'daily', weekday: 'weekdays', week: 'weekly', month: 'monthly', year: 'yearly' };
const TOMORROW = ['tomorrow', 'tmr', 'tmrw'];
const UNITS = { day: 1, days: 1, week: 7, weeks: 7 };

// Own keys only, so words like "constructor" never match.
const get = (map, key) => (Object.hasOwn(map, key) ? map[key] : undefined);

// A real calendar day, so 2026-02-30 isn't one.
const realDay = word => isDay(word) && dayKey(new Date(word + 'T00:00').getTime()) === word;

export function parseTask(input, now) {
  const today = dayKey(now);
  const weekday = new Date(now).getDay();
  // The coming such weekday; a week on when it's that day today.
  const coming = wd => addDays(today, ((wd - weekday + 6) % 7) + 1);
  // The next time a month and day come round, today included.
  const monthDay = (month, dayWord) => {
    if (!/^\d{1,2}$/.test(dayWord)) return null;
    const year = new Date(now).getFullYear();
    for (const y of [year, year + 1]) {
      const date = new Date(y, month, Number(dayWord));
      const key = dayKey(date.getTime());
      if (date.getMonth() === month && key >= today) return key;
    }
    return null;
  };

  // The phrase ending the word list: { length, due?, repeat? }, or null.
  function phraseAtEnd(w) {
    if (w.length >= 3) {
      const [a, b, c] = w.slice(-3);
      if (a === 'in' && /^\d+$/.test(b) && Number(b) >= 1 && get(UNITS, c)) {
        return { length: 3, due: addDays(today, Number(b) * get(UNITS, c)) };
      }
    }
    if (w.length >= 2) {
      const [x, y] = w.slice(-2);
      if (x === 'next' && y === 'week') return { length: 2, due: coming(1) };
      if (x === 'every' && get(EVERY, y)) return { length: 2, repeat: get(EVERY, y) };
      if (x === 'every' && get(DAYS, y) !== undefined) return { length: 2, repeat: 'weekly', due: coming(get(DAYS, y)) };
      const md = get(MONTHS, x) !== undefined ? monthDay(get(MONTHS, x), y)
        : get(MONTHS, y) !== undefined ? monthDay(get(MONTHS, y), x) : null;
      if (md) return { length: 2, due: md };
    }
    const z = w.at(-1);
    if (z === 'today') return { length: 1, due: today };
    if (TOMORROW.includes(z)) return { length: 1, due: addDays(today, 1) };
    if (get(DAYS, z) !== undefined) return { length: 1, due: coming(get(DAYS, z)) };
    if (get(REPEAT_WORDS, z)) return { length: 1, repeat: get(REPEAT_WORDS, z) };
    if (realDay(z)) return { length: 1, due: z };
    return null;
  }

  const plain = { text: input.trim().split(/\s+/).join(' '), priority: null, due: null, repeat: null };
  let priority = null;
  const words = [];
  for (const word of plain.text.split(' ')) {
    const level = get(LEVELS, word.toLowerCase());
    if (level) priority = level;
    else if (word) words.push(word);
  }

  let end = words.length;
  let due = null;
  let repeat = null;
  while (end > 0) {
    const m = phraseAtEnd(words.slice(0, end).map(w => w.toLowerCase()));
    if (!m || (m.due && due) || (m.repeat && repeat)) break;
    due = m.due ?? due;
    repeat = m.repeat ?? repeat;
    end -= m.length;
  }

  const text = words.slice(0, end).join(' ');
  return text ? { text, priority, due, repeat } : plain;
}
