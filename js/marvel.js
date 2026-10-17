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

// tv: a Marvel Television show.
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
  film('captain-marvel', 'Captain Marvel', 2019, { note: 'Its mid-credits scene is set after Avengers: Infinity War' }),
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
  film('black-widow', 'Black Widow', 2021, { note: 'Watch its credits scene after Avengers: Endgame' }),
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
  film('ant-man-wasp', 'Ant-Man and the Wasp', 2018, { note: CREDITS_AFTER_INFINITY_WAR }),
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

// ---- Disney+ ----
// Each title's page id (disneyplus.com/browse/entity-<id>), the same in every country; a series has
// one page for all its seasons and parts. From JustWatch's listings, 17 Oct 2026 (US, and the UK
// for The Avengers, WandaVision and Cloak & Dagger). Not on Disney+: Slingshot (an ABC web
// series), Runaways (Hulu) and Spider-Man: Brand New Day (Sony, in cinemas).

const DISNEY_FILMS = {   // films, shorts and specials
  'Captain America: The First Avenger': '8e68c43a-117c-4f4d-b217-0db106a1a614',
  'Agent Carter': '5e7f5aa1-b3ea-4cd3-983f-c5cda970fb0a',
  'Captain Marvel': '1e383a14-1ea6-4345-9ab8-fd37618669af',
  'Iron Man': '0c520152-b81f-4c20-9310-003debd1947e',
  'Iron Man 2': '85c5529d-c053-4fa4-9957-4906eb5aedc6',
  'The Incredible Hulk': '30d00f7b-331a-4f43-b9e1-1989d39cb1a3',
  'The Consultant': 'cad91b86-ab50-4fce-882f-ae71c86c2938',
  'A Funny Thing Happened on the Way to Thor’s Hammer': 'b45838e2-aa7a-4985-923d-9fe949e40ece',
  'Thor': '479d41e3-8438-4ba4-b93d-8223220e069c',
  'The Avengers': 'd2ab699b-67da-4906-a7a4-5bc542c953cf',
  'Item 47': '2cd46937-17fe-4ada-8de4-0972f2763f1c',
  'Thor: The Dark World': '7c4f4e28-4152-4f64-90ec-8b7f682c33d4',
  'Iron Man 3': 'e8569c2d-85ec-42a4-8811-b2618d494a40',
  'All Hail the King': '14988369-345c-4984-9c16-59428bd70609',
  'Captain America: The Winter Soldier': 'ef333a5c-b855-4d3e-a7d9-d9e142b6dc7d',
  'Guardians of the Galaxy': 'c9ee959b-7249-4a4c-9708-9ffd1ddb00f1',
  'Guardians of the Galaxy Vol. 2': '9fcd7087-c151-49dc-aeb9-b2f9943fd4e6',
  'Avengers: Age of Ultron': '42329b99-0953-4f1a-9420-a0dbf7733e95',
  'Ant-Man': 'af42798c-b9db-457f-b748-5e1f029c1ece',
  'Captain America: Civil War': '2bd19267-1387-4b51-98e6-5189ff28e9c9',
  'Team Thor': 'abc1bb00-77b3-40e0-b1e6-dad2739f2236',
  'Team Thor: Part 2': '6d346cdb-d46c-43af-b6c2-eb47c56b1426',
  'Black Widow': 'd9cd6bd1-bcf8-4a3b-8f92-0fdd4f79ac08',
  'Doctor Strange': '43a741e8-2369-4577-9bec-ef94f4aaae0b',
  'Black Panther': '8904b1b5-da2c-4ff1-b389-dc81825559fd',
  'Spider-Man: Homecoming': 'd285316b-e1ea-4b50-933a-bb5fd13549c1',
  'Thor: Ragnarok': '766280de-0c00-4781-a388-2c85c5b4e259',
  'Team Darryl': '4750ff79-de75-4660-9bee-e610ed6bcb56',
  'Ant-Man and the Wasp': '3533ca7b-e187-4bf5-a65c-7c903cd2d4ad',
  'Avengers: Infinity War': '9a136e06-852a-41bf-b71d-fa061cb43225',
  'Avengers: Endgame': 'b39aa962-be56-4b09-a536-98617031717f',
  'Deadpool & Wolverine': '120ae1e6-2240-4924-a4ce-f8de6e28b0b1',
  'Shang-Chi and the Legend of the Ten Rings': '92243dd0-bcfe-4365-ae76-1fa3cf1a2ab9',
  'Eternals': 'b042efa2-6650-48fd-bf35-ea285a5a5649',
  'Spider-Man: Far From Home': '6e497c43-d4da-4e12-b100-d4d38dc2a7ff',
  'Spider-Man: No Way Home': '295fb45a-c8bb-477e-816f-b0706b4d9984',
  'Doctor Strange in the Multiverse of Madness': '6fe6062c-2499-4f44-a48a-fc93f59cb504',
  'Black Panther: Wakanda Forever': '86e14fdb-3841-4282-ad38-07c8c4aab4b6',
  'Thor: Love and Thunder': '0007d7a0-2515-411e-9294-2de6a7b8d00e',
  'Werewolf by Night': 'ad2fd4e8-062b-45b9-b2c5-8b8779873e48',
  'The Guardians of the Galaxy Holiday Special': '1a15fe60-3236-4242-a699-a4e3392cf112',
  'Ant-Man and the Wasp: Quantumania': 'eb1453f3-48aa-4af0-85f5-8ca4916c7415',
  'Guardians of the Galaxy Vol. 3': '820f0ded-3254-42c5-a7e4-7c044ff6dd65',
  'The Marvels': '75c90eca-8969-4edb-ac1a-7165cff2671c',
  'Captain America: Brave New World': '3064ac7f-ef4d-4f89-b92f-b5524da92a72',
  'Thunderbolts*': 'f51dce23-7d8f-490a-9f0c-be1b5432c2a9',
  'The Fantastic Four: First Steps': '2142a7a9-4c49-438d-a492-296c4e08b714',
  'The Punisher: One Last Kill': 'c5b69f75-f159-4749-873d-9a1d1a4eb878',
};

