// Pub golf: the group plays a "course" of bars. Every bar is a hole — everybody drinks the hole's
// drink, and the number of sips ("strokes") it takes is their score. As in golf the lowest score
// wins. Players can play in teams, and one judge records scores, penalties (extra strokes),
// bonuses (strokes off) and who won the competitions along the way.
//
// The course, teams and competitions live in the event meta (edited by the host). Everything
// that happens during the round is an entry in someone's own log, so phones never overwrite each
// other's data:
//   pg      { p, h, s }            p took s strokes on hole h (s = 0 clears) — by p or an official
//   pgpen   { p | team, n, why }   n penalty strokes                          — officials
//   pgbon   { p | team, n, why }   n strokes off                              — officials
//   team    { p, team }            p plays for team (null = no team)          — p or an official
//   hole    { h }                  the group moves on to hole h               — officials
//   podium  { c, places | photos } result of competition c                   — officials
//   chal    { c | text }           a challenge for the teams                  — officials
//   photo   { a, cap }             a photo (image in shared asset a)          — anyone
//   pghide  { k }                  hide photo k                               — officials
// Officials are the host and the judge. The host appoints the judge (meta.judges keeps every
// appointment with its time); a judge's entries count for the time they were judge.

export const PG = {
  defaultHoles: 9,
  maxHoles: 18,
  maxTeams: 8,
  maxStrokes: 15,
  maxPar: 10,
  // "Opgiv" scores par + this many strokes.
  giveUpOver: 4,
  // Challenges and competition results pop up on phones that see them within this long.
  momentMs: 60_000,
  // A new judge's term starts this much before the appointment, for phones whose clock is behind.
  judgeSkewMs: 120_000,
};

