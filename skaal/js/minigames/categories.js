import { html } from '../ui/kit.js';
import { pickFresh } from '../core/rng.js';
import { CATEGORIES } from '../game/content/prompts.js';
import { PlayerPicker, PenaltyList, tally, Spectating } from './common.js';

export default {
  id: 'categories',
  name: 'Kategorier',
  emoji: '🗂️',
  color: '#F6B73C',
  tagline: 'Sig et ord i kategorien på skift — første der går kold, taber',
  minPlayers: 3,
  weight: 0.7,
  duration: 75000,
  respond: 'last',

  setup({ rng, history }) {
    return { c: pickFresh(rng, CATEGORIES.length, history.map((p) => p.c)) };
  },

  resolve({ responses, eligible }) {
    const { top, counts } = tally(responses, eligible);
    return { penalties: top.map((pid) => ({ pid, n: 2, unit: 'sip' })), bonus: [], summary: { counts: [...counts] } };
  },

  Play({ inst, d, me, mine, respond, canRespond }) {
    return html`<div class="mg">
      <div class="mg-card mg-card--center">
        <div class="mg-kicker">Kategori</div>
        <div class="mg-q">${CATEGORIES[inst.p.c]}</div>
        <div class="mg-sub">Gå på skift rundt i kredsen og nævn noget i kategorien. Gentagelser eller tøven = tabt.</div>
      </div>
      ${canRespond
        ? html`<div class="mg-label">Hvem tabte? Stem herunder</div>
            <${PlayerPicker} d=${d} pids=${inst.eligible} selected=${mine?.v} onPick=${(pid) => respond(pid)} me=${me} />`
        : html`<${Spectating} />`}
    </div>`;
  },

  Result({ inst, d, me, result }) {
    return html`<div class="mg">
      <div class="mg-card mg-card--compact">
        <div class="mg-kicker">Kategori</div>
        <div class="mg-q mg-q--sm">${CATEGORIES[inst.p.c]}</div>
      </div>
      <${PenaltyList} d=${d} result=${result} me=${me} emptyText="Ingen blev stemt ud — alle klarede den!" />
    </div>`;
  },
};
