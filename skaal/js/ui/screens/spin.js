// Personal lucky-wheel flow: spin → reveal → (choose recipients / player / rule) → apply.
import { html, useState, useStore, useEffect, Button, IconButton, Avatar, Icon, cx } from '../kit.js';
import { Wheel } from '../wheel.js';
import { wheelById, activeOutcomes, outcomeNeeds, allocateSips } from '../../game/wheels.js';
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
    const { entries } = applySpin(room, d, offer, outcome, input);
    storage.remove(`spin:${offer.id}`);
    sfx.clink();
    const give = entries.find((e) => e.t === 'give');
    toast(
      give
        ? `🍻 Sendt! ${Object.entries(give.to).map(([pid, n]) => `${d.players.get(pid)?.name || '?'} ${n}`).join(' · ')}`
        : `${outcome.emoji} ${outcome.text}`,
      { tone: 'good', duration: 4000 },
    );
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
  const [picks, setPicks] = useState(() => new Map());
  const [target, setTarget] = useState(null);
  const [rule, setRule] = useState('');
  const total = outcome.effect.n || 0;
  const noOne = (need === 'distribute' || need === 'choosePlayer') && !others.length;
  const suggestions = shuffle(seededRandom(offer.id), RULES.map((_, i) => i)).slice(0, 3).map((i) => RULES[i]);

  let input = null;
  let ready = true;
  let body = null;
  if (noOne) {
    body = html`<p class="mg-note">Der er ingen andre aktive spillere lige nu — effekten springes over.</p>`;
  } else if (need === 'distribute') {
    const alloc = allocateSips(total, picks);
    ready = alloc.size > 0;
    input = { distribution: Object.fromEntries(alloc) };
    body = html`<${HandOut} d=${d} total=${total} others=${others} picks=${picks} alloc=${alloc} onChange=${setPicks} />`;
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
      ${need === 'distribute' && !noOne
        ? ready
          ? `Send ${sips(total)} afsted 🍻`
          : 'Vælg hvem der skal drikke'
        : need === 'choosePlayer' && !noOne
          ? 'Bekræft'
          : need === 'ruleText'
            ? 'Indfør reglen'
            : 'Fedt! 🎉'}
    <//>
  </div>`;
}

// Hand out sips: tap the players who must drink. Each tap is one sip; sips not tapped out yet
// are shared evenly among those picked, so ticking two players for 4 sips gives them 2 each.
function HandOut({ d, total, others, picks, alloc, onChange }) {
  const tapped = [...picks.values()].reduce((a, b) => a + b, 0);
  const [full, setFull] = useState(0); // bumps to replay the "all handed out" nudge
  const tap = (pid) => {
    if (tapped >= total) {
      setFull((x) => x + 1);
      haptic([8, 40, 8]);
      return;
    }
    const next = new Map(picks);
    next.set(pid, (next.get(pid) || 0) + 1);
    onChange(next);
    sfx.tick();
    haptic(8);
  };
  const untap = (pid) => {
    const next = new Map(picks);
    const n = (next.get(pid) || 0) - 1;
    if (n > 0) next.set(pid, n);
    else next.delete(pid);
    onChange(next);
  };
  const random = () => {
    const next = new Map();
    for (let i = 0; i < total; i++) {
      const pid = others[Math.floor(randomFloat() * others.length)];
      next.set(pid, (next.get(pid) || 0) + 1);
    }
    onChange(next);
    sfx.tick();
  };
  const summary = alloc.size
    ? [...alloc].map(([pid, n]) => `${d.players.get(pid)?.name} ${n}`).join(' · ')
    : `${sips(total)} at dele ud`;
  return html`<div class="handout">
    <div class="handout__head">
      <span class="mg-label">Hvem skal drikke?</span>
      <span class=${cx('handout__sum', alloc.size && 'is-set', full && 'is-nudge')} key=${full} aria-live="polite">${summary}</span>
    </div>
    <p class="handout__hint">
      ${tapped >= total && full ? 'Alle slurke er delt ud — tryk − for at flytte en.' : 'Tryk på dem, der skal drikke. Tryk igen for at give en af dem flere.'}
    </p>
    <div class="mg-grid handout__grid">
      ${others.map((pid) => {
        const p = d.players.get(pid);
        const n = alloc.get(pid) || 0;
        const picked = picks.has(pid);
        return html`<div class="handout__cell" key=${pid}>
          <button
            type="button"
            class=${cx('mg-pick', picked && 'is-selected')}
            aria-pressed=${picked}
            aria-label=${picked ? `${p.name}: ${sips(n)}. Tryk for at give en slurk mere` : `Giv ${p.name} slurke`}
            onClick=${() => tap(pid)}
          >
            <${Avatar} player=${p} size=${52} />
            <span class="mg-pick__name">${p.name}</span>
            ${picked ? html`<span class="handout__count" key=${n}>${n}</span>` : null}
          </button>
          ${picked
            ? html`<button type="button" class="handout__minus" aria-label=${`Én slurk mindre til ${p.name}`} onClick=${() => untap(pid)}>
                <${Icon} name="minus" size=${14} stroke=${3} />
              </button>`
            : null}
        </div>`;
      })}
    </div>
    <div class="handout__tools">
      <button type="button" class="btn btn--ghost btn--sm" onClick=${random}>🎲 Tilfældigt</button>
      ${picks.size ? html`<button type="button" class="btn btn--ghost btn--sm" onClick=${() => onChange(new Map())}>Nulstil</button>` : null}
    </div>
  </div>`;
}
