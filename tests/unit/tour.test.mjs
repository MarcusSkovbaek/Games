import test from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../../skaal/js/game/derive.js';
import { normalizeSettings, withSchedule } from '../../skaal/js/game/settings.js';
import { TOUR, TOUR_FACES, faceById, tourContext, cleanSongUrl, isAudioUrl } from '../../skaal/js/game/tour.js';
import { logDrink, undo, updateSettings } from '../../skaal/js/app/actions.js';
import { invalidateDerived } from '../../skaal/js/app/session.js';

const MIN = 60000;

// A minimal stand-in for Room: entries are appended in memory as the device's player.
function makeRoom({ pid = 'bbbb', settings = {}, drinks = {} } = {}) {
  const s = normalizeSettings({ breakerMin: 0, ...settings });
  const t0 = Date.now() - 3 * 60 * MIN;
  const state = {
    meta: { v: 1, name: 'Touren', hostId: 'aaaa', createdAt: t0, startedAt: t0, settings: s, sched: withSchedule([], s, t0), removed: [] },
    players: {},
    assets: {},
  };
  let seq = 0;
  const room = {
    pid,
    roomId: `room-${Math.random()}`,
    version: 0,
    state,
    isOnline: () => true,
    appendMany(partials) {
      const t = Date.now();
      const created = partials.map((p, i) => ({ ...p, id: p.id || `e${++seq}`, ts: p.ts || t + i }));
      for (const e of created) state.players[this.pid].entries.set(e.id, e);
      this.version++;
      return created;
    },
    append(partial) {
      return this.appendMany([partial])[0];
    },
    setMeta(patch) {
      state.meta = { ...state.meta, ...patch, v: state.meta.v + 1 };
      this.version++;
    },
  };
  for (const [id, n] of Object.entries(drinks)) {
    state.players[id] = { profile: { v: 1, name: id.toUpperCase(), joinedAt: t0, photo: null, left: 0 }, entries: new Map() };
    for (let i = 0; i < n; i++) {
      const e = { id: `${id}-${i}`, t: 'd', k: 'beer', ts: t0 + MIN + i * 1000 };
      state.players[id].entries.set(e.id, e);
    }
  }
  invalidateDerived();
  return room;
}

const standings = () => ({ aaaa: 10, bbbb: TOUR.stages - 1, cccc: 5, dddd: 2 });
const tourObligations = (d, key) => d.obligations.filter((ob) => ob.why?.tour === key);

test('the 21st drink brings out one face on every phone, and its effect matches the face', () => {
  const room = makeRoom({ settings: { tour: true }, drinks: standings() });
  const { moment } = logDrink(room, 'beer');
  assert.ok(moment, 'a Tour moment was created');
  const face = faceById(moment.face);
  assert.ok(face, 'with a known face');

  // Another phone (same log, different viewer) derives exactly the same moment.
  const d = derive({ ...room, pid: 'cccc' }, Date.now());
  assert.equal(d.tour.moments.length, 1);
  const m = d.tour.moments[0];
  assert.deepEqual([m.pid, m.face, m.n], ['bbbb', moment.face, TOUR.stages]);

  const obs = tourObligations(d, m.key);
  const targets = obs.map((ob) => `${ob.target}:${ob.n}`).sort();
  if (face.id === 'henning') assert.deepEqual(targets, ['aaaa:2', 'bbbb:2', 'cccc:2', 'dddd:2']);
  if (face.id === 'bobby') assert.deepEqual(targets, ['aaaa:3', 'cccc:3']);
  if (face.id === 'pimm') {
    assert.deepEqual(targets, ['aaaa:3']);
    assert.equal(d.players.get('bbbb').points, TOUR.stages + 3, 'time bonus');
  }
  const item = d.feed.find((f) => f.kind === 'tour');
  assert.ok(item && item.pid === 'bbbb' && item.effects.length > 0, 'feed item with its effects');
  assert.ok(d.feed.every((f) => f.kind !== 'effect'), 'effects are listed under the moment, not on their own');

  // It only happens once per rider.
  assert.equal(logDrink(room, 'beer').moment, null);
  assert.equal(logDrink(room, 'water').moment, null);
});

