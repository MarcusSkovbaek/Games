// Derives everything the UI shows (standings, feed, inbox, minigames …) from the raw synced
// state. Pure and deterministic: the same state and time give the same result on every phone.
import { GAMEPLAY } from '../config.js';
import { drinkById } from './drinks.js';
import { normalizeSettings, pointsFor } from './settings.js';
import { buildInstances, phaseOf, isPausedAt, RESULT_GRACE_MS } from './schedule.js';
import { gameById } from '../minigames/index.js';
import { hashString } from '../core/rng.js';
import { TOUR_FACES, TOUR_ASSETS, faceById } from './tour.js';
import { derivePubGolf, officialsOf } from './pubgolf.js';
import { derivePhotos, photoFeedItems } from './photos.js';

const AFTER_END = new Set(['ack', 'react', 'photo', 'pc', 'phide', 'pghide']);

// Player identity colours: a categorical palette validated for colour-blind separation and
// contrast against the app's dark surface. Assigned in fixed slot order as players join.
export const PLAYER_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export function colorFor(pid) {
  return PLAYER_COLORS[hashString(pid) % PLAYER_COLORS.length];
}

// First palette slot not taken by someone already in the event (falls back to a hash when full).
export function pickPlayerColor(room) {
  const taken = new Set(Object.values(room.state.players).map((p) => p.profile?.color).filter(Boolean));
  return PLAYER_COLORS.find((c) => !taken.has(c)) || colorFor(room.pid);
}

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const EFFECT_TYPES = new Set(['give', 'all', 'pen', 'self', 'bon', 'shd', 'owe', 'rule']);

