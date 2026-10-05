// Everything a player can do. Each action appends entries to the player's own log (or, for the
// host, updates the event meta); the sync layer distributes them.
import { getDerived, invalidateDerived } from './session.js';
import { detectTrigger } from '../game/triggers.js';
import { withSchedule, normalizeSettings, alcoholicDrinkIds } from '../game/settings.js';
import { eligibleAt } from '../game/schedule.js';
import { gameById } from '../minigames/index.js';
import { effectToEntries } from '../game/wheels.js';
import { TOUR_FACES, reachesFinish, tourContext } from '../game/tour.js';
import { drinkById } from '../game/drinks.js';
import { randomId, randomFloat } from '../core/ids.js';
import { now } from '../core/clock.js';

export function logDrink(room, drinkId) {
  const before = getDerived(room);
  const entry = room.append({ t: 'd', k: drinkId });
  invalidateDerived();
  const after = getDerived(room);
  const trigger = detectTrigger({ before, after, me: room.pid, drinkId });
  let offer = null;
  if (trigger) {
    offer = room.append({ t: 'o', w: trigger.w, why: trigger.why, ...(trigger.n ? { n: trigger.n } : {}), src: entry.id });
    invalidateDerived();
  }
  let moment = null;
  if (reachesFinish({ after, me: room.pid, alcoholic: !!drinkById(drinkId)?.alcoholic })) {
    moment = startTourMoment(room, after, entry.id);
  }
  return { entry, offer, trigger, moment };
}

// Tour de France: the rider reached the finish — a random face decides what happens. The moment
// and its effects go in one batch so every phone gets them together.
function startTourMoment(room, d, drinkEntryId) {
  const face = TOUR_FACES[Math.floor(randomFloat() * TOUR_FACES.length)];
  const id = randomId(10);
  const effects = face.effects(tourContext(d, room.pid)).map((e) => ({ ...e, src: id }));
  const [moment] = room.appendMany([{ t: 'tour', id, face: face.id, n: d.mePlayer.alcoholic, src: drinkEntryId }, ...effects]);
  invalidateDerived();
  return moment;
}

// Host: share an image with everyone (Tour faces and leader mask), or null for the default.
export function setSharedImage(room, name, dataUrl) {
  room.setAsset(name, dataUrl || null);
}

export function undo(room, entryId) {
  room.append({ t: 'x', r: entryId });
}

export function respond(room, gid, v) {
  room.append({ t: 'resp', gid, v });
}

export function acknowledge(room, key, how = 'ok') {
  room.append({ t: 'ack', r: key, how });
}

export function toggleReaction(room, d, key, emoji) {
  const mine = d.reactions.get(key)?.get(emoji)?.get(room.pid);
  if (mine) room.append({ t: 'x', r: mine });
  else room.append({ t: 'react', r: key, e: emoji });
}

export function setPaused(room, on) {
  room.append({ t: 'pause', on: !!on });
}

export function startGame(room, d, gameId) {
  const game = gameById(gameId);
  if (!game) return null;
  const roster = [...d.players.values()].map((p) => ({ pid: p.pid, joinedAt: p.joinedAt, left: p.left, pauses: p.pauses }));
  const players = eligibleAt(roster, now()).sort();
  const history = d.games.filter((g) => g.g === gameId).map((g) => g.p);
  const p = game.setup({ rng: randomFloat, players, history, settings: d.settings, drinks: alcoholicDrinkIds(d.settings) });
  return room.append({ t: 'game', gid: randomId(8), g: gameId, p });
}

export function applySpin(room, d, offer, outcome, input) {
  const spin = room.append({ t: 'spin', w: offer.w, oc: outcome.id, src: offer.id });
  const others = [...d.players.values()].filter((p) => p.pid !== room.pid && !p.left && !p.paused).map((p) => p.pid);
  const leader = d.ranking[0]?.pid || null;
  const entries = effectToEntries(outcome, input, { others, leader, me: room.pid, random: randomFloat }, spin.id);
  if (entries.length) room.appendMany(entries);
  return { spin, entries };
}

// ------------------------------------------------------------------------------- host

export function updateSettings(room, patch) {
  const meta = room.state.meta;
  const settings = normalizeSettings({ ...meta.settings, ...patch });
  room.setMeta({ settings, sched: withSchedule(meta.sched, settings, now()) });
}

export function renameEvent(room, name) {
  room.setMeta({ name: String(name).trim().slice(0, 48) });
}

export function endEvent(room) {
  room.setMeta({ ended: now() });
}

export function reopenEvent(room) {
  const meta = room.state.meta;
  const settings = normalizeSettings(meta.settings);
  // No automatic breakers for the period the event was closed; resume from now.
  const closed = { at: meta.ended || now(), every: 0, games: [], drinks: [] };
  room.setMeta({ ended: 0, sched: withSchedule([...(meta.sched || []), closed], settings, now()) });
}

export function removePlayer(room, pid) {
  const removed = new Set(room.state.meta.removed || []);
  removed.add(pid);
  room.setMeta({ removed: [...removed] });
}

export function leaveEvent(room) {
  room.setProfile({ left: now() });
}
