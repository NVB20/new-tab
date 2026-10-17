// Weather: a place's conditions now, the next hours and the week, from Open-Meteo (no key, CORS
// open). Places come from Open-Meteo's geocoding search. Forecasts are fetched in °C and km/h and
// converted here, so switching units needs no fetch. Pure (unit-tested in Node).

export const UNITS = ['c', 'f'];
export const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
export const SEARCH_API = 'https://geocoding-api.open-meteo.com/v1/search';
export const SOURCE = { name: 'Open-Meteo', url: 'https://open-meteo.com/' };

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ---- conditions ----

// WMO weather codes, as Open-Meteo reports them: a label and an icon (ui.js), with a night icon
// where the sky shows.
const CODES = [
  [[0], 'Clear', 'sun', 'moon'],
  [[1], 'Mostly clear', 'cloud-sun', 'cloud-moon'],
  [[2], 'Partly cloudy', 'cloud-sun', 'cloud-moon'],
  [[3], 'Overcast', 'cloud'],
  [[45, 48], 'Fog', 'fog'],
  [[51, 53, 55], 'Drizzle', 'rain'],
  [[56, 57], 'Freezing drizzle', 'rain'],
  [[61], 'Light rain', 'rain'],
  [[63], 'Rain', 'rain'],
  [[65], 'Heavy rain', 'rain'],
  [[66, 67], 'Freezing rain', 'rain'],
  [[71], 'Light snow', 'snow'],
  [[73], 'Snow', 'snow'],
  [[75], 'Heavy snow', 'snow'],
  [[77], 'Snow grains', 'snow'],
  [[80, 81], 'Showers', 'rain'],
  [[82], 'Heavy showers', 'rain'],
  [[85, 86], 'Snow showers', 'snow'],
  [[95], 'Thunderstorm', 'storm'],
  [[96, 99], 'Thunderstorm, hail', 'storm'],
];
const BY_CODE = new Map(CODES.flatMap(([codes, label, day, night]) => codes.map(c => [c, { label, day, night: night ?? day }])));

// { label, icon } for a code; an unknown code reads as cloud.
export function condition(code, isDay = true) {
  const c = BY_CODE.get(code) ?? { label: 'Cloudy', day: 'cloud', night: 'cloud' };
  return { label: c.label, icon: isDay ? c.day : c.night };
}

// ---- places and settings ----

// A saved place, whole and valid, or null.
export function cleanPlace(p) {
  if (!isObj(p)) return null;
  const lat = num(p.lat);
  const lon = num(p.lon);
  const name = text(p.name, 100);
  if (!name || lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name, region: text(p.region, 100), country: text(p.country, 100), lat, lon };
}

// A copy's settings: the place (null until one is chosen) and the unit, °C or °F.
export const cleanWeather = s => ({ place: cleanPlace(s?.place), unit: UNITS.includes(s?.unit) ? s.unit : 'c' });

// "Tel Aviv, Israel"; with the region too when it says more ("Portland, Oregon, United States").
export function placeLabel(p, { region = false } = {}) {
  if (!p) return '';
  const parts = [p.name, region && p.region !== p.name ? p.region : '', p.country].filter(Boolean);
  return parts.join(', ');
}

export const searchUrl = query => `${SEARCH_API}?${new URLSearchParams({ name: query.trim(), count: '6', language: 'en', format: 'json' })}`;