export const TEAM_COLORS = [
  { name: 'Rød', color: '#e5484d' },
  { name: 'Blå', color: '#3b82f6' },
  { name: 'Grøn', color: '#22c55e' },
  { name: 'Gul', color: '#eab308' },
  { name: 'Lilla', color: '#a855f7' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Pink', color: '#ec4899' },
  { name: 'Turkis', color: '#14b8a6' },
];

// The classic nine: what to drink at each hole and its par. Holes beyond nine repeat the list.
export const COURSE_TEMPLATE = [
  { drink: 'Fadøl', par: 3 },
  { drink: 'Shot', par: 1 },
  { drink: 'Cider', par: 3 },
  { drink: 'Glas vin', par: 2 },
  { drink: 'Stout', par: 4 },
  { drink: 'Vodka-juice', par: 2 },
  { drink: 'Flaskeøl', par: 3 },
  { drink: 'Jägerbomb', par: 1 },
  { drink: 'Drink', par: 2 },
];

export const DEFAULT_COMPS = [
  { id: 'photo', name: 'Fotokonkurrence', emoji: '📸', kind: 'photo' },
  { id: 'outfit', name: 'Bedste outfit', emoji: '👔', kind: 'team' },
  { id: 'song', name: 'Bedste holdsang', emoji: '🎤', kind: 'team' },
  { id: 'spirit', name: 'Bedste holdånd', emoji: '🤝', kind: 'team' },
];

export const PENALTIES = [
  { id: 'spill', label: 'Spildt', emoji: '💦', n: 1 },
  { id: 'toilet', label: 'Toiletbesøg', emoji: '🚽', n: 2 },
  { id: 'rule', label: 'Brød en regel', emoji: '📜', n: 1 },
  { id: 'unfinished', label: 'Drak ikke ud', emoji: '🥴', n: 2 },
  { id: 'late', label: 'Kom for sent', emoji: '⏰', n: 1 },
  { id: 'phone', label: 'Telefon frem', emoji: '📱', n: 1 },
];

export const BONUSES = [
  { id: 'challenge', label: 'Vandt udfordringen', emoji: '🏅', n: 1 },
  { id: 'style', label: 'Stilpoint', emoji: '😎', n: 1 },
  { id: 'teamwork', label: 'Godt holdspil', emoji: '🤝', n: 1 },
  { id: 'bartender', label: 'Fik bartenderen til at grine', emoji: '😂', n: 1 },
];

// Entertainment along the way: the judge draws one, the teams compete, the winner gets a bonus.
export const CHALLENGES = [
  'Tag et gruppebillede med bartenderen — det sjoveste billede vinder.',
  'Find en fremmed med samme fødselsmåned som en fra holdet.',
  'Syng omkvædet af en sang, som de andre hold vælger.',
  'Byg det højeste tårn af ølbrikker på 2 minutter.',
  'Lav en reklame på 30 sekunder for baren.',
  'Find noget rødt, noget rundt og noget, der lyser — først tilbage vinder.',
  'Opfind et hemmeligt holdhåndtryk og vis det frem.',
  'Bedste imitation af en kendt dansker — dommeren afgør.',
  'Få fem fremmede til at sige “skål” med jer.',
  'Find ud af, hvad barens mest solgte drink er — uden at spørge bartenderen.',
  'Holdkaptajnen må kun tale i rim indtil næste hul.',
  'Lav den flotteste luftguitar-solo som hold.',
  'Skål på fem forskellige sprog — hurtigst vinder.',
  'Tag det mest kreative billede af holdets drinks.',
  'Find en fremmed, der vil give holdet et godt råd for livet.',
  'Lav en dansemove, som holdet skal lave, hver gang nogen siger “skål”.',
  'Gæt barens alder — tættest på vinder.',
  'Hvem kan holde en ølbrik balanceret på næsen længst?',
];

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

// Photos are shared images named after their owner, so only the owner's log can claim them.
export const photoPrefix = (pid) => `ph-${String(pid).slice(0, 16)}-`;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const ID = /^[a-z0-9]{1,16}$/;

export function holeFromTemplate(i, id = `h${i + 1}`) {
  const t = COURSE_TEMPLATE[i % COURSE_TEMPLATE.length];
  return { id, bar: '', drink: t.drink, par: t.par, addr: '' };
}

export function defaultPg() {
  return {
    course: Array.from({ length: PG.defaultHoles }, (_, i) => holeFromTemplate(i)),
    teams: TEAM_COLORS.slice(0, 2).map((c, i) => ({ id: `t${i + 1}`, name: `Hold ${c.name}`, color: c.color })),
    comps: DEFAULT_COMPS.map((c) => ({ ...c })),
    teamScore: 'sum',
    selfScore: true,
    lockTeams: 0,
    compBonus: [3, 2, 1],
  };
}

function cleanHole(h) {
  if (!h || typeof h !== 'object' || !ID.test(h.id)) return null;
  return { id: h.id, bar: str(h.bar, 40), drink: str(h.drink, 32), par: clampInt(h.par, 1, PG.maxPar), addr: str(h.addr, 80) };
}

function cleanTeam(t) {
  if (!t || typeof t !== 'object' || !ID.test(t.id)) return null;
  const color = typeof t.color === 'string' && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : TEAM_COLORS[0].color;
  return { id: t.id, name: str(t.name, 24) || 'Hold', color };
}

function cleanComp(c) {
  if (!c || typeof c !== 'object' || !ID.test(c.id)) return null;
  return { id: c.id, name: str(c.name, 32) || 'Konkurrence', emoji: str(c.emoji, 8) || '🏆', kind: c.kind === 'photo' ? 'photo' : 'team' };
}

const uniqueBy = (list) => list.filter((x, i) => x && list.findIndex((y) => y && y.id === x.id) === i);

export function normalizePg(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const def = defaultPg();
  let course = uniqueBy((Array.isArray(s.course) ? s.course : []).map(cleanHole)).slice(0, PG.maxHoles);
  if (!course.length) course = def.course;
  const teams = Array.isArray(s.teams) ? uniqueBy(s.teams.map(cleanTeam)).slice(0, PG.maxTeams) : def.teams;
  let comps = Array.isArray(s.comps) ? uniqueBy(s.comps.map(cleanComp)).slice(0, 12) : def.comps;
  // There is always a photo competition.
  if (!comps.some((c) => c.kind === 'photo')) comps = [{ ...DEFAULT_COMPS[0] }, ...comps.filter((c) => c.id !== 'photo')];
  const bonus = Array.isArray(s.compBonus) ? s.compBonus : def.compBonus;
  return {
    course,
    teams,
    comps,
    teamScore: s.teamScore === 'avg' ? 'avg' : 'sum',
    selfScore: typeof s.selfScore === 'boolean' ? s.selfScore : def.selfScore,
    lockTeams: Number(s.lockTeams) || 0,
    compBonus: [0, 1, 2].map((i) => clampInt(bonus[i] ?? def.compBonus[i], 0, 5)),
  };
}

// The judge right now, and whether an entry made by pid at ts counts as official: the host's
// always do, a judge's only while they were judge. There is only ever one judge — the host until
// someone else is appointed.
export function officialsOf(meta) {
  const hostId = typeof meta?.hostId === 'string' ? meta.hostId : '';
  const terms = (Array.isArray(meta?.judges) ? meta.judges : [])
    .filter((x) => x && typeof x.p === 'string')
    .map((x) => ({ p: x.p, from: Number(x.ts) || 0 }))
    .sort((a, b) => a.from - b.from);
  terms.forEach((x, i) => (x.to = i + 1 < terms.length ? terms[i + 1].from : Infinity));
  const judge = terms.length ? terms[terms.length - 1].p : hostId;
  const officialAt = (pid, ts) => !!pid && (pid === hostId || terms.some((x) => x.p === pid && ts >= x.from - PG.judgeSkewMs && ts < x.to));
  return { judge, hostId, officialAt };
}

// The name of a score relative to par.
export function scoreName(s, par) {
  if (!s) return '';
  if (s === 1 && par > 1) return 'Hole in one!';
  const d = s - par;
  if (d <= -3) return 'Albatros';
  if (d === -2) return 'Eagle';
  if (d === -1) return 'Birdie';
  if (d === 0) return 'Par';
  if (d === 1) return 'Bogey';
  if (d === 2) return 'Dobbelt bogey';
  return `${d} over par`;
}

// "+3", "−2" or "±0" (true minus sign).
export function fmtToPar(n) {
  const v = Math.round(n * 10) / 10;
  const text = Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toFixed(1).replace('.', ',');
  if (v > 0) return `+${text}`;
  if (v < 0) return `−${text}`;
  return '±0';
}

// Builds the pub golf part of the derived state. `list(type)` gives the valid log entries of a
// type in time order (see derive.js), `players` the derived players, `assets` the shared images.
export function derivePubGolf({ meta, players, list, assets = {}, t, me }) {
  const cfg = normalizePg(meta.pg);
  const { judge, hostId, officialAt } = officialsOf(meta);
  const holeById = new Map(cfg.course.map((h, i) => [h.id, { ...h, n: i + 1 }]));
  const teamById = new Map(cfg.teams.map((tm) => [tm.id, tm]));
  const compById = new Map(cfg.comps.map((c) => [c.id, c]));
  const feed = [];

  // ------------------------------------------------------------------------------- teams
  const teamOf = new Map();
  for (const { pid, e } of list('team')) {
    if (typeof e.p !== 'string' || !players.has(e.p)) continue;
    const self = pid === e.p && (!cfg.lockTeams || e.ts < cfg.lockTeams);
    if (!self && !officialAt(pid, e.ts)) continue;
    if (e.team != null && !teamById.has(e.team)) continue;
    teamOf.set(e.p, e.team ?? null);
  }

  // ------------------------------------------------------------------------------ scores
  // The judge's word stands: once an official has set a score, the player can't change it.
  const scores = new Map(); // `${pid}|${hole}` → { s, official, by, ts }
  for (const { pid, e } of list('pg')) {
    if (!players.has(e.p) || !holeById.has(e.h)) continue;
    const official = officialAt(pid, e.ts);
    if (!official && !(pid === e.p && cfg.selfScore)) continue;
    const key = `${e.p}|${e.h}`;
    if (scores.get(key)?.official && !official) continue;
    const s = clampInt(e.s, 0, PG.maxStrokes);
    if (!s) scores.delete(key);
    else scores.set(key, { s, official, by: pid, ts: e.ts });
  }

  // ------------------------------------------------------------------ penalties & bonuses
  const adjustments = [];
  for (const [type, kind] of [
    ['pgpen', 'pen'],
    ['pgbon', 'bon'],
  ]) {
    for (const { pid, e } of list(type)) {
      if (!officialAt(pid, e.ts)) continue;
      const target = typeof e.p === 'string' && players.has(e.p) ? { p: e.p } : typeof e.team === 'string' && teamById.has(e.team) ? { team: e.team } : null;
      if (!target) continue;
      const src = typeof e.src === 'string' ? e.src.slice(0, 40) : null;
      const adj = { key: `${pid}:${e.id}`, kind, ...target, n: clampInt(e.n, 1, 10), why: str(e.why, 60), h: holeById.has(e.h) ? e.h : null, src, by: pid, ts: e.ts };
      adjustments.push(adj);
      feed.push({ key: adj.key, ts: e.ts, kind: `pg${kind}`, pid, adj });
    }
  }

  // --------------------------------------------------------------------------- the round
  let current = cfg.course[0].id;
  for (const { pid, e } of list('hole')) {
    if (!officialAt(pid, e.ts) || !holeById.has(e.h)) continue;
    if (e.h !== current) feed.push({ key: `${pid}:${e.id}`, ts: e.ts, kind: 'pghole', pid, h: e.h });
    current = e.h;
  }

  // ------------------------------------------------------------------------------ photos
  const hidden = new Set();
  for (const { pid, e } of list('pghide')) if (officialAt(pid, e.ts) && typeof e.k === 'string') hidden.add(e.k);
  const photos = [];
  for (const { pid, e } of list('photo')) {
    const key = `${pid}:${e.id}`;
    if (hidden.has(key) || typeof e.a !== 'string' || !e.a.startsWith(photoPrefix(pid))) continue;
    const asset = assets[e.a];
    if (asset && !asset.data) continue; // deleted by its owner
    photos.push({ key, pid, asset: e.a, data: asset?.data || null, cap: str(e.cap, 140), ts: e.ts });
    feed.push({ key, ts: e.ts, kind: 'pgphoto', pid, photo: key });
  }
  photos.sort((a, b) => b.ts - a.ts);
  const photoByKey = new Map(photos.map((ph) => [ph.key, ph]));

  // ------------------------------------------------------------------------ competitions
  const results = new Map(); // compId → { places: [{ team?, pid?, photo? } | null ×3], by, ts, key }
  for (const { pid, e } of list('podium')) {
    const comp = compById.get(e.c);
    if (!officialAt(pid, e.ts) || !comp) continue;
    let places;
    if (comp.kind === 'photo' && Array.isArray(e.photos)) {
      places = [0, 1, 2].map((i) => {
        const ph = photoByKey.get(e.photos[i]);
        return ph ? { photo: ph.key, pid: ph.pid, team: teamOf.get(ph.pid) || null } : null;
      });
    } else {
      const ids = Array.isArray(e.places) ? e.places : [];
      places = [0, 1, 2].map((i) => {
        const id = ids[i];
        if (teamById.has(id)) return { team: id };
        if (players.has(id)) return { pid: id, team: teamOf.get(id) || null };
        return null;
      });
    }
    const result = { key: `${pid}:${e.id}`, comp: comp.id, places, by: pid, ts: e.ts };
    results.set(comp.id, result);
    feed.push({ key: result.key, ts: e.ts, kind: 'pgpodium', pid, result });
  }
  // Podium places give bonus strokes to the team (or, without teams, to the player).
  for (const result of results.values()) {
    result.places.forEach((place, i) => {
      const n = cfg.compBonus[i];
      if (!place || !n) return;
      const target = place.team ? { team: place.team } : place.pid && !cfg.teams.length ? { p: place.pid } : null;
      if (target) adjustments.push({ key: `${result.key}#${i}`, kind: 'bon', ...target, n, why: `${compById.get(result.comp).name}: ${i + 1}.-plads`, comp: result.comp, by: result.by, ts: result.ts });
    });
  }

  // ---------------------------------------------------------------------------- players
  const pgPlayers = new Map();
  for (const p of players.values()) {
    const holes = {};
    let strokes = 0;
    let parPlayed = 0;
    let played = 0;
    let aces = 0;
    for (const h of cfg.course) {
      const sc = scores.get(`${p.pid}|${h.id}`);
      if (!sc) continue;
      holes[h.id] = sc;
      strokes += sc.s;
      parPlayed += h.par;
      played++;
      if (sc.s === 1 && h.par > 1) aces++;
    }
    const mine = adjustments.filter((a) => a.p === p.pid);
    const pen = mine.filter((a) => a.kind === 'pen').reduce((s, a) => s + a.n, 0);
    const bon = mine.filter((a) => a.kind === 'bon').reduce((s, a) => s + a.n, 0);
    const total = strokes + pen - bon;
    pgPlayers.set(p.pid, { pid: p.pid, team: teamOf.get(p.pid) || null, holes, strokes, pen, bon, total, toPar: total - parPlayed, parPlayed, played, aces, rank: 0 });
  }
  for (const [key, sc] of scores) {
    const [pid, h] = key.split('|');
    const hole = holeById.get(h);
    if (sc.s === 1 && hole.par > 1) feed.push({ key: `ace:${key}`, ts: sc.ts, kind: 'pgace', pid, h });
  }
  // Lowest score first; on a tie, whoever has played more holes (fewer strokes would just reward
  // being behind on the course).
  const individuals = [...pgPlayers.values()].sort(
    (a, b) => (b.played > 0) - (a.played > 0) || a.toPar - b.toPar || b.played - a.played || nameOf(players, a.pid).localeCompare(nameOf(players, b.pid), 'da'),
  );
  individuals.forEach((x, i) => (x.rank = x.played ? i + 1 : 0));

  // ------------------------------------------------------------------------------- teams
  const teams = cfg.teams.map((tm) => {
    const members = individuals.filter((x) => x.team === tm.id);
    // Members count once they have played a hole or got a penalty/bonus.
    const playing = members.filter((x) => x.played > 0 || x.pen || x.bon);
    const sumToPar = playing.reduce((s, x) => s + x.toPar, 0);
    const base = cfg.teamScore === 'avg' ? (playing.length ? sumToPar / playing.length : 0) : sumToPar;
    const own = adjustments.filter((a) => a.team === tm.id);
    const pen = own.filter((a) => a.kind === 'pen').reduce((s, a) => s + a.n, 0);
    const bon = own.filter((a) => a.kind === 'bon').reduce((s, a) => s + a.n, 0);
    const strokes = members.reduce((s, x) => s + x.total, 0);
    return { ...tm, members: members.map((x) => x.pid), playing: playing.length, pen, bon, score: base + pen - bon, strokes, played: Math.max(0, ...members.map((x) => x.played)), rank: 0 };
  });
  const teamRanking = [...teams].sort(
    (a, b) => (b.played > 0 || b.pen || b.bon ? 1 : 0) - (a.played > 0 || a.pen || a.bon ? 1 : 0) || a.score - b.score || b.played - a.played || a.name.localeCompare(b.name, 'da'),
  );
  teamRanking.forEach((tm, i) => (tm.rank = i + 1));

  // -------------------------------------------------------------------------- challenges
  const challenges = [];
  for (const { pid, e } of list('chal')) {
    if (!officialAt(pid, e.ts)) continue;
    const text = str(e.text, 160) || CHALLENGES[clampInt(e.c, 0, CHALLENGES.length - 1)];
    const key = `${pid}:${e.id}`;
    const winners = adjustments.filter((a) => a.src === key && a.kind === 'bon');
    challenges.push({ key, id: e.id, by: pid, text, ts: e.ts, winners });
    feed.push({ key, ts: e.ts, kind: 'pgchal', pid, text });
  }

  // ------------------------------------------------------------------------- this hole
  const hole = holeById.get(current);
  const done = [...players.values()].filter((p) => !p.left && scores.has(`${p.pid}|${current}`)).length;

  return {
    cfg,
    judge,
    isJudge: me === judge,
    isOfficial: !!me && (me === hostId || me === judge),
    holes: cfg.course.map((h) => holeById.get(h.id)),
    holeById,
    current: hole,
    progress: { done, of: [...players.values()].filter((p) => !p.left).length },
    par: cfg.course.reduce((s, h) => s + h.par, 0),
    teams: teamRanking,
    teamById: new Map(teamRanking.map((tm) => [tm.id, tm])),
    players: pgPlayers,
    individuals,
    me: pgPlayers.get(me) || null,
    myTeam: teamOf.get(me) ? teamById.get(teamOf.get(me)) : null,
    adjustments,
    results,
    comps: cfg.comps,
    photos,
    photoByKey,
    challenges,
    feed,
    now: t,
  };
}

function nameOf(players, pid) {
  return players.get(pid)?.name || '';
}
