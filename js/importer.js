// Converts a Speed Dial 2 JSON export into our groups, tiles and prefs.
// Pure: no DOM or Chrome access.

import { DEFAULT_PREFS, deepMerge } from './store.js';
import { uid, clamp, hostOf } from './util.js';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : undefined);
const bool = v => (typeof v === 'boolean' ? v : v === 0 || v === 1 ? v === 1 : undefined);
const oneOf = (v, list) => (list.includes(v) ? v : undefined);
const toNum = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// Speed Dial 2 gives newly added dials position 999, so position-then-id
// puts them after the arranged ones, in the order they were created.
const byPosition = (a, b) => toNum(a.position, 999) - toNum(b.position, 999) || toNum(a.id, 0) - toNum(b.id, 0);

export function fromSpeedDial2(json, makeId = uid) {
  if (!isObj(json) || !Array.isArray(json.dials)) {
    throw new Error('This file is not a Speed Dial 2 export (it has no "dials" list).');
  }

  const sdGroups = (Array.isArray(json.groups) ? json.groups : [])
    .filter(g => isObj(g) && g.id != null)
    .sort(byPosition);
  const groups = sdGroups.map(g => ({ id: makeId(), title: String(g.title ?? '').trim() || 'Group' }));
  if (!groups.length) groups.push({ id: makeId(), title: 'Home' });
  const idMap = new Map(sdGroups.map((g, i) => [g.id, groups[i].id]));

  const dials = json.dials
    .filter(d => isObj(d) && typeof d.url === 'string' && d.url.trim())
    .sort(byPosition);
  const toTile = (d, groupId) => {
    const url = d.url.trim();
    return {
      id: makeId(),
      groupId,
      title: (typeof d.title === 'string' ? d.title.trim() : '') || hostOf(url),
      url,
      icon: typeof d.thumbnail === 'string' ? d.thumbnail : '',
    };
  };

  const tiles = [];
  for (const [sdId, id] of idMap) {
    tiles.push(...dials.filter(d => d.idgroup === sdId).map(d => toTile(d, id)));
  }
  // Dials pointing at a group that no longer exists land at the end of the first group.
  tiles.push(...dials.filter(d => !idMap.has(d.idgroup)).map(d => toTile(d, groups[0].id)));

  return { groups, tiles, prefs: mapPrefs(json.preferences), activeGroupId: groups[0].id };
}

function mapPrefs(raw) {
  const p = isObj(raw) ? raw : {};
  const w = isObj(p.widgets) ? p.widgets : {};
  const clock = isObj(w.clock) ? w.clock : {};
  const cycle = String(clock.hourCycle ?? '');

  return deepMerge(DEFAULT_PREFS, {
    columns: num(p.columns, 2, 10),
    spacing: num(p.spacing, 0, 40),
    width: num(p.maxWidth, 480, 1600),
    centerVertically: bool(p.centeredLayout),
    showAddButton: bool(p.showAddButton),
    openInNewTab: bool(p.openInNewTab),
    theme: oneOf(isObj(p.theme) ? p.theme.theme : undefined, ['dark', 'light', 'auto']),
    tiles: { showTitle: bool(isObj(p.bookmarks) ? p.bookmarks.showTitle : undefined) },
    widgets: {
      enabled: bool(w.enabled),
      position: oneOf(w.position, ['left', 'right']),
      clock: {
        enabled: bool(clock.enabled),
        hour24: cycle === '24' ? true : cycle === '12' ? false : undefined,
        name: typeof clock.name === 'string' ? clock.name : undefined,
        greeting: bool(clock.showGreeting),
      },
      tasks: { enabled: bool(isObj(w.tasks) ? w.tasks.enabled : undefined) },
      notes: { enabled: bool(isObj(w.notes) ? w.notes.enabled : undefined) },
    },
  });
}
