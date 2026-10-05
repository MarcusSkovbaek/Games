import { html, cx, Avatar } from '../ui/kit.js';
import { pickFresh } from '../core/rng.js';
import { NEVER_HAVE } from '../game/content/prompts.js';
import { AnsweredCount, PenaltyList, Spectating, playerOf } from './common.js';

export default {
  id: 'neverHave',
  name: 'Jeg har aldrig…',
  emoji: '🙈',
  color: '#FF4F8B',
  tagline: 'Har du prøvet det? Så drikker du',
  minPlayers: 2,
  weight: 1.2,
  duration: 25000,
  respond: 'last',

  setup({ rng, history }) {
    return { s: pickFresh(rng, NEVER_HAVE.length, history.map((p) => p.s)) };
  },

  resolve({ responses, eligible }) {
    const guilty = eligible.filter((pid) => responses.get(pid)?.v === 1);
    return {
      penalties: guilty.map((pid) => ({ pid, n: 1, unit: 'sip' })),
      bonus: [],
      summary: { guilty, innocent: eligible.filter((pid) => responses.get(pid)?.v === 0) },
    };
  },

  Play({ inst, responses, mine, respond, canRespond }) {
    return html`<div class="mg">
      <div class="mg-card">
        <div class="mg-kicker">Jeg har aldrig…</div>
        <div class="mg-q">${NEVER_HAVE[inst.p.s]}</div>
      </div>
      ${canRespond
        ? html`<div class="mg-big-btns">
            <button type="button" class=${cx('mg-big-btn mg-big-btn--hot', mine?.v === 1 && 'is-selected')} onClick=${() => respond(1)}>
              <span class="mg-big-btn__emoji">🍻</span>Det har jeg!
            </button>
            <button type="button" class=${cx('mg-big-btn', mine?.v === 0 && 'is-selected')} onClick=${() => respond(0)}>
              <span class="mg-big-btn__emoji">😇</span>Aldrig
            </button>
          </div>`
        : html`<${Spectating} />`}
      <${AnsweredCount} inst=${inst} responses=${responses} />
    </div>`;
  },

  Result({ inst, d, me, result }) {
    const { innocent } = result.summary;
    return html`<div class="mg">
      <div class="mg-card mg-card--compact">
        <div class="mg-kicker">Jeg har aldrig…</div>
        <div class="mg-q mg-q--sm">${NEVER_HAVE[inst.p.s]}</div>
      </div>
      <${PenaltyList} d=${d} result=${result} me=${me} emptyText="Ingen har prøvet det — I er alt for uskyldige 😇" />
      ${innocent.length
        ? html`<div class="mg-innocent">
            <span>Uskyldige:</span>
            <span class="avatar-stack">${innocent.map((pid) => html`<${Avatar} player=${playerOf(d, pid)} size=${28} />`)}</span>
          </div>`
        : null}
    </div>`;
  },
};
