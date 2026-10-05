import { html, Avatar, cx } from '../ui/kit.js';
import { pick, pickFresh } from '../core/rng.js';
import { TRUTHS, DARES } from '../game/content/prompts.js';
import { PenaltyList, playerOf } from './common.js';

export default {
  id: 'truthDare',
  name: 'Sandhed eller konsekvens',
  emoji: '🎭',
  color: '#8B5CF6',
  tagline: 'Klar opgaven — eller drik 3 slurke',
  minPlayers: 2,
  weight: 0.8,
  duration: 45000,
  respond: 'first',

  setup({ rng, players, history }) {
    const kind = rng() < 0.5 ? 'truth' : 'dare';
    const list = kind === 'truth' ? TRUTHS : DARES;
    const used = history.filter((p) => p.kind === kind).map((p) => p.i);
    return { pid: pick(rng, players), kind, i: pickFresh(rng, list.length, used) };
  },

  responders(inst) {
    return inst.eligible.includes(inst.p.pid) ? [inst.p.pid] : [];
  },

  resolve({ p, responses }) {
    const done = responses.get(p.pid)?.v === 'done';
    return { penalties: done ? [] : [{ pid: p.pid, n: 3, unit: 'sip' }], bonus: [], summary: { done } };
  },

  Play({ inst, d, me, mine, respond }) {
    const p = playerOf(d, inst.p.pid);
    const isMe = inst.p.pid === me;
    const text = (inst.p.kind === 'truth' ? TRUTHS : DARES)[inst.p.i];
    return html`<div class="mg">
      <div class=${cx('mg-card mg-card--center mg-td', `mg-td--${inst.p.kind}`)}>
        <${Avatar} player=${p} size=${64} ring />
        <div class="mg-kicker">${isMe ? 'Din tur' : `${p.name}s tur`} · ${inst.p.kind === 'truth' ? 'Sandhed' : 'Konsekvens'}</div>
        <div class="mg-q mg-q--md">${text}</div>
      </div>
      ${isMe && inst.responders.includes(me)
        ? mine
          ? html`<p class="mg-note">${mine.v === 'done' ? 'Sejt klaret! 💪' : 'Så er det 3 slurke 🍻'}</p>`
          : html`<div class="mg-big-btns">
              <button type="button" class="mg-big-btn mg-big-btn--good" onClick=${() => respond('done')}><span class="mg-big-btn__emoji">💪</span>Klaret!</button>
              <button type="button" class="mg-big-btn" onClick=${() => respond('drink')}><span class="mg-big-btn__emoji">🍻</span>Drik 3 i stedet</button>
            </div>`
        : html`<p class="mg-note">Hold øje med ${p.name} — klarer de den?</p>`}
    </div>`;
  },

  Result({ inst, d, me, result }) {
    const p = playerOf(d, inst.p.pid);
    const who = inst.p.pid === me ? 'Du' : p.name;
    return html`<div class="mg">
      <div class="mg-card mg-card--center">
        <${Avatar} player=${p} size=${64} ring />
        <div class="mg-q mg-q--md">${result.summary.done ? `${who} klarede den! 💪` : `${who} drikker i stedet 🍻`}</div>
      </div>
      <${PenaltyList} d=${d} result=${result} me=${me} emptyText="Ingen straf — godt gået!" />
    </div>`;
  },
};
