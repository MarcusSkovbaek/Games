// The "Fotos" tab in pub golf: photos from the round (taken with the camera in the app, seen by
// everyone in the event) — and the photo competition: the players upload an entry each from their
// photo albums, and the judge sets the podium.
import { html, useStore, Empty, cx } from '../kit.js';
import { setPodium } from '../../app/actions.js';
import { toast } from '../ui-store.js';
import { sfx } from '../feedback.js';
import { eventUi } from '../screens/event.js';
import { PhotoThumb, PhotoGrid, PlayButton, PhotoFilter, photosBy } from '../photos/photo.js';
import { CameraCard, DevelopCard } from '../photos/layer.js';
import { MEDALS } from './common.js';
import { EntryCard } from './entry.js';

export const photoComp = (pg) => pg.comps.find((c) => c.kind === 'photo');
const placeOfPhoto = (pg, key) => (pg.results.get(photoComp(pg)?.id)?.places || []).findIndex((pl) => pl?.photo === key);

export function PhotosTab({ room, d }) {
  const pg = d.pg;
  const comp = photoComp(pg);
  // One person's photos (a pid), or everyone's.
  const by = useStore(eventUi, (s) => (d.photos.some((ph) => ph.pid === s.photosBy) ? s.photosBy : null));
  const winners = (pg.results.get(comp?.id)?.places || []).map((pl) => (pl ? d.photoByKey.get(pl.photo) : null));
  const badge = (ph) => {
    const place = placeOfPhoto(pg, ph.key);
    const team = pg.teamById.get(pg.players.get(ph.pid)?.team);
    return html`${team ? html`<span class="photo-tile__team" style=${{ '--tc': team.color }} aria-hidden="true"></span>` : null}${place >= 0 ? html`<span class="photo-tile__medal" aria-hidden="true">${MEDALS[place]}</span>` : null}`;
  };

  return html`<div class="stack stack--l">
    <div class="section__head" style=${{ paddingTop: '6px' }}>
      <h1 class="section__title" style=${{ fontSize: '26px' }}>Fotos</h1>
      <span class="faint" style=${{ fontSize: '13px' }}>${d.photos.length} ${d.photos.length === 1 ? 'billede' : 'billeder'}</span>
    </div>

    ${winners.some(Boolean)
      ? html`<section class="pg-winners" aria-label=${comp.name}>
          <div class="pg-winners__title">${comp.emoji} ${comp.name}</div>
          <div class="pg-winners__row">
            ${winners.map((ph, i) =>
              ph
                ? html`<button type="button" class=${cx('pg-winner', `pg-winner--${i + 1}`)} onClick=${() => eventUi.set({ photo: ph.key })} aria-label=${`${i + 1}.-plads: billede fra ${d.players.get(ph.pid)?.name}`}>
                    <${PhotoThumb} room=${room} photo=${ph} />
                    <span class="pg-winner__medal" aria-hidden="true">${MEDALS[i]}</span>
                    <span class="pg-winner__who" aria-hidden="true">${d.players.get(ph.pid)?.name}</span>
                  </button>`
                : null,
            )}
          </div>
        </section>`
      : null}

    <${EntryCard} room=${room} d=${d} comp=${comp} />
    <${CameraCard} room=${room} d=${d} />
    <${DevelopCard} room=${room} d=${d} />

    ${d.photos.length
      ? html`<${PhotoFilter} d=${d} value=${by} onChange=${(photosBy) => eventUi.set({ photosBy })} />
          <${PlayButton} d=${d} label="Afspil runden" scope=${by} />
          <${PhotoGrid} room=${room} d=${d} photos=${photosBy(d, by)} badge=${badge} scope=${by} />`
      : d.undeveloped.length || d.settings.disposable
        ? html`<${Empty}
            icon="camera"
            title=${d.undeveloped.length ? 'Ingen billeder fremkaldt endnu' : 'Ingen billeder endnu'}
            text="Billeder fra engangskameraet dukker op her, når de er fremkaldt — 24 timer efter, de er taget."
          />`
        : html`<${Empty}
            icon="camera"
            title="Ingen billeder endnu"
            text="Tag det første billede fra runden — alle i eventet kan se det."
          />`}
  </div>`;
}

// Below a photo in the viewer: its team and place — and for an entry in the photo competition, the
// judge's podium buttons (also after the end: the judge may decide the morning after).
export function PhotoPlaces({ room, d, photo }) {
  const pg = d.pg;
  const comp = photoComp(pg);
  if (!comp) return null;
  const place = placeOfPhoto(pg, photo.key);
  const entry = !!pg.entries.get(comp.id)?.some((ph) => ph.key === photo.key);
  const team = pg.teamById.get(pg.players.get(photo.pid)?.team);
  const name = d.players.get(photo.pid)?.name;
  const set = (i) => {
    const current = [0, 1, 2].map((j) => pg.results.get(comp.id)?.places[j]?.photo || null);
    const next = current.map((key, j) => (j === i ? (key === photo.key ? null : photo.key) : key === photo.key ? null : key));
    setPodium(room, comp, next);
    sfx.win();
    toast(next[i] ? `${MEDALS[i]} ${comp.name}: ${i + 1}.-plads til ${name}` : `${comp.name}: pladsen er fjernet`, { tone: 'good' });
  };
  return html`<div class="viewer__extra">
    ${team || place >= 0 || entry
      ? html`<div class="viewer__tags">
          ${team ? html`<span class="team-chip" style=${{ '--tc': team.color }}><span class="team-chip__dot" style=${{ background: team.color }}></span><span>${team.name}</span></span>` : null}
          ${place >= 0
            ? html`<span class="viewer__medal">${MEDALS[place]} ${place + 1}.-plads i ${comp.name.toLowerCase()}</span>`
            : entry
              ? html`<span class="viewer__medal">${comp.emoji} Med i ${comp.name.toLowerCase()}</span>`
              : null}
        </div>`
      : null}
    ${pg.isJudge && entry
      ? html`<div class="viewer__places" role="group" aria-label=${comp.name}>
          ${MEDALS.map(
            (m, i) => html`<button type="button" class=${cx('chip', place === i && 'is-active')} aria-pressed=${place === i} onClick=${() => set(i)}>${m} ${i + 1}.-plads</button>`,
          )}
        </div>`
      : null}
  </div>`;
}
