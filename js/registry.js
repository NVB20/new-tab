// The widget types the canvas can show: layout.js's sizes and limits joined with each type's
// mount. mount(root, store, copy, ctx) draws the widget into root, reading its settings from the
// layout copy with that id, and returns { destroy() }.

import { TYPES } from './layout.js';
import { mountClock } from './clock-widget.js';
import { mountTasks } from './task-widget.js';
import { mountNotes, mountClaude } from './notes-widget.js';
import { mountMarkets } from './markets-widget.js';
import { mountGithub } from './github-widget.js';
import { mountSports } from './sports-widget.js';
import { mountTiles } from './grid.js';
import { mountSearch } from './searchbar.js';
import { mountWebsite } from './website-widget.js';
import { mountMarvel } from './marvel-widget.js';
import { mountWeather } from './weather-widget.js';
import { mountCountdown } from './countdown-widget.js';
import { mountEcon } from './econ-widget.js';
import { mountGcal } from './gcal-widget.js';

const MOUNTS = {
  clock: mountClock,
  tasks: mountTasks,
  notes: mountNotes,
  claude: mountClaude,
  markets: mountMarkets,
  github: mountGithub,
  sports: mountSports,
  tiles: mountTiles,
  search: mountSearch,
  website: mountWebsite,
  marvel: mountMarvel,
  weather: mountWeather,
  countdown: mountCountdown,
  econ: mountEcon,
  gcal: mountGcal,
};

export const WIDGETS = Object.fromEntries(Object.entries(TYPES).map(([type, t]) => [type, { ...t, mount: MOUNTS[type] }]));