const DISNEY_SERIES = {
  'Eyes of Wakanda': '8d16eb3d-b7e5-4c43-abda-a281be4d284a',
  'Agent Carter': 'e4cbebda-a890-4e99-9a29-40d2162f7d46',
  'Agents of SHIELD': '63516dff-91f8-4deb-b110-d22552f329cb',
  'I Am Groot': '38f451b9-22df-4784-b580-4e4db4b92dba',
  'Daredevil': 'b03f0bdc-ebd5-44df-a16a-1a180a88873a',
  'Jessica Jones': '6e31f304-024a-41a2-97a5-5a7ced0345a8',
  'Luke Cage': '0e8ba0c3-47da-44d4-bab5-1c6f5d6e61a0',
  'Iron Fist': 'd251acf8-4a1a-48d1-b3b7-d9513afeaac0',
  'The Defenders': '61687bed-4a66-4657-9252-df80ca1d1fbc',
  'Inhumans': 'f93e8212-c6c0-4a2f-a147-ad220f3481c8',
  'The Punisher': 'bbe154ae-af21-49dd-8129-90077e61c991',
  'Cloak & Dagger': 'b83bebc2-abcc-41fb-9e33-ec81d1bfcfba',
  'Loki': '8f8c5cbb-e5ba-4285-9e2c-86abcac9fd50',
  'What If…?': 'fc588cfe-ff2b-4a44-abbd-d76359ce778f',
  'Marvel Zombies': 'd274138a-7c29-4ddf-9ea2-2f9d3c1a24a0',
  'WandaVision': '90affd1f-0851-48bc-9cab-c142d5c9c20c',
  'The Falcon and the Winter Soldier': '3c08a31a-2350-4aaf-90d0-88def4c551bf',
  'Hawkeye': '128482e8-a9bc-4289-9c0d-83a975d823f3',
  'Moon Knight': '330062c7-20c5-45e1-b6c5-e1e096055d75',
  'Echo': '3c9aa47d-88c2-455b-a63b-4be76b666a55',
  'She-Hulk: Attorney at Law': 'b1c3c897-b925-4236-88e4-1ceed3623a46',
  'Ms. Marvel': '7bf8d7e6-9739-4fee-86c0-f4afc48b152c',
  'Ironheart': 'b2b50b9a-a055-4b31-a609-8ec46f3add98',
  'Secret Invasion': '4cfe6313-7f5e-4544-af84-d31bf718f65a',
  'Agatha All Along': '5e474669-a4a2-4b90-a928-5ae7f845090c',
  'Daredevil: Born Again': '85e7a914-c8e6-41db-95df-c740dc2cf1b7',
  'Wonder Man': '25ee768f-06e3-491c-ad8f-876b4c87ac42',
  'VisionQuest': '8744ec55-8d14-4631-99b4-c889a2d6013f',
};

// The entry's page on Disney+, or null when Disney+ doesn't have it.
export function disneyUrl(e) {
  const id = (e.kind === 'series' ? DISNEY_SERIES : DISNEY_FILMS)[e.title];
  return id ? `https://www.disneyplus.com/browse/entity-${id}` : null;
}
