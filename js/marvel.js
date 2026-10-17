// The Marvel widget's pure part: every MCU film, series, short and special in the order the story
// happens, and what's shown, watched and next. Unit-tested in Node.
//
// The order is Digital Spy's (see SOURCE): split seasons, placement notes and all. Its italics
// slip on three Agents of SHIELD entries; those are series here.

export const SOURCE = {
  name: 'Digital Spy',
  updated: '14 Oct 2026',
  url: 'https://www.digitalspy.com/movies/a825774/marvel-cinematic-universe-in-chronological-order/',
};

export const KINDS = { film: 'Film', series: 'Series', short: 'Short', special: 'Special' };

// What a copy shows: everything, everything but the Marvel Television shows (ABC, Netflix, Hulu
// and Freeform, 2013–2020, which the MCU now places outside its main timeline), or the films.
export const SHOWS = ['all', 'studios', 'films'];

// tv: a Marvel Television show. credits: the entry whose end this one's credits scene belongs after.
const entry = (kind, id, title, part, year, more = {}) => ({ id, title, part, kind, year, tv: false, note: '', ...more });
const film = (id, title, year, more) => entry('film', id, title, '', year, more);
const series = (id, title, part, year, more) => entry('series', id, title, part, year, more);
const tv = (id, title, part, year, more) => series(id, title, part, year, { tv: true, ...more });
const aos = (id, part, year, more) => tv(id, 'Agents of SHIELD', part, year, more);
const short = (id, title, year, more) => entry('short', id, title, '', year, more);
const special = (id, title, year, more) => entry('special', id, title, '', year, more);

const CREDITS_AFTER_INFINITY_WAR = 'Watch its credits scene after Avengers: Infinity War';

