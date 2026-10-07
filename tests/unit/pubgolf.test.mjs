import test from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../../skaal/js/game/derive.js';
import { normalizeSettings, withSchedule } from '../../skaal/js/game/settings.js';
import { defaultPg, normalizePg, fmtToPar, scoreName, PG } from '../../skaal/js/game/pubgolf.js';
import { photoPrefix } from '../../skaal/js/game/photos.js';

const MIN = 60000;
const T0 = Date.UTC(2026, 9, 10, 18, 0, 0);

// An event with the given players; `meta` patches the pub golf meta.
function makeRoom({ pid = 'anna0000', players = ['host0000', 'judy0000', 'anna0000', 'bo000000', 'cara0000'], meta = {} } = {}) {
  const settings = normalizeSettings({ breakerMin: 0 });
  const state = {
    meta: { v: 1, name: 'Pub golf', type: 'pubgolf', hostId: 'host0000', judges: [{ p: 'judy0000', ts: T0 }], createdAt: T0, startedAt: T0, settings, sched: withSchedule([], settings, T0), removed: [], pg: defaultPg(), ...meta },
    players: {},
    assets: {},
  };
  for (const id of players) state.players[id] = { profile: { v: 1, name: id.replace(/0+$/, ''), joinedAt: T0 - MIN, photo: null, left: 0 }, entries: new Map() };
  let seq = 0;
  let clock = T0;
  return {
    pid,
    roomId: 'pg-room',
    state,
    isOnline: () => true,
    add(owner, e) {
      const entry = { id: `e${++seq}`, ts: (clock += 1000), ...e };
      state.players[owner].entries.set(entry.id, entry);
      return entry;
    },
  };
}

const pgOf = (room, t = T0 + 600 * MIN) => derive(room, t).pg;

test('a new pub golf event: nine holes, two teams and a photo competition', () => {
  const pg = defaultPg();
  assert.equal(pg.course.length, PG.defaultHoles);
  assert.deepEqual(pg.course.map((h) => h.par), [3, 1, 3, 2, 4, 2, 3, 1, 2]);
  assert.equal(pg.teams.length, 2);
  assert.ok(pg.comps.some((c) => c.kind === 'photo'));
  const n = normalizePg({ course: Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, par: 99, bar: 'B'.repeat(80) })), comps: [{ id: 'a', name: 'A' }], compBonus: [9, -2] });
  assert.equal(n.course.length, PG.maxHoles, 'at most 18 holes');
  assert.equal(n.course[0].par, PG.maxPar);
  assert.equal(n.course[0].bar.length, 40);
  assert.equal(n.comps[0].kind, 'photo', 'the photo competition cannot be removed');
  assert.deepEqual(n.compBonus, [5, 0, 1]);
  assert.equal(normalizePg({ course: [] }).course.length, 9, 'an empty course falls back to the default');
});

test('strokes: players score themselves, the judge has the last word, nobody else counts', () => {
  const room = makeRoom();
  const [h1, h2] = room.state.meta.pg.course;
  room.add('anna0000', { t: 'pg', p: 'anna0000', h: h1.id, s: 3 });
  room.add('bo000000', { t: 'pg', p: 'bo000000', h: h1.id, s: 2 });
  room.add('judy0000', { t: 'pg', p: 'cara0000', h: h1.id, s: 4 });
  room.add('cara0000', { t: 'pg', p: 'cara0000', h: h1.id, s: 1 }); // after the judge: ignored
  room.add('anna0000', { t: 'pg', p: 'bo000000', h: h2.id, s: 1 }); // not hers to set
  room.add('bo000000', { t: 'pg', p: 'bo000000', h: h2.id, s: 2 });
  room.add('anna0000', { t: 'pg', p: 'anna0000', h: h1.id, s: 4 }); // corrects herself
  const pg = pgOf(room);
  const strokes = (pid, h) => pg.players.get(pid).holes[h.id]?.s;
  assert.equal(strokes('anna0000', h1), 4);
  assert.equal(strokes('bo000000', h1), 2);
  assert.equal(strokes('cara0000', h1), 4, "the judge's score stands");
  assert.equal(pg.players.get('cara0000').holes[h1.id].official, true);
  assert.equal(strokes('bo000000', h2), 2);
  assert.equal(pg.players.get('bo000000').toPar, 2 + 2 - (h1.par + h2.par));

  // The judge clears a score; with self-scoring off only the judge's scores count.
  room.add('judy0000', { t: 'pg', p: 'bo000000', h: h2.id, s: 0 });
  assert.equal(pgOf(room).players.get('bo000000').holes[h2.id], undefined, 'cleared by the judge');
  room.state.meta.pg = { ...room.state.meta.pg, selfScore: false };
  const strict = pgOf(room);
  assert.equal(strict.players.get('anna0000').holes[h1.id], undefined);
  assert.equal(strict.players.get('cara0000').holes[h1.id].s, 4);
});

