import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  condition, cleanPlace, cleanWeather, placeLabel, parsePlaces, parseForecast, nextHours, nextDays, forecastUrl, placeKey,
  searchUrl, nextSun, matchParts, toUnit, degrees, windSpeed, hourLabel, timeLabel, dayLabel, localDate, rangeBars,
} from '../js/weather.js';

const TEL_AVIV = { name: 'Tel Aviv', region: 'Tel Aviv', country: 'Israel', lat: 32.08088, lon: 34.78057 };

// A trimmed Open-Meteo response for Tel Aviv (UTC+3), fetched 2026-10-17 at 18:30 local.
const RESPONSE = {
  utc_offset_seconds: 10800,
  current: { time: '2026-10-17T18:30', temperature_2m: 23, apparent_temperature: 25.7, relative_humidity_2m: 79, weather_code: 2, is_day: 0, wind_speed_10m: 5 },
  hourly: {
    time: ['2026-10-17T17:00', '2026-10-17T18:00', '2026-10-17T19:00', '2026-10-17T20:00'],
    temperature_2m: [24.1, 23.4, 22.8, null],
    weather_code: [1, 2, 3, 3],
    precipitation_probability: [0, 5, 20, 40],
    is_day: [1, 0, 0, 0],
  },
  daily: {
    time: ['2026-10-16', '2026-10-17', '2026-10-18'],
    weather_code: [0, 2, 61],
    temperature_2m_max: [27, 26.4, 24],
    temperature_2m_min: [19, 18.2, 17.5],
    precipitation_probability_max: [0, 10, 70],
    sunrise: ['2026-10-16T06:11', '2026-10-17T06:12', '2026-10-18T06:12'],
    sunset: ['2026-10-16T17:40', '2026-10-17T17:39', '2026-10-18T17:38'],
  },
};
const AT_1830 = Date.UTC(2026, 9, 17, 15, 30);   // 18:30 in Tel Aviv

test('a WMO code reads as a label and an icon, with a night icon where the sky shows', () => {
  assert.deepEqual(condition(0, true), { label: 'Clear', icon: 'sun' });
  assert.deepEqual(condition(0, false), { label: 'Clear', icon: 'moon' });
  assert.deepEqual(condition(2, false), { label: 'Partly cloudy', icon: 'cloud-moon' });
  assert.deepEqual(condition(63, false), { label: 'Rain', icon: 'rain' });
  assert.deepEqual(condition(75), { label: 'Heavy snow', icon: 'snow' });
  assert.deepEqual(condition(99), { label: 'Thunderstorm, hail', icon: 'storm' });
  assert.deepEqual(condition(1234), { label: 'Cloudy', icon: 'cloud' });
});

test('a place is kept only with a name and coordinates on the globe', () => {
  assert.deepEqual(cleanPlace(TEL_AVIV), TEL_AVIV);
  assert.deepEqual(cleanPlace({ name: ' Oslo ', lat: 59.9, lon: 10.7 }), { name: 'Oslo', region: '', country: '', lat: 59.9, lon: 10.7 });
  assert.equal(cleanPlace({ name: '', lat: 1, lon: 1 }), null);
  assert.equal(cleanPlace({ name: 'X', lat: 91, lon: 1 }), null);
  assert.equal(cleanPlace({ name: 'X', lat: '1', lon: 1 }), null);
  assert.equal(cleanPlace(null), null);
});

test('settings: no place until one is chosen, and °C unless °F was picked', () => {
  assert.deepEqual(cleanWeather({}), { place: null, unit: 'c' });
  assert.deepEqual(cleanWeather({ place: TEL_AVIV, unit: 'f' }), { place: TEL_AVIV, unit: 'f' });
  assert.deepEqual(cleanWeather({ place: { name: 'X' }, unit: 'k' }), { place: null, unit: 'c' });
});

test('a place is labelled by its name and country, the region only when asked and different', () => {
  assert.equal(placeLabel(TEL_AVIV), 'Tel Aviv, Israel');
  assert.equal(placeLabel(TEL_AVIV, { region: true }), 'Tel Aviv, Israel');
  assert.equal(placeLabel({ name: 'Portland', region: 'Oregon', country: 'United States' }, { region: true }), 'Portland, Oregon, United States');
  assert.equal(placeLabel(null), '');
});

test('geocoding results become places; no results is an empty list; junk is null', () => {
  const json = { results: [
    { name: 'Tel Aviv', latitude: 32.08088, longitude: 34.78057, admin1: 'Tel Aviv', country: 'Israel' },
    { name: 'Nowhere' },
  ] };
  assert.deepEqual(parsePlaces(json), [TEL_AVIV]);
  assert.deepEqual(parsePlaces({ generationtime_ms: 0.1 }), []);
  assert.equal(parsePlaces({ results: 'x' }), null);
  assert.equal(parsePlaces(null), null);
  assert.match(searchUrl(' tel aviv '), /\?name=tel\+aviv&count=6&language=en&format=json$/);
});

test('the forecast URL asks for the place rounded to about a kilometre, in its own time zone', () => {
  const url = new URL(forecastUrl(TEL_AVIV));
  assert.equal(url.searchParams.get('latitude'), '32.08');
  assert.equal(url.searchParams.get('longitude'), '34.78');
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.match(url.searchParams.get('current'), /temperature_2m/);
  assert.equal(placeKey(TEL_AVIV), '32.08,34.78');
});

