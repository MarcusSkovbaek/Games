import { html } from '../ui/kit.js';
import { pick } from '../core/rng.js';
import { drinkById } from '../game/drinks.js';
import { DrinkArt } from '../ui/drinkArt.js';

const MINUTES = 10;

export default {
  id: 'happyHour',
  name: 'Happy Hour',
  emoji: '⏰',
  color: '#3DDC97',
  tagline: 'En drik giver dobbelt point i 10 minutter',
  minPlayers: 2,
  weight: 0.6,
  duration: 7000,
  respond: null,

  setup({ rng, drinks }) {
    return { k: pick(rng, drinks.length ? drinks : ['beer']), mult: 2, mins: MINUTES };
  },

  resolve() {
    return { penalties: [], bonus: [], summary: {} };
  },

  // Scoring modifiers this instance creates (read by game/derive.js).
  modifiers(inst) {
    return [{ k: inst.p.k, mult: inst.p.mult, from: inst.playStart, to: inst.playStart + inst.p.mins * 60000 }];
  },

  Play({ inst }) {
    const drink = drinkById(inst.p.k);
    return html`<div class="mg">
      <div class="mg-card mg-card--center mg-hh">
        <div class="mg-hh__art"><${DrinkArt} id=${inst.p.k} size=${120} /></div>
        <div class="mg-kicker">De næste ${inst.p.mins} minutter giver</div>
        <div class="mg-q">${drink?.name || 'Drinks'}</div>
        <div class="mg-hh__mult">×${inst.p.mult} point</div>
      </div>
    </div>`;
  },

  Result({ inst }) {
    const drink = drinkById(inst.p.k);
    return html`<div class="mg">
      <div class="mg-card mg-card--center mg-hh">
        <div class="mg-hh__art"><${DrinkArt} id=${inst.p.k} size=${96} /></div>
        <div class="mg-q mg-q--md">Happy Hour: ${drink?.name || 'drinks'} ×${inst.p.mult}!</div>
        <p class="mg-note">Dobbelt point i ${inst.p.mins} minutter — se nedtællingen på forsiden.</p>
      </div>
    </div>`;
  },
};