test('teams, penalties, bonuses and competition podiums add up for players and teams', () => {
  const room = makeRoom();
  const [h1, h2] = room.state.meta.pg.course; // par 3 and par 1
  room.add('anna0000', { t: 'team', p: 'anna0000', team: 't1' });
  room.add('judy0000', { t: 'team', p: 'bo000000', team: 't1' });
  room.add('cara0000', { t: 'team', p: 'cara0000', team: 't2' });
  room.add('judy0000', { t: 'team', p: 'judy0000', team: 't2' }); // the judge plays too
  room.add('anna0000', { t: 'team', p: 'cara0000', team: 't1' }); // not hers to move: ignored
  for (const [pid, s1, s2] of [['anna0000', 3, 1], ['bo000000', 4, 2], ['cara0000', 2, 1], ['judy0000', 3, 3]]) {
    room.add(pid, { t: 'pg', p: pid, h: h1.id, s: s1 });
    room.add(pid, { t: 'pg', p: pid, h: h2.id, s: s2 });
  }
  room.add('judy0000', { t: 'pgpen', p: 'anna0000', n: 2, why: 'Spildt' });
  room.add('judy0000', { t: 'pgbon', team: 't2', n: 1, why: 'Vandt udfordringen' });
  room.add('anna0000', { t: 'pgpen', p: 'bo000000', n: 5, why: 'Snyd' }); // only officials
  room.add('judy0000', { t: 'podium', c: 'outfit', places: ['t2', 't1'] });
  const pg = pgOf(room);
  const toPar = (pid) => pg.players.get(pid).toPar;
  assert.equal(toPar('anna0000'), 0 + 2, 'par golf plus a penalty');
  assert.equal(toPar('bo000000'), 2);
  assert.equal(toPar('cara0000'), -1);
  assert.equal(toPar('judy0000'), 2);
  assert.equal(pg.players.get('cara0000').team, 't2');
  const team = (id) => pg.teams.find((tm) => tm.id === id);
  // t1: anna +2, bo +2 → +4, 2nd place outfit −2 → +2. t2: cara −1, judy +2 → +1, bonus −1, 1st −3 → −3.
  assert.equal(team('t1').score, 2);
  assert.equal(team('t2').score, -3);
  assert.deepEqual(pg.teams.map((tm) => tm.id), ['t2', 't1'], 'lowest score leads');
  assert.equal(pg.individuals[0].pid, 'cara0000');
  assert.deepEqual(pg.results.get('outfit').places.map((pl) => pl?.team || null), ['t2', 't1', null]);

  // Averages instead of sums for uneven teams.
  room.state.meta.pg = { ...room.state.meta.pg, teamScore: 'avg' };
  const avg = pgOf(room);
  assert.equal(avg.teams.find((tm) => tm.id === 't1').score, (2 + 2) / 2 - 2);
});

test('a tie goes to whoever has played more holes, for players and teams', () => {
  const room = makeRoom();
  const [h1, h2, h3] = room.state.meta.pg.course; // par 3, 1 and 3
  room.add('anna0000', { t: 'team', p: 'anna0000', team: 't1' });
  room.add('bo000000', { t: 'team', p: 'bo000000', team: 't2' });
  for (const [pid, strokes] of [['anna0000', [4, 1, 3]], ['bo000000', [4]], ['cara0000', [3, 2]]]) {
    strokes.forEach((s, i) => room.add(pid, { t: 'pg', p: pid, h: [h1, h2, h3][i].id, s }));
  }
  const pg = pgOf(room);
  // All +1 — Bo has the fewest strokes only because he is two holes behind.
  assert.deepEqual(pg.individuals.filter((x) => x.played).map((x) => [x.pid, x.toPar, x.played]), [['anna0000', 1, 3], ['cara0000', 1, 2], ['bo000000', 1, 1]]);
  assert.deepEqual(pg.teams.map((tm) => [tm.id, tm.score]), [['t1', 1], ['t2', 1]]);
});

