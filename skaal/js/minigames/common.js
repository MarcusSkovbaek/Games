// Building blocks shared by the minigame views.
import { html, Avatar, Icon, cx } from '../ui/kit.js';
import { unitText } from '../ui/format.js';

export function nameOf(d, pid) {
  return d.players.get(pid)?.name || 'Ukendt';
}

export function playerOf(d, pid) {
  return d.players.get(pid) || { pid, name: 'Ukendt' };
}

export function AnsweredCount({ inst, responses }) {
  const total = inst.responders.length;
  const done = inst.responders.filter((pid) => responses.has(pid)).length;
  return html`<div class="mg-count" aria-live="polite">
    <span class="mg-count__bar"><span style=${{ width: `${total ? (done / total) * 100 : 0}%` }}></span></span>
    <span>${done} af ${total} har svaret</span>
  </div>`;
}

// Grid of players to pick from (votes, losers …).
export function PlayerPicker({ d, pids, selected, onPick, disabled, counts, me }) {
  return html`<div class="mg-grid">
    ${pids.map((pid) => {
      const p = playerOf(d, pid);
      const isSel = selected === pid;
      return html`<button
        type="button"
        class=${cx('mg-pick', isSel && 'is-selected')}
        disabled=${disabled}
        aria-pressed=${isSel}
        onClick=${() => onPick(pid)}
      >
        <${Avatar} player=${p} size=${52} />
        <span class="mg-pick__name">${pid === me ? 'Mig' : p.name}</span>
        ${counts && counts.get(pid) ? html`<span class="mg-pick__count">${counts.get(pid)}</span>` : null}
        ${isSel ? html`<span class="mg-pick__check"><${Icon} name="check" size=${14} stroke=${3} /></span>` : null}
      </button>`;
    })}
  </div>`;
}

export function PenaltyChip({ n, unit = 'sip' }) {
  return html`<span class="mg-verdict"><span aria-hidden="true">🍻</span> ${unitText(n, unit)}</span>`;
}

export function PenaltyList({ d, result, me, emptyText = 'Ingen skal drikke denne gang 😇' }) {
  const list = result?.penalties || [];
  const bonus = result?.bonus || [];
  if (!list.length && !bonus.length) return html`<p class="mg-empty">${emptyText}</p>`;
  return html`<div class="mg-penalties">
    ${list.map(
      (pen) => html`<div class=${cx('mg-row', pen.pid === me && 'is-me')}>
        <${Avatar} player=${playerOf(d, pen.pid)} size=${36} />
        <span class="mg-row__name">${pen.pid === me ? 'Dig' : nameOf(d, pen.pid)}</span>
        <span class="mg-row__value">drikker</span>
        <${PenaltyChip} n=${pen.n} unit=${pen.unit} />
      </div>`,
    )}
    ${bonus.map(
      (b) => html`<div class=${cx('mg-row', b.pid === me && 'is-me-good')}>
        <${Avatar} player=${playerOf(d, b.pid)} size=${36} />
        <span class="mg-row__name">${b.pid === me ? 'Dig' : nameOf(d, b.pid)}</span>
        <span class="mg-row__value"></span>
        <span class="mg-verdict mg-verdict--good">⭐ +${b.n} point</span>
      </div>`,
    )}
  </div>`;
}

// Picks the most-voted pids from a Map(voter -> votedPid).
export function tally(responses, allowed) {
  const counts = new Map();
  for (const [, r] of responses) {
    if (!allowed.includes(r.v)) continue;
    counts.set(r.v, (counts.get(r.v) || 0) + 1);
  }
  let max = 0;
  for (const c of counts.values()) max = Math.max(max, c);
  const top = max ? [...counts].filter(([, c]) => c === max).map(([pid]) => pid) : [];
  return { counts, max, top };
}

export function Spectating({ text = 'Du ser med i denne runde' }) {
  return html`<div class="mg-spectate"><${Icon} name="eye" size=${16} /> ${text}</div>`;
}
