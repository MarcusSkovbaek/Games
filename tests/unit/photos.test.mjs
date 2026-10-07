import test from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../../skaal/js/game/derive.js';
import { normalizeSettings, withSchedule } from '../../skaal/js/game/settings.js';
import { photoPrefix, DISPOSABLE } from '../../skaal/js/game/photos.js';
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

test('photos with their own thumbnail topic: no shared image needed; deleted or hidden ones are named as gone', () => {
  const room = makeParty();
  const lazy = (owner, cap) => {
    const name = `${photoPrefix(owner)}${cap.toLowerCase().padEnd(6, 'x').slice(0, 6)}`;
    return { name, entry: room.add(owner, { t: 'photo', a: name, cap, w: 400, h: 300, f: 1, th: 1 }) };
  };
  const a = lazy('anna0000', 'Anna');
  const b = lazy('bo000000', 'Bo');
  const c = lazy('cara0000', 'Cara');
  let d = at(room);
  assert.deepEqual(d.photos.map((ph) => [ph.cap, ph.lazy, ph.thumb]), [['Cara', true, null], ['Bo', true, null], ['Anna', true, null]]);
  assert.deepEqual([...d.photosGone], []);
  room.add('anna0000', { t: 'x', r: a.entry.id });
  room.add('host0000', { t: 'phide', k: `bo000000:${b.entry.id}` });
  d = at(room);
  assert.deepEqual(d.photos.map((ph) => ph.cap), ['Cara']);
  assert.deepEqual([...d.photosGone].sort(), [a.name, b.name].sort());
  assert.equal(c.name, d.photos[0].asset);
});

test('comments: oldest first under each photo; your own can be deleted, the host can hide any', () => {
  const room = makeParty();
  const photo = room.photo('anna0000', 'Skål');
  const key = `anna0000:${photo.entry.id}`;
  const one = room.add('bo000000', { t: 'pc', k: key, txt: '  Haha, se Cara!  ' });
  room.add('cara0000', { t: 'pc', k: key, txt: 'Slet det 😂' });
  room.add('anna0000', { t: 'pc', k: key, txt: 'x'.repeat(500) });
  room.add('bo000000', { t: 'pc', k: key, txt: '   ' }); // empty
  room.add('bo000000', { t: 'pc', k: 'anna0000:nope', txt: 'intet billede' });
  room.add('bo000000', { t: 'pc', txt: 'ingen nøgle' });
  let d = at(room, 'cara0000');
  assert.deepEqual(
    d.comments.get(key).map((c) => [c.pid, c.txt.length > 20 ? c.txt.length : c.txt]),
    [
      ['bo000000', 'Haha, se Cara!'],
      ['cara0000', 'Slet det 😂'],
      ['anna0000', 200],
    ],
  );
  assert.equal(d.comments.size, 1);
  assert.equal(d.comments.get(key)[0].key, `bo000000:${one.id}`);

  // Bo deletes his own; Cara can't hide Anna's, the host can.
  room.add('bo000000', { t: 'x', r: one.id });
  const annas = d.comments.get(key)[2].key;
  room.add('cara0000', { t: 'phide', k: annas });
  d = at(room);
  assert.deepEqual(d.comments.get(key).map((c) => c.pid), ['cara0000', 'anna0000']);
  room.add('host0000', { t: 'phide', k: annas });
  d = at(room);
  assert.deepEqual(d.comments.get(key).map((c) => c.pid), ['cara0000']);

  // Comments keep coming after the end — and go with the photo when it is deleted.
  room.state.meta.ended = T0 + 10 * MIN;
  room.add('bo000000', { t: 'pc', k: key, txt: 'Dagen derpå' }).ts = T0 + 60 * MIN;
  assert.deepEqual(at(room).comments.get(key).map((c) => c.txt), ['Slet det 😂', 'Dagen derpå']);
  room.add('anna0000', { t: 'x', r: photo.entry.id });
  assert.equal(at(room).comments.size, 0);
});

