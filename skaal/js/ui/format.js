// Danish formatting helpers.

export function fmtPoints(n) {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}

export function fmtDecimal(n, digits = 1) {
  return (Number(n) || 0).toFixed(digits).replace('.', ',');
}

export function plural(n, one, many) {
  return `${fmtPoints(n)} ${Math.abs(n) === 1 ? one : many}`;
}

export const sips = (n) => plural(n, 'slurk', 'slurke');

// Number and word apart, for big "2 slurke" displays.
export function amountParts(n, unit = 'sip') {
  if (unit === 'shot') return [fmtPoints(n), n === 1 ? 'shot' : 'shots'];
  if (unit === 'drink') return [fmtPoints(n), n === 1 ? 'drink' : 'drinks'];
  return [fmtPoints(n), Math.abs(n) === 1 ? 'slurk' : 'slurke'];
}

export function unitText(n, unit = 'sip') {
  if (unit === 'shot') return n === 1 ? 'et shot' : `${n} shots`;
  if (unit === 'drink') return n === 1 ? 'en drink' : `${n} drinks`;
  return sips(n);
}

export function fmtClock(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtAgo(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'lige nu';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min siden`;
  const h = Math.floor(m / 60);
  if (h < 6) return `${h} t ${m % 60 ? `${m % 60} min ` : ''}siden`;
  return `kl. ${fmtClock(ts)}`;
}

export function fmtDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtSince(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} t ${m % 60} min`;
}

export function rankLabel(rank) {
  return `${rank}.`;
}
