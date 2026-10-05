import { html } from '../ui/kit.js';
import { pickFresh } from '../core/rng.js';
import { RULES } from '../game/content/prompts.js';

const MINUTES = 15;

export default {
  id: 'ruleCard',
  name: 'Ny regel',
  emoji: '📜',
  color: '#B47CFF',
  tagline: 'En ny regel gælder de næste 15 minutter',
  minPlayers: 2,
  weight: 0.6,
  duration: 9000,
  respond: null,

  setup({ rng, history }) {
    return { r: pickFresh(rng, RULES.length, history.map((p) => p.r)), mins: MINUTES };
  },

  resolve() {
    return { penalties: [], bonus: [], summary: {} };
  },

  // Active table rules this instance creates (read by game/derive.js).
  rules(inst) {
    return [{ text: RULES[inst.p.r], from: inst.playStart, to: inst.playStart + inst.p.mins * 60000 }];
  },

  Play({ inst }) {
    return html`<div class="mg">
      <div class="mg-card mg-card--rule">
        <div class="mg-kicker">Ny regel · ${inst.p.mins} min</div>
        <div class="mg-q mg-q--md">${RULES[inst.p.r]}</div>
      </div>
    </div>`;
  },

  Result({ inst }) {
    return html`<div class="mg">
      <div class="mg-card mg-card--rule">
        <div class="mg-kicker">Regel i kraft · ${inst.p.mins} min</div>
        <div class="mg-q mg-q--md">${RULES[inst.p.r]}</div>
      </div>
      <p class="mg-note">Reglen vises øverst på forsiden, så længe den gælder.</p>
    </div>`;
  },
};
