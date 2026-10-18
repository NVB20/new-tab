import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanEcon, marketsSummary, tvUrl, originRule, isOriginRule, parseTradingView, parseForexFactory, formatValue, calendar,
  untilLabel, econTtl, DUE_MS,
} from '../js/econ.js';

const TZ = 'Asia/Jerusalem';
const MIN = 60e3;
const HOUR = 60 * MIN;

// Trimmed TradingView events, as fetched 2026-10-18 (Israel is UTC+3 until 25 Oct).
const TV = {
  status: 'ok',
  result: [
    { id: '408077', title: 'GDP Growth Annualized 3rd Est', country: 'IL', indicator: 'GDP Growth Annualized', period: 'Q2', source: 'Central Bureau of Statistics', comment: 'GDP Annualized Growth Rate shows…', actual: null, previous: -1.7, forecast: 14.9, unit: '%', importance: -1, date: '2026-10-18T10:00:00.000Z' },
    { id: '1', title: 'Interest Rate Decision', country: 'IL', indicator: 'Interest Rate', period: '', source: 'Bank of Israel', actual: null, previous: 3.25, forecast: null, unit: '%', importance: 0, date: '2026-10-21T14:00:00.000Z' },
    { id: '2', title: 'Inflation Rate MoM', country: 'IL', indicator: 'Inflation Rate Mom', period: 'Sep', actual: -0.5, previous: 0.7, forecast: -0.3, unit: '%', importance: -1, date: '2026-10-15T15:30:00.000Z' },
    { id: '3', title: 'Tourist Arrivals YoY', country: 'IL', indicator: 'Tourist Arrivals', period: 'Sep', actual: 19.2, previous: -1.9, forecast: null, unit: '%', importance: -1, date: '2026-10-18T10:00:00.000Z' },
    { id: '4', title: 'Non Farm Payrolls', country: 'US', indicator: 'Non Farm Payrolls', period: 'Sep', actual: 29, previous: 133, forecast: 90, scale: 'K', importance: 1, date: '2026-10-18T12:30:00.000Z' },
    { id: '5', title: 'Building Permits Prel', country: 'US', indicator: 'Building Permits', period: 'Sep', actual: null, previous: 1.403, forecast: 1.4, scale: 'M', importance: 1, date: '2026-10-20T12:30:00.000Z' },
    { id: '6', title: 'Fed Chair Warsh Speech', country: 'US', indicator: 'Interest Rate', period: '', actual: null, previous: null, forecast: null, importance: 1, date: '2026-10-18T15:00:00.000Z' },
    { id: '7', title: 'Columbus Day', country: 'US', indicator: 'Holidays', period: '', actual: null, previous: null, forecast: null, importance: -1, date: '2026-10-19T00:00:00.000Z' },
    { id: '8', title: 'Eurogroup Meeting', country: 'EU', indicator: 'Calendar', period: '', actual: null, previous: null, forecast: null, importance: 0, date: '2026-10-19T00:00:00.000Z' },
    { id: '9', title: 'Balance of Trade', country: 'EU', indicator: 'Balance of Trade', period: 'Aug', actual: -7.8, previous: -1.2, forecast: -1.6, unit: '€', scale: 'B', importance: 0, date: '2026-10-18T09:00:00.000Z' },
    { id: '10', title: 'Trade Balance', country: 'JP', indicator: 'Balance of Trade', period: 'Sep', actual: null, previous: 1, forecast: 2, importance: 1, date: '2026-10-19T23:50:00.000Z' },
    { id: '11', title: 'Natural Gas Stocks', country: 'US', indicator: 'Natural Gas Stocks Change', period: '', actual: 87, previous: 76, forecast: 87, unit: 'cf', scale: 'B', importance: 0, date: '2026-10-25T14:30:00.000Z' },
    { title: 'No id', country: 'US', date: '2026-10-20T12:30:00.000Z' },
    { id: '12', title: 'Bad date', country: 'US', date: 'soon' },
  ],
};

// Trimmed ForexFactory weekly feed.
const FF = [
  { title: 'IMF Meetings', country: 'All', date: '2026-10-18T10:15:00-04:00', impact: 'Low', forecast: '', previous: '' },
  { title: 'Unemployment Claims', country: 'USD', date: '2026-10-22T08:30:00-04:00', impact: 'Medium', forecast: '200K', previous: '199K' },
  { title: 'German PPI m/m', country: 'EUR', date: '2026-10-20T02:00:00-04:00', impact: 'Low', forecast: '1.5%', previous: '-1.1%' },
  { title: 'Bank Holiday', country: 'USD', date: '2026-10-19T00:00:00-04:00', impact: 'Holiday', forecast: '', previous: '' },
  { title: 'Trade Balance', country: 'NZD', date: '2026-10-18T17:45:00-04:00', impact: 'Low', forecast: '-775M', previous: '-1349M' },
  { title: 'Flash Services PMI', country: 'USD', date: '2026-10-23T09:45:00-04:00', impact: 'High', forecast: '58.0', previous: '58.7' },
];

