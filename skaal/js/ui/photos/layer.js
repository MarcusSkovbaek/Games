// What floats above an event for photos: the camera, the full-screen viewer, and a small heads-up
// when someone shares a photo (or photos from the disposable camera develop).
import { html, useEffect, useRef, useStore, Icon, IconButton, cx } from '../kit.js';
import { dropGoneCopies } from '../../app/photos.js';
import { eventUi } from '../screens/event.js';
import { toast } from '../ui-store.js';
import { fmtWhen } from '../format.js';
import { Camera } from './camera.js';
import { DisposableCamera, shotsLeft } from './disposable.js';
import { PhotoViewer } from './photo.js';
import { openComments } from './comments.js';

// Photos need an event with a long code (see core/crypto.js) — and the host's blessing.
export const canTakePhotos = (room, d) => !!room.strong && d.settings.photos !== false;

export function PhotoLayer({ room, d, extra }) {
  const allowed = canTakePhotos(room, d);
  useEffect(() => {
    if (!allowed) eventUi.set({ camera: false });
  }, [allowed]);
  // Our own photos that were hidden or deleted elsewhere: let go of this phone's copies.
  useEffect(() => dropGoneCopies(room, d), [room.version]);

  // News: a photo someone else shares, or one from the disposable camera that develops (ours too).
  const newest = d.photos.reduce((a, ph) => ((ph.pid !== room.pid || ph.ds) && (!a || ph.shown > a.shown) ? ph : a), null);
  // Only ever announce a photo newer than the last one announced (not an older one that becomes
  // the newest because a newer one was hidden).
  const announced = useRef(newest?.shown || 0);
  useEffect(() => {
    if (!newest || newest.shown <= announced.current) return;
    announced.current = newest.shown;
    if (d.t - newest.shown > 60_000) return; // an older photo arriving late
    const name = d.players.get(newest.pid)?.name || 'En gæst';
    // Several in a row (picked together from the camera roll): one heads-up for them all.
    const n = d.feed.find((f) => f.kind === 'photos' && f.photos.some((ph) => ph.key === newest.key))?.photos.length || 1;
    // (An entry in pub golf's photo competition says so.)
    const comp = newest.comp ? d.pg?.cfg.comps.find((c) => c.id === newest.comp) : null;
    const text = comp
      ? `${comp.emoji} ${name} sendte et billede ind til ${comp.name}`
      : !newest.ds
        ? `📸 ${name} delte ${n === 1 ? 'et billede' : `${n} billeder`}`
        : newest.pid === room.pid
          ? `🎞️ ${n === 1 ? 'Et af dine billeder' : `${n} af dine billeder`} er fremkaldt`
          : `🎞️ ${n === 1 ? 'Et billede' : `${n} billeder`} fra ${name} er fremkaldt`;
    const scope = comp ? `comp:${comp.id}` : null;
    toast(text, { key: 'photo', duration: 4500, action: { label: 'Se', onClick: () => eventUi.set({ photo: newest.key, show: false, comments: false, scope }) } });
  }, [newest?.key]);

  // Someone comments on one of our photos (unless we are reading that photo's comments).
  const heard = latestCommentToMe(room, d);
  const told = useRef(heard?.ts || 0);
  useEffect(() => {
    if (!heard || heard.ts <= told.current) return;
    told.current = heard.ts;
    if (d.t - heard.ts > 60_000) return;
    const ui = eventUi.get();
    if (ui.photo === heard.photo && ui.comments) return;
    const name = d.players.get(heard.pid)?.name || 'En gæst';
    const photo = d.photoByKey.get(heard.photo);
    toast(`💬 ${name}: “${heard.txt.length > 60 ? `${heard.txt.slice(0, 58)}…` : heard.txt}”`, {
      key: 'comment',
      duration: 5000,
      action: { label: 'Svar', onClick: () => openComments(photo, 'write') },
    });
  }, [heard?.key]);
  return html`<${CameraOverlay} room=${room} d=${d} /><${PhotoViewer} room=${room} d=${d} extra=${extra} />`;
}

