import test from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../../skaal/js/game/derive.js';
import { normalizeSettings, withSchedule } from '../../skaal/js/game/settings.js';
import { GAMEPLAY } from '../../skaal/js/config.js';

// A big night: 30 players, 6 hours, ~60 drinks each, breakers every 10 minutes with answers,
// wheel spins and acknowledgements. derive() runs every second on every phone, so it must stay
// well inside a frame budget.
test('derive() stays fast for a large event', () => {
  const T0 = Date.UTC(2026, 9, 3, 18, 0, 0);
  const H = 3600_000;
  const s = normalizeSettings({ breakerMin: 10 });
  const state = { meta: { v: 1, name: 'Big', hostId: 'p0', createdAt: T0, startedAt: T0, settings: s, sched: withSchedule([], s, T0), removed: [] }, players: {} };
  const pids = Array.from({ length: 30 }, (_, i) => `p${i}`);
  let seq = 0;
  const add = (pid, e) => state.players[pid].entries.set(`e${++seq}`, { id: `e${seq}`, ...e });
  for (const pid of pids) state.players[pid] = { profile: { v: 1, name: pid.toUpperCase(), joinedAt: T0 - 60_000, left: 0 }, entries: new Map() };
  const kinds = ['beer', 'shot', 'drink', 'jager', 'water'];
  for (const pid of pids) {
    for (let i = 0; i < 60; i++) add(pid, { ts: T0 + Math.floor((i / 60) * 6 * H) + (seq % 997), t: 'd', k: kinds[(i + seq) % kinds.length] });
    for (let i = 0; i < 6; i++) {
      add(pid, { ts: T0 + i * H + 5000, t: 'spin', w: 'king', oc: 'give2', src: 'x' });
      add(pid, { ts: T0 + i * H + 5001, t: 'give', to: { [pids[(i + 1) % 30]]: 2 }, src: `e${seq - 1}` });
    }
  }
  const room = { pid: 'p0', roomId: 'big', state, isOnline: () => true };
  // Every player answers every breaker.
  const d0 = derive(room, T0 + 6 * H);
  for (const inst of d0.games) {
    for (const pid of inst.responders) add(pid, { ts: inst.playStart + 1000, t: 'resp', gid: inst.gid, v: inst.g === 'quiz' ? { a: 0, ms: 900 } : pids[0] });
  }
  const runs = 20;
  const start = performance.now();
  let d;
  for (let i = 0; i < runs; i++) d = derive(room, T0 + 6 * H + i * 1000);
  const ms = (performance.now() - start) / runs;
  console.log(`derive(): ${ms.toFixed(1)} ms for ${d.players.size} players, ${d.feed.length} feed items, ${d.games.length} games`);
  assert.equal(d.players.size, 30);
  assert.ok(d.games.length >= 30);
  assert.ok(ms < 60, `derive too slow: ${ms.toFixed(1)} ms`);
  assert.ok(GAMEPLAY.introMs > 0);
});
