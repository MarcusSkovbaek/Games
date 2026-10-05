// Personal lucky-wheel flow: spin → reveal → (choose recipients / player / rule) → apply.
import { html, useState, useStore, useEffect, Button, IconButton, Avatar, Stepper, cx } from '../kit.js';
import { Wheel } from '../wheel.js';
import { wheelById, activeOutcomes, outcomeNeeds } from '../../game/wheels.js';
import { RULES } from '../../game/content/prompts.js';
import { applySpin } from '../../app/actions.js';
import { pickWeighted, seededRandom, shuffle } from '../../core/rng.js';
import { randomFloat } from '../../core/ids.js';
import * as storage from '../../core/storage.js';
import { sfx, haptic, confetti } from '../feedback.js';
import { toast, clearToasts } from '../ui-store.js';
import { PlayerPicker } from '../../minigames/common.js';
import { sips } from '../format.js';
import { eventUi } from './event.js';

export function SpinOverlay({ room, d }) {
  const ui = useStore(eventUi);
  const offer = ui.spin ? d.offers.find((o) => o.id === ui.spin) : null;
  useEffect(() => {
    if (ui.spin && !offer) eventUi.set({ spin: null });
  }, [ui.spin, !!offer]);
  if (!offer) return null;
  return html`<${SpinFlow} key=${offer.id} room=${room} d=${d} offer=${offer} onClose=${() => eventUi.set({ spin: null })} />`;
}

