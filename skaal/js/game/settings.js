// Event settings (stored in the event meta and editable by the host).
import { DRINKS, drinkById, POINT_STEPS } from './drinks.js';
import { GAMES } from '../minigames/index.js';
import { cleanSongUrl } from './tour.js';

export const BREAKER_OPTIONS = [0, 10, 15, 20, 30, 45, 60];

export function defaultSettings() {
  return {
    drinks: Object.fromEntries(DRINKS.map((d) => [d.id, { on: d.defaultOn, pts: d.points }])),
    breakerMin: 15,
    games: Object.fromEntries(GAMES.map((g) => [g.id, g.auto !== false])),
    triggers: true,
    bonus: true,
    anyoneCanStart: true,
    // Tour de France mode (see game/tour.js): yellow jersey for the leader, a face at 21 drinks.
    tour: false,
    // Link to the song played at a Tour moment, and whether every phone plays it (otherwise the
    // rider's phone and big screens do).
    tourSong: '',
    tourSongAll: false,
    // Guests can take photos in the app (see game/photos.js).
    photos: true,
  };
}

const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const def = defaultSettings();
  const drinks = {};
  for (const d of DRINKS) {
    const v = s.drinks?.[d.id];
    const pts = Number(v?.pts);
    drinks[d.id] = {
      on: bool(v?.on, def.drinks[d.id].on),
      pts: POINT_STEPS.includes(pts) ? pts : def.drinks[d.id].pts,
    };
  }
  const games = {};
  for (const g of GAMES) games[g.id] = bool(s.games?.[g.id], def.games[g.id]);
  return {
    drinks,
    games,
    breakerMin: BREAKER_OPTIONS.includes(Number(s.breakerMin)) ? Number(s.breakerMin) : def.breakerMin,
    triggers: bool(s.triggers, def.triggers),
    bonus: bool(s.bonus, def.bonus),
    anyoneCanStart: bool(s.anyoneCanStart, def.anyoneCanStart),
    tour: bool(s.tour, def.tour),
    tourSong: cleanSongUrl(s.tourSong),
    tourSongAll: bool(s.tourSongAll, def.tourSongAll),
    photos: bool(s.photos, def.photos),
  };
}

export function enabledDrinks(settings) {
  return DRINKS.filter((d) => settings.drinks[d.id]?.on);
}

export function enabledGameIds(settings) {
  return GAMES.filter((g) => g.auto !== false && settings.games[g.id]).map((g) => g.id);
}

export function alcoholicDrinkIds(settings) {
  return DRINKS.filter((d) => d.alcoholic && settings.drinks[d.id]?.on).map((d) => d.id);
}

export function pointsFor(settings, drinkId) {
  return settings.drinks[drinkId]?.pts ?? drinkById(drinkId)?.points ?? 0;
}

// Automatic breakers follow "schedule segments". A new segment starts whenever the host changes
// the interval or the game selection, so already-played breakers never change retroactively.
export function scheduleSegment(at, settings) {
  return { at, every: settings.breakerMin, games: enabledGameIds(settings), drinks: alcoholicDrinkIds(settings) };
}

export function withSchedule(sched, settings, at) {
  const list = Array.isArray(sched) ? sched.slice() : [];
  const seg = scheduleSegment(at, settings);
  const last = list[list.length - 1];
  const same = last && last.every === seg.every && String(last.games) === String(seg.games) && String(last.drinks) === String(seg.drinks);
  if (!same) list.push(seg);
  return list.slice(-60);
}