test('each face does something different, based on the standings around the rider', () => {
  const room = makeRoom({ settings: { tour: true }, drinks: { aaaa: 10, bbbb: TOUR.stages, cccc: 5, dddd: 2 } });
  const d = derive(room, Date.now());
  const ctx = tourContext(d, 'bbbb');
  assert.deepEqual(ctx.near, ['aaaa', 'cccc', 'dddd']);
  assert.equal(ctx.rival, 'aaaa', 'the leader\'s rival is the rider right behind');
  const byFace = Object.fromEntries(TOUR_FACES.map((f) => [f.id, f.effects(ctx)]));
  assert.deepEqual(byFace.henning, [{ t: 'all', n: 2 }, { t: 'self', n: 2 }]);
  assert.deepEqual(byFace.bobby, [{ t: 'pen', to: 'aaaa', n: 3, u: 'sip' }, { t: 'pen', to: 'cccc', n: 3, u: 'sip' }]);
  assert.deepEqual(byFace.pimm, [{ t: 'bon', n: 3 }, { t: 'pen', to: 'aaaa', n: 3, u: 'sip' }]);

  // Last place: the nearest riders are those in front; the rival is the one just in front.
  const last = tourContext(d, 'dddd');
  assert.deepEqual(last.near, ['cccc', 'aaaa', 'bbbb']);
  assert.equal(last.rival, 'cccc');
  // Without bonus points Pimm's breakaway is only the rival's sips.
  assert.deepEqual(faceById('pimm').effects({ ...last, bonus: false }), [{ t: 'pen', to: 'cccc', n: 3, u: 'sip' }]);
});

test('undoing the 21st drink removes the moment and its effects; the next 21st drink brings a new one', () => {
  const room = makeRoom({ settings: { tour: true }, drinks: standings() });
  const first = logDrink(room, 'shot');
  assert.ok(first.moment);
  undo(room, first.entry.id);
  invalidateDerived();
  const d = derive(room, Date.now());
  assert.equal(d.tour.moments.length, 0);
  assert.equal(tourObligations(d, `bbbb:${first.moment.id}`).length, 0);
  assert.equal(d.players.get('bbbb').points, TOUR.stages - 1, 'no time bonus left over');
  assert.equal(d.players.get('bbbb').pending, 0);
  assert.ok(d.feed.every((f) => f.kind !== 'tour' && f.kind !== 'effect'));

  const again = logDrink(room, 'beer');
  assert.ok(again.moment, 'reaching 21 again counts');
  assert.equal(derive(room, Date.now()).tour.moments.length, 1);
});

test('no moments without Tour mode; switching it on later catches riders already past 21', () => {
  const room = makeRoom({ drinks: { aaaa: 3, bbbb: TOUR.stages + 4 } });
  assert.equal(logDrink(room, 'beer').moment, null);
  updateSettings(room, { tour: true });
  invalidateDerived();
  assert.ok(logDrink(room, 'beer').moment);
});

test('the leader wears the yellow jersey (with the host\'s mask image) only in Tour mode', () => {
  const room = makeRoom({ settings: { tour: true }, drinks: { aaaa: 4, bbbb: 6, cccc: 1 } });
  let d = derive(room, Date.now());
  assert.deepEqual([...d.players.values()].filter((p) => p.jersey).map((p) => p.pid), ['bbbb']);
  assert.equal(d.tour.leader, 'bbbb');
  assert.equal(d.players.get('bbbb').mask, null, 'built-in mask by default');

  const img = 'data:image/png;base64,AAAA';
  room.state.assets['tour-mask'] = { v: 1, u: 1, data: img };
  room.state.assets['tour-face-pimm'] = { v: 1, u: 1, data: img };
  d = derive(room, Date.now());
  assert.equal(d.players.get('bbbb').mask, img);
  assert.equal(d.tour.faces.pimm, img);
  assert.equal(d.tour.faces.bobby, null);

  room.state.meta.settings = normalizeSettings({ ...room.state.meta.settings, tour: false });
  d = derive(room, Date.now());
  assert.equal([...d.players.values()].some((p) => p.jersey), false);
});

test('song links are sanitised and audio files recognised', () => {
  assert.equal(cleanSongUrl('javascript:alert(1)'), '');
  assert.equal(cleanSongUrl('data:audio/mp3;base64,AAAA'), '');
  assert.equal(cleanSongUrl(' https://open.spotify.com/track/abc '), 'https://open.spotify.com/track/abc');
  assert.equal(cleanSongUrl('audio/baghjul.mp3'), 'audio/baghjul.mp3');
  assert.equal(normalizeSettings({ tourSong: 'vbscript:x' }).tourSong, '');
  assert.equal(isAudioUrl('https://example.com/sang.mp3?dl=1'), true);
  assert.equal(isAudioUrl('https://www.youtube.com/watch?v=abc'), false);
});