// The camera — or, when the host has turned it on, the disposable camera.
function CameraOverlay({ room, d }) {
  const open = useStore(eventUi, (s) => s.camera);
  if (!open) return null;
  const close = () => eventUi.set({ camera: false });
  return d.settings.disposable ? html`<${DisposableCamera} room=${room} d=${d} onClose=${close} />` : html`<${Camera} room=${room} onClose=${close} />`;
}

function latestCommentToMe(room, d) {
  let latest = null;
  for (const ph of d.photos) {
    if (ph.pid !== room.pid) continue;
    for (const c of d.comments.get(ph.key) || []) if (c.pid !== room.pid && (!latest || c.ts > latest.ts)) latest = c;
  }
  return latest;
}

export function CameraButton({ room, d }) {
  if (!canTakePhotos(room, d)) return null;
  return html`<${IconButton} icon="camera" label="Tag et billede" onClick=${() => eventUi.set({ camera: true })} />`;
}

// The invitation to take a photo, at the top of the feed and the photo gallery.
export function CameraCard({ room, d, text }) {
  const ui = useStore(eventUi, (s) => s.camera);
  if (!room.strong) {
    return html`<div class="card card--pad photo-locked">
      <${Icon} name="lock" size=${18} />
      <span>Billeder kan kun deles i events med en lang kode (12 tegn), så de er ordentligt beskyttet. Opret et nyt event for at dele billeder.</span>
    </div>`;
  }
  if (!canTakePhotos(room, d)) {
    return html`<div class="card card--pad photo-locked">
      <${Icon} name="camera" size=${18} />
      <span>Værten har slået fotos fra i dette event.</span>
    </div>`;
  }
  if (d.settings.disposable) {
    const left = shotsLeft(d);
    return html`<button type="button" class=${cx('camera-card camera-card--dispo', ui && 'is-open')} onClick=${() => eventUi.set({ camera: true })}>
      <span class="camera-card__icon" aria-hidden="true">🎞️</span>
      <span class="camera-card__text">
        <strong>Engangskamera</strong>
        <small>${left ? `${left} ${left === 1 ? 'billede' : 'billeder'} tilbage · ingen ser dem, før de er fremkaldt 24 timer efter` : 'Filmen er brugt op — dine billeder fremkaldes 24 timer efter, de er taget'}</small>
      </span>
      <${Icon} name="chevron-right" size=${20} />
    </button>`;
  }
  return html`<button type="button" class=${cx('camera-card', ui && 'is-open')} onClick=${() => eventUi.set({ camera: true })}>
    <span class="camera-card__icon" aria-hidden="true"><${Icon} name="camera" size=${26} /></span>
    <span class="camera-card__text">
      <strong>Tag et billede</strong>
      <small>${text || `Alle ${d.ranking.filter((p) => !p.left).length > 1 ? 'i eventet' : 'du inviterer'} kan se det — ingen andre`}</small>
    </span>
    <${Icon} name="chevron-right" size=${20} />
  </button>`;
}

// Photos from the disposable camera that are still developing: how many, and when the next is ready.
export function DevelopCard({ room, d }) {
  const n = d.undeveloped.length;
  if (!n) return null;
  const mine = d.undeveloped.filter((ph) => ph.pid === room.pid).length;
  const whose = !mine ? '' : mine === n ? (n === 1 ? ' · det er dit' : ' · alle er dine') : mine === 1 ? ' · ét af dem er dit' : ` · ${mine} af dem er dine`;
  return html`<div class="card card--pad develop-card">
    <span class="develop-card__icon" aria-hidden="true">⏳</span>
    <span class="develop-card__text">
      <strong>${n === 1 ? 'Et billede' : `${n} billeder`} til fremkaldelse</strong>
      <small>${n === 1 ? 'Det' : 'Det næste'} er klar ${fmtWhen(d.undeveloped[0].shown, d.t)}${whose}</small>
    </span>
  </div>`;
}