test('locking the teams keeps earlier choices but ignores later self-moves', () => {
  const room = makeRoom();
  room.add('anna0000', { t: 'team', p: 'anna0000', team: 't1' });
  room.state.meta.pg = { ...room.state.meta.pg, lockTeams: T0 + 10 * MIN };
  const late = room.add('anna0000', { t: 'team', p: 'anna0000', team: 't2' });
  late.ts = T0 + 20 * MIN;
  assert.equal(pgOf(room).players.get('anna0000').team, 't1');
  room.add('host0000', { t: 'team', p: 'anna0000', team: 't2' }).ts = T0 + 30 * MIN;
  assert.equal(pgOf(room).players.get('anna0000').team, 't2', 'the host can still move people');
});

test('only officials move the round on; holes, aces and the feed', () => {
  const room = makeRoom();
  const [h1, h2, h3] = room.state.meta.pg.course;
  room.add('anna0000', { t: 'hole', h: h3.id });
  assert.equal(pgOf(room).current.id, h1.id);
  room.add('judy0000', { t: 'hole', h: h2.id });
  room.add('anna0000', { t: 'pg', p: 'anna0000', h: h1.id, s: 1 }); // hole in one on a par 3
  const pg = pgOf(room);
  assert.equal(pg.current.id, h2.id);
  assert.equal(pg.current.n, 2);
  assert.equal(pg.players.get('anna0000').aces, 1);
  assert.ok(pg.feed.some((f) => f.kind === 'pghole' && f.h === h2.id));
  assert.ok(pg.feed.some((f) => f.kind === 'pgace' && f.pid === 'anna0000'));
  assert.equal(scoreName(1, 3), 'Hole in one!');
  assert.equal(scoreName(2, 3), 'Birdie');
  assert.equal(scoreName(5, 3), 'Dobbelt bogey');
  assert.deepEqual([fmtToPar(3), fmtToPar(-2), fmtToPar(0), fmtToPar(1.5)], ['+3', '−2', '±0', '+1,5']);
});

test('one judge at a time: a former judge only counts for the time they were judge', () => {
  const room = makeRoom();
  const [h1, h2] = room.state.meta.pg.course;
  room.add('judy0000', { t: 'pg', p: 'cara0000', h: h1.id, s: 4 });
  const chal = room.add('judy0000', { t: 'chal', c: 0 });
  let pg = pgOf(room);
  assert.equal(pg.judge, 'judy0000');
  // The host hands the whistle to Anna.
  const handover = room.add('host0000', { t: 'noop' }).ts;
  room.state.meta.judges = [...room.state.meta.judges, { p: 'anna0000', ts: handover }];
  room.add('judy0000', { t: 'pg', p: 'bo000000', h: h1.id, s: 9 }); // no longer hers to set
  room.add('judy0000', { t: 'pgpen', p: 'bo000000', n: 3, why: 'Hævn' });
  room.add('judy0000', { t: 'hole', h: h2.id });
  room.add('bo000000', { t: 'pg', p: 'bo000000', h: h1.id, s: 2 });
  room.add('anna0000', { t: 'pgbon', team: 't1', n: 1, why: 'Vandt udfordringen', src: `judy0000:${chal.id}` });
  pg = derive({ ...room, pid: 'judy0000' }, T0 + 600 * MIN).pg;
  assert.equal(pg.judge, 'anna0000');
  assert.equal(pg.isJudge, false);
  assert.equal(pg.isOfficial, false, 'the former judge is a player again');
  assert.equal(pg.players.get('cara0000').holes[h1.id].s, 4, 'scores from her time as judge stand');
  assert.equal(pg.players.get('cara0000').holes[h1.id].official, true);
  assert.equal(pg.players.get('bo000000').holes[h1.id].s, 2);
  assert.equal(pg.players.get('bo000000').pen, 0);
  assert.equal(pg.current.id, h1.id);
  assert.equal(pg.challenges[0].winners.length, 1, 'the new judge can crown the winner of an earlier challenge');
  assert.equal(pg.teams.find((tm) => tm.id === 't1').bon, 1);
  const anna = derive({ ...room, pid: 'anna0000' }, T0 + 600 * MIN).pg;
  assert.equal(anna.isJudge, true);
  assert.equal(anna.isOfficial, true);
  assert.equal(derive({ ...room, pid: 'host0000' }, T0 + 600 * MIN).pg.isOfficial, true, 'the host always is');
});