test('a forecast is read in the place\'s time, dropping hours and days it can\'t use', () => {
  const f = parseForecast(RESPONSE);
  assert.equal(f.offset, 10800);
  assert.deepEqual(f.now, { at: AT_1830, temp: 23, feels: 25.7, humidity: 79, wind: 5, code: 2, isDay: false });
  assert.equal(f.hours.length, 3);   // 20:00 has no temperature
  assert.equal(f.hours[0].at, Date.UTC(2026, 9, 17, 14));
  assert.deepEqual(f.days.map(d => d.date), ['2026-10-16', '2026-10-17', '2026-10-18']);
  assert.equal(f.days[1].sunrise, Date.UTC(2026, 9, 17, 3, 12));
  assert.equal(parseForecast({ ...RESPONSE, current: { temperature_2m: null } }), null);
  assert.equal(parseForecast({ current: {} }), null);
});

test('the next hours start with the one under way; the days with the place\'s today', () => {
  const f = parseForecast(RESPONSE);
  assert.deepEqual(nextHours(f, AT_1830).map(h => hourLabel(h.at, f.offset)), ['18:00', '19:00']);
  assert.deepEqual(nextDays(f, AT_1830).map(d => d.date), ['2026-10-17', '2026-10-18']);
  // 01:30 on the 18th in Tel Aviv is still the 17th in UTC.
  assert.equal(localDate(Date.UTC(2026, 9, 17, 22, 30), 10800), '2026-10-18');
});

test('temperatures and wind convert to °F and mph', () => {
  assert.equal(toUnit(23, 'c'), 23);
  assert.equal(toUnit(23, 'f'), 73);
  assert.equal(toUnit(-40, 'f'), -40);
  assert.equal(degrees(25.7, 'c'), '26°');
  assert.equal(degrees(null, 'c'), '–');
  assert.equal(windSpeed(16.1, 'c'), '16 km/h');
  assert.equal(windSpeed(16.1, 'f'), '10 mph');
});

test('hours and times follow the 12/24-hour choice', () => {
  const at = Date.UTC(2026, 9, 17, 11, 5);   // 14:05 in Tel Aviv
  assert.equal(hourLabel(at, 10800), '14:00');
  assert.equal(hourLabel(at, 10800, false), '2 PM');
  assert.equal(hourLabel(Date.UTC(2026, 9, 16, 21), 10800, false), '12 AM');
  assert.equal(timeLabel(at, 10800), '14:05');
  assert.equal(timeLabel(Date.UTC(2026, 9, 17, 3, 12), 10800, false), '6:12 AM');
});

test('days are Today, then weekday names', () => {
  assert.equal(dayLabel('2026-10-17', '2026-10-17'), 'Today');
  assert.equal(dayLabel('2026-10-18', '2026-10-17'), 'Sun');
  assert.equal(dayLabel('2026-10-19', '2026-10-17', { long: true }), 'Monday');
});

test('each day\'s bar sits on the week\'s low-to-high range, never thinner than a sliver', () => {
  const bars = rangeBars([{ min: 10, max: 20 }, { min: 15, max: 30 }, { min: 30, max: 30 }]);
  assert.deepEqual(bars[0], { left: 0, width: 50 });
  assert.deepEqual(bars[1], { left: 25, width: 75 });
  assert.deepEqual(bars[2], { left: 96, width: 4 });
  assert.deepEqual(rangeBars([]), []);
});

test('the next sunrise or sunset: tomorrow’s sunrise once today’s sunset has passed', () => {
  const f = parseForecast(RESPONSE);
  assert.deepEqual(nextSun(f, AT_1830), { kind: 'Sunrise', at: Date.UTC(2026, 9, 18, 3, 12) });
  assert.deepEqual(nextSun(f, Date.UTC(2026, 9, 17, 12)), { kind: 'Sunset', at: Date.UTC(2026, 9, 17, 14, 39) });
  assert.equal(nextSun(f, Date.UTC(2026, 9, 19)), null);
});

test('a search lists towns and cities, each once; a park or an airport only when nothing else matches', () => {
  const town = { name: 'Tel Aviv', latitude: 32.08088, longitude: 34.78057, admin1: 'Tel Aviv', country: 'Israel', feature_code: 'PPLA' };
  const park = { name: 'Tel Aviv Luna Park', latitude: 32.1, longitude: 34.81, admin1: 'Tel Aviv', country: 'Israel', feature_code: 'AMUS' };
  assert.deepEqual(parsePlaces({ results: [town, park, { ...town, latitude: 32.09 }] }), [TEL_AVIV]);
  assert.deepEqual(parsePlaces({ results: [park] }).map(p => p.name), ['Tel Aviv Luna Park']);
});

test('the typed part of a name is marked, ignoring case and accents', () => {
  assert.deepEqual(matchParts('Tel Aviv', 'tel'), [{ text: 'Tel', hit: true }, { text: ' Aviv', hit: false }]);
  assert.deepEqual(matchParts('Zürich', 'zur'), [{ text: 'Zür', hit: true }, { text: 'ich', hit: false }]);
  assert.deepEqual(matchParts('New York', 'york'), [{ text: 'New ', hit: false }, { text: 'York', hit: true }]);
  assert.deepEqual(matchParts('Paris', 'lyon'), [{ text: 'Paris', hit: false }]);
  assert.deepEqual(matchParts('Paris', ' '), [{ text: 'Paris', hit: false }]);
});
