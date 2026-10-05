import test from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../../skaal/js/game/derive.js';
import { detectTrigger } from '../../skaal/js/game/triggers.js';
import { allocateSips } from '../../skaal/js/game/wheels.js';
import { withSchedule, normalizeSettings } from '../../skaal/js/game/settings.js';
import { GAMES } from '../../skaal/js/minigames/index.js';
import { GAMEPLAY } from '../../skaal/js/config.js';

const MIN = 60000;
const T0 = Date.UTC(2026, 9, 3, 19, 0, 0);

function makeRoom({ pid = 'aaaa', settings = {}, players = ['aaaa', 'bbbb', 'cccc'], order } = {}) {
  const s = normalizeSettings(settings);
  const state = {
    meta: { v: 1, name: 'Test', hostId: 'aaaa', createdAt: T0, startedAt: T0, settings: s, sched: withSchedule([], s, T0), removed: [] },
    players: {},
  };
  for (const id of order || players) {
    state.players[id] = { profile: { v: 1, name: id.toUpperCase(), joinedAt: T0 - MIN, photo: null, left: 0 }, entries: new Map() };
  }
  let seq = 0;
  return {
    pid,
    roomId: 'room123',
    state,
    isOnline: () => true,
    add(owner, ts, e) {
      const entry = { id: `e${++seq}`, ts, ...e };
      state.players[owner].entries.set(entry.id, entry);
      return entry;
    },
  };
}

test('scoring, undo and ranking with first-to-reach tie break', () => {
  const room = makeRoom({ settings: { breakerMin: 0 } });
  room.add('aaaa', T0 + 1 * MIN, { t: 'd', k: 'beer' });
  const shot = room.add('aaaa', T0 + 2 * MIN, { t: 'd', k: 'shot' });
  room.add('bbbb', T0 + 3 * MIN, { t: 'd', k: 'drink' }); // 2 pts
  room.add('cccc', T0 + 4 * MIN, { t: 'd', k: 'jager' }); // 2 pts
  room.add('aaaa', T0 + 5 * MIN, { t: 'x', r: shot.id }); // undo the shot
  room.add('aaaa', T0 + 6 * MIN, { t: 'd', k: 'water' }); // 0 pts
  const d = derive(room, T0 + 10 * MIN);
  assert.deepEqual(
    d.ranking.map((p) => [p.pid, p.points]),
    [
      ['bbbb', 2],
      ['cccc', 2],
      ['aaaa', 1],
    ],
  );
  assert.equal(d.players.get('aaaa').counts.shot, undefined);
  assert.equal(d.players.get('aaaa').water, 1);
  assert.equal(d.players.get('bbbb').titles.includes('leader'), true);
  assert.ok(d.feed.some((f) => f.kind === 'lead' && f.pid === 'bbbb'));
});

test('lead / comeback / milestone triggers', () => {
  const room = makeRoom({ settings: { breakerMin: 0 } });
  room.add('bbbb', T0 + MIN, { t: 'd', k: 'beer' });
  room.add('aaaa', T0 + 2 * MIN, { t: 'd', k: 'beer' });
  const before = derive(room, T0 + 3 * MIN);
  room.add('aaaa', T0 + 3 * MIN, { t: 'd', k: 'beer' });
  const after = derive(room, T0 + 3 * MIN);
  assert.deepEqual(detectTrigger({ before, after, me: 'aaaa', drinkId: 'beer' }), { w: 'king', why: 'lead' });
  // Water never triggers.
  assert.equal(detectTrigger({ before, after, me: 'aaaa', drinkId: 'water' }), null);

  // Comeback for someone far behind.
  const r2 = makeRoom({ pid: 'cccc', settings: { breakerMin: 0 } });
  for (let i = 0; i < 6; i++) r2.add('aaaa', T0 + i * MIN, { t: 'd', k: 'beer' });
  for (let i = 0; i < 4; i++) r2.add('bbbb', T0 + i * MIN, { t: 'd', k: 'beer' });
  const b2 = derive(r2, T0 + 10 * MIN);
  r2.add('cccc', T0 + 10 * MIN, { t: 'd', k: 'beer' });
  const a2 = derive(r2, T0 + 10 * MIN);
  assert.deepEqual(detectTrigger({ before: b2, after: a2, me: 'cccc', drinkId: 'beer' }), { w: 'comeback', why: 'comeback' });

  // Milestone on the 5th drink.
  const r3 = makeRoom({ pid: 'bbbb', settings: { breakerMin: 0 }, players: ['aaaa', 'bbbb'] });
  for (let i = 0; i < 10; i++) r3.add('aaaa', T0 + i * MIN, { t: 'd', k: 'beer' });
  for (let i = 0; i < 4; i++) r3.add('bbbb', T0 + i * MIN, { t: 'd', k: 'beer' });
  const b3 = derive(r3, T0 + 20 * MIN);
  r3.add('bbbb', T0 + 20 * MIN, { t: 'd', k: 'beer' });
  const a3 = derive(r3, T0 + 20 * MIN);
  assert.deepEqual(detectTrigger({ before: b3, after: a3, me: 'bbbb', drinkId: 'beer' }), { w: 'lucky', why: 'milestone', n: 5 });
});

