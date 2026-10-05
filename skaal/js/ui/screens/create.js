import { html, useState, Button, IconButton, Icon, Chips, Switch, Stepper, cx } from '../kit.js';
import { DrinkArt } from '../drinkArt.js';
import { DRINKS, POINT_STEPS } from '../../game/drinks.js';
import { defaultSettings, normalizeSettings, withSchedule, BREAKER_OPTIONS } from '../../game/settings.js';
import { randomCode, randomId } from '../../core/ids.js';
import { now } from '../../core/clock.js';
import { openEvent, rememberEvent } from '../../app/session.js';
import { fmtPoints } from '../format.js';
import { navigate } from '../router.js';
import { toast } from '../ui-store.js';

const NAME_IDEAS = ['Fredagsbar 🍻', 'Sommerfesten', 'Julefrokost', 'Bytur', 'Fødselsdag', 'Forfest'];

export function breakerLabel(min) {
  if (!min) return 'Fra';
  return min === 60 ? 'Hver time' : `Hver ${min}. min`;
}

export function DrinkSettings({ settings, onChange }) {
  const set = (id, patch) => onChange({ drinks: { ...settings.drinks, [id]: { ...settings.drinks[id], ...patch } } });
  return html`<div class="drink-toggle-list">
    ${DRINKS.map((d) => {
      const s = settings.drinks[d.id];
      return html`<div class="drink-toggle">
        <button type="button" class=${cx('check-btn', s.on && 'is-on')} aria-pressed=${s.on} aria-label=${`${d.name} ${s.on ? 'til' : 'fra'}`} onClick=${() => set(d.id, { on: !s.on })}>
          <${Icon} name="check" size=${16} stroke=${3} />
        </button>
        <span class="drink-toggle__art"><${DrinkArt} id=${d.id} size=${38} /></span>
        <span class="drink-toggle__name">${d.name}<small>${d.alcoholic ? 'Point pr. stk.' : 'Tæller ikke point'}</small></span>
        ${d.alcoholic
          ? html`<${Stepper} value=${s.pts} steps=${POINT_STEPS} format=${fmtPoints} onChange=${(pts) => set(d.id, { pts })} />`
          : null}
      </div>`;
    })}
  </div>`;
}

export function Create() {
  const [name, setName] = useState('');
  const [settings, setSettings] = useState(defaultSettings());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const update = (patch) => setSettings((s) => normalizeSettings({ ...s, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError('Giv eventet et navn.');
      return;
    }
    if (!settings.drinks || !DRINKS.some((d) => d.alcoholic && settings.drinks[d.id].on)) {
      setError('Slå mindst én drik til.');
      return;
    }
    setBusy(true);
    try {
      const code = randomCode();
      rememberEvent(code, { pid: randomId(12), name: clean, host: true });
      const room = await openEvent(code);
      const t = now();
      room.setMeta({
        name: clean,
        hostId: room.pid,
        createdAt: t,
        startedAt: t,
        ended: 0,
        removed: [],
        settings,
        sched: withSchedule([], settings, t),
      });
      navigate(`/e/${code}`);
    } catch (err) {
      console.error(err);
      toast('Eventet kunne ikke oprettes. Prøv igen.', { icon: '⚠️', tone: 'bad' });
      setBusy(false);
    }
  };

  return html`<main class="page view-enter">
    <div class="flow-head">
      <${IconButton} icon="chevron-left" label="Tilbage" onClick=${() => navigate('/')} />
      <span class="flow-head__title">Nyt event</span>
    </div>
    <h1 class="flow-title">Lad festen begynde</h1>
    <p class="flow-sub">Du bliver vært og kan altid ændre indstillingerne senere.</p>

    <form class="stack stack--l" onSubmit=${submit} novalidate>
      <label class="field">
        <span class="field__label">Eventets navn</span>
        <input
          class="input"
          type="text"
          maxlength="48"
          placeholder="Fx Fredagsbar hos Mads"
          value=${name}
          onInput=${(e) => setName(e.currentTarget.value)}
        />
        <div class="chips chips--scroll" style=${{ marginTop: '4px' }}>
          ${NAME_IDEAS.map((idea) => html`<button type="button" class="chip" onClick=${() => setName(idea)}>${idea}</button>`)}
        </div>
      </label>

      <div class="field">
        <span class="field__label">Breakers (minigames for alle)</span>
        <${Chips}
          options=${BREAKER_OPTIONS.filter((m) => m !== 45).map((m) => ({ value: m, label: breakerLabel(m) }))}
          value=${settings.breakerMin}
          onChange=${(breakerMin) => update({ breakerMin })}
        />
        <span class="field__hint">Et tilfældigt minigame popper op på alles telefoner med dette interval.</span>
      </div>

      <div class="field">
        <span class="field__label">Drikke & point</span>
        <div class="card option-card">
          <${DrinkSettings} settings=${settings} onChange=${update} />
        </div>
      </div>

      <div class="card" style=${{ padding: '4px 16px' }}>
        <${Switch}
          label="Lykkehjul"
          hint="Spin når man tager føringen, er langt bagud eller når en milepæl"
          checked=${settings.triggers}
          onChange=${(triggers) => update({ triggers })}
        />
        <div class="divider"></div>
        <${Switch}
          label="Bonuspoint"
          hint="Hjul og minigames kan give ekstra point"
          checked=${settings.bonus}
          onChange=${(bonus) => update({ bonus })}
        />
      </div>

      ${error ? html`<div class="form-error" role="alert"><${Icon} name="info" size=${18} />${error}</div>` : null}
      <${Button} type="submit" size="lg" block loading=${busy} iconRight="chevron-right">Opret event<//>
    </form>
  </main>`;
}