export const ENTRIES = [
  series('eyes-of-wakanda', 'Eyes of Wakanda', '', 2025),
  film('captain-america-first-avenger', 'Captain America: The First Avenger', 2011),
  short('agent-carter-one-shot', 'Agent Carter', 2013, { note: 'One-Shot on the Iron Man 3 disc' }),
  tv('agent-carter-1', 'Agent Carter', 'Season 1', 2015),
  tv('agent-carter-2', 'Agent Carter', 'Season 2', 2016),
  film('captain-marvel', 'Captain Marvel', 2019, { note: 'Its mid-credits scene is set after Avengers: Infinity War', credits: 'infinity-war' }),
  film('iron-man', 'Iron Man', 2008),
  film('iron-man-2', 'Iron Man 2', 2010),
  film('incredible-hulk', 'The Incredible Hulk', 2008),
  short('the-consultant', 'The Consultant', 2011, { note: 'One-Shot on the Thor disc' }),
  // 11
  short('thors-hammer', 'A Funny Thing Happened on the Way to Thor’s Hammer', 2011, { note: 'One-Shot on the Captain America: The First Avenger disc' }),
  film('thor', 'Thor', 2011),
  film('avengers', 'The Avengers', 2012, { note: 'Avengers Assemble in some countries' }),
  short('item-47', 'Item 47', 2012, { note: 'One-Shot on the Avengers disc' }),
  aos('aos-1a', 'Season 1 · episodes 1–7', 2013),
  film('thor-dark-world', 'Thor: The Dark World', 2013),
  aos('aos-1b', 'Season 1 · episodes 8–16', 2013),
  film('iron-man-3', 'Iron Man 3', 2013),
  short('all-hail-the-king', 'All Hail the King', 2014, { note: 'One-Shot on the Thor: The Dark World disc' }),
  film('winter-soldier', 'Captain America: The Winter Soldier', 2014),
  // 21
  aos('aos-1c', 'Season 1 · episodes 17–22', 2013),
  film('guardians', 'Guardians of the Galaxy', 2014),
  film('guardians-2', 'Guardians of the Galaxy Vol. 2', 2017),
  series('i-am-groot-1', 'I Am Groot', 'Season 1', 2022),
  series('i-am-groot-2', 'I Am Groot', 'Season 2', 2023),
  tv('daredevil-1', 'Daredevil', 'Season 1', 2015),
  aos('aos-2a', 'Season 2 · episodes 1–10', 2014),
  tv('jessica-jones-1', 'Jessica Jones', 'Season 1', 2015),
  aos('aos-2b', 'Season 2 · episodes 11–19', 2014),
  film('age-of-ultron', 'Avengers: Age of Ultron', 2015),
  // 31
  aos('aos-2c', 'Season 2 · episodes 20–22', 2014),
  tv('daredevil-2a', 'Daredevil', 'Season 2 · episodes 1–4', 2016),
  tv('luke-cage-1a', 'Luke Cage', 'Season 1 · episodes 1–4', 2016),
  tv('daredevil-2b', 'Daredevil', 'Season 2 · episodes 5–11', 2016),
  tv('luke-cage-1b', 'Luke Cage', 'Season 1 · episodes 5–8', 2016),
  tv('daredevil-2c', 'Daredevil', 'Season 2 · episodes 12–13', 2016),
  tv('luke-cage-1c', 'Luke Cage', 'Season 1 · episodes 9–13', 2016),
  film('ant-man', 'Ant-Man', 2015),
  aos('aos-3a', 'Season 3 · episodes 1–10', 2015),
  aos('aos-3b', 'Season 3 · episodes 11–19', 2015),
  // 41
  tv('iron-fist-1', 'Iron Fist', 'Season 1', 2017),
  film('civil-war', 'Captain America: Civil War', 2016),
  short('team-thor', 'Team Thor', 2016, { note: 'One-Shot on the Captain America: Civil War disc' }),
  short('team-thor-2', 'Team Thor: Part 2', 2017, { note: 'One-Shot on the Doctor Strange disc' }),
  film('black-widow', 'Black Widow', 2021, { note: 'Watch its credits scene after Avengers: Endgame', credits: 'endgame' }),
  aos('aos-3c', 'Season 3 · episodes 20–22', 2015),
  tv('defenders', 'The Defenders', '', 2017),
  aos('aos-4a', 'Season 4 · episodes 1–6', 2016),
  film('doctor-strange', 'Doctor Strange', 2016),
  film('black-panther', 'Black Panther', 2018),
  // 51
  aos('aos-4b', 'Season 4 · episodes 7–8', 2016),
  short('slingshot', 'Agents of SHIELD: Slingshot', 2016, { part: 'Episodes 1–6', tv: true }),
  aos('aos-4c', 'Season 4 · episodes 9–22', 2016),
  film('homecoming', 'Spider-Man: Homecoming', 2017),
  film('ragnarok', 'Thor: Ragnarok', 2017),
  short('team-darryl', 'Team Darryl', 2018, { note: 'One-Shot on the Thor: Ragnarok disc' }),
  tv('inhumans', 'Inhumans', '', 2017),
  tv('punisher-1', 'The Punisher', 'Season 1', 2017),
  tv('runaways-1', 'Runaways', 'Season 1', 2017),
  aos('aos-5a', 'Season 5 · episodes 1–10', 2017, { note: 'Allowing for the time travel' }),
  // 61
  tv('jessica-jones-2', 'Jessica Jones', 'Season 2', 2018),
  aos('aos-5b', 'Season 5 · episodes 11–18', 2017),
  tv('cloak-dagger-1', 'Cloak & Dagger', 'Season 1', 2018),
  tv('cloak-dagger-2', 'Cloak & Dagger', 'Season 2', 2019),
  tv('luke-cage-2', 'Luke Cage', 'Season 2', 2018),
  tv('iron-fist-2', 'Iron Fist', 'Season 2', 2018),
  tv('daredevil-3', 'Daredevil', 'Season 3', 2018),
  tv('runaways-2', 'Runaways', 'Season 2', 2018),
  tv('punisher-2', 'The Punisher', 'Season 2', 2019),
  tv('jessica-jones-3', 'Jessica Jones', 'Season 3', 2019),
  // 71
  film('ant-man-wasp', 'Ant-Man and the Wasp', 2018, { note: CREDITS_AFTER_INFINITY_WAR, credits: 'infinity-war' }),
  film('infinity-war', 'Avengers: Infinity War', 2018),
  aos('aos-5c', 'Season 5 · episodes 19–22', 2017, { note: 'Runs alongside Infinity War' }),
  aos('aos-6', 'Season 6', 2019, { note: 'During Endgame’s five-year jump' }),
  aos('aos-7', 'Season 7', 2020, { note: 'During Endgame’s five-year jump' }),
  tv('runaways-3', 'Runaways', 'Season 3', 2019, { note: 'Mostly after the Snap' }),
  film('endgame', 'Avengers: Endgame', 2019),
  series('loki-1', 'Loki', 'Season 1', 2021),
  series('loki-2', 'Loki', 'Season 2', 2023),
  series('what-if-1', 'What If…?', 'Season 1', 2021, { note: 'Other universes: fits anywhere' }),
  // 81
  series('what-if-2', 'What If…?', 'Season 2', 2023, { note: 'Other universes: fits anywhere' }),
  series('what-if-3', 'What If…?', 'Season 3', 2024, { note: 'Other universes: fits anywhere' }),
  series('marvel-zombies', 'Marvel Zombies', '', 2025, { note: 'Five years after What If…? “Zombies?!”' }),
  series('wandavision', 'WandaVision', '', 2021),
  film('deadpool-wolverine', 'Deadpool & Wolverine', 2024),
  film('shang-chi', 'Shang-Chi and the Legend of the Ten Rings', 2021),
  series('falcon-winter-soldier', 'The Falcon and the Winter Soldier', '', 2021),
  film('eternals', 'Eternals', 2021),
  film('far-from-home', 'Spider-Man: Far From Home', 2019),
  film('no-way-home', 'Spider-Man: No Way Home', 2021),
  // 91
  film('multiverse-of-madness', 'Doctor Strange in the Multiverse of Madness', 2022),
  series('hawkeye', 'Hawkeye', '', 2021),
  series('moon-knight', 'Moon Knight', '', 2022),
  film('wakanda-forever', 'Black Panther: Wakanda Forever', 2022),
  series('echo', 'Echo', '', 2024),
  series('she-hulk', 'She-Hulk: Attorney at Law', '', 2022),
  series('ms-marvel', 'Ms. Marvel', '', 2022),
  film('love-and-thunder', 'Thor: Love and Thunder', 2022),
  series('ironheart', 'Ironheart', 'Season 1', 2025),
  special('werewolf-by-night', 'Werewolf by Night', 2022),
  // 101
  special('holiday-special', 'The Guardians of the Galaxy Holiday Special', 2022),
  film('quantumania', 'Ant-Man and the Wasp: Quantumania', 2023),
  film('guardians-3', 'Guardians of the Galaxy Vol. 3', 2023),
  series('secret-invasion', 'Secret Invasion', '', 2023),
  film('the-marvels', 'The Marvels', 2023),
  series('agatha', 'Agatha All Along', '', 2024),
  series('born-again-1', 'Daredevil: Born Again', 'Season 1', 2025),
  film('brave-new-world', 'Captain America: Brave New World', 2025),
  film('thunderbolts', 'Thunderbolts*', 2025),
  film('fantastic-four', 'The Fantastic Four: First Steps', 2025, { note: 'A separate universe' }),
  // 111
  series('wonder-man', 'Wonder Man', 'Season 1', 2026),
  series('born-again-2', 'Daredevil: Born Again', 'Season 2', 2026),
  special('one-last-kill', 'The Punisher: One Last Kill', 2026),
  film('brand-new-day', 'Spider-Man: Brand New Day', 2026),
  series('visionquest', 'VisionQuest', '', 2026),
];

