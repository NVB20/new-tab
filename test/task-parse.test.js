import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTask } from '../js/task-parse.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 16);   // Friday 16 October 2026
const parse = (text, now = NOW) => parseTask(text, now);
const plain = text => ({ text, priority: null, due: null, repeat: null });

test('importance anywhere, any case; the last one wins', () => {
  assert.deepEqual(parse('Call !h the bank !low'), { text: 'Call the bank', priority: 'low', due: null, repeat: null });
  for (const [word, level] of [['!high', 'high'], ['!1', 'high'], ['!MED', 'medium'], ['!m', 'medium'], ['!2', 'medium'], ['!medium', 'medium'], ['!l', 'low'], ['!3', 'low']]) {
    assert.equal(parse(`Task ${word}`).priority, level, word);
  }
  assert.deepEqual(parse('Wow!h nice'), plain('Wow!h nice'));
});

test('dates at the end', () => {
  const due = text => parse(`Call bank ${text}`).due;
  assert.equal(due('today'), '2026-10-16');
  assert.equal(due('TOMORROW'), '2026-10-17');
  assert.equal(due('tmr'), '2026-10-17');
  assert.equal(due('tmrw'), '2026-10-17');
  assert.equal(due('mon'), '2026-10-19');
  assert.equal(due('thurs'), '2026-10-22');
  assert.equal(due('fri'), '2026-10-23');        // today is Friday: a week on
  assert.equal(due('friday'), '2026-10-23');
  assert.equal(due('next week'), '2026-10-19');
  assert.equal(due('in 3 days'), '2026-10-19');
  assert.equal(due('in 1 day'), '2026-10-17');
  assert.equal(due('in 2 weeks'), '2026-10-30');
  assert.equal(due('oct 30'), '2026-10-30');
  assert.equal(due('30 oct'), '2026-10-30');
  assert.equal(due('october 16'), '2026-10-16');  // today counts
  assert.equal(due('oct 15'), '2027-10-15');      // passed: next year
  assert.equal(due('sept 3'), '2027-09-03');
  assert.equal(due('2026-12-01'), '2026-12-01');
  assert.equal(parse('Call bank tomorrow').text, 'Call bank');
});

test('impossible dates and lookalikes are not shorthand', () => {
  assert.deepEqual(parse('Plan feb 30'), plain('Plan feb 30'));
  assert.deepEqual(parse('Plan 2026-02-30'), plain('Plan 2026-02-30'));
  assert.deepEqual(parse('Rest in 0 days'), plain('Rest in 0 days'));
  assert.deepEqual(parse('Read about constructor'), plain('Read about constructor'));
});

test('repeats at the end', () => {
  const rep = text => { const p = parse(`Gym ${text}`); return [p.repeat, p.due]; };
  assert.deepEqual(rep('daily'), ['daily', null]);
  assert.deepEqual(rep('every day'), ['daily', null]);
  assert.deepEqual(rep('weekdays'), ['weekdays', null]);
  assert.deepEqual(rep('every weekday'), ['weekdays', null]);
  assert.deepEqual(rep('weekly'), ['weekly', null]);
  assert.deepEqual(rep('every week'), ['weekly', null]);
  assert.deepEqual(rep('monthly'), ['monthly', null]);
  assert.deepEqual(rep('every month'), ['monthly', null]);
  assert.deepEqual(rep('yearly'), ['yearly', null]);
  assert.deepEqual(rep('every year'), ['yearly', null]);
  assert.deepEqual(rep('every monday'), ['weekly', '2026-10-19']);
  assert.deepEqual(rep('every fri'), ['weekly', '2026-10-23']);
  assert.deepEqual(rep('weekly fri'), ['weekly', '2026-10-23']);
  assert.deepEqual(rep('fri weekly'), ['weekly', '2026-10-23']);
});

test('only the end is read: a word that isn’t shorthand stops it', () => {
  assert.deepEqual(parse('Watch Friday night lights'), plain('Watch Friday night lights'));
  assert.deepEqual(parse('Call mom friday !high'), { text: 'Call mom', priority: 'high', due: '2026-10-23', repeat: null });
  assert.deepEqual(parse('Pay 3 tomorrow'), { text: 'Pay 3', priority: null, due: '2026-10-17', repeat: null });
});

test('a second date or repeat ends the reading and stays in the text', () => {
  assert.deepEqual(parse('Pay today tomorrow'), { text: 'Pay today', priority: null, due: '2026-10-17', repeat: null });
  assert.deepEqual(parse('Gym daily weekly'), { text: 'Gym daily', priority: null, due: null, repeat: 'weekly' });
  assert.deepEqual(parse('Gym every friday tomorrow'), { text: 'Gym every friday', priority: null, due: '2026-10-17', repeat: null });
});

test('when nothing would be left, nothing is read', () => {
  assert.deepEqual(parse('tomorrow'), plain('tomorrow'));
  assert.deepEqual(parse('  !high  '), plain('!high'));
  assert.deepEqual(parse('every day'), plain('every day'));
  assert.deepEqual(parse('   '), plain(''));
});

test('spaces are tidied in the text that is left', () => {
  assert.equal(parse('  Call   the  bank   tomorrow ').text, 'Call the bank');
});