test('photos shared in a row by the same person are one item in the feed', () => {
  const room = makeParty();
  const a1 = room.photo('anna0000', 'Natten over byen');
  room.photo('anna0000');
  room.photo('anna0000');
  room.photo('bo000000', 'Bo'); // someone else's photo ends the set
  room.photo('anna0000', 'Igen');
  room.add('anna0000', { t: 'd', k: 'beer' }).ts += 10 * MIN;
  const late = room.photo('anna0000', 'Senere'); // more than 3 minutes after: an item of its own
  late.entry.ts += 10 * MIN;
  const items = at(room, 'cara0000').feed.filter((f) => f.kind === 'photo' || f.kind === 'photos');
  assert.deepEqual(
    items.map((f) => [f.kind, f.pid, f.kind === 'photos' ? f.photos.map((ph) => ph.cap) : f.photo.cap]),
    [
      ['photo', 'anna0000', 'Senere'],
      ['photo', 'anna0000', 'Igen'],
      ['photo', 'bo000000', 'Bo'],
      ['photos', 'anna0000', ['Natten over byen', '', '']],
    ],
  );
  const set = items[3];
  assert.equal(set.key, `set:anna0000:${a1.entry.id}`, 'named after its first photo, so it keeps its place');
  assert.equal(set.ts, set.photos[2].ts, 'in the feed at the time of its newest photo');
});

const HOUR = 60 * MIN;

test('the disposable camera is off by default; the host can turn it on', () => {
  assert.equal(defaultSettings().disposable, false);
  assert.equal(normalizeSettings({ disposable: true }).disposable, true);
  assert.equal(normalizeSettings({ disposable: 'ja' }).disposable, false, 'junk keeps the default');
  assert.deepEqual(DISPOSABLE, { shots: 23, developMs: 24 * HOUR });
});

test('disposable camera: nobody sees a photo — not even the one who took it — until it develops 24 hours later', () => {
  const room = makeParty();
  const shot = room.photo('anna0000', '', { th: 1, ds: 1 });
  const normal = room.photo('bo000000', 'Med det samme');
  const taken = shot.entry.ts;
  for (const pid of ['anna0000', 'bo000000', 'host0000']) {
    const d = at(room, pid, taken + DISPOSABLE.developMs - 1);
    assert.deepEqual(d.photos.map((ph) => ph.cap), ['Med det samme'], `${pid} sees only the normal photo`);
    assert.equal(d.photoByKey.has(`anna0000:${shot.entry.id}`), false);
    assert.deepEqual(d.undeveloped.map((ph) => [ph.pid, ph.shown]), [['anna0000', taken + DISPOSABLE.developMs]]);
    assert.equal(d.feed.some((f) => f.kind === 'photo' && f.photo.ds), false, 'not in the feed either');
  }
  // Comments and likes can't reach it before then (nobody can see it to comment on).
  room.add('bo000000', { t: 'pc', k: `anna0000:${shot.entry.id}`, txt: 'Hvad er det?' });
  assert.equal(at(room, 'bo000000', taken + HOUR).comments.size, 0);

  const d = at(room, 'cara0000', taken + DISPOSABLE.developMs);
  assert.deepEqual(d.photos.map((ph) => [ph.pid, ph.ds]), [['bo000000', false], ['anna0000', true]], 'in the gallery from when it was taken');
  assert.equal(d.undeveloped.length, 0);
  const item = d.feed.find((f) => f.kind === 'photo' && f.photo.ds);
  assert.equal(item.ts, taken + DISPOSABLE.developMs, 'in the feed from when it developed');
  assert.equal(d.feed[0], item, 'so it is the newest news');
  assert.equal(d.photoByKey.get(`anna0000:${shot.entry.id}`).ts, taken, 'still taken when it was taken');
  assert.equal(normal.entry.ts > taken, true);
});

