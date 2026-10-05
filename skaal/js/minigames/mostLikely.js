import { html } from '../ui/kit.js';
import { pickFresh } from '../core/rng.js';
import { MOST_LIKELY } from '../game/content/prompts.js';
import { AnsweredCount, PlayerPicker, PenaltyList, tally, Spectating, nameOf } from './common.js';

export default {
  id: 'mostLikely',
  name: 'Mest tilbøjelig til…',
  emoji: '🤔',
  color: '#FF8A3D',
  tagline: 'Stem på hinanden — flest stemmer drikker',
  minPlayers: 3,
  weight: 1.2,
  duration: 35000,
  respond: 'last',

  setup({ rng, history }) {
    return { q: pickFresh(rng, MOST_LIKELY.length, history.map((p) => p.q)) };
  },

  resolve({ p, responses, eligible }) {
    const { counts, top } = tally(responses, eligible);
    const n = top.length === 1 ? 3 : 2;
    return {
      penalties: top.map((pid) => ({ pid, n, unit: 'sip' })),
      bonus: [],
      summary: { counts: [...counts].sort((a, b) => b[1] - a[1]) },
    };
  },

  Play({ inst, d, me, responses, mine, respond, canRespond }) {
    return html`<div class="mg">
      <div class="mg-card">
        <div class="mg-kicker">Hvem er mest tilbøjelig til at…</div>
        <div class="mg-q">${MOST_LIKELY[inst.p.q]}?</div>
      </div>
      ${canRespond
        ? html`<${PlayerPicker} d=${d} pids=${inst.eligible} selected=${mine?.v} onPick=${(pid) => respond(pid)} me=${me} />`
        : html`<${Spectating} />`}
      <${AnsweredCount} inst=${inst} responses=${responses} />
    </div>`;
  },

  Result({ inst, d, me, result }) {
    const counts = result.summary.counts;
    const max = counts[0]?.[1] || 1;
    return html`<div class="mg">
      <div class="mg-card mg-card--compact">
        <div class="mg-kicker">Mest tilbøjelig til at…</div>
        <div class="mg-q mg-q--sm">${MOST_LIKELY[inst.p.q]}?</div>
      </div>
      ${counts.length
        ? html`<div class="mg-bars">
            ${counts.map(
              ([pid, c]) => html`<div class="mg-bar">
                <span class="mg-bar__name">${pid === me ? 'Dig' : nameOf(d, pid)}</span>
                <span class="mg-bar__track"><span class="mg-bar__fill" style=${{ width: `${(c / max) * 100}%` }}></span></span>
                <span class="mg-bar__value">${c}</span>
              </div>`,
            )}
          </div>`
        : null}
      <${PenaltyList} d=${d} result=${result} me=${me} emptyText="Ingen stemte — I slipper denne gang." />
    </div>`;
  },
};
