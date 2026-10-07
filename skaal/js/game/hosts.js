// Who is host, then and now. The host can hand the role over (say, on going home early); every
// handover is kept in the meta with its time (meta.hosts), so what an earlier host did while host
// — hiding a photo, starting a minigame, deciding a pub golf competition — keeps counting.
// meta.hostId is always the host right now.

// A new host's first moments count a little before the handover, for phones whose clock is behind.
const SKEW_MS = 120_000;

export function hostsOf(meta) {
  const hostId = typeof meta?.hostId === 'string' ? meta.hostId : '';
  const terms = (Array.isArray(meta?.hosts) ? meta.hosts : [])
    .filter((x) => x && typeof x.p === 'string')
    .map((x) => ({ p: x.p, from: Number(x.ts) || 0 }))
    .sort((a, b) => a.from - b.from);
  terms.forEach((x, i) => (x.to = i + 1 < terms.length ? terms[i + 1].from : Infinity));
  // Whether pid was host at ts (never handed over: the host is the one it always was).
  const hostAt = (pid, ts) => !!pid && (terms.length ? terms.some((x) => x.p === pid && ts >= x.from - (x.from ? SKEW_MS : 0) && ts < x.to) : pid === hostId);
  return { hostId, hostAt };
}

// The meta patch that hands the role to pid (the first handover also records the host before it).
export function handOver(meta, pid, at) {
  const terms = (Array.isArray(meta?.hosts) ? meta.hosts : []).filter((x) => x && typeof x.p === 'string').slice(-40);
  const before = terms.length ? terms : [{ p: meta.hostId, ts: 0 }];
  return { hostId: pid, hosts: [...before, { p: pid, ts: at }] };
}