test('disposable camera: 23 shots each — the 24th is never shown, and deleted shots still used a frame', () => {
  const room = makeParty();
  const shots = [];
  for (let i = 0; i < 25; i++) shots.push(room.photo('anna0000', '', { th: 1, ds: 1 }));
  for (let i = 0; i < 3; i++) room.photo('anna0000', 'normal'); // only the disposable camera counts
  room.photo('bo000000', '', { th: 1, ds: 1 });
  const later = shots[24].entry.ts + DISPOSABLE.developMs;
  let d = at(room, 'anna0000', later);
  assert.equal(d.shotsUsed, 23);
  assert.equal(d.photos.filter((ph) => ph.pid === 'anna0000' && ph.ds).length, 23);
  assert.deepEqual([...d.photosGone].sort(), [shots[23].name, shots[24].name].sort(), 'the phone that took them lets go of them');
  assert.equal(at(room, 'bo000000', later).shotsUsed, 1);
  // Deleting a developed shot doesn't give the frame back.
  room.add('anna0000', { t: 'x', r: shots[0].entry.id });
  d = at(room, 'anna0000', later);
  assert.equal(d.shotsUsed, 23);
  assert.equal(d.photos.filter((ph) => ph.pid === 'anna0000' && ph.ds).length, 22);
  assert.equal(d.photoByKey.has(`anna0000:${shots[23].entry.id}`), false, 'the 24th stays out');
});

test('disposable camera: photos that develop together are one item, apart from photos shared normally', () => {
  const room = makeParty();
  room.photo('anna0000', '', { th: 1, ds: 1 });
  room.photo('anna0000', '', { th: 1, ds: 1 });
  const last = room.photo('anna0000', '', { th: 1, ds: 1 });
  const d = at(room, 'bo000000', last.entry.ts + DISPOSABLE.developMs);
  // Anna shares a photo right after hers have developed.
  const now = room.photo('anna0000', 'Nu');
  now.entry.ts = last.entry.ts + DISPOSABLE.developMs + 1000;
  const items = at(room, 'bo000000', now.entry.ts).feed.filter((f) => f.kind === 'photo' || f.kind === 'photos');
  assert.deepEqual(
    items.map((f) => [f.kind, f.kind === 'photos' ? f.photos.length : f.photo.cap]),
    [
      ['photo', 'Nu'],
      ['photos', 3],
    ],
  );
  assert.equal(d.feed.filter((f) => f.kind === 'photos').length, 1);
});

test('pub golf: the photo competition can still be decided after the end — other competitions cannot', () => {
  const room = makeParty();
  const meta = room.state.meta;
  meta.type = 'pubgolf';
  meta.pg = { course: [{ id: 'h1', bar: 'Baren', par: 3 }], teams: [], comps: [{ id: 'photo', name: 'Fotokonkurrence', emoji: '📸', kind: 'photo' }, { id: 'bp', name: 'Bordtennis', emoji: '🏓', kind: 'team' }] };
  meta.judges = [];
  const shot = room.photo('anna0000', '', { th: 1, ds: 1 });
  meta.ended = shot.entry.ts + HOUR;
  const after = shot.entry.ts + DISPOSABLE.developMs + MIN;
  const photoPodium = room.add('host0000', { t: 'podium', c: 'photo', photos: [`anna0000:${shot.entry.id}`] });
  photoPodium.ts = after;
  const teamPodium = room.add('host0000', { t: 'podium', c: 'bp', places: ['bo000000'] });
  teamPodium.ts = after;
  const d = at(room, 'cara0000', after + MIN);
  assert.equal(d.pg.results.get('photo')?.places[0]?.pid, 'anna0000');
  assert.equal(d.pg.results.has('bp'), false);
});

test('captions can be written afterwards — only by the one who took the photo; the latest counts', () => {
  const room = makeParty();
  const shot = room.photo('anna0000', 'Først');
  const key = `anna0000:${shot.entry.id}`;
  room.add('anna0000', { t: 'pcap', k: key, cap: '  Fra i går  ' });
  room.add('bo000000', { t: 'pcap', k: key, cap: 'Bos tekst' }); // not his photo
  assert.equal(at(room, 'cara0000').photoByKey.get(key).cap, 'Fra i går');
  room.add('anna0000', { t: 'pcap', k: key, cap: '' });
  assert.equal(at(room, 'cara0000').photoByKey.get(key).cap, '', 'an empty caption takes it off');
});