test('photos: the judge hides and sets the photo podium, which rewards the team', () => {
  const room = makeRoom();
  const img = 'data:image/jpeg;base64,AAAA';
  room.add('anna0000', { t: 'team', p: 'anna0000', team: 't1' });
  room.add('bo000000', { t: 'team', p: 'bo000000', team: 't2' });
  const a = `${photoPrefix('anna0000')}aaaaaa`;
  const b = `${photoPrefix('bo000000')}bbbbbb`;
  room.state.assets[a] = { v: 1, u: 1, data: img };
  room.state.assets[b] = { v: 1, u: 1, data: img };
  const pa = room.add('anna0000', { t: 'photo', a, cap: 'Skål!', f: 1 });
  const pb = room.add('bo000000', { t: 'photo', a: b, cap: 'Hold 2' }); // the first version: no full size
  let d = derive(room, T0 + 600 * MIN);
  assert.deepEqual(d.photos.map((ph) => [ph.cap, ph.full]), [['Hold 2', false], ['Skål!', true]]);
  room.add('judy0000', { t: 'podium', c: 'photo', photos: [`anna0000:${pa.id}`, `bo000000:${pb.id}`] });
  d = derive(room, T0 + 600 * MIN);
  assert.deepEqual(d.pg.results.get('photo').places.map((pl) => pl && pl.team), ['t1', 't2', null]);
  assert.equal(d.pg.teams.find((tm) => tm.id === 't1').bon, 3);
  room.add('cara0000', { t: 'phide', k: `anna0000:${pa.id}` }); // a player can't hide photos
  room.add('judy0000', { t: 'pghide', k: `bo000000:${pb.id}` }); // as written by the first version
  d = derive(room, T0 + 600 * MIN);
  assert.deepEqual(d.photos.map((ph) => ph.cap), ['Skål!']);
  assert.deepEqual(d.pg.results.get('photo').places.map((pl) => pl && pl.team), ['t1', null, null], 'a hidden photo leaves the podium');
  assert.equal(d.canHidePhotos, false, 'Anna is neither host nor judge');
  assert.equal(derive({ ...room, pid: 'judy0000' }, T0 + 600 * MIN).canHidePhotos, true);
});

