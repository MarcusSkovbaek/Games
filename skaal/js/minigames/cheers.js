import { html, Avatar, cx } from '../ui/kit.js';
import { pick, pickIndex } from '../core/rng.js';
import { TOASTS } from '../game/content/prompts.js';
import { sfx, haptic, confetti } from '../ui/feedback.js';
import { AnsweredCount, Spectating, playerOf } from './common.js';

export default {
  id: 'cheers',
  name: 'Skål-runde',
  emoji: '🥂',
  color: '#F7C04A',
  tagline: 'Alle skåler og tager en slurk sammen',
  minPlayers: 2,
  weight: 0.6,
  duration: 15000,
  respond: 'first',

  setup({ rng, players }) {
    return { pid: pick(rng, players), r: pickIndex(rng, TOASTS.length) };
  },

  // Everybody drinks one sip; tapping "Skål!" during the round counts as having done it.
  resolve({ responses, eligible }) {
    return {
      penalties: eligible.map((pid) => ({ pid, n: 1, unit: 'sip', done: responses.has(pid) })),
      bonus: [],
      summary: { cheered: eligible.filter((pid) => responses.has(pid)) },
    };
  },

  Play({ inst, d, me, responses, mine, respond, canRespond }) {
    const honoree = playerOf(d, inst.p.pid);
    return html`<div class="mg">
      <div class="mg-card mg-card--center">
        <${Avatar} player=${honoree} size=${84} ring />
        <div class="mg-kicker">Skål for</div>
        <div class="mg-q">${inst.p.pid === me ? 'dig' : honoree.name}</div>
        <div class="mg-sub">— for ${TOASTS[inst.p.r]}!</div>
      </div>
      ${canRespond
        ? html`<button
            type="button"
            class=${cx('mg-cheers-btn', mine && 'is-done')}
            disabled=${!!mine}
            onClick=${(e) => {
              respond(1);
              sfx.clink();
              haptic([10, 40, 10]);
              const r = e.currentTarget.getBoundingClientRect();
              confetti({ x: (r.left + r.width / 2) / innerWidth, y: r.top / innerHeight, count: 50 });
            }}
          >
            ${mine ? 'Skål! ✓' : 'SKÅL! 🥂'}
          </button>`
        : html`<${Spectating} />`}
      <${AnsweredCount} inst=${inst} responses=${responses} />
    </div>`;
  },

  Result({ inst, d, me, result }) {
    const honoree = playerOf(d, inst.p.pid);
    return html`<div class="mg">
      <div class="mg-card mg-card--center">
        <div class="mg-kicker">Der blev skålet for</div>
        <div class="mg-q">${inst.p.pid === me ? 'dig' : honoree.name} 🥂</div>
      </div>
      <div class="mg-innocent">
        <span>Skålede med:</span>
        <span class="avatar-stack">${result.summary.cheered.map((pid) => html`<${Avatar} player=${playerOf(d, pid)} size=${28} />`)}</span>
      </div>
      <p class="mg-note">Alle tager 1 slurk. Skål!</p>
    </div>`;
  },
};