const INDEX = new Map(ENTRIES.map((e, i) => [e.id, i]));

// An entry's place in the whole order, from 1, as the article numbers it.
export const numberOf = id => INDEX.get(id) + 1;

// Known ids once each, in the list's order.
export function cleanWatched(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter(id => INDEX.has(id)))].sort((a, b) => INDEX.get(a) - INDEX.get(b));
}

export function shownEntries(show) {
  if (show === 'studios') return ENTRIES.filter(e => !e.tv);
  if (show === 'films') return ENTRIES.filter(e => e.kind === 'film');
  return ENTRIES;
}

export function nextUp(shown, watched) {
  const seen = new Set(watched);
  return shown.find(e => !seen.has(e.id)) ?? null;
}

// The watched films whose credits scenes belong after the entry with this id.
export const creditsAfter = (id, watched) => ENTRIES.filter(e => e.credits === id && watched.includes(e.id));

// Every shown entry up to and including id ticked; the others as they were.
export function watchedUpTo(watched, shown, id) {
  const i = shown.findIndex(e => e.id === id);
  return cleanWatched([...watched, ...shown.slice(0, i + 1).map(e => e.id)]);
}

// The shown entry with this id and every shown one after it unticked; the others as they were.
export function unwatchedFrom(watched, shown, id) {
  const i = shown.findIndex(e => e.id === id);
  if (i < 0) return cleanWatched(watched);
  const drop = new Set(shown.slice(i).map(e => e.id));
  return cleanWatched(watched.filter(w => !drop.has(w)));
}
