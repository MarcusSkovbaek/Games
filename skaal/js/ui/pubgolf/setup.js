// Editing a pub golf event: the course (bars), teams, competitions and rules. Used when creating
// the event and later in the host's settings.
import { html, useState, useEffect, Sheet, Button, IconButton, Stepper, Segmented, Switch } from '../kit.js';
import { PG, TEAM_COLORS, holeFromTemplate, normalizePg } from '../../game/pubgolf.js';
import { randomId } from '../../core/ids.js';
import { updatePubGolf } from '../../app/actions.js';
import { now } from '../../core/clock.js';
import { toast } from '../ui-store.js';

const PARS = Array.from({ length: PG.maxPar }, (_, i) => i + 1);
const COMP_EMOJI = ['🏆', '👔', '🎤', '🤝', '🎯', '🕺', '😂', '🍻', '🎨', '🧠', '🏃', '🎭'];

export function CourseEditor({ course, onChange }) {
  const set = (i, patch) => onChange(course.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const remove = (i) => onChange(course.filter((_, j) => j !== i));
  const add = () => onChange([...course, holeFromTemplate(course.length, `h${randomId(6)}`)]);
  const par = course.reduce((s, h) => s + (Number(h.par) || 0), 0);
  return html`<div class="pg-edit">
    ${course.map(
      (h, i) => html`<div class="pg-edit__item" key=${h.id}>
        <div class="pg-edit__side">
          <span class="pg-edit__num" aria-hidden="true">${i + 1}</span>
          ${course.length > 1 ? html`<${IconButton} icon="trash" label=${`Fjern hul ${i + 1}`} size=${18} onClick=${() => remove(i)} />` : null}
        </div>
        <div class="pg-edit__fields">
          <input class="input" maxlength="40" placeholder=${`Bar på hul ${i + 1}`} aria-label=${`Bar på hul ${i + 1}`} value=${h.bar} onInput=${(e) => set(i, { bar: e.currentTarget.value })} />
          <div class="pg-edit__row">
            <input class="input" maxlength="32" placeholder="Drik" aria-label=${`Drik på hul ${i + 1}`} value=${h.drink} onInput=${(e) => set(i, { drink: e.currentTarget.value })} />
            <${Stepper} value=${h.par} steps=${PARS} format=${(v) => `Par ${v}`} onChange=${(p) => set(i, { par: p })} />
          </div>
          <input class="input pg-edit__addr" maxlength="80" placeholder="Adresse (valgfri)" aria-label=${`Adresse på hul ${i + 1}`} value=${h.addr} onInput=${(e) => set(i, { addr: e.currentTarget.value })} />
        </div>
      </div>`,
    )}
    ${course.length < PG.maxHoles ? html`<${Button} variant="secondary" icon="plus" onClick=${add}>Tilføj hul<//>` : null}
    <span class="field__hint">${course.length} ${course.length === 1 ? 'hul' : 'huller'} · par ${par} i alt. Par er det antal slurke, drikken bør tage.</span>
  </div>`;
}

export function TeamsEditor({ teams, onChange }) {
  const set = (i, patch) => onChange(teams.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const nextColor = (color) => TEAM_COLORS[(TEAM_COLORS.findIndex((c) => c.color === color) + 1) % TEAM_COLORS.length];
  const add = () => {
    const used = new Set(teams.map((t) => t.color));
    const c = TEAM_COLORS.find((x) => !used.has(x.color)) || TEAM_COLORS[teams.length % TEAM_COLORS.length];
    onChange([...teams, { id: `t${randomId(6)}`, name: `Hold ${c.name}`, color: c.color }]);
  };
  return html`<div class="pg-edit">
    ${teams.map(
      (t, i) => html`<div class="pg-edit__item pg-edit__item--team" key=${t.id}>
        <button type="button" class="pg-edit__swatch" style=${{ background: t.color }} aria-label=${`Skift farve på ${t.name}`} onClick=${() => set(i, { color: nextColor(t.color).color })}></button>
        <input class="input" maxlength="24" placeholder="Holdnavn" aria-label=${`Navn på hold ${i + 1}`} value=${t.name} onInput=${(e) => set(i, { name: e.currentTarget.value })} />
        <${IconButton} icon="trash" label=${`Fjern ${t.name}`} size=${18} onClick=${() => onChange(teams.filter((_, j) => j !== i))} />
      </div>`,
    )}
    ${teams.length < PG.maxTeams ? html`<${Button} variant="secondary" icon="plus" onClick=${add}>Tilføj hold<//>` : null}
    <span class="field__hint">${teams.length ? 'Tryk på farven for at skifte den. Spillerne vælger selv hold, når de deltager.' : 'Uden hold spiller alle for sig selv.'}</span>
  </div>`;
}

export function CompsEditor({ comps, onChange }) {
  const set = (i, patch) => onChange(comps.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const nextEmoji = (e) => COMP_EMOJI[(COMP_EMOJI.indexOf(e) + 1) % COMP_EMOJI.length];
  return html`<div class="pg-edit">
    ${comps.map(
      (c, i) => html`<div class="pg-edit__item pg-edit__item--team" key=${c.id}>
        ${c.kind === 'photo'
          ? html`<span class="pg-edit__emoji" aria-hidden="true">${c.emoji}</span>`
          : html`<button type="button" class="pg-edit__emoji" aria-label=${`Skift ikon for ${c.name || 'konkurrencen'}`} onClick=${() => set(i, { emoji: nextEmoji(c.emoji) })}>${c.emoji}</button>`}
        <input class="input" maxlength="32" placeholder="Fx Bedste dansemove" aria-label=${`Navn på konkurrence ${i + 1}`} value=${c.name} onInput=${(e) => set(i, { name: e.currentTarget.value })} />
        ${c.kind === 'photo'
          ? html`<span class="pg-edit__fixed">Foto</span>`
          : html`<${IconButton} icon="trash" label=${`Fjern ${c.name || 'konkurrencen'}`} size=${18} onClick=${() => onChange(comps.filter((_, j) => j !== i))} />`}
      </div>`,
    )}
    ${comps.length < 12
      ? html`<${Button} variant="secondary" icon="plus" onClick=${() => onChange([...comps, { id: `c${randomId(6)}`, name: '', emoji: '🏆', kind: 'team' }])}>Tilføj konkurrence<//>`
      : null}
    <span class="field__hint">Dommeren sætter podiet for hver konkurrence. I fotokonkurrencen uploader hver spiller sit bedste billede fra fotoalbummet.</span>
  </div>`;
}

export function RulesEditor({ pg, onChange }) {
  const bonus = pg.compBonus;
  const setBonus = (i, n) => onChange({ compBonus: bonus.map((b, j) => (j === i ? n : b)) });
  return html`<div class="card option-card pg-rules">
    <${Switch}
      label="Spillerne noterer selv deres slag"
      hint="Ellers gør dommeren det. Dommeren kan altid rette en score."
      checked=${pg.selfScore}
      onChange=${(selfScore) => onChange({ selfScore })}
    />
    <div class="divider"></div>
    <div class="field">
      <span class="field__label">Holdets score</span>
      <${Segmented}
        options=${[
          { value: 'sum', label: 'Sum af spillerne' },
          { value: 'avg', label: 'Gennemsnit' },
        ]}
        value=${pg.teamScore}
        onChange=${(teamScore) => onChange({ teamScore })}
      />
      <span class="field__hint">Gennemsnit er mest fair, hvis holdene er forskellige store.</span>
    </div>
    <div class="divider"></div>
    <div class="field">
      <span class="field__label">Bonus for podiepladser (slag)</span>
      <div class="pg-bonus">
        ${['🥇', '🥈', '🥉'].map(
          (m, i) => html`<span class="pg-bonus__item"><span aria-hidden="true">${m}</span><${Stepper} value=${bonus[i]} steps=${[0, 1, 2, 3, 4, 5]} format=${(v) => (v ? `−${v}` : '0')} onChange=${(n) => setBonus(i, n)} /></span>`,
        )}
      </div>
    </div>
  </div>`;
}

// Host: everything above for a running event.
export function PgSettingsSheet({ room, d, open, onClose }) {
  const [pg, setPg] = useState(d.pg.cfg);
  useEffect(() => {
    if (open) setPg(d.pg.cfg);
  }, [open]);
  const update = (patch) => setPg((cur) => ({ ...cur, ...patch }));
  const save = () => {
    const clean = normalizePg({ ...pg, course: pg.course.map((h) => ({ ...h, bar: h.bar.trim() })) });
    updatePubGolf(room, clean);
    toast('Indstillinger gemt ✓', { tone: 'good' });
    onClose();
  };
  return html`<${Sheet}
    open=${open}
    onClose=${onClose}
    title="Bane, hold og konkurrencer"
    subtitle="Ændringer gælder med det samme for alle."
    size="tall"
    footer=${html`<${Button} block icon="check" onClick=${save}>Gem ændringer<//>`}
  >
    <div class="stack stack--l">
      <div class="field"><span class="field__label">Banen</span><${CourseEditor} course=${pg.course} onChange=${(course) => update({ course })} /></div>
      <div class="field"><span class="field__label">Hold</span><${TeamsEditor} teams=${pg.teams} onChange=${(teams) => update({ teams })} /></div>
      <div class="card option-card">
        <${Switch}
          label="Lås holdene"
          hint="Spillerne kan ikke længere skifte hold selv — dommeren og du kan stadig flytte folk."
          checked=${!!pg.lockTeams}
          onChange=${(on) => update({ lockTeams: on ? now() : 0 })}
        />
      </div>
      <div class="field"><span class="field__label">Konkurrencer</span><${CompsEditor} comps=${pg.comps} onChange=${(comps) => update({ comps })} /></div>
      <div class="field"><span class="field__label">Regler</span><${RulesEditor} pg=${pg} onChange=${update} /></div>
    </div>
  <//>`;
}
