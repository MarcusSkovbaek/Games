import test from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../../skaal/js/game/derive.js';
import { normalizeSettings, withSchedule } from '../../skaal/js/game/settings.js';
import { photoPrefix } from '../../skaal/js/game/photos.js';
import { defaultPg } from '../../skaal/js/game/pubgolf.js';
import { hostsOf, handOver } from '../../skaal/js/game/hosts.js';

const MIN = 60000;
const T0 = Date.UTC(2026, 9, 10, 20, 0, 0);

function makeRoom({ settings: s = {}, meta = {} } = {}) {
  const settings = normalizeSettings({ breakerMin: 0, ...s });
  const state = {
    meta: { v: 1, name: 'Fest', hostId: 'host0000', createdAt: T0, startedAt: T0, settings, sched: withSchedule([], settings, T0), removed: [], ...meta },
    players: {},
    assets: {},
  };
  for (const id of ['host0000', 'anna0000', 'bo000000']) state.players[id] = { profile: { v: 1, name: id.replace(/0+$/, ''), joinedAt: T0 - MIN, photo: null, left: 0 }, entries: new Map() };
  let seq = 0;
  return {
    pid: 'bo000000',
    roomId: 'host-room',
    state,
    isOnline: () => true,
    add(owner, ts, e) {
      const entry = { id: `e${++seq}`, ts, ...e };
      state.players[owner].entries.set(entry.id, entry);
      return entry;
    },
    handOver(pid, at) {
      Object.assign(state.meta, handOver(state.meta, pid, at));
    },
  };
}

test('hosts: never handed over, the host is the one it always was; after a handover each counts for their own time', () => {
  const meta = { hostId: 'host0000' };
  assert.equal(hostsOf(meta).hostAt('host0000', T0), true);
  assert.equal(hostsOf(meta).hostAt('anna0000', T0), false);
  Object.assign(meta, handOver(meta, 'anna0000', T0 + 60 * MIN));
  const { hostId, hostAt } = hostsOf(meta);
  assert.equal(hostId, 'anna0000');
  assert.equal(hostAt('host0000', T0 + 30 * MIN), true, 'the first host, before the handover');
  assert.equal(hostAt('host0000', T0 + 61 * MIN), false, 'not after');
  assert.equal(hostAt('anna0000', T0 + 61 * MIN), true);
  assert.equal(hostAt('anna0000', T0 + 30 * MIN), false, 'the new host, not long before');
  Object.assign(meta, handOver(meta, 'host0000', T0 + 120 * MIN));
  assert.equal(hostsOf(meta).hostAt('host0000', T0 + 121 * MIN), true, 'and back again');
  assert.equal(meta.hosts.length, 3);
});

test('what the host did keeps counting after a handover — and only the host at the time counts', () => {
  const room = makeRoom({ settings: { anyoneCanStart: false } });
  const photo = (owner, ts) => room.add(owner, ts, { t: 'photo', a: `${photoPrefix(owner)}${ts}`, cap: '', w: 10, h: 10, f: 1, th: 1 });
  const p1 = photo('anna0000', T0 + 5 * MIN);
  const p2 = photo('anna0000', T0 + 6 * MIN);
  const p3 = photo('bo000000', T0 + 7 * MIN);
  room.add('host0000', T0 + 10 * MIN, { t: 'phide', k: `anna0000:${p1.id}` }); // as host
  room.add('host0000', T0 + 11 * MIN, { t: 'game', g: 'ruleCard', gid: 'g-1', p: { rule: 0 } }); // as host
  room.handOver('anna0000', T0 + 30 * MIN);
  room.add('host0000', T0 + 40 * MIN, { t: 'phide', k: `anna0000:${p2.id}` }); // no longer host
  room.add('anna0000', T0 + 41 * MIN, { t: 'phide', k: `bo000000:${p3.id}` }); // the new host
  const d = derive(room, T0 + 60 * MIN);
  assert.deepEqual(d.photos.map((ph) => ph.key), [`anna0000:${p2.id}`], 'hidden by the hosts of the time');
  assert.equal(d.players.get('anna0000').isHost, true);
  assert.equal(d.games.filter((g) => !g.auto).length, 1, 'the minigame the first host started still happened');
});

test('pub golf: the first host decided as judge until the handover; after it, the new host does', () => {
  const room = makeRoom({ meta: { type: 'pubgolf', pg: defaultPg(), judges: [] } });
  room.add('host0000', T0 + 10 * MIN, { t: 'pgpen', p: 'bo000000', n: 2, why: 'Sugerør' });
  room.handOver('anna0000', T0 + 30 * MIN);
  room.add('host0000', T0 + 40 * MIN, { t: 'pgpen', p: 'bo000000', n: 3, why: 'For sent' });
  room.add('anna0000', T0 + 41 * MIN, { t: 'pgbon', p: 'bo000000', n: 1, why: 'Flot' });
  const pg = derive(room, T0 + 60 * MIN).pg;
  assert.equal(pg.judge, 'anna0000', 'without an appointed judge, the host is judge');
  assert.equal(pg.players.get('bo000000').pen, 2);
  assert.equal(pg.players.get('bo000000').bon, 1);
});