export function derive(room, t) {
  const st = room.state;
  const meta = st.meta || null;
  const settings = normalizeSettings(meta?.settings);
  const removed = new Set(meta?.removed || []);
  const ended = meta?.ended || 0;
  const me = room.pid;

  // ------------------------------------------------------------------------------- players
  const players = new Map();
  for (const [pid, raw] of Object.entries(st.players)) {
    const prof = raw.profile;
    if (!prof || !prof.name || removed.has(pid)) continue;
    players.set(pid, {
      pid,
      name: prof.name,
      photo: prof.photo,
      pv: prof.pv || null,
      color: prof.color || colorFor(pid),
      joinedAt: prof.joinedAt || 0,
      left: prof.left || 0,
      isHost: meta?.hostId === pid,
      isMe: pid === me,
      online: room.isOnline(pid),
      points: 0,
      bonus: 0,
      counts: {},
      alcoholic: 0,
      water: 0,
      drinkTimes: [],
      lastWaterAt: 0,
      firstDrinkAt: 0,
      lastDrinkAt: 0,
      reachedAt: 0,
      timeline: [],
      sipsTaken: 0,
      shotsTaken: 0,
      sipsGiven: 0,
      shieldsGained: 0,
      shieldsUsed: 0,
      pending: 0,
      pendingSips: 0,
      pauses: [],
      paused: false,
      rank: 0,
      prevRank: 0,
      titles: [],
      bestReaction: 0,
      quizRight: 0,
      jersey: false,
      mask: null,
    });
  }

  // ------------------------------------------------------------------------------- entries
  const all = [];
  for (const [pid, raw] of Object.entries(st.players)) {
    if (!players.has(pid)) continue;
    for (const e of raw.entries.values()) all.push({ pid, e });
  }
  all.sort((a, b) => a.e.ts - b.e.ts || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0));

  const voided = new Set();
  for (const { pid, e } of all) if (e.t === 'x' && typeof e.r === 'string') voided.add(`${pid}:${e.r}`);
  // A Tour moment falls away when the drink that set it off is undone (as does a second moment
  // for the same rider), and effects always follow the moment or spin they came from.
  const rode = new Set();
  for (const { pid, e } of all) {
    if (e.t !== 'tour' || voided.has(`${pid}:${e.id}`)) continue;
    if (voided.has(`${pid}:${e.src}`) || rode.has(pid) || !faceById(e.face)) voided.add(`${pid}:${e.id}`);
    else rode.add(pid);
  }
  for (const { pid, e } of all) {
    if (EFFECT_TYPES.has(e.t) && typeof e.src === 'string' && voided.has(`${pid}:${e.src}`)) voided.add(`${pid}:${e.id}`);
  }
  const by = {};
  const entryIndex = new Map();
  for (const item of all) {
    const { pid, e } = item;
    if (e.t === 'x' || voided.has(`${pid}:${e.id}`)) continue;
    // After the end only acknowledgements, reactions, photos and comments still come in.
    if (ended && e.ts > ended && !AFTER_END.has(e.t)) continue;
    (by[e.t] ||= []).push(item);
    entryIndex.set(`${pid}:${e.id}`, item);
  }
  const list = (type) => by[type] || [];

  for (const { pid, e } of list('pause')) players.get(pid).pauses.push({ ts: e.ts, on: !!e.on });
  for (const p of players.values()) p.paused = isPausedAt(p.pauses, t);

  // ------------------------------------------------------------------------------ minigames
  const roster = [...players.values()]
    .map((p) => ({ pid: p.pid, joinedAt: p.joinedAt, left: p.left, pauses: p.pauses }))
    .sort((a, b) => (a.pid < b.pid ? -1 : 1));
  const games = buildInstances({ roomId: room.roomId, meta, settings, roster, manual: list('game'), now: t, hostId: meta?.hostId });
  const gameByGid = new Map(games.map((g) => [g.gid, g]));
  for (const inst of games) inst.responses = new Map();
  for (const { pid, e } of list('resp')) {
    const inst = gameByGid.get(e.gid);
    if (!inst || !inst.responders.includes(pid)) continue;
    if (e.ts < inst.start - 2000 || e.ts > inst.playEnd + 5000) continue;
    const game = gameById(inst.g);
    const prev = inst.responses.get(pid);
    if (prev && game.respond === 'first') continue;
    inst.responses.set(pid, { v: e.v, ts: e.ts });
  }
  const modifiers = [];
  const rules = [];
  for (const inst of games) {
    const game = gameById(inst.g);
    inst.phase = phaseOf(inst, t);
    if (t >= inst.playEnd + RESULT_GRACE_MS) {
      try {
        inst.result = game.resolve({ p: inst.p, responses: inst.responses, eligible: inst.eligible, settings });
      } catch (err) {
        console.error('[derive] resolve failed', inst.g, err);
        inst.result = { penalties: [], bonus: [], summary: {} };
      }
    }
    if (t >= inst.playStart) {
      if (game.modifiers) modifiers.push(...game.modifiers(inst).map((m) => ({ ...m, gid: inst.gid })));
      if (game.rules) rules.push(...game.rules(inst).map((r) => ({ ...r, gid: inst.gid })));
    }
  }
  for (const { pid, e } of list('rule')) {
    rules.push({ text: String(e.text || '').slice(0, 140), from: e.ts, to: e.ts + clampInt(e.mins, 1, 120) * 60000, pid });
  }

  // -------------------------------------------------------------------------------- scoring
  const scoreEvents = [];
  for (const { pid, e } of list('d')) {
    const def = drinkById(e.k);
    let mult = 1;
    for (const m of modifiers) if (m.k === e.k && e.ts >= m.from && e.ts < m.to) mult *= m.mult;
    scoreEvents.push({ ts: e.ts, pid, id: e.id, drink: e.k, alcoholic: def ? def.alcoholic : true, pts: pointsFor(settings, e.k) * mult, mult });
  }
  if (settings.bonus) {
    for (const { pid, e } of list('bon')) scoreEvents.push({ ts: e.ts, pid, pts: clampInt(e.n, 0, 5), bonus: true });
    for (const inst of games) {
      for (const b of inst.result?.bonus || []) {
        if (players.has(b.pid)) scoreEvents.push({ ts: inst.playEnd, pid: b.pid, pts: b.n, bonus: true, gid: inst.gid });
      }
    }
  }
  scoreEvents.sort((a, b) => a.ts - b.ts);

  const leaderChanges = [];
  const milestones = [];
  let leader = null;
  const pickLeader = () => {
    let best = null;
    for (const p of players.values()) {
      if (p.points <= 0) continue;
      if (!best || p.points > best.points || (p.points === best.points && p.reachedAt < best.reachedAt)) best = p;
    }
    return best;
  };
  for (const ev of scoreEvents) {
    const p = players.get(ev.pid);
    if (!p) continue;
    if (ev.drink) {
      p.counts[ev.drink] = (p.counts[ev.drink] || 0) + 1;
      if (ev.alcoholic) {
        p.alcoholic++;
        p.drinkTimes.push(ev.ts);
        if (!p.firstDrinkAt) p.firstDrinkAt = ev.ts;
        p.lastDrinkAt = ev.ts;
        if (p.alcoholic % GAMEPLAY.milestoneEvery === 0) milestones.push({ pid: p.pid, n: p.alcoholic, ts: ev.ts });
      } else if (ev.drink === 'water') {
        p.water++;
        p.lastWaterAt = ev.ts;
      }
    }
    if (ev.bonus) p.bonus += ev.pts;
    if (ev.pts) {
      p.points += ev.pts;
      p.reachedAt = ev.ts;
      p.timeline.push([ev.ts, p.points]);
      const top = pickLeader();
      if (top && top.pid !== leader && players.size >= 2) {
        leaderChanges.push({ ts: ev.ts, pid: top.pid, prev: leader });
        leader = top.pid;
      }
    }
  }

  const byRank = (a, b) =>
    b.points - a.points || (a.reachedAt || Infinity) - (b.reachedAt || Infinity) || a.name.localeCompare(b.name, 'da');
  const ranking = [...players.values()].sort(byRank);
  ranking.forEach((p, i) => (p.rank = i + 1));

  // Rank 15 minutes ago, for the ↑/↓ indicators.
  const past = t - 15 * 60000;
  const pastPoints = (p) => {
    let pts = 0;
    let at = 0;
    for (const [ts, v] of p.timeline) {
      if (ts > past) break;
      pts = v;
      at = ts;
    }
    return { pts, at };
  };
  [...players.values()]
    .filter((p) => p.joinedAt <= past)
    .map((p) => ({ p, ...pastPoints(p) }))
    .sort((a, b) => b.pts - a.pts || (a.at || Infinity) - (b.at || Infinity) || a.p.name.localeCompare(b.p.name, 'da'))
    .forEach((x, i) => (x.p.prevRank = i + 1));

  // ------------------------------------------------------------------------- obligations
  const obligations = [];
  const whyOf = (pid, src) => {
    const from = entryIndex.get(`${pid}:${src}`)?.e;
    if (from?.t === 'spin') return { wheel: from.w, outcome: from.oc };
    if (from?.t === 'tour') return { tour: `${pid}:${from.id}`, face: from.face };
    return null;
  };
  const activeAt = (q, ts) => q.joinedAt <= ts && (!q.left || q.left > ts) && !isPausedAt(q.pauses, ts);
  for (const { pid, e } of list('give')) {
    let total = 0;
    for (const [to, n] of Object.entries(e.to || {})) {
      if (!players.has(to) || to === pid) continue;
      const k = clampInt(n, 1, 20);
      total += k;
      obligations.push({ key: `${pid}:${e.id}`, target: to, from: pid, n: k, unit: 'sip', ts: e.ts, why: whyOf(pid, e.src) });
    }
    players.get(pid).sipsGiven += total;
  }
  for (const { pid, e } of list('all')) {
    const n = clampInt(e.n, 1, 10);
    for (const q of players.values()) {
      if (q.pid === pid || !activeAt(q, e.ts)) continue;
      obligations.push({ key: `${pid}:${e.id}`, target: q.pid, from: pid, n, unit: 'sip', ts: e.ts, everyone: true, why: whyOf(pid, e.src) });
      players.get(pid).sipsGiven += n;
    }
  }
  for (const { pid, e } of list('pen')) {
    if (!players.has(e.to)) continue;
    const n = clampInt(e.n, 1, 10);
    const unit = e.u === 'shot' ? 'shot' : 'sip';
    obligations.push({ key: `${pid}:${e.id}`, target: e.to, from: pid, n, unit, ts: e.ts, why: whyOf(pid, e.src) });
    if (unit === 'sip') players.get(pid).sipsGiven += n;
  }
  for (const { pid, e } of list('self')) {
    obligations.push({ key: `${pid}:${e.id}`, target: pid, from: pid, n: clampInt(e.n, 1, 10), unit: 'sip', ts: e.ts, self: true, why: whyOf(pid, e.src) });
  }
  for (const { pid, e } of list('owe')) {
    if (!players.has(e.from) || e.from === pid) continue;
    obligations.push({ key: `${pid}:${e.id}`, target: e.from, from: pid, n: 1, unit: 'drink', kind: 'owe', ts: e.ts, why: whyOf(pid, e.src) });
  }
  for (const inst of games) {
    for (const pen of inst.result?.penalties || []) {
      if (!players.has(pen.pid)) continue;
      obligations.push({ key: `g:${inst.gid}`, target: pen.pid, from: null, gid: inst.gid, game: inst.g, n: pen.n, unit: pen.unit || 'sip', ts: inst.playEnd + RESULT_GRACE_MS, done: !!pen.done });
    }
  }

  const acks = new Map();
  for (const { pid, e } of list('ack')) if (typeof e.r === 'string' && !acks.has(`${pid}|${e.r}`)) acks.set(`${pid}|${e.r}`, e);
  for (const { pid } of list('shd')) players.get(pid).shieldsGained++;
  const obligationByKey = new Map();
  for (const ob of obligations) {
    const ack = acks.get(`${ob.target}|${ob.key}`);
    ob.acked = !!ack || !!ob.done;
    ob.how = ack?.how || (ob.done ? 'ok' : null);
    ob.ackedAt = ack?.ts || 0;
    obligationByKey.set(`${ob.target}|${ob.key}`, ob);
    const target = players.get(ob.target);
    if (ob.how === 'shield') target.shieldsUsed++;
    else if (ob.acked && ob.kind !== 'owe') {
      if (ob.unit === 'sip') target.sipsTaken += ob.n;
      if (ob.unit === 'shot') target.shotsTaken += ob.n;
    }
    if (!ob.acked && ob.ts > t - GAMEPLAY.inboxTtlMs && !ended) {
      target.pending++;
      if (ob.unit === 'sip') target.pendingSips += ob.n;
    }
  }
  for (const p of players.values()) p.shields = Math.max(0, p.shieldsGained - p.shieldsUsed);

  // Fællesskål: an "everyone drinks" effect pops up on every phone (Tour moments have their own).
  const toasts = [];
  for (const { pid, e } of list('all')) {
    const why = whyOf(pid, e.src);
    if (why?.tour) continue;
    const key = `${pid}:${e.id}`;
    const targets = obligations.filter((ob) => ob.key === key).map((ob) => ob.target);
    if (targets.length) toasts.push({ key, pid, ts: e.ts, n: clampInt(e.n, 1, 10), why, targets });
  }

  // Personal minigame stats.
  for (const inst of games) {
    if (!inst.result) continue;
    if (inst.g === 'reaction') {
      for (const r of inst.result.summary.valid || []) {
        const p = players.get(r.pid);
        if (p && (!p.bestReaction || r.ms < p.bestReaction)) p.bestReaction = r.ms;
      }
    }
    if (inst.g === 'quiz') for (const r of inst.result.summary.right || []) players.get(r.pid) && players.get(r.pid).quizRight++;
  }

  // ------------------------------------------------------------------------- titles & pace
  for (const p of players.values()) {
    if (p.rank === 1 && p.points > 0 && players.size >= 2) p.titles.push('leader');
    if (p.drinkTimes.filter((ts) => ts > t - 30 * 60000).length >= 3) p.titles.push('onfire');
    if (p.lastWaterAt && p.lastWaterAt > t - 45 * 60000) p.titles.push('hydrated');
    const hours = p.firstDrinkAt ? Math.max(0.5, (Math.min(t, ended || t) - p.firstDrinkAt) / 3600000) : 0;
    p.pace = p.alcoholic >= 2 && hours ? p.alcoholic / hours : 0;
  }

  // ------------------------------------------------------------------------ tour de france
  const assets = st.assets || {};
  const tour = {
    on: settings.tour,
    leader: null,
    mask: assets[TOUR_ASSETS.mask]?.data || null,
    faces: Object.fromEntries(TOUR_FACES.map((f) => [f.id, assets[TOUR_ASSETS.face(f.id)]?.data || null])),
    moments: list('tour').map(({ pid, e }) => ({ key: `${pid}:${e.id}`, id: e.id, pid, face: e.face, n: clampInt(e.n, 1, 999), ts: e.ts, effects: [] })),
  };
  if (settings.tour) {
    const top = [...players.values()].find((p) => p.titles.includes('leader'));
    if (top) {
      top.jersey = true;
      top.mask = tour.mask;
      tour.leader = top.pid;
    }
  }

  // ---------------------------------------------------------------------------------- me
  const mePlayer = players.get(me) || null;
  const inbox = obligations
    .filter((ob) => ob.target === me && !ob.acked && ob.ts > t - GAMEPLAY.inboxTtlMs && !ended)
    .sort((a, b) => a.ts - b.ts);
  const spun = new Set(list('spin').filter((x) => x.pid === me).map((x) => x.e.src));
  const offers = settings.triggers && !ended
    ? list('o')
        .filter(({ pid, e }) => pid === me && !spun.has(e.id) && e.ts > t - GAMEPLAY.offerTtlMs && (!e.src || !voided.has(`${me}:${e.src}`)))
        .map(({ e }) => e)
    : [];
  const myOffers = list('o').filter((x) => x.pid === me).map((x) => x.e);

  // -------------------------------------------------------------------------------- feed
  const feed = [];
  for (const p of players.values()) if (p.joinedAt) feed.push({ key: `j:${p.pid}`, ts: p.joinedAt, kind: 'join', pid: p.pid });
  for (const ev of scoreEvents) {
    if (ev.drink) feed.push({ key: `${ev.pid}:${ev.id}`, ts: ev.ts, kind: 'drink', pid: ev.pid, drink: ev.drink, pts: ev.pts, mult: ev.mult });
  }
  for (const lc of leaderChanges) feed.push({ key: `l:${lc.pid}:${lc.ts}`, ts: lc.ts + 1, kind: 'lead', pid: lc.pid, prev: lc.prev });
  for (const m of milestones) feed.push({ key: `m:${m.pid}:${m.n}`, ts: m.ts + 2, kind: 'milestone', pid: m.pid, n: m.n });
  // Spins and Tour moments collect the effects they caused.
  const parents = new Map();
  for (const { pid, e } of list('spin')) {
    const item = { key: `${pid}:${e.id}`, ts: e.ts, kind: 'spin', pid, wheel: e.w, outcome: e.oc, effects: [] };
    parents.set(item.key, item);
    feed.push(item);
  }
  for (const m of tour.moments) {
    const item = { key: m.key, ts: m.ts, kind: 'tour', pid: m.pid, face: m.face, n: m.n, effects: m.effects };
    parents.set(m.key, item);
    feed.push(item);
  }
  for (const type of EFFECT_TYPES) {
    for (const { pid, e } of list(type)) {
      const effect = { type, pid, e, key: `${pid}:${e.id}` };
      const parent = e.src && parents.get(`${pid}:${e.src}`);
      if (parent) parent.effects.push(effect);
      else if (type !== 'bon' && type !== 'shd') feed.push({ key: effect.key, ts: e.ts, kind: 'effect', pid, effect });
    }
  }
  for (const { pid, e } of list('ack')) {
    const ob = obligationByKey.get(`${pid}|${e.r}`);
    if (ob && !ob.self) feed.push({ key: `${pid}:${e.id}`, ts: e.ts, kind: 'ack', pid, ob, how: e.how });
  }
  for (const inst of games) {
    if (t < inst.start) continue;
    feed.push({ key: `g:${inst.gid}`, ts: inst.result ? inst.playEnd : inst.start, kind: 'game', inst });
  }
  for (const { pid, e } of list('pause')) feed.push({ key: `${pid}:${e.id}`, ts: e.ts, kind: 'pause', pid, on: !!e.on });

  // Photos from the evening. The host can hide anyone's — in pub golf so can the judge.
  const officials = meta?.type === 'pubgolf' ? officialsOf(meta) : null;
  const canHide = (pid, ts) => pid === meta?.hostId || !!officials?.officialAt(pid, ts);
  const voidedPhotos = all.filter(({ pid, e }) => e.t === 'photo' && voided.has(`${pid}:${e.id}`));
  const { photos, photoByKey, comments, gone: photosGone } = derivePhotos({ list, assets, canHide, voided: voidedPhotos });
  feed.push(...photoFeedItems(photos));

  // Pub golf events: course, teams, scores and competitions.
  const pg = meta?.type === 'pubgolf' ? derivePubGolf({ meta, players, list, photoByKey, t, me }) : null;
  if (pg) feed.push(...pg.feed);
  feed.sort((a, b) => b.ts - a.ts);

  const reactions = new Map();
  for (const { pid, e } of list('react')) {
    if (typeof e.r !== 'string' || typeof e.e !== 'string') continue;
    if (!reactions.has(e.r)) reactions.set(e.r, new Map());
    const byEmoji = reactions.get(e.r);
    if (!byEmoji.has(e.e)) byEmoji.set(e.e, new Map());
    byEmoji.get(e.e).set(pid, e.id);
  }

  // ------------------------------------------------------------------------------ summary
  const activeGame = [...games].reverse().find((g) => t >= g.start && t < g.until) || null;
  const nextAuto = games.find((g) => g.auto && g.start > t) || null;
  const totals = { drinks: 0, alcoholic: 0, points: 0, sips: 0 };
  for (const p of players.values()) {
    totals.alcoholic += p.alcoholic;
    totals.drinks += p.alcoholic + p.water;
    totals.points += p.points;
    totals.sips += p.sipsTaken;
  }

  return {
    t,
    me,
    meta,
    settings,
    ended,
    isHost: !!meta && meta.hostId === me,
    players,
    ranking,
    mePlayer,
    games,
    activeGame,
    nextAuto,
    modifiers: modifiers.filter((m) => t >= m.from && t < m.to),
    rules: rules.filter((r) => t >= r.from && t < r.to).sort((a, b) => a.to - b.to),
    obligations,
    inbox,
    offers,
    myOffers,
    feed,
    reactions,
    tour,
    toasts,
    photos,
    photoByKey,
    comments,
    photosGone,
    canHidePhotos: canHide(me, t),
    pg,
    leaderChanges,
    totals,
    myEntries: (st.players[me] ? [...st.players[me].entries.values()] : []).sort((a, b) => b.ts - a.ts),
    voided,
  };
}