test('automatic breakers are deterministic regardless of player order', () => {
  const r1 = makeRoom({ settings: { breakerMin: 10 }, players: ['aaaa', 'bbbb', 'cccc', 'dddd'] });
  const r2 = makeRoom({ settings: { breakerMin: 10 }, order: ['dddd', 'cccc', 'bbbb', 'aaaa'] });
  const t = T0 + 125 * MIN;
  const g1 = derive(r1, t).games.map((g) => [g.gid, g.g, g.start, JSON.stringify(g.p)]);
  const g2 = derive(r2, t).games.map((g) => [g.gid, g.g, g.start, JSON.stringify(g.p)]);
  assert.deepEqual(g1, g2);
  assert.equal(g1.length, 13); // 12 past + the next upcoming one
  for (let i = 1; i < g1.length; i++) assert.notEqual(g1[i][1], g1[i - 1][1], 'no game twice in a row');
  const used = new Set(g1.map((g) => g[1]));
  assert.ok(used.size >= 5, `variety: ${[...used]}`);
});

test('changing the interval does not rewrite past breakers', () => {
  const room = makeRoom({ settings: { breakerMin: 10 } });
  const before = derive(room, T0 + 35 * MIN).games.filter((g) => g.start <= T0 + 35 * MIN).map((g) => [g.gid, g.g]);
  const s = normalizeSettings({ ...room.state.meta.settings, breakerMin: 30 });
  room.state.meta.settings = s;
  room.state.meta.sched = withSchedule(room.state.meta.sched, s, T0 + 35 * MIN);
  const d = derive(room, T0 + 36 * MIN);
  const after = d.games.filter((g) => g.start <= T0 + 35 * MIN).map((g) => [g.gid, g.g]);
  assert.deepEqual(after, before);
  assert.equal(d.nextAuto.start, T0 + 65 * MIN);
});

test('minigame votes become penalties in the inbox; ack and shields resolve them', () => {
  const room = makeRoom({ pid: 'bbbb', settings: { breakerMin: 0 }, players: ['aaaa', 'bbbb', 'cccc'] });
  const start = T0 + 10 * MIN;
  room.add('aaaa', start, { t: 'game', gid: 'g1', g: 'mostLikely', p: { q: 3 } });
  const inPlay = start + GAMEPLAY.introMs + 1000;
  room.add('aaaa', inPlay, { t: 'resp', gid: 'g1', v: 'bbbb' });
  room.add('cccc', inPlay, { t: 'resp', gid: 'g1', v: 'bbbb' });
  room.add('bbbb', inPlay, { t: 'resp', gid: 'g1', v: 'aaaa' });
  room.add('bbbb', inPlay + 500, { t: 'resp', gid: 'g1', v: 'cccc' }); // changed vote ('last' counts)
  const during = derive(room, inPlay + 2000);
  assert.equal(during.activeGame?.gid, 'g1');
  assert.equal(during.activeGame.phase, 'play');
  assert.equal(during.activeGame.result, undefined);
  const end = during.activeGame.playEnd + 2000;
  const d = derive(room, end);
  const inst = d.games.find((g) => g.gid === 'g1');
  assert.deepEqual(inst.result.penalties, [{ pid: 'bbbb', n: 3, unit: 'sip' }]);
  assert.equal(d.inbox.length, 1);
  assert.equal(d.inbox[0].key, 'g:g1');

  // Sips handed out by a wheel, and a shield.
  room.add('aaaa', end + 1000, { t: 'spin', id: 'spin1', w: 'king', oc: 'give4', src: 'o1' });
  room.add('aaaa', end + 1001, { t: 'give', to: { bbbb: 3, cccc: 1 }, src: 'spin1' });
  room.add('bbbb', end + 2000, { t: 'shd', src: 'x' });
  let d2 = derive(room, end + 3000);
  assert.equal(d2.inbox.length, 2);
  assert.equal(d2.players.get('bbbb').shields, 1);
  assert.equal(d2.players.get('aaaa').sipsGiven, 4);
  const spinItem = d2.feed.find((f) => f.kind === 'spin');
  assert.equal(spinItem.effects.length, 1);

  room.add('bbbb', end + 4000, { t: 'ack', r: 'g:g1', how: 'ok' });
  room.add('bbbb', end + 5000, { t: 'ack', r: d2.inbox[1].key, how: 'shield' });
  d2 = derive(room, end + 6000);
  assert.equal(d2.inbox.length, 0);
  assert.equal(d2.players.get('bbbb').shields, 0);
  assert.equal(d2.players.get('bbbb').sipsTaken, 3);
});

