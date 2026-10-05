// Challenges ("underholdning undervejs"): the judge draws one, it pops up on every phone, and the
// winning team (or player) gets strokes off.
import { html, useState, Sheet, Button, Stepper, cx } from '../kit.js';
import { CHALLENGES } from '../../game/pubgolf.js';
import { drawChallenge, adjustScore } from '../../app/actions.js';
import { randomFloat } from '../../core/ids.js';
import { toast } from '../ui-store.js';
import { sfx } from '../feedback.js';
import { TeamChip } from './common.js';

export function ChallengeSheet({ room, d, open, onClose }) {
  const used = new Set(d.pg.challenges.map((c) => c.text));
  const pickIndex = () => {
    const fresh = CHALLENGES.map((_, i) => i).filter((i) => !used.has(CHALLENGES[i]));
    const pool = fresh.length ? fresh : CHALLENGES.map((_, i) => i);
    return pool[Math.floor(randomFloat() * pool.length)];
  };
  const [index, setIndex] = useState(pickIndex);
  const [own, setOwn] = useState('');
  const start = () => {
    drawChallenge(room, own.trim() ? { text: own } : { c: index });
    sfx.whoosh();
    toast('Udfordringen er sendt til alle 🎲', { tone: 'good' });
    setOwn('');
    setIndex(pickIndex());
    onClose();
  };
  return html`<${Sheet}
    open=${open}
    onClose=${onClose}
    title="Ny udfordring"
    subtitle="Den popper op på alles telefoner. Bagefter kårer du vinderen."
    footer=${html`<${Button} block icon="zap" onClick=${start}>Send til alle<//>`}
  >
    <div class="stack">
      <div class="chal-card">
        <span class="chal-card__icon" aria-hidden="true">🎲</span>
        <p class="chal-card__text">${own.trim() || CHALLENGES[index]}</p>
      </div>
      <${Button} variant="secondary" icon="refresh-cw" onClick=${() => setIndex(pickIndex())}>En anden<//>
      <label class="field">
        <span class="field__label">Eller skriv din egen</span>
        <textarea class="input" maxlength="160" placeholder="Fx Hvilket hold kan først …" value=${own} onInput=${(e) => setOwn(e.currentTarget.value)}></textarea>
      </label>
    </div>
  <//>`;
}

// Judge: crown the winner of a challenge (strokes off for the winning team or player).
export function CrownWinner({ room, d, challenge, onDone }) {
  const pg = d.pg;
  const [n, setN] = useState(1);
  const teams = pg.cfg.teams.map((t) => pg.teamById.get(t.id));
  const solo = !teams.length;
  const give = (target) => {
    adjustScore(room, 'bon', { ...target, n, why: 'Vandt udfordringen', src: challenge.key, h: pg.current.id });
    sfx.win();
    toast(`🏅 ${target.team ? pg.teamById.get(target.team).name : d.players.get(target.p)?.name} får ${n} slag i bonus`, { tone: 'good' });
    onDone?.();
  };
  return html`<div class="crown-pick">
    <div class="crown-pick__head">
      <span class="mg-label">Kår vinderen</span>
      <${Stepper} value=${n} steps=${[1, 2, 3]} format=${(v) => `−${v} slag`} onChange=${setN} />
    </div>
    <div class=${cx('crown-pick__list', solo && 'crown-pick__list--players')}>
      ${solo
        ? d.ranking.filter((p) => !p.left).map((p) => html`<button type="button" class="chip" onClick=${() => give({ p: p.pid })}>${p.name}</button>`)
        : teams.map((tm) => html`<${TeamChip} team=${tm} onClick=${() => give({ team: tm.id })} />`)}
    </div>
  </div>`;
}