const events = parseTradingView(TV);
const byId = id => events.find(e => e.id === id);

test('settings keep known levels and markets in a fixed order; empty or broken goes back to the default', () => {
  assert.deepEqual(cleanEcon({}), { levels: ['high', 'medium'], markets: ['US', 'EU', 'IL'] });
  assert.deepEqual(cleanEcon({ levels: ['low', 'high', 'low', 'huge'], markets: ['IL', 'XX'] }), { levels: ['high', 'low'], markets: ['IL'] });
  assert.deepEqual(cleanEcon({ levels: [], markets: 'US' }), { levels: ['high', 'medium'], markets: ['US', 'EU', 'IL'] });
  assert.equal(marketsSummary(['US', 'IL']), 'US, IL');
});

test('the request covers yesterday to nine days on, in UTC days, for the three markets', () => {
  const url = new URL(tvUrl(Date.UTC(2026, 9, 18, 21, 5)));
  assert.equal(url.origin + url.pathname, 'https://economic-calendar.tradingview.com/events');
  assert.equal(url.searchParams.get('from'), '2026-10-17T00:00:00.000Z');
  assert.equal(url.searchParams.get('to'), '2026-10-27T00:00:00.000Z');
  assert.equal(url.searchParams.get('countries'), 'US,EU,IL');
});

test('the Origin rule touches only this extension\'s requests to the calendar host', () => {
  const rule = originRule('abcdef', 7);
  assert.equal(rule.id, 7);
  assert.deepEqual(rule.action.requestHeaders, [{ header: 'origin', operation: 'set', value: 'https://www.tradingview.com' }]);
  assert.deepEqual(rule.condition.initiatorDomains, ['abcdef']);
  assert.deepEqual(rule.condition.requestDomains, ['economic-calendar.tradingview.com']);
  assert.deepEqual(rule.condition.resourceTypes, ['xmlhttprequest']);
  assert.equal(isOriginRule(rule), true);
  assert.equal(isOriginRule({ id: 1, condition: { tabIds: [5] }, action: { type: 'modifyHeaders' } }), false);
  assert.equal(isOriginRule(null), false);
});

test('TradingView events: the three markets only, whole ones only', () => {
  assert.equal(parseTradingView({ status: 'error' }), null);
  assert.equal(parseTradingView(null), null);
  assert.deepEqual(parseTradingView({ status: 'ok', result: [] }), []);
  assert.equal(events.length, 11);
  assert.equal(byId('10'), undefined);   // Japan
  assert.deepEqual(byId('4'), {
    id: '4', market: 'US', kind: 'event', level: 'high', title: 'Non Farm Payrolls', period: 'Sep', at: Date.parse('2026-10-18T12:30:00.000Z'),
    allDay: false, day: '', actual: '29K', forecast: '90K', previous: '133K', move: 'down', source: '', about: '',
  });
});

test('Israel\'s rate decisions and CPI count as High, GDP and unemployment as Medium', () => {
  assert.equal(byId('1').level, 'high');     // Interest Rate, TradingView's medium
  assert.equal(byId('2').level, 'high');     // Inflation Rate Mom, TradingView's low
  assert.equal(byId('408077').level, 'medium');
  assert.equal(byId('3').level, 'low');      // Tourist Arrivals keeps TradingView's
  assert.equal(byId('9').level, 'medium');   // Eurozone: TradingView's
  assert.equal(byId('408077').source, 'Central Bureau of Statistics');
});

test('holidays and events at 00:00 UTC are a date, not a time', () => {
  assert.deepEqual([byId('7').kind, byId('7').allDay, byId('7').day], ['holiday', true, '2026-10-19']);
  assert.deepEqual([byId('8').kind, byId('8').allDay, byId('8').day], ['event', true, '2026-10-19']);
  assert.equal(byId('4').allDay, false);
});

test('values carry their scale and unit; the arrow compares the actual with the forecast, else the previous', () => {
  assert.equal(formatValue(-1.7, '%'), '−1.7%');
  assert.equal(formatValue(9743, '$', 'M'), '$9,743M');
  assert.equal(formatValue(-7.8, '€', 'B'), '−€7.8B');
  assert.equal(formatValue(87, 'cf', 'B'), '87B cf');
  assert.equal(formatValue(0.4816, null, 'M'), '0.482M');
  assert.equal(formatValue(null, '%'), '');
  assert.equal(byId('9').actual, '−€7.8B');
  assert.equal(byId('9').move, 'down');
  assert.equal(byId('3').move, 'up');        // no forecast: against the previous
  assert.equal(byId('11').move, '');         // as forecast
  assert.equal(byId('1').move, '');          // not out yet
});