test('happy hour doubles points inside its window only', () => {
  const room = makeRoom({ settings: { breakerMin: 0 } });
  const start = T0 + 5 * MIN;
  room.add('aaaa', start, { t: 'game', gid: 'hh', g: 'happyHour', p: { k: 'shot', mult: 2, mins: 10 } });
  const playStart = start + GAMEPLAY.introMs;
  room.add('bbbb', playStart - 1000, { t: 'd', k: 'shot' }); // before: 1
  room.add('bbbb', playStart + 60000, { t: 'd', k: 'shot' }); // inside: 2
  room.add('bbbb', playStart + 60000, { t: 'd', k: 'beer' }); // other drink: 1
  room.add('bbbb', playStart + 11 * MIN, { t: 'd', k: 'shot' }); // after: 1
  const d = derive(room, playStart + 12 * MIN);
  assert.equal(d.players.get('bbbb').points, 5);
});

test('every minigame sets up and resolves without throwing', () => {
  const rng = () => 0.42;
  const settings = normalizeSettings({});
  for (const g of GAMES) {
    const p = g.setup({ rng, players: ['aaaa', 'bbbb', 'cccc'], history: [], settings, drinks: ['beer', 'shot'] });
    assert.ok(p && typeof p === 'object', g.id);
    const inst = { gid: 'x', g: g.id, p, eligible: ['aaaa', 'bbbb', 'cccc'] };
    const responders = g.responders ? g.responders(inst) : inst.eligible;
    const responses = new Map(responders.map((pid) => [pid, { v: g.id === 'quiz' ? { a: 0, ms: 900 } : g.id === 'reaction' ? 250 : g.id === 'duel' ? 'r' : g.id === 'truthDare' ? 'done' : 'bbbb', ts: 1 }]));
    const result = g.resolve({ p, responses, eligible: inst.eligible, settings });
    assert.ok(Array.isArray(result.penalties) && Array.isArray(result.bonus), g.id);
    assert.ok(typeof g.Play === 'function' && typeof g.Result === 'function', g.id);
  }
});

test('handing out sips by tapping players: taps count, the rest is shared evenly', () => {
  const alloc = (total, picks) => Object.fromEntries(allocateSips(total, new Map(picks)));
  assert.deepEqual(alloc(4, []), {});
  assert.deepEqual(alloc(4, [['anna', 1]]), { anna: 4 }, 'one pick takes them all');
  assert.deepEqual(alloc(4, [['anna', 1], ['bo', 1]]), { anna: 2, bo: 2 });
  assert.deepEqual(alloc(4, [['anna', 2], ['bo', 1]]), { anna: 3, bo: 1 }, 'a second tap gives that player more');
  assert.deepEqual(alloc(5, [['anna', 1], ['bo', 1]]), { anna: 3, bo: 2 }, 'odd sip goes to the first picked');
  assert.deepEqual(alloc(3, [['anna', 1], ['bo', 1], ['cara', 1]]), { anna: 1, bo: 1, cara: 1 });
  for (const picks of [[['a', 1]], [['a', 2], ['b', 1]], [['a', 1], ['b', 1], ['c', 1], ['d', 1]]]) {
    const sum = Object.values(alloc(5, picks)).reduce((x, y) => x + y, 0);
    assert.equal(sum, 5, 'always adds up to the total');
  }
});

test('a fællesskål (everyone drinks) is a toast for every phone, with who has drunk', () => {
  const room = makeRoom({ settings: { breakerMin: 0 } });
  const spin = room.add('aaaa', T0 + MIN, { t: 'spin', w: 'king', oc: 'all1', src: 'o1' });
  const all = room.add('aaaa', T0 + MIN + 1, { t: 'all', n: 1, src: spin.id });
  room.add('bbbb', T0 + 2 * MIN, { t: 'ack', r: `aaaa:${all.id}`, how: 'ok' });
  // Tour moments show their own pop-up; their "everyone drinks" is not a separate toast.
  const tour = room.add('cccc', T0 + 3 * MIN, { t: 'tour', face: 'henning', n: 21 });
  room.add('cccc', T0 + 3 * MIN + 1, { t: 'all', n: 2, src: tour.id });
  const d = derive({ ...room, pid: 'cccc' }, T0 + 4 * MIN);
  assert.equal(d.toasts.length, 1);
  const [toast] = d.toasts;
  assert.deepEqual([toast.pid, toast.n, toast.why?.wheel], ['aaaa', 1, 'king']);
  assert.deepEqual(toast.targets.sort(), ['bbbb', 'cccc']);
  const obs = d.obligations.filter((ob) => ob.key === toast.key);
  assert.deepEqual(obs.map((ob) => [ob.target, ob.acked]).sort(), [['bbbb', true], ['cccc', false]]);
  assert.equal(d.inbox.filter((ob) => ob.key === toast.key).length, 1, 'still owed by this phone');
});
