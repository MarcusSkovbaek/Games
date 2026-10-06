// The host's photo controls in "Mig": photos on or off, the disposable camera, and deleting every
// photo of the event.
import { html, Icon, Switch } from '../kit.js';
import { updateSettings } from '../../app/actions.js';
import { removePhotos } from '../../app/photos.js';
import { DISPOSABLE } from '../../game/photos.js';
import { confirmDialog, toast } from '../ui-store.js';

export const DISPOSABLE_HINT = `Ingen kan se, hvad de tager billeder af. ${DISPOSABLE.shots} billeder hver, og de fremkaldes først 24 timer efter, de er taget`;

export function PhotoHostSection({ room, d }) {
  if (!d.isHost || !room.strong) return null;
  // Photos still developing go too.
  const all = [...d.photos, ...d.undeveloped];
  const n = all.length;
  const purge = async () => {
    const ok = await confirmDialog({
      title: `Slet alle ${n} billeder?`,
      text: 'De forsvinder fra alles telefoner og fra serverne. Det kan ikke fortrydes.',
      confirm: 'Slet alle',
      danger: true,
    });
    if (!ok) return;
    removePhotos(room, all);
    toast('Alle billeder er slettet', { icon: '🗑️' });
  };
  const disposable = (on) => {
    updateSettings(room, { disposable: on });
    toast(on ? '🎞️ Engangskameraet er slået til' : 'Engangskameraet er slået fra — billeder, der allerede er taget, fremkaldes stadig', { tone: 'good' });
  };
  return html`<section class="section">
    <h2 class="section__title">Fotos</h2>
    <div class="list">
      <${Switch}
        label="📸 Fotos i eventet"
        hint="Gæsterne kan tage billeder i appen og dele dem med alle i eventet"
        checked=${d.settings.photos !== false}
        onChange=${(photos) => updateSettings(room, { photos })}
      />
      ${d.settings.photos !== false
        ? html`<${Switch} label="🎞️ Engangskamera" hint=${DISPOSABLE_HINT} checked=${d.settings.disposable} onChange=${disposable} />`
        : null}
      ${n
        ? html`<button type="button" class="list-item list-item--danger" onClick=${purge}>
            <span class="list-item__icon"><${Icon} name="trash" size=${18} /></span>
            <span class="list-item__text">
              <div class="list-item__title">Slet alle billeder</div>
              <div class="list-item__sub">${n} ${n === 1 ? 'billede' : 'billeder'} · fra alles telefoner og serverne</div>
            </span>
          </button>`
        : null}
    </div>
  </section>`;
}
