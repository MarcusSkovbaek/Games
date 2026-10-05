// Small building blocks shared by the pub golf screens.
import { html, cx, Avatar } from '../kit.js';
import { fmtToPar } from '../../game/pubgolf.js';

export const holeTitle = (hole) => hole?.bar || `Hul ${hole?.n ?? ''}`;

export function mapsLink(hole) {
  const q = [hole.bar, hole.addr].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

// Score relative to par, coloured: under par is good (green), over par is not.
export function ToPar({ n, class: className, played = true }) {
  if (!played) return html`<span class=${cx('topar is-none', className)}>–</span>`;
  const tone = n < 0 ? 'is-under' : n > 0 ? 'is-over' : 'is-even';
  return html`<span class=${cx('topar', tone, className)}>${fmtToPar(n)}</span>`;
}

export function TeamBadge({ team, size = 36 }) {
  if (!team) return null;
  return html`<span class="team-badge" style=${{ '--tc': team.color, '--tb': `${size}px` }} aria-hidden="true">${teamInitial(team)}</span>`;
}

export function TeamChip({ team, active, onClick, disabled, children }) {
  const content = html`<span class="team-chip__dot" style=${{ background: team.color }}></span><span>${children ?? team.name}</span>`;
  return onClick
    ? html`<button type="button" class=${cx('team-chip', active && 'is-active')} style=${{ '--tc': team.color }} aria-pressed=${!!active} disabled=${disabled} onClick=${onClick}>${content}</button>`
    : html`<span class=${cx('team-chip', active && 'is-active')} style=${{ '--tc': team.color }}>${content}</span>`;
}

function teamInitial(team) {
  const word = team.name.replace(/^hold\s+/i, '');
  return ([...word][0] || '?').toUpperCase();
}

// A player's avatar with their team's colour as the ring.
export function PlayerAvatar({ d, pid, size = 40, online }) {
  const p = d.players.get(pid);
  const team = d.pg.teamById.get(d.pg.players.get(pid)?.team);
  return html`<span class="pg-avatar" style=${{ '--tc': team?.color || 'transparent' }}><${Avatar} player=${p} size=${size} online=${online} /></span>`;
}

export const MEDALS = ['🥇', '🥈', '🥉'];

// Who an entrant is: a team, or a player (events without teams).
export function entrantName(d, place) {
  if (!place) return '';
  if (place.team) return d.pg.teamById.get(place.team)?.name || 'Hold';
  return d.players.get(place.pid)?.name || 'Nogen';
}

export function entrantColor(d, place) {
  return (place?.team && d.pg.teamById.get(place.team)?.color) || d.players.get(place?.pid)?.color || 'var(--gold)';
}
