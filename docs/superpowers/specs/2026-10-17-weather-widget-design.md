# Weather widget: a city's weather now, by the hour and for the week

Date: 2026-10-17
Status: built (asked for as "add a weather widget")

A new widget type, **Weather**, shows one city's conditions now, the next hours and the week
ahead. Up to three copies, each with its own city and units.

## Data

- **Open-Meteo** (<https://open-meteo.com/>): free, no key, CORS open (`access-control-allow-origin: *`
  on both APIs), so no host permission and no manifest change.
- **Forecast:** `api.open-meteo.com/v1/forecast` with the city's coordinates rounded to 0.01°,
  `timezone=auto`, 7 days; current temperature, feels-like, humidity, wind, weather code and
  day/night; hourly temperature, code, chance of rain and day/night; daily code, high, low, chance
  of rain, sunrise and sunset. Always fetched in °C and km/h; °F and mph are converted locally, so
  switching units needs no fetch.
- **City search:** `geocoding-api.open-meteo.com/v1/search` (6 results, English names). Not cached.
- Through `net.js`'s `feed()`, key `weather-v1:<lat>,<lon>`, TTL 15 minutes: every copy and tab
  showing the same city shares one fetch. A tab checks every 5 minutes while visible and when it
  comes back into view. On failure the last forecast stays, with "Open-Meteo unreachable · from
  2 h ago"; with nothing saved, "Couldn't load the forecast" and Try again (a forced fetch).
- Times are read in the city's own time (Open-Meteo's wall-clock times plus `utc_offset_seconds`)
  and follow the Clock's 12/24-hour setting.

## What the widget shows

- **Head:** the cloud-and-sun icon and the city's name (hover: name, region, country); ✎ on hover.
- **Now:** a large condition icon (accent colour), the temperature, the condition in words, and
  today's high and low.
- **A line under it:** feels like, wind, humidity, and the next sunrise or sunset. What doesn't
  fit the width wraps out of sight.
- **The next hours:** "Now", then each hour: the time, an icon (night icons after dark), the
  temperature, and the chance of rain at 20% or more. As many as fit the width (a grid whose
  overflow wraps into zero-height rows).
- **The week:** Today, then weekday names, each with an icon, the chance of rain at 20% or more,
  the low, a bar placed on the week's low-to-high range, and the high. As many days as fit the
  height (a wrapping flex column whose overflow lands out of sight), never a cut-off row.
- **Sizes (container queries):** under 200px tall, just now and the line under it; under 230px
  wide, a smaller now and no bars.
- **No city yet:** "No city yet. Choose one", which opens the editor.

Conditions: the WMO codes Open-Meteo uses, as Clear, Mostly clear, Partly cloudy, Overcast, Fog,
Drizzle, Rain (light, heavy), Freezing rain or drizzle, Snow (light, heavy, grains), Showers, Snow
showers and Thunderstorm (with hail). New icons in `ui.js`: cloud, cloud-sun, cloud-moon, rain,
snow, storm, fog, wind; clear uses the existing sun and moon.

## Editor (✎)

- **City:** the current city, a search box (searches when typing pauses, or Enter), and the
  results as a list: name in bold, region and country after. ↓ from the box into the list, ↑/↓
  through it, Enter or a click picks one and closes the editor.
- **Units:** °C with km/h, or °F with mph.
- "Forecast: Open-Meteo", linked.

## Settings and layout

- The copy's settings: `{ place: { name, region, country, lat, lon } | null, unit: 'c' | 'f' }`,
  cleaned by `cleanWeather` (a place needs a name and coordinates on the globe).
- Preferences → Layout → Weather: the city (changed with ✎) and the Units choice.
- Copy title: "Weather · Tel Aviv", or "Weather · no place".
- Size 3 × 4, minimum 2 × 2, up to 3 copies (like Markets and GitHub). Never on a page converted from before Layout mode.
- **Default place:** the clock column, under the clock. Both columns' minimums already filled all
  12 rows, so Weather is a *spare* type: when its column's minimums don't fit it goes in the other
  column, and when neither has room `placeDefaults` leaves it out (setup then says there's no room).

## Setup

- Widgets step: Weather, after the Clock ("Now, by the hour, the week").
- Connect step: a city search whose results are chips (picking one puts it in the widget) and °C /
  °F chips. When Weather is the only widget there is to fill in besides the search bar, the card
  sits opposite the clock column so the widget fills in in view.

## Files

- `js/weather.js` (pure, tested in `test/weather.test.js`): conditions, places, URLs, parsing,
  next hours and days, next sunrise or sunset, units and labels, range bars.
- `js/weather-widget.js`: the widget and its editor.
- `js/layout.js` (type, default place, spare types, copy title), `js/registry.js`,
  `js/widget-about.js`, `js/prefs.js`, `js/onboarding.js`, `js/ui.js` (icons),
  `css/newtab.css`, `README.md`, `docs/onboarding.md`.
