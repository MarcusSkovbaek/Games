// Showing photos. A photo is always painted as the background of a protected frame — never an
// <img> — so the browser offers no "save image", no long-press menu and no dragging it out.
// Thumbnails are on every phone already; the full-size photo is fetched (and decrypted) only when
// someone looks at it.
import { html, useState, useEffect, useRef, useStore, Avatar, Icon, IconButton, Spinner, cx } from '../kit.js';
import { loadFull, cachedFull, removePhoto } from '../../app/photos.js';
import { toggleReaction } from '../../app/actions.js';
import { eventUi } from '../screens/event.js';
import { toast } from '../ui-store.js';
import { sfx, haptic } from '../feedback.js';
import { fmtAgo } from '../format.js';

export const LIKE = '❤️';
export const likesOf = (d, key) => d.reactions.get(key)?.get(LIKE)?.size || 0;
const block = (e) => e.preventDefault();

export function PhotoFrame({ src, label, fit = 'cover', class: className, style, children }) {
  return html`<div
    class=${cx('photo-frame', fit === 'contain' && 'photo-frame--contain', className)}
    role=${label ? 'img' : null}
    aria-label=${label || null}
    aria-hidden=${label ? null : 'true'}
    style=${{ ...style, backgroundImage: src ? `url("${src}")` : 'none' }}
    onContextMenu=${block}
    onDragStart=${block}
  >
    ${children}
  </div>`;
}

export const photoLabel = (d, photo) => `Billede fra ${d.players.get(photo.pid)?.name || 'en gæst'}${photo.cap ? `: ${photo.cap}` : ''}`;

// The full-size photo once it has been fetched (null until then); `enabled` = false waits.
export function useFullPhoto(room, photo, enabled = true) {
  const [state, setState] = useState(() => ({ key: photo?.key, url: photo ? cachedFull(photo) || (!photo.full ? photo.thumb : null) : null, failed: false }));
  const current = state.key === photo?.key ? state : { key: photo?.key, url: photo ? cachedFull(photo) || (!photo.full ? photo.thumb : null) : null, failed: false };
  useEffect(() => {
    if (!photo || !enabled || current.url) return undefined;
    let live = true;
    loadFull(room, photo).then((url) => {
      if (live) setState({ key: photo.key, url, failed: !url });
    });
    return () => {
      live = false;
    };
  }, [photo?.key, photo?.thumb, enabled]);
  return current;
}

// Calls back once the element has been on screen for a moment (not while flicking past).
function useSeen(ref, delay = 350) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el || !globalThis.IntersectionObserver) return undefined;
    let timer = null;
    const io = new globalThis.IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (entry.isIntersecting) timer = setTimeout(() => setSeen(true), delay);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, [seen]);
  return seen;
}

const ratio = (photo) => (photo.w && photo.h ? Math.min(1.8, Math.max(0.75, photo.w / photo.h)) : 1);

// A photo in the feed: the thumbnail at once, sharpened to full size when it has been looked at.
// Our own photo, while no broker has it yet (no connection): it goes out by itself later.
function Pending({ room, photo, short }) {
  if (photo.pid !== room.pid || !photo.full || room.photoSent(photo.asset)) return null;
  return html`<span class="photo-pending"><${Icon} name="clock" size=${13} />${short ? 'Sendes …' : 'Sendes, når der er forbindelse'}</span>`;
}

export function FeedPhoto({ room, d, photo, compact }) {
  const ref = useRef(null);
  const seen = useSeen(ref);
  const full = useFullPhoto(room, photo, seen && !compact);
  const open = () => eventUi.set({ photo: photo.key });
  return html`<button type="button" ref=${ref} class=${cx('feed-photo', compact && 'feed-photo--compact')} style=${{ aspectRatio: compact ? '4 / 3' : String(ratio(photo)) }} onClick=${open} onContextMenu=${block} aria-label=${`Åbn ${photoLabel(d, photo)}`}>
    <${PhotoFrame} src=${full.url || photo.thumb} class=${cx(!full.url && 'is-thumb')} />
    ${!photo.thumb ? html`<span class="feed-photo__wait"><${Spinner} /></span>` : null}
    <${Pending} room=${room} photo=${photo} />
  </button>`;
}

export function PhotoGrid({ room, d, photos, badge }) {
  return html`<div class="photo-grid">
    ${photos.map((ph) => {
      const p = d.players.get(ph.pid);
      const likes = likesOf(d, ph.key);
      return html`<button type="button" class="photo-tile" key=${ph.key} onClick=${() => eventUi.set({ photo: ph.key })} onContextMenu=${block} aria-label=${`Åbn ${photoLabel(d, ph)}`}>
        <${PhotoFrame} src=${ph.thumb} />
        ${!ph.thumb ? html`<span class="photo-tile__wait"><${Spinner} /></span>` : null}
        <${Pending} room=${room} photo=${ph} short />
        ${badge?.(ph)}
        <span class="photo-tile__foot" aria-hidden="true">
          <${Avatar} player=${p} size=${22} />
          <span class="photo-tile__name">${p?.name}</span>
          ${likes ? html`<span class="photo-tile__likes">${LIKE} ${likes}</span>` : null}
        </span>
      </button>`;
    })}
  </div>`;
}