test('ForexFactory: USA and Eurozone, its values as given, Holiday as a holiday, no actual', () => {
  assert.equal(parseForexFactory({}), null);
  const ff = parseForexFactory(FF);
  assert.deepEqual(ff.map(e => e.market), ['US', 'EU', 'US', 'US']);
  const claims = ff[0];
  assert.deepEqual(claims, {
    id: 'ff:US:2026-10-22T08:30:00-04:00:Unemployment Claims', market: 'US', kind: 'event', level: 'medium', title: 'Unemployment Claims',
    period: '', at: Date.parse('2026-10-22T08:30:00-04:00'), allDay: false, day: '', actual: '', forecast: '200K', previous: '199K', move: '',
    source: '', about: '',
  });
  assert.equal(ff[1].previous, '−1.1%');
  assert.deepEqual([ff[2].kind, ff[2].allDay, ff[2].day], ['holiday', true, '2026-10-19']);
  assert.equal(ff[3].level, 'high');
});

test('the calendar: today and the next 6 days by local day, filtered, all-day first, then by time', () => {
  const now = Date.parse('2026-10-18T13:00:00.000Z');   // 16:00 in Israel
  const days = calendar(events, { levels: ['high', 'medium', 'low'], markets: ['US', 'EU', 'IL'], now, timeZone: TZ });
  assert.deepEqual(days.map(d => [d.day, d.label]), [['2026-10-18', 'Today'], ['2026-10-19', 'Tomorrow'], ['2026-10-20', 'Tue 20 Oct'], ['2026-10-21', 'Wed 21 Oct']]);
  // The CPI of the 15th is before today; the gas stocks of the 25th come after the 6 days.
  assert.deepEqual(days[0].events.map(e => e.id), ['9', '408077', '3', '4', '6']);
  assert.deepEqual(days[1].events.map(e => e.id), ['7', '8']);
  assert.ok(!days.flatMap(d => d.events).some(e => e.id === '2' || e.id === '11'));
});

test('the calendar shows a copy\'s markets and levels; holidays whatever the level', () => {
  const now = Date.parse('2026-10-18T13:00:00.000Z');
  const days = calendar(events, { levels: ['high'], markets: ['US', 'IL'], now, timeZone: TZ });
  assert.deepEqual(days.map(d => d.events.map(e => e.id)), [['4', '6'], ['7'], ['5'], ['1']]);
  assert.deepEqual(calendar(events, { levels: ['low'], markets: ['EU'], now, timeZone: TZ }), []);
});

test('each row\'s state: out, past, due, the next one, later, all day', () => {
  const now = Date.parse('2026-10-18T12:40:00.000Z');   // NFP out 10 min ago; the speech at 15:00 is next
  const state = id => calendar(events, { levels: ['high', 'medium', 'low'], markets: ['US', 'EU', 'IL'], now, timeZone: TZ })
    .flatMap(d => d.events).find(e => e.id === id)?.state;
  assert.equal(state('4'), 'out');
  assert.equal(state('3'), 'out');
  assert.equal(state('408077'), 'past');   // 2 h 40 m ago, still no number
  assert.equal(state('6'), 'next');
  assert.equal(state('5'), 'later');
  assert.equal(state('7'), 'allday');
  // GDP 10 minutes after its time, with a forecast and no actual: due.
  const due = Date.parse('2026-10-18T10:10:00.000Z');
  assert.equal(calendar(events, { levels: ['medium'], markets: ['IL'], now: due, timeZone: TZ })[0].events[0].state, 'due');
  // A speech has no number to wait for: past as soon as it starts.
  const speech = Date.parse('2026-10-18T15:05:00.000Z');
  assert.equal(calendar(events, { levels: ['high'], markets: ['US'], now: speech, timeZone: TZ })[0].events.find(e => e.id === '6').state, 'past');
});

test('every event at the next time is next', () => {
  const twin = { ...byId('5'), id: '5b', title: 'Housing Starts' };
  const now = Date.parse('2026-10-19T09:00:00.000Z');
  const days = calendar([...events, twin], { levels: ['high'], markets: ['US'], now, timeZone: TZ });
  assert.deepEqual(days.find(d => d.day === '2026-10-20').events.map(e => [e.id, e.state]), [['5', 'next'], ['5b', 'next']]);
});

test('the countdown: minutes, hours and minutes, then days', () => {
  const now = 0;
  assert.equal(untilLabel(30e3, now), 'in 1 m');
  assert.equal(untilLabel(14 * MIN, now), 'in 14 m');
  assert.equal(untilLabel(2 * HOUR + 14 * MIN, now), 'in 2 h 14 m');
  assert.equal(untilLabel(3 * HOUR, now), 'in 3 h');
  assert.equal(untilLabel(50 * HOUR, now), 'in 2 d');
});

test('ask every minute while a number shown is due, hourly from ForexFactory, else every 15 minutes', () => {
  const shown = calendar(events, { levels: ['medium'], markets: ['IL'], now: Date.parse('2026-10-18T10:05:00.000Z'), timeZone: TZ }).flatMap(d => d.events);
  assert.equal(econTtl(shown, Date.parse('2026-10-18T10:05:00.000Z')), MIN);
  assert.equal(econTtl(shown, Date.parse('2026-10-18T10:00:00.000Z') + DUE_MS + 1), 15 * MIN);
  assert.equal(econTtl([], 0, 'ForexFactory'), HOUR);
  assert.equal(econTtl([], 0, 'TradingView'), 15 * MIN);
});