test('the photo competition: an entry each, uploaded — seen at once, also with the disposable camera', () => {
  const room = makeRoom({ meta: { settings: normalizeSettings({ breakerMin: 0, disposable: true }) } });
  const name = (pid, n) => `${photoPrefix(pid)}${n}`;
  room.add('anna0000', { t: 'team', p: 'anna0000', team: 't1' });
  room.add('bo000000', { t: 'team', p: 'bo000000', team: 't2' });
  room.add('anna0000', { t: 'photo', a: name('anna0000', 'shot01'), f: 1, th: 1, ds: 1 }); // the disposable camera
  const first = room.add('anna0000', { t: 'photo', a: name('anna0000', 'entry1'), cap: 'Første', f: 1, th: 1, c: 'photo' });
  // A new entry takes the place of the first (which the app deletes) — and is never disposable.
  const again = room.add('anna0000', { t: 'photo', a: name('anna0000', 'entry2'), cap: 'Bedre', f: 1, th: 1, c: 'photo', ds: 1 });
  room.add('anna0000', { t: 'x', r: first.id });
  const bo = room.add('bo000000', { t: 'photo', a: name('bo000000', 'entry1'), cap: 'Hold 2', f: 1, th: 1, c: 'photo' });
  room.add('bo000000', { t: 'photo', a: name('bo000000', 'other1'), cap: 'Bare et billede', f: 1, th: 1 });
  room.add('cara0000', { t: 'photo', a: name('cara0000', 'entry1'), f: 1, th: 1, c: 'nope' }); // no such competition
  let d = derive(room, T0 + 10 * MIN);
  assert.deepEqual(d.pg.entries.get('photo').map((ph) => ph.cap), ['Hold 2', 'Bedre'], 'one each, newest first');
  assert.deepEqual(d.photos.map((ph) => ph.cap).sort(), ['', 'Bare et billede', 'Bedre', 'Hold 2'], 'entries are seen at once');
  assert.equal(d.undeveloped.length, 1, 'the shot from the disposable camera still develops');
  assert.equal(d.shotsUsed, 1, 'entries take no film');
  const items = d.feed.filter((f) => f.kind === 'photo' || f.kind === 'photos').filter((f) => f.pid === 'bo000000');
  assert.equal(items.length, 2, 'an entry is an item of its own in the feed');
  room.add('judy0000', { t: 'podium', c: 'photo', photos: [`anna0000:${again.id}`, `bo000000:${bo.id}`] });
  d = derive(room, T0 + 10 * MIN);
  assert.deepEqual(d.pg.results.get('photo').places.map((pl) => pl && pl.team), ['t1', 't2', null]);
  // Anna takes hers back: gone from the entries and the podium.
  room.add('anna0000', { t: 'x', r: again.id });
  d = derive(room, T0 + 10 * MIN);
  assert.deepEqual(d.pg.entries.get('photo').map((ph) => ph.cap), ['Hold 2']);
  assert.deepEqual(d.pg.results.get('photo').places.map((pl) => pl && pl.team), [null, 't2', null]);
});

test('secret competitions: players see one only once the judge starts it (or decides it)', () => {
  const room = makeRoom();
  const ids = room.state.meta.pg.comps.map((c) => c.id);
  const shown = (pid) => derive({ ...room, pid }, T0 + 600 * MIN).pg.comps.map((c) => c.id);
  assert.deepEqual(shown('anna0000'), ids, 'on show by default');
  assert.equal(pgOf(room).compsOnShow, true);

  // A player can't make them secret; the judge can.
  room.add('anna0000', { t: 'pgvis', show: false });
  assert.deepEqual(shown('anna0000'), ids);
  room.add('judy0000', { t: 'pgvis', show: false });
  assert.deepEqual(shown('anna0000'), [], 'secret: nothing to see yet');
  assert.deepEqual(shown('judy0000'), ids, 'the judge sees them all');
  assert.deepEqual(shown('host0000'), ids, 'and so does the host');
  assert.deepEqual(pgOf(room).secretComps.map((c) => c.id), ids);

  // The judge starts one: it shows (and is in the feed); a player's "start" doesn't count.
  room.add('bo000000', { t: 'pgcomp', c: 'outfit' });
  assert.deepEqual(shown('anna0000'), []);
  const start = room.add('judy0000', { t: 'pgcomp', c: 'song' });
  room.add('judy0000', { t: 'pgcomp', c: 'song' }); // started once — the first start counts
  room.add('judy0000', { t: 'pgcomp', c: 'nope' });
  let pg = pgOf(room);
  assert.deepEqual(shown('anna0000'), ['song']);
  assert.deepEqual([...pg.started.values()].map((s) => [s.comp, s.by, s.ts]), [['song', 'judy0000', start.ts]]);
  assert.deepEqual(pg.feed.filter((f) => f.kind === 'pgcomp').map((f) => f.comp), ['song']);

  // A podium shows a competition too (even one never started).
  room.add('judy0000', { t: 'podium', c: 'spirit', places: ['t1'] });
  assert.deepEqual(shown('anna0000'), ['song', 'spirit']);
  assert.deepEqual(pgOf(room).secretComps.map((c) => c.id), ['photo', 'outfit']);

  // On show again: everything is visible; starting still works (as an announcement).
  room.add('judy0000', { t: 'pgvis', show: true });
  assert.deepEqual(shown('anna0000'), ids);
  room.add('judy0000', { t: 'pgcomp', c: 'photo' });
  pg = pgOf(room);
  assert.equal(pg.compsOnShow, true);
  assert.deepEqual([...pg.started.keys()], ['song', 'photo']);
  assert.deepEqual(pg.secretComps, []);
});
