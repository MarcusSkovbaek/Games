import { html, useState, useEffect, Sheet, Button, Switch, Chips } from '../kit.js';
import { GAMES } from '../../minigames/index.js';
import { normalizeSettings, BREAKER_OPTIONS } from '../../game/settings.js';
import { updateSettings, renameEvent } from '../../app/actions.js';
import { toast } from '../ui-store.js';
import { DrinkSettings, breakerLabel } from './create.js';

export function HostSheet({ room, d, open, onClose }) {
  const [name, setName] = useState(d.meta.name);
  const [settings, setSettings] = useState(d.settings);
  useEffect(() => {
    if (open) {
      setName(d.meta.name);
      setSettings(d.settings);
    }
  }, [open]);
  const update = (patch) => setSettings((s) => normalizeSettings({ ...s, ...patch }));

  const save = () => {
    const clean = name.trim();
    if (clean && clean !== d.meta.name) renameEvent(room, clean);
    updateSettings(room, settings);
    toast('Indstillinger gemt ✓', { tone: 'good' });
    onClose();
  };

  return html`<${Sheet}
    open=${open}
    onClose=${onClose}
    title="Event-indstillinger"
    subtitle="Ændringer gælder med det samme for alle."
    size="tall"
    footer=${html`<${Button} block icon="check" onClick=${save}>Gem ændringer<//>`}
  >
    <div class="stack stack--l">
      <label class="field">
        <span class="field__label">Navn</span>
        <input class="input" type="text" maxlength="48" value=${name} onInput=${(e) => setName(e.currentTarget.value)} />
      </label>

      <div class="field">
        <span class="field__label">Automatiske breakers</span>
        <${Chips} options=${BREAKER_OPTIONS.map((m) => ({ value: m, label: breakerLabel(m) }))} value=${settings.breakerMin} onChange=${(breakerMin) => update({ breakerMin })} />
        <span class="field__hint">Et nyt interval starter nedtællingen forfra.</span>
      </div>

      <div class="field">
        <span class="field__label">Minigames i rotationen</span>
        <div class="list">
          ${GAMES.map(
            (g) => html`<${Switch}
              label=${`${g.emoji} ${g.name}`}
              hint=${g.tagline}
              checked=${settings.games[g.id]}
              onChange=${(on) => update({ games: { ...settings.games, [g.id]: on } })}
            />`,
          )}
        </div>
      </div>

      <div class="field">
        <span class="field__label">Drikke & point</span>
        <div class="card option-card"><${DrinkSettings} settings=${settings} onChange=${update} /></div>
        <span class="field__hint">Point gælder også for drinks, der allerede er registreret.</span>
      </div>

      <div class="list">
        <${Switch} label="Lykkehjul" hint="Ved føring, comeback og hver 5. drink" checked=${settings.triggers} onChange=${(triggers) => update({ triggers })} />
        <${Switch} label="Bonuspoint" hint="Hjul og minigames kan give ekstra point" checked=${settings.bonus} onChange=${(bonus) => update({ bonus })} />
        <${Switch} label="Alle kan starte minigames" hint="Ellers kun dig som vært" checked=${settings.anyoneCanStart} onChange=${(anyoneCanStart) => update({ anyoneCanStart })} />
      </div>
    </div>
  <//>`;
}
