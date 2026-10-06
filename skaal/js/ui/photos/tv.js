// The big screen's slideshow: the newest photo as soon as it arrives, then the latest ones in
// turn — full size, on a blurred copy of itself so portrait photos fill the frame nicely.
import { html } from '../kit.js';
import { Avatar } from '../kit.js';
import { PhotoFrame, useFullPhoto, photoLabel } from './photo.js';

export function TvPhotos({ room, d, empty = null }) {
  const recent = d.photos.slice(0, 12);
  const newest = recent[0];
  const photo = !recent.length ? null : d.t - newest.ts < 20_000 ? newest : recent[Math.floor(d.t / 8000) % recent.length];
  const full = useFullPhoto(room, photo, !!photo);
  if (!photo) return empty;
  const p = d.players.get(photo.pid);
  const src = full.url || photo.thumb;
  return html`<figure class="card tv-photo" key=${photo.key}>
    <${PhotoFrame} src=${src} class="tv-photo__backdrop" />
    <${PhotoFrame} src=${src} fit="contain" label=${photoLabel(d, photo)} class="tv-photo__img" />
    <figcaption class="tv-photo__cap">
      <${Avatar} player=${p} size=${30} />
      <span><strong>${p?.name || 'En gæst'}</strong>${photo.cap ? html` — ${photo.cap}` : null}</span>
    </figcaption>
  </figure>`;
}