function SpinFlow({ room, d, offer, onClose }) {
  const wheel = wheelById(offer.w);
  const outcomes = activeOutcomes(wheel, { bonusEnabled: d.settings.bonus });
  const stored = storage.load(`spin:${offer.id}`);
  const [phase, setPhase] = useState(stored ? 'reveal' : 'ready');
  const [outcomeId, setOutcomeId] = useState(stored?.oc || null);
  const [spunHere, setSpunHere] = useState(false); // keep the wheel on screen after spinning
  const outcome = outcomes.find((o) => o.id === outcomeId) || null;
  const others = d.ranking.filter((p) => !p.isMe && !p.left && !p.paused).map((p) => p.pid);

  useEffect(() => {
    clearToasts();
    document.documentElement.classList.add('scroll-locked');
    return () => document.documentElement.classList.remove('scroll-locked');
  }, []);

  const spin = () => {
    const o = pickWeighted(randomFloat, outcomes);
    storage.save(`spin:${offer.id}`, { oc: o.id }); // the result sticks even if the app is closed
    setOutcomeId(o.id);
    setSpunHere(true);
    setPhase('spinning');
    sfx.whoosh();
    haptic(20);
  };

  const onStopped = () => {
    setPhase('reveal');
    const bad = outcome?.effect.type === 'self';
    if (bad) sfx.fail();
    else {
      sfx.win();
      confetti({ count: 110, colors: [wheel.colors[0], '#FFFFFF', '#FFE08F', '#FF4F8B'] });
    }
  };

  const apply = (input) => {
    applySpin(room, d, offer, outcome, input);
    storage.remove(`spin:${offer.id}`);
    sfx.clink();
    toast(`${outcome.emoji} ${outcome.text}`, { tone: 'good', duration: 4000 });
    onClose();
  };

  return html`<div class="overlay" style=${{ '--c': wheel.colors[0] }} role="dialog" aria-modal="true" aria-label=${wheel.name}>
    <div class="overlay__inner">
      <div class="overlay__head">
        <div class="overlay__titles">
          <div class="overlay__kicker">${wheel.why}</div>
          <div class="overlay__title">${wheel.emoji} ${wheel.name}</div>
        </div>
        ${phase !== 'spinning' ? html`<${IconButton} icon="x" label="Senere" onClick=${onClose} />` : null}
      </div>
      <div class="overlay__body stack stack--l">
        ${spunHere || phase !== 'reveal'
          ? html`<${Wheel}
              wheelId=${wheel.id}
              emoji=${wheel.emoji}
              outcomes=${outcomes}
              target=${phase === 'ready' ? null : outcomes.indexOf(outcome)}
              onDone=${onStopped}
              small=${phase === 'reveal'}
            />`
          : null}
        ${phase === 'reveal' && outcome
          ? html`<${Reveal} d=${d} outcome=${outcome} others=${others} offer=${offer} onApply=${apply} />`
          : html`<${Button} size="lg" block disabled=${phase === 'spinning'} onClick=${spin}>
              ${phase === 'spinning' ? 'Held og lykke…' : 'SPIN HJULET!'}
            <//>`}
      </div>
    </div>
  </div>`;
}

function Reveal({ d, outcome, others, offer, onApply }) {
  const need = outcomeNeeds(outcome);
  const [dist, setDist] = useState({});
  const [target, setTarget] = useState(null);
  const [rule, setRule] = useState('');
  const total = outcome.effect.n || 0;
  const used = Object.values(dist).reduce((a, b) => a + b, 0);
  const noOne = (need === 'distribute' || need === 'choosePlayer') && !others.length;
  const suggestions = shuffle(seededRandom(offer.id), RULES.map((_, i) => i)).slice(0, 3).map((i) => RULES[i]);

  let input = null;
  let ready = true;
  let body = null;
  if (noOne) {
    body = html`<p class="mg-note">Der er ingen andre aktive spillere lige nu — effekten springes over.</p>`;
  } else if (need === 'distribute') {
    ready = used === total;
    input = { distribution: dist };
    body = html`<div class="stack stack--s">
      <div class="row" style=${{ justifyContent: 'space-between' }}>
        <span class="mg-label">Fordel ${sips(total)}</span>
        <span class="distribute__left">${total - used} tilbage</span>
      </div>
      <div class="distribute">
        ${others.map((pid) => {
          const p = d.players.get(pid);
          const n = dist[pid] || 0;
          return html`<div class="distribute__row">
            <${Avatar} player=${p} size=${36} />
            <span class="distribute__name">${p.name}</span>
            <${Stepper}
              value=${n}
              steps=${Array.from({ length: Math.min(total, n + total - used) + 1 }, (_, i) => i)}
              onChange=${(v) => setDist((s) => ({ ...s, [pid]: v }))}
            />
          </div>`;
        })}
      </div>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        onClick=${() => {
          const next = {};
          for (let i = 0; i < total; i++) {
            const pid = others[Math.floor(randomFloat() * others.length)];
            next[pid] = (next[pid] || 0) + 1;
          }
          setDist(next);
        }}
      >🎲 Fordel tilfældigt</button>
    </div>`;
  } else if (need === 'choosePlayer') {
    ready = !!target;
    input = { target };
    body = html`<div class="stack stack--s">
      <span class="mg-label">${outcome.effect.type === 'owe' ? 'Hvem skylder dig en drink?' : 'Hvem skal tage det?'}</span>
      <${PlayerPicker} d=${d} pids=${others} selected=${target} onPick=${setTarget} me=${d.me} />
    </div>`;
  } else if (need === 'ruleText') {
    ready = rule.trim().length > 2;
    input = { rule };
    body = html`<div class="stack stack--s">
      <span class="mg-label">Vælg eller skriv din regel</span>
      <div class="rule-suggestions">
        ${suggestions.map(
          (r) => html`<button type="button" class=${cx('rule-suggestion', rule === r && 'is-active')} onClick=${() => setRule(r)}>${r}</button>`,
        )}
      </div>
      <textarea class="input" maxlength="140" placeholder="Eller skriv din egen…" value=${rule} onInput=${(e) => setRule(e.currentTarget.value)}></textarea>
    </div>`;
  }

  return html`<div class="stack stack--l">
    <div class="outcome">
      <div class="outcome__emoji">${outcome.emoji}</div>
      <div class="outcome__title">${outcome.text}</div>
    </div>
    ${body}
    <${Button} size="lg" block disabled=${!ready} onClick=${() => onApply(noOne ? null : input)}>
      ${need === 'distribute' && !noOne ? 'Del slurkene ud' : need === 'choosePlayer' && !noOne ? 'Bekræft' : need === 'ruleText' ? 'Indfør reglen' : 'Fedt! 🎉'}
    <//>
  </div>`;
}
