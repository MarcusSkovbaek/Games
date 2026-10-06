// The big screen's slideshow: the newest photo as soon as it arrives, then the latest ones in
// turn — full size, on a blurred copy of itself so portrait photos fill the frame nicely. Each
// photo fades in over the last one and drifts slowly closer. Before the first photo: a nudge to
// take one.
import { html, useState, useEffect, useRef, Avatar } from '../kit.js';
import { PhotoFrame, useFullPhoto, useThumb, photoLabel } from './photo.js';
import { canTakePhotos } from './layer.js';

function Layer({ src, label, top }) {
  return html`<div class=${top ? 'tv-photo__layer is-top' : 'tv-photo__layer'}>
    <${PhotoFrame} src=${src} class="tv-photo__backdrop" />
    <${PhotoFrame} src=${src} fit="contain" label=${label} class="tv-photo__img" />
  </div>`;
}

export function TvPhotos({ room, d }) {
  const recent = d.photos.slice(0, 12);
  const newest = recent[0];
  const photo = !recent.length ? null : d.t - newest.ts < 20_000 ? newest : recent[Math.floor(d.t / 8000) % recent.length];
  const thumb = useThumb(room, photo, !!photo);
  const full = useFullPhoto(room, photo, !!photo);
  const src = photo ? full.url || thumb.url : null;
  // The photo shown before stays underneath while the new one fades in.
  const [under, setUnder] = useState(null);
  const shown = useRef(null);
  useEffect(() => {
    if (shown.current && shown.current.key !== photo?.key) setUnder(shown.current);
    const t = setTimeout(() => setUnder(null), 1500);
    return () => clearTimeout(t);
  }, [photo?.key]);
  shown.current = photo ? { key: photo.key, src } : null;
  if (!photo) {
    return canTakePhotos(room, d) && !d.ended
      ? html`<div class="card card--pad tv-photo-hint">
          <span class="tv-photo-hint__icon" aria-hidden="true">📸</span>
          <span><strong>Tag billeder i appen</strong><small>De dukker op her med det samme — kun for jer i eventet</small></span>
        </div>`
      : null;
  }
  const p = d.players.get(photo.pid);
  return html`<figure class="card tv-photo">
    ${under ? html`<${Layer} key=${under.key} src=${under.src} />` : null}
    <${Layer} key=${photo.key} src=${src} label=${photoLabel(d, photo)} top />
    <figcaption class="tv-photo__cap" key=${`cap-${photo.key}`}>
      <${Avatar} player=${p} size=${30} />
      <span><strong>${p?.name || 'En gæst'}</strong>${photo.cap ? html` — ${photo.cap}` : null}</span>
    </figcaption>
  </figure>`;
}
