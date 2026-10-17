import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  condition, cleanPlace, cleanWeather, placeLabel, parsePlaces, parseForecast, nextHours, nextDays, forecastUrl, placeKey,
  searchUrl, nextSun, matchParts, toUnit, degrees, windSpeed, hourLabel, timeLabel, dayLabel, localDate, rangeBars,
  metnoCode, metnoUrl, parseMetno, guessOffset, sunTimes, photonUrl, parsePhotonPlaces,
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

// ---- MET Norway, when Open-Meteo is down ----

// A trimmed MET Norway response for Tel Aviv, fetched 2026-10-17 at 23:00 local (20:00 UTC):
// hourly steps, then 6-hourly ones.
const step = (time, temp, one, six, extra = {}) => ({
  time,
  data: {
    instant: { details: { air_temperature: temp, ...extra } },
    ...(one ? { next_1_hours: { summary: { symbol_code: one[0] }, details: { precipitation_amount: 0, ...one[1] } } } : {}),
    next_6_hours: { summary: { symbol_code: six[0] }, details: { air_temperature_max: six[1], air_temperature_min: six[2], ...six[3] } },
  },
});
const METNO = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [34.78, 32.08, 21] },
  properties: {
    timeseries: [
      step('2026-10-17T20:00:00Z', 20.9, ['clearsky_night'], ['fair_night', 20.1, 18.5],
        { apparent_air_temperature: 20.9, relative_humidity: 82.6, wind_speed: 1.9 }),
      step('2026-10-17T21:00:00Z', 20.1, ['clearsky_night'], ['partlycloudy_night', 20.5, 18.1]),
      step('2026-10-18T09:00:00Z', 25.8, ['rainshowers_day', { probability_of_precipitation: 40 }], ['rainshowers_day', 26.2, 24]),
      step('2026-10-20T12:00:00Z', 25, null, ['partlycloudy_day', 25.5, 22]),
      step('2026-10-20T18:00:00Z', 19, null, ['clearsky_night', 21, 16.6]),
      step('2026-10-21T00:00:00Z', 17.3, null, ['fair_night', 18, 17]),
    ],
  },
};

test('MET Norway\'s symbols read as WMO codes, by day or night; thunder of any kind is a storm', () => {
  assert.equal(metnoCode('clearsky_night'), 0);
  assert.equal(metnoCode('partlycloudy_polartwilight'), 2);
  assert.equal(metnoCode('lightrainshowers_day'), 80);
  assert.equal(metnoCode('heavysnow'), 75);
  assert.equal(metnoCode('lightssleetshowersandthunder'), 95);
  assert.equal(metnoCode('fog'), 45);
  assert.equal(metnoCode('martian_dust'), null);
  assert.equal(metnoCode(undefined), null);
});

test('a MET Norway forecast reads like an Open-Meteo one: now, the hourly steps, and days made from all steps', () => {
  const f = parseMetno(METNO, 10800);
  assert.equal(f.offset, 10800);
  assert.deepEqual(f.now, { at: Date.UTC(2026, 9, 17, 20), temp: 20.9, feels: 20.9, humidity: 82.6, wind: 1.9 * 3.6, code: 0, isDay: false });
  assert.deepEqual(f.hours.map(h => [h.temp, h.code, h.rain, h.isDay]), [[20.9, 0, null, false], [20.1, 0, null, false], [25.8, 81, 40, true]]);
  // Days follow the place's calendar; the last one, a lone step, is left out.
  assert.deepEqual(f.days.map(d => [d.date, d.max, d.min, d.code, d.rain]), [
    ['2026-10-17', 20.9, 18.5, 1, null],
    ['2026-10-18', 26.2, 18.1, 81, 40],
    ['2026-10-20', 25.5, 16.6, 2, null],
  ]);
  assert.equal(localDate(f.days[0].sunrise, f.offset), '2026-10-17');
  assert.ok(f.days[0].sunset > f.days[0].sunrise);
});

test('without an earlier forecast the time zone is guessed from the longitude', () => {
  assert.equal(parseMetno(METNO).offset, 7200);
});

test('a better guess: this computer\'s time zone when it\'s near the place\'s, summer time and all', () => {
  assert.equal(guessOffset(34.78, 3 * 3600), 3 * 3600);     // Tel Aviv seen from Israel in October
  assert.equal(guessOffset(-3.7, 2 * 3600), 2 * 3600);      // Madrid seen from Spain in summer
  assert.equal(guessOffset(-74, 3 * 3600), -5 * 3600);      // New York seen from Israel: the sun's
});

test('a MET Norway response that isn\'t a forecast reads as null', () => {
  assert.equal(parseMetno(null), null);
  assert.equal(parseMetno({ properties: { timeseries: [] }, geometry: { coordinates: [34.78, 32.08] } }), null);
  assert.equal(parseMetno({ properties: { timeseries: METNO.properties.timeseries } }), null);
});

test('MET Norway is asked for the same rounded spot as Open-Meteo', () => {
  assert.equal(metnoUrl(TEL_AVIV), 'https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=32.08&lon=34.78');
});

test('sunrise and sunset are worked out to within a couple of minutes of Open-Meteo\'s', () => {
  // Open-Meteo, Tel Aviv, 2026-10-17 (UTC+3): sunrise 06:45, sunset 18:06.
  const { sunrise, sunset } = sunTimes('2026-10-17', 32.08, 34.78, 10800);
  assert.ok(Math.abs(sunrise - Date.UTC(2026, 9, 17, 3, 45)) <= 3 * 60e3);
  assert.ok(Math.abs(sunset - Date.UTC(2026, 9, 17, 15, 6)) <= 3 * 60e3);
  // No sunrise in Tromsø's polar night.
  assert.deepEqual(sunTimes('2026-12-15', 69.65, 18.96, 3600), { sunrise: null, sunset: null });
});

test('Photon\'s places (OpenStreetMap) read as places, each once', () => {
  const feature = (name, state, country, lon, lat) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { name, state, country, osm_value: 'town' } });
  const json = { type: 'FeatureCollection', features: [
    feature('Herzliya', 'Tel-Aviv District', 'Israel', 34.8469, 32.1656),
    feature('Herzliya', 'Tel-Aviv District', 'Israel', 34.8308, 32.1677),
    feature('Portland', 'Oregon', 'United States', -122.67, 45.52),
    feature('', 'Nowhere', 'Nowhere', 0, 0),
  ] };
  assert.deepEqual(parsePhotonPlaces(json), [
    { name: 'Herzliya', region: 'Tel-Aviv District', country: 'Israel', lat: 32.1656, lon: 34.8469 },
    { name: 'Portland', region: 'Oregon', country: 'United States', lat: 45.52, lon: -122.67 },
  ]);
  assert.deepEqual(parsePhotonPlaces({ type: 'FeatureCollection', features: [] }), []);
  assert.equal(parsePhotonPlaces({ message: 'error' }), null);
  assert.equal(photonUrl(' Herz '), 'https://photon.komoot.io/api/?q=Herz&limit=6&lang=en&layer=city');
});