// Full screen, one photo at a time; swipe (or arrow keys) for the next. `extra(photo)` adds
// controls (the pub golf judge's podium buttons).
export function PhotoViewer({ room, d, extra }) {
  const key = useStore(eventUi, (s) => s.photo);
  const photos = d.photos;
  const index = photos.findIndex((ph) => ph.key === key);
  const photo = index >= 0 ? photos[index] : null;
  const [confirm, setConfirm] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef(null);
  const close = () => eventUi.set({ photo: null });
  const go = (step) => {
    const next = photos[index + step];
    if (next) {
      eventUi.set({ photo: next.key });
      setConfirm(false);
    }
  };

  // A photo that disappears (deleted or hidden) closes the viewer.
  useEffect(() => {
    if (key && !photo) close();
  }, [key, !!photo]);
  // The keys always act on the photo shown now (the handler outlives the render it was made in).
  const keys = useRef(null);
  keys.current = { close, go };
  useEffect(() => {
    if (!photo) return undefined;
    document.documentElement.classList.add('scroll-locked', 'media-open');
    const onKey = (e) => {
      if (e.key === 'Escape') keys.current.close();
      else if (e.key === 'ArrowRight') keys.current.go(1);
      else if (e.key === 'ArrowLeft') keys.current.go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('scroll-locked', 'media-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [!!photo]);
  // Fetch the neighbours too, so swiping feels instant.
  useEffect(() => {
    for (const step of [1, -1]) {
      const near = photos[index + step];
      if (near?.full) loadFull(room, near);
    }
  }, [index]);

  const full = useFullPhoto(room, photo, !!photo);
  if (!photo) return null;
  const p = d.players.get(photo.pid);
  const mine = photo.pid === room.pid;
  const canRemove = mine || d.canHidePhotos;
  const likes = likesOf(d, photo.key);
  const liked = !!d.reactions.get(photo.key)?.get(LIKE)?.has(room.pid);

  const like = () => {
    toggleReaction(room, d, photo.key, LIKE);
    haptic(8);
    if (!liked) sfx.pop();
  };
  const remove = () => {
    removePhoto(room, photo);
    toast(mine ? 'Billedet er slettet for alle' : 'Billedet er skjult for alle', { icon: '🗑️' });
    setConfirm(false);
  };
  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onMove = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    if (Math.abs(dx) > Math.abs(e.clientY - start.current.y)) setDrag(dx);
  };
  const onUp = (e) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    const fast = Date.now() - start.current.t < 300;
    start.current = null;
    setDrag(0);
    if (Math.abs(dx) > Math.max(60, Math.abs(dy)) || (fast && Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy))) go(dx < 0 ? 1 : -1);
    else if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.5) close();
  };

  return html`<div class="viewer" role="dialog" aria-modal="true" aria-label=${photoLabel(d, photo)} onContextMenu=${block}>
    <header class="viewer__top">
      <${Avatar} player=${p} size=${36} />
      <span class="viewer__who">
        <strong>${mine ? 'Dig' : p?.name || 'En gæst'}</strong>
        <small>${fmtAgo(photo.ts, d.t)} · ${index + 1} af ${photos.length}</small>
      </span>
      <${IconButton} icon="x" label="Luk" onClick=${close} />
    </header>
    <div
      class="viewer__stage"
      onPointerDown=${onDown}
      onPointerMove=${onMove}
      onPointerUp=${onUp}
      onPointerCancel=${() => {
        start.current = null;
        setDrag(0);
      }}
      style=${{ '--dx': `${drag}px` }}
    >
      <${PhotoFrame} src=${full.url || photo.thumb} fit="contain" label=${photoLabel(d, photo)} class=${cx('viewer__photo', !full.url && 'is-thumb')} />
      ${!full.url && !full.failed && photo.full ? html`<span class="viewer__loading"><${Spinner} size=${30} /></span>` : null}
      ${full.failed ? html`<span class="viewer__note">Fuld størrelse er ikke tilgængelig lige nu — du ser en mindre udgave.</span>` : null}
      ${index > 0 ? html`<button type="button" class="viewer__nav viewer__nav--prev" aria-label="Forrige billede" onClick=${() => go(-1)}><${Icon} name="chevron-left" size=${26} /></button>` : null}
      ${index < photos.length - 1 ? html`<button type="button" class="viewer__nav viewer__nav--next" aria-label="Næste billede" onClick=${() => go(1)}><${Icon} name="chevron-right" size=${26} /></button>` : null}
    </div>
    <footer class="viewer__bottom">
      ${photo.cap ? html`<p class="viewer__cap">${photo.cap}</p>` : null}
      ${confirm
        ? html`<div class="viewer__confirm" role="group" aria-label="Bekræft">
            <span>${mine ? 'Slet billedet for alle?' : `Skjul billedet fra ${p?.name} for alle?`}</span>
            <button type="button" class="btn btn--secondary btn--sm" onClick=${() => setConfirm(false)}>Annullér</button>
            <button type="button" class="btn btn--danger btn--sm" onClick=${remove}>${mine ? 'Slet' : 'Skjul'}</button>
          </div>`
        : html`<div class="viewer__bar">
            <button type="button" class=${cx('viewer__like', liked && 'is-on')} aria-pressed=${liked} onClick=${like}>
              <span aria-hidden="true">${LIKE}</span> ${likes || ''}<span class="sr-only">${liked ? 'Fjern like' : 'Like'}</span>
            </button>
            <span class="spacer"></span>
            ${canRemove
              ? html`<button type="button" class="viewer__action" onClick=${() => setConfirm(true)}><${Icon} name=${mine ? 'trash' : 'eye'} size=${18} />${mine ? 'Slet' : 'Skjul'}</button>`
              : null}
          </div>`}
      ${extra ? extra(photo) : null}
    </footer>
  </div>`;
}
