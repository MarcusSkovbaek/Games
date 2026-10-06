import test from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../../skaal/js/game/derive.js';
import { normalizeSettings, withSchedule } from '../../skaal/js/game/settings.js';
import { photoPrefix } from '../../skaal/js/game/photos.js';
import { defaultSettings } from '../../skaal/js/game/settings.js';

const MIN = 60000;
const T0 = Date.UTC(2026, 9, 10, 20, 0, 0);
const IMG = 'data:image/jpeg;base64,/9j/AAAA';

// A party (no event type) with a host and three guests.
function makeParty({ pid = 'anna0000' } = {}) {
  const settings = normalizeSettings({ breakerMin: 0 });
  const state = {
    meta: { v: 1, name: 'Fredagsbar', hostId: 'host0000', createdAt: T0, startedAt: T0, settings, sched: withSchedule([], settings, T0), removed: [] },
    players: {},
    assets: {},
  };
  for (const id of ['host0000', 'anna0000', 'bo000000', 'cara0000']) {
    state.players[id] = { profile: { v: 1, name: id.replace(/0+$/, ''), joinedAt: T0 - MIN, photo: null, left: 0 }, entries: new Map() };
  }
  let seq = 0;
  let clock = T0;
  return {
    pid,
    roomId: 'party-room',
    state,
    isOnline: () => true,
    add(owner, e) {
      const entry = { id: `e${++seq}`, ts: (clock += 1000), ...e };
      state.players[owner].entries.set(entry.id, entry);
      return entry;
    },
    // A photo the way the app shares it: thumbnail asset + log entry.
    photo(owner, cap = '', extra = {}) {
      const name = `${photoPrefix(owner)}${String(++seq).padStart(6, 'x')}`;
      state.assets[name] = { v: 1, u: clock, data: IMG };
      return { name, entry: this.add(owner, { t: 'photo', a: name, cap, w: 1600, h: 1200, f: 1, ...extra }) };
    },
  };
}

const at = (room, pid = room.pid, t = T0 + 120 * MIN) => derive({ ...room, pid }, t);

test('party photos: everyone sees them, newest first, and they show up in the feed', () => {
  const room = makeParty();
  room.add('anna0000', { t: 'd', k: 'beer' });
  const one = room.photo('anna0000', '  Skål fra baren!  ');
  const two = room.photo('bo000000');
  const d = at(room, 'cara0000');
  assert.deepEqual(
    d.photos.map((ph) => [ph.pid, ph.cap, ph.full, ph.w, ph.h, ph.thumb === IMG]),
    [
      ['bo000000', '', true, 1600, 1200, true],
      ['anna0000', 'Skål fra baren!', true, 1600, 1200, true],
    ],
  );
  assert.equal(d.photoByKey.get(`anna0000:${one.entry.id}`).asset, one.name);
  const feed = d.feed.filter((f) => f.kind === 'photo' || f.kind === 'drink').map((f) => f.kind);
  assert.deepEqual(feed, ['photo', 'photo', 'drink'], 'photos sit in the feed with the drinks');
  assert.equal(d.feed.find((f) => f.kind === 'photo').photo.key, `bo000000:${two.entry.id}`);
});

test('nobody can pass off someone else’s picture, and broken entries are ignored', () => {
  const room = makeParty();
  const real = room.photo('anna0000', 'mit billede');
  room.add('bo000000', { t: 'photo', a: real.name, cap: 'også mit' }); // claims Anna's thumbnail
  room.add('bo000000', { t: 'photo', cap: 'intet billede' });
  room.add('bo000000', { t: 'photo', a: 42 });
  const d = at(room);
  assert.deepEqual(d.photos.map((ph) => ph.cap), ['mit billede']);
});

test('deleting your own photo removes it everywhere; only the host can hide other people’s', () => {
  const room = makeParty();
  const anna = room.photo('anna0000', 'Anna');
  const bo = room.photo('bo000000', 'Bo');
  const cara = room.photo('cara0000', 'Cara');
  // Anna deletes hers: the entry is voided and the thumbnail emptied.
  room.add('anna0000', { t: 'x', r: anna.entry.id });
  room.state.assets[anna.name] = { v: 2, u: 2, data: null };
  // Bo tries to hide Cara's (not allowed); the host hides Bo's.
  room.add('bo000000', { t: 'phide', k: `cara0000:${cara.entry.id}` });
  room.add('host0000', { t: 'phide', k: `bo000000:${bo.entry.id}` });
  const d = at(room);
  assert.deepEqual(d.photos.map((ph) => ph.cap), ['Cara']);
  assert.equal(d.feed.filter((f) => f.kind === 'photo').length, 1);
  assert.equal(at(room, 'host0000').canHidePhotos, true);
  assert.equal(at(room, 'bo000000').canHidePhotos, false);
  // A photo whose thumbnail has not arrived yet still shows (as loading).
  room.add('bo000000', { t: 'photo', a: `${photoPrefix('bo000000')}zzzzzz`, cap: 'på vej' });
  assert.equal(at(room).photos[0].thumb, null);
});

test('photos keep coming after the host ends the event; drinks do not', () => {
  const room = makeParty();
  room.state.meta.ended = T0 + 10 * MIN;
  room.add('anna0000', { t: 'd', k: 'beer' }).ts = T0 + 20 * MIN;
  const late = room.photo('anna0000', 'Efterfest');
  late.entry.ts = T0 + 30 * MIN;
  const d = at(room);
  assert.deepEqual(d.photos.map((ph) => ph.cap), ['Efterfest']);
  assert.equal(d.mePlayer.alcoholic, 0);
});

test('photos are on by default; the host can turn them off', () => {
  assert.equal(defaultSettings().photos, true);
  assert.equal(normalizeSettings({}).photos, true);
  assert.equal(normalizeSettings({ photos: false }).photos, false);
  assert.equal(normalizeSettings({ photos: 'nej' }).photos, true, 'junk keeps the default');
});
