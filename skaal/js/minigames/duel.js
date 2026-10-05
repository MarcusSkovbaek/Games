import { html, Avatar, cx } from '../ui/kit.js';
import { shuffle } from '../core/rng.js';
import { PenaltyList, playerOf } from './common.js';

const HANDS = [
  { v: 'r', emoji: '✊', name: 'Sten' },
  { v: 's', emoji: '✌️', name: 'Saks' },
  { v: 'p', emoji: '✋', name: 'Papir' },
];
const BEATS = { r: 's', s: 'p', p: 'r' };
const hand = (v) => HANDS.find((h) => h.v === v);

export default {
  id: 'duel',
  name: 'Duel',
  emoji: '⚔️',
  color: '#FF4F8B',
  tagline: 'Sten, saks, papir — taberen drikker 3',
  minPlayers: 2,
  weight: 1,
  duration: 20000,
  respond: 'first',

  setup({ rng, players }) {
    const [a, b] = shuffle(rng, players);
    return { a, b };
  },

  responders(inst) {
    return [inst.p.a, inst.p.b].filter((pid) => inst.eligible.includes(pid));
  },

  resolve({ p, responses }) {
    const va = HANDS.some((h) => h.v === responses.get(p.a)?.v) ? responses.get(p.a).v : null;
    const vb = HANDS.some((h) => h.v === responses.get(p.b)?.v) ? responses.get(p.b).v : null;
    let penalties;
    let outcome;
    if (va && vb) {
      if (va === vb) {
        outcome = 'tie';
        penalties = [p.a, p.b].map((pid) => ({ pid, n: 1, unit: 'sip' }));
      } else {
        const loser = BEATS[va] === vb ? p.b : p.a;
        outcome = loser === p.a ? 'b' : 'a';
        penalties = [{ pid: loser, n: 3, unit: 'sip' }];
      }
    } else if (va || vb) {
      outcome = va ? 'a' : 'b';
      penalties = [{ pid: va ? p.b : p.a, n: 3, unit: 'sip' }];
    } else {
      outcome = 'none';
      penalties = [p.a, p.b].map((pid) => ({ pid, n: 1, unit: 'sip' }));
    }
    return { penalties, bonus: [], summary: { va, vb, outcome } };
  },

  Play({ inst, d, me, responses, mine, respond }) {
    const isDuelist = me === inst.p.a || me === inst.p.b;
    const ready = (pid) => responses.has(pid);
    return html`<div class="mg">
      <${Versus} d=${d} me=${me} a=${inst.p.a} b=${inst.p.b} ready=${ready} />
      ${isDuelist && inst.responders.includes(me)
        ? mine
          ? html`<p class="mg-note">Du valgte ${hand(mine.v)?.emoji} ${hand(mine.v)?.name} — venter på modstanderen…</p>`
          : html`<div class="mg-rps">
              ${HANDS.map(
                (h) => html`<button type="button" class="mg-rps__btn" onClick=${() => respond(h.v)}>
                  <span>${h.emoji}</span>${h.name}
                </button>`,
              )}
            </div>`
        : html`<p class="mg-note">Hep på din favorit! Taberen drikker 3 slurke.</p>`}
    </div>`;
  },

  Result({ inst, d, me, result }) {
    const { va, vb, outcome } = result.summary;
    const text = {
      tie: 'Uafgjort! Begge drikker 1 slurk.',
      none: 'Ingen af dem valgte — begge drikker 1 slurk.',
      a: `${inst.p.a === me ? 'Du' : playerOf(d, inst.p.a).name} vinder duellen!`,
      b: `${inst.p.b === me ? 'Du' : playerOf(d, inst.p.b).name} vinder duellen!`,
    }[outcome];
    return html`<div class="mg">
      <${Versus} d=${d} me=${me} a=${inst.p.a} b=${inst.p.b} handA=${va} handB=${vb} winner=${outcome} />
      <p class="mg-note mg-note--strong">${text}</p>
      <${PenaltyList} d=${d} result=${result} me=${me} />
    </div>`;
  },
};

function Versus({ d, me, a, b, ready, handA, handB, winner }) {
  const side = (pid, h, key) => {
    const p = playerOf(d, pid);
    return html`<div class=${cx('mg-vs__side', winner === key && 'is-winner', winner && winner !== key && winner !== 'tie' && winner !== 'none' && 'is-loser')}>
      <${Avatar} player=${p} size=${76} ring />
      <span class="mg-vs__name">${pid === me ? 'Dig' : p.name}</span>
      ${h ? html`<span class="mg-vs__hand">${hand(h)?.emoji}</span>` : ready ? html`<span class="mg-vs__status">${ready(pid) ? 'Klar ✓' : 'Vælger…'}</span>` : html`<span class="mg-vs__hand">❔</span>`}
    </div>`;
  };
  return html`<div class="mg-vs">${side(a, handA, 'a')}<span class="mg-vs__x">VS</span>${side(b, handB, 'b')}</div>`;
}