// Geocoding results as places, or null when the response isn't what we expect. No results is [].
// Towns and cities only (GeoNames' PPL codes: no parks, airports or regions) unless that leaves
// nothing, and each name, region and country once.
export function parsePlaces(json) {
  if (!isObj(json)) return null;
  if (json.results === undefined) return [];
  if (!Array.isArray(json.results)) return null;
  const towns = json.results.filter(r => typeof r?.feature_code !== 'string' || r.feature_code.startsWith('PPL'));
  const seen = new Set();
  return (towns.length ? towns : json.results)
    .map(r => cleanPlace({ name: r?.name, region: r?.admin1, country: r?.country, lat: r?.latitude, lon: r?.longitude }))
    .filter(p => {
      const key = placeLabel(p, { region: true });
      if (!p || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// A name split around the first place it contains the query, ignoring case and accents, for
// showing the typed part in bold: [{ text, hit }].
export function matchParts(name, query) {
  const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const q = fold(query.trim());
  // Folding keeps one character per character only when nothing was combined: else no bold.
  const at = q && fold(name).length === name.length ? fold(name).indexOf(q) : -1;
  if (at < 0) return [{ text: name, hit: false }];
  return [
    { text: name.slice(0, at), hit: false },
    { text: name.slice(at, at + q.length), hit: true },
    { text: name.slice(at + q.length), hit: false },
  ].filter(part => part.text);
}

// ---- the forecast ----

const CURRENT = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'weather_code', 'is_day', 'wind_speed_10m'];
const HOURLY = ['temperature_2m', 'weather_code', 'precipitation_probability', 'is_day'];
const DAILY = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max', 'sunrise', 'sunset'];

// Coordinates rounded to about a kilometre: the cache key and the request agree, and two copies
// for the same city share a fetch.
const round = n => Math.round(n * 100) / 100;
export const placeKey = p => `${round(p.lat)},${round(p.lon)}`;

export const forecastUrl = p => `${FORECAST_API}?${new URLSearchParams({
  latitude: String(round(p.lat)), longitude: String(round(p.lon)),
  current: CURRENT.join(','), hourly: HOURLY.join(','), daily: DAILY.join(','),
  timezone: 'auto', forecast_days: '7',
})}`;

// Open-Meteo gives the place's wall-clock times ("2026-10-17T18:30") and its UTC offset; as epoch ms.
const instant = (local, offset) => {
  const ms = typeof local === 'string' ? Date.parse(`${local.length === 10 ? `${local}T00:00` : local}:00Z`) : NaN;
  return Number.isFinite(ms) ? ms - offset * 1000 : null;
};

// The forecast as { offset (seconds east of UTC), now, hours, days } or null when the response
// isn't what we expect. Temperatures in °C, wind in km/h, chances of rain in %.
export function parseForecast(json) {
  if (!isObj(json) || !isObj(json.current) || !isObj(json.hourly) || !isObj(json.daily)) return null;
  const offset = num(json.utc_offset_seconds) ?? 0;
  const c = json.current;
  const now = {
    at: instant(c.time, offset),
    temp: num(c.temperature_2m),
    feels: num(c.apparent_temperature),
    humidity: num(c.relative_humidity_2m),
    wind: num(c.wind_speed_10m),
    code: num(c.weather_code),
    isDay: c.is_day !== 0,
  };
  if (now.temp == null) return null;
  const h = json.hourly;
  const hours = (Array.isArray(h.time) ? h.time : []).map((t, i) => ({
    at: instant(t, offset),
    temp: num(h.temperature_2m?.[i]),
    code: num(h.weather_code?.[i]),
    rain: num(h.precipitation_probability?.[i]),
    isDay: h.is_day?.[i] !== 0,
  })).filter(x => x.at != null && x.temp != null);
  const d = json.daily;
  const days = (Array.isArray(d.time) ? d.time : []).map((t, i) => ({
    date: typeof t === 'string' ? t.slice(0, 10) : '',
    code: num(d.weather_code?.[i]),
    max: num(d.temperature_2m_max?.[i]),
    min: num(d.temperature_2m_min?.[i]),
    rain: num(d.precipitation_probability_max?.[i]),
    sunrise: instant(d.sunrise?.[i], offset),
    sunset: instant(d.sunset?.[i], offset),
  })).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.max != null && x.min != null);
  return { offset, now, hours, days };
}

// The hours from the one under way, at most n.
export function nextHours(forecast, now, n = 24) {
  const from = now - 3600e3;
  return forecast.hours.filter(x => x.at > from).slice(0, n);
}

// The days from the place's today on.
export function nextDays(forecast, now) {
  const today = localDate(now, forecast.offset);
  return forecast.days.filter(x => x.date >= today);
}

// The next sunrise or sunset: { kind: 'Sunrise' | 'Sunset', at } or null.
export function nextSun(forecast, now) {
  const events = forecast.days.flatMap(d => [{ kind: 'Sunrise', at: d.sunrise }, { kind: 'Sunset', at: d.sunset }]);
  return events.filter(e => e.at != null && e.at > now).sort((a, b) => a.at - b.at)[0] ?? null;
}

// ---- units and labels ----

export const toUnit = (c, unit) => (c == null ? null : Math.round(unit === 'f' ? (c * 9) / 5 + 32 : c));
export const degrees = (c, unit) => (c == null ? '–' : `${toUnit(c, unit)}°`);
export const windSpeed = (kmh, unit) => (kmh == null ? '–' : unit === 'f' ? `${Math.round(kmh / 1.609344)} mph` : `${Math.round(kmh)} km/h`);

// The place's wall clock for an instant, as a Date read with its UTC getters.
const wall = (ms, offset) => new Date(ms + offset * 1000);
export const localDate = (ms, offset) => wall(ms, offset).toISOString().slice(0, 10);

// "14:00" or "2 PM", in the place's time.
export function hourLabel(ms, offset, hour24 = true) {
  const h = wall(ms, offset).getUTCHours();
  if (hour24) return `${String(h).padStart(2, '0')}:00`;
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}

// "06:12" or "6:12 AM", in the place's time.
export function timeLabel(ms, offset, hour24 = true) {
  const d = wall(ms, offset);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return hour24 ? `${String(h).padStart(2, '0')}:${m}` : `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "Today", then "Sat", "Sun", … (long: "Saturday").
export function dayLabel(date, today, { long = false } = {}) {
  if (date === today) return 'Today';
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (long ? LONG_WEEKDAYS : WEEKDAYS)[day];
}

// Where each day's low-to-high bar sits on the week's range, as percents { left, width }.
export function rangeBars(days) {
  if (!days.length) return [];
  const lo = Math.min(...days.map(d => d.min));
  const hi = Math.max(...days.map(d => d.max));
  const span = hi - lo || 1;
  return days.map(d => {
    const width = Math.max(((d.max - d.min) / span) * 100, 4);
    return { left: Math.min(((d.min - lo) / span) * 100, 100 - width), width };
  });
}
