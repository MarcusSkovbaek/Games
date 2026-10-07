// Minigame instances: automatic breakers (computed deterministically from the schedule, so every
// phone shows the same game at the same moment without a coordinator) plus games started by hand.
import { GAMEPLAY } from '../config.js';
import { GAMES, gameById } from '../minigames/index.js';
import { seededRandom, pickWeighted } from '../core/rng.js';
import { scheduleSegment } from './settings.js';

export const RESULT_GRACE_MS = 1500; // wait for late answers before showing a result
const JOIN_SLACK_MS = 30000; // players must have joined this long before an automatic breaker

export function isPausedAt(pauses, ts) {
  let paused = false;
  for (const p of pauses || []) {
    if (p.ts > ts) break;
    paused = !!p.on;
  }
  return paused;
}

// roster: [{ pid, joinedAt, left, pauses: [{ ts, on }] }] sorted by pid
export function eligibleAt(roster, ts, slack = 0) {
  return roster
    .filter((r) => r.joinedAt && r.joinedAt <= ts - slack && (!r.left || r.left > ts) && !isPausedAt(r.pauses, ts))
    .map((r) => r.pid);
}

function timing(inst, game) {
  inst.dur = typeof game.duration === 'function' ? game.duration(inst.p) : game.duration;
  inst.playStart = inst.start + GAMEPLAY.introMs;
  inst.playEnd = inst.playStart + inst.dur;
  inst.until = inst.playEnd + GAMEPLAY.resultMs;
  inst.responders = game.responders ? game.responders(inst) : inst.eligible;
  return inst;
}

export function buildInstances({ roomId, meta, settings, roster, manual = [], now, hostAt = (pid) => pid === meta?.hostId }) {
  if (!meta) return [];
  const raw = [];
  const ended = meta.ended || Infinity;
  const segments = (Array.isArray(meta.sched) && meta.sched.length
    ? meta.sched
    : [scheduleSegment(meta.startedAt || meta.createdAt || 0, settings)]
  )
    .filter((s) => s && Number.isFinite(s.at))
    .slice()
    .sort((a, b) => a.at - b.at);

  // Automatic breakers.
  let prevGame = null;
  const history = new Map();
  segments.forEach((seg, i) => {
    const every = (Number(seg.every) || 0) * 60000;
    if (!every) return;
    const segEnd = Math.min(i + 1 < segments.length ? segments[i + 1].at : Infinity, ended);
    for (let k = 1; k < 2000; k++) {
      const start = seg.at + k * every;
      if (start >= segEnd || start > now + every) break;
      const eligible = eligibleAt(roster, start, JOIN_SLACK_MS);
      if (eligible.length < GAMEPLAY.minPlayersForBreakers) continue;
      const allowed = Array.isArray(seg.games) ? seg.games : [];
      const candidates = GAMES.filter((g) => g.auto !== false && allowed.includes(g.id) && eligible.length >= (g.minPlayers || 2));
      const pool = candidates.length > 1 ? candidates.filter((g) => g.id !== prevGame) : candidates;
      const rng = seededRandom(`${roomId}|${seg.at}|${k}`);
      const game = pickWeighted(rng, pool);
      if (!game) continue;
      const hist = history.get(game.id) || [];
      let p;
      try {
        p = game.setup({ rng, players: eligible, history: hist, settings, drinks: seg.drinks || [] });
      } catch (err) {
        console.error('[schedule] setup failed', game.id, err);
        continue;
      }
      hist.push(p);
      history.set(game.id, hist);
      prevGame = game.id;
      raw.push({ gid: `a${seg.at.toString(36)}-${k}`, g: game.id, start, p, auto: true, eligible });
    }
  });

  // Games started by a player.
  for (const { pid, e } of manual) {
    const game = gameById(e.g);
    if (!game || game.manual === false || typeof e.gid !== 'string' || !e.p || typeof e.p !== 'object') continue;
    if (!settings.anyoneCanStart && !hostAt(pid, e.ts)) continue;
    if (e.ts > ended) continue;
    raw.push({ gid: e.gid, g: e.g, start: e.ts, p: e.p, auto: false, by: pid, eligible: eligibleAt(roster, e.ts) });
  }

  raw.sort((a, b) => a.start - b.start || (a.gid < b.gid ? -1 : 1));
  const accepted = [];
  let busyUntil = -Infinity;
  for (const inst of raw) {
    const game = gameById(inst.g);
    timing(inst, game);
    if (inst.start < busyUntil) continue; // another game was running — first one wins
    accepted.push(inst);
    busyUntil = inst.until;
  }
  return accepted;
}

export function phaseOf(inst, t) {
  if (t < inst.start) return 'pending';
  if (t < inst.playStart) return 'intro';
  if (t < inst.playEnd) return 'play';
  if (t < inst.until) return 'result';
  return 'done';
}
