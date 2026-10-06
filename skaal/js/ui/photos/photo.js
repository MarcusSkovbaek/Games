// Showing photos. A photo is always painted as the background of a protected frame — never an
// <img> — so the browser offers no "save image", no long-press menu and no dragging it out.
// Thumbnails are on every phone already; the full-size photo is fetched (and decrypted) only when
// someone looks at it.
import { html, useState, useEffect, useLayoutEffect, useRef, useStore, useModalFocus, Avatar, Button, Icon, IconButton, Spinner, cx } from '../kit.js';
import { loadFull, cachedFull, loadThumb, cachedThumb, removePhoto } from '../../app/photos.js';
import { toggleReaction } from '../../app/actions.js';
import { eventUi } from '../screens/event.js';
import { toast } from '../ui-store.js';
import { sfx, haptic } from '../feedback.js';
import { fmtAgo, fmtClock } from '../format.js';

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

// A photo (thumbnail or full size) once it has been fetched — url is null until then, failed
// says nobody has it right now; `enabled` = false waits.
function useLoaded(room, photo, enabled, cached, load) {
  const initial = () => ({ key: photo?.key, url: photo ? cached(photo) : null, failed: false });
  const [state, setState] = useState(initial);
  const current = state.key === photo?.key ? state : initial();
  useEffect(() => {
    if (!photo || !enabled || current.url) return undefined;
    let live = true;
    load(room, photo).then((url) => {
      if (live) setState({ key: photo.key, url, failed: !url });
    });
    return () => {
      live = false;
    };
  }, [photo?.key, photo?.thumb, enabled]);
  return current;
}

export const useFullPhoto = (room, photo, enabled = true) => useLoaded(room, photo, enabled, cachedFull, loadFull);
export const useThumb = (room, photo, enabled = true) => useLoaded(room, photo, enabled, cachedThumb, loadThumb);

// True once the element is on screen or close to it (thumbnails load a little ahead).
function useNear(ref, margin = '600px') {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return undefined;
    if (!globalThis.IntersectionObserver) {
      setNear(true);
      return undefined;
    }
    const io = new globalThis.IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return near;
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

// A photo's thumbnail in a frame (fetched when needed), with a spinner until it is there.
export function PhotoThumb({ room, photo, class: className, style, label }) {
  const thumb = useThumb(room, photo);
  return html`<${PhotoFrame} src=${thumb.url} class=${className} style=${style} label=${label}>
    ${!thumb.url && !thumb.failed ? html`<span class="photo-frame__wait"><${Spinner} size=${18} /></span>` : null}
  <//>`;
}

const ratio = (photo) => (photo.w && photo.h ? Math.min(1.8, Math.max(0.75, photo.w / photo.h)) : 1);

// A photo in the feed: the thumbnail at once, sharpened to full size when it has been looked at.
// Our own photo, while no broker has it yet (no connection): it goes out by itself later.
function Pending({ room, photo, short }) {
  if (photo.pid !== room.pid || !photo.lazy || room.photoSent(photo.asset)) return null;
  return html`<span class="photo-pending"><${Icon} name="clock" size=${13} />${short ? 'Sendes …' : 'Sendes, når der er forbindelse'}</span>`;
}

export function FeedPhoto({ room, d, photo, compact }) {
  const ref = useRef(null);
  const near = useNear(ref);
  const seen = useSeen(ref);
  const thumb = useThumb(room, photo, near);
  const full = useFullPhoto(room, photo, seen && !compact);
  const open = () => eventUi.set({ photo: photo.key });
  return html`<button type="button" ref=${ref} class=${cx('feed-photo', compact && 'feed-photo--compact')} style=${{ aspectRatio: compact ? '4 / 3' : String(ratio(photo)) }} onClick=${open} onContextMenu=${block} aria-label=${`Åbn ${photoLabel(d, photo)}`}>
    <${PhotoFrame} src=${full.url || thumb.url} class=${cx(!full.url && 'is-thumb')} />
    ${!thumb.url && !full.url ? html`<span class="feed-photo__wait"><${Spinner} /></span>` : null}
    <${Pending} room=${room} photo=${photo} />
  </button>`;
}

function PhotoTile({ room, d, photo, badge }) {
  const ref = useRef(null);
  const thumb = useThumb(room, photo, useNear(ref));
  const p = d.players.get(photo.pid);
  const likes = likesOf(d, photo.key);
  return html`<button type="button" ref=${ref} class="photo-tile" onClick=${() => eventUi.set({ photo: photo.key })} onContextMenu=${block} aria-label=${`Åbn ${photoLabel(d, photo)}`}>
    <${PhotoFrame} src=${thumb.url} />
    ${!thumb.url ? html`<span class="photo-tile__wait"><${Spinner} /></span>` : null}
    <${Pending} room=${room} photo=${photo} short />
    ${badge?.(photo)}
    <span class="photo-tile__foot" aria-hidden="true">
      <${Avatar} player=${p} size=${22} />
      <span class="photo-tile__name">${p?.name}</span>
      ${likes ? html`<span class="photo-tile__likes">${LIKE} ${likes}</span>` : null}
    </span>
  </button>`;
}

export function PhotoGrid({ room, d, photos, badge }) {
  return html`<div class="photo-grid">${photos.map((ph) => html`<${PhotoTile} key=${ph.key} room=${room} d=${d} photo=${ph} badge=${badge} />`)}</div>`;
}

// The evening as a slideshow: every photo in the order they were taken, a few seconds each.
export const playEvening = (d) => {
  const first = d.photos[d.photos.length - 1];
  if (first) eventUi.set({ photo: first.key, show: true });
};

export function PlayButton({ d, label = 'Afspil aftenen' }) {
  if (d.photos.length < 2) return null;
  return html`<${Button} variant="secondary" block icon="play" onClick=${() => playEvening(d)}>${label}<//>`;
}

// Full screen, one photo at a time; swipe (or arrow keys) for the next. `extra(photo)` adds
// controls (the pub golf judge's podium buttons). In a slideshow (eventUi.show) the photos come
// in the order they were taken; holding a finger on the photo or zooming in pauses it.
export function PhotoViewer({ room, d, extra }) {
  const key = useStore(eventUi, (s) => s.photo);
  const show = useStore(eventUi, (s) => !!s.show);
  const photos = d.photos;
  const index = photos.findIndex((ph) => ph.key === key);
  const photo = index >= 0 ? photos[index] : null;
  const [confirm, setConfirm] = useState(false);
  const [held, setHeld] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const root = useRef(null);
  useModalFocus(root, !!photo);
  const close = () => {
    eventUi.set({ photo: null, show: false });
    setConfirm(false);
  };
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
  // (A layout effect, so the keys work from the moment the viewer is on screen.)
  useLayoutEffect(() => {
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
  // Keep the screen on while the slideshow plays.
  const playing = show && !!photo;
  useEffect(() => {
    if (!playing) return undefined;
    let lock = null;
    let live = true;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        ?.request('screen')
        .then((l) => (live ? (lock = l) : l.release()))
        .catch(() => {});
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', take);
      lock?.release?.().catch(() => {});
    };
  }, [playing]);

  const thumb = useThumb(room, photo, !!photo);
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
  // The slideshow moves on to the next photo in time (the one before it in the list).
  const later = photos[index - 1];
  const advance = () => {
    if (later) eventUi.set({ photo: later.key });
    else {
      eventUi.set({ show: false });
      toast('Det var alle billederne indtil nu 🎉', { key: 'show' });
    }
  };
  const play = () => {
    if (show) eventUi.set({ show: false });
    // From the newest photo, the evening starts over from the first one.
    else eventUi.set({ show: true, photo: later ? photo.key : photos[photos.length - 1].key });
  };
  const running = show && !held && !zoomed && !confirm && !!(full.url || full.failed);
  return html`<div class=${cx('viewer', show && 'is-show')} ref=${root} tabindex="-1" role="dialog" aria-modal="true" aria-label=${photoLabel(d, photo)} onContextMenu=${block}>
    ${show
      ? html`<div class="viewer__progress" aria-hidden="true">
          <i key=${photo.key} class=${running ? null : 'is-paused'} onAnimationEnd=${advance}></i>
        </div>`
      : null}
    <header class="viewer__top">
      <${Avatar} player=${p} size=${36} />
      <span class="viewer__who">
        <strong>${mine ? 'Dig' : p?.name || 'En gæst'}</strong>
        <small>${show ? `kl. ${fmtClock(photo.ts)}` : `${fmtAgo(photo.ts, d.t)} · ${index + 1} af ${photos.length}`}</small>
      </span>
      <${IconButton} icon="x" label="Luk" onClick=${close} data-autofocus />
    </header>
    <${ZoomStage} photoKey=${photo.key} src=${full.url || thumb.url} label=${photoLabel(d, photo)} onStep=${go} onClose=${close} onHold=${setHeld} onZoom=${setZoomed}>
      ${!full.url && !full.failed ? html`<span class="viewer__loading"><${Spinner} size=${30} /></span>` : null}
      ${full.failed ? html`<span class="viewer__note">Fuld størrelse er ikke tilgængelig lige nu — du ser en mindre udgave.</span>` : null}
      ${index > 0 ? html`<button type="button" class="viewer__nav viewer__nav--prev" aria-label="Forrige billede" onClick=${() => go(-1)}><${Icon} name="chevron-left" size=${26} /></button>` : null}
      ${index < photos.length - 1 ? html`<button type="button" class="viewer__nav viewer__nav--next" aria-label="Næste billede" onClick=${() => go(1)}><${Icon} name="chevron-right" size=${26} /></button>` : null}
    <//>
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
            ${photos.length > 1
              ? html`<button type="button" class="viewer__action" aria-pressed=${show} onClick=${play}>
                  <${Icon} name=${show ? 'pause' : 'play'} size=${18} />${show ? 'Pause' : 'Afspil'}
                </button>`
              : null}
            <span class="spacer"></span>
            ${canRemove
              ? html`<button type="button" class="viewer__action" onClick=${() => setConfirm(true)}><${Icon} name=${mine ? 'trash' : 'eye'} size=${18} />${mine ? 'Slet' : 'Skjul'}</button>`
              : null}
          </div>`}
      ${extra ? extra(photo) : null}
    </footer>
  </div>`;
}

const RESET = { s: 1, x: 0, y: 0, dx: 0, live: false };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// The photo in the viewer: swipe for the next one, double-tap or pinch to zoom, drag to look
// around while zoomed (on a computer: double-click, ctrl/⌘ + scroll, or + / − / 0).
function ZoomStage({ photoKey, src, label, onStep, onClose, onHold, onZoom, children }) {
  const [view, setView] = useState(RESET);
  const stage = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(null);
  useEffect(() => setView(RESET), [photoKey]);
  useEffect(() => onZoom?.(view.s > 1), [view.s > 1]);
  useEffect(() => () => onHold?.(false), []);

  const box = () => {
    const r = stage.current.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
  };
  // Never zoom out past the whole photo, and never pan it out of the frame.
  const clamp = (v) => {
    const { w, h } = box();
    const s = Math.min(4, Math.max(1, v.s));
    const mx = ((s - 1) * w) / 2;
    const my = ((s - 1) * h) / 2;
    return { ...v, s, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
  };
  // Zoom to s, keeping the point under (px, py) where it is.
  const zoomAt = (s, px, py, base) => {
    const { cx, cy } = box();
    const qx = px - cx;
    const qy = py - cy;
    const k = Math.min(4, Math.max(1, s)) / base.s;
    return clamp({ ...base, s, x: qx - (qx - base.x) * k, y: qy - (qy - base.y) * k });
  };

  useLayoutEffect(() => {
    const onKey = (e) => {
      if (e.key === '+' || e.key === '=') setView((v) => ({ ...zoomAt(v.s * 1.6, box().cx, box().cy, v), live: false }));
      else if (e.key === '-' || e.key === '0') setView(RESET);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDown = (e) => {
    if (e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stage.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    onHold?.(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: 'pinch', d0: dist(a, b) || 1, m0: mid(a, b), base: view };
    } else if (pointers.current.size === 1) {
      gesture.current = { type: view.s > 1 ? 'pan' : 'swipe', x0: e.clientX, y0: e.clientY, t0: Date.now(), base: view };
    }
  };
  const onMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const m = mid(a, b);
      const z = zoomAt((g.base.s * dist(a, b)) / g.d0, g.m0.x, g.m0.y, g.base);
      setView(clamp({ ...z, x: z.x + m.x - g.m0.x, y: z.y + m.y - g.m0.y, dx: 0, live: true }));
    } else if (g.type === 'pan') {
      setView(clamp({ ...g.base, x: g.base.x + e.clientX - g.x0, y: g.base.y + e.clientY - g.y0, live: true }));
    } else if (g.type === 'swipe') {
      const dx = e.clientX - g.x0;
      if (Math.abs(dx) > Math.abs(e.clientY - g.y0)) setView((v) => ({ ...v, dx, live: true }));
    }
  };
  const onUp = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) onHold?.(false);
    const g = gesture.current;
    if (pointers.current.size === 1 && g?.type === 'pinch') {
      // One finger stays down: carry on looking around from here.
      const [p] = [...pointers.current.values()];
      gesture.current = { type: 'pan', x0: p.x, y0: p.y, t0: 0, base: view };
      return;
    }
    if (pointers.current.size || !g) return;
    gesture.current = null;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.type !== 'pinch' && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      // A tap — two in a row zoom in, or back out.
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
        lastTap.current = null;
        setView((v) => (v.s > 1 ? RESET : { ...zoomAt(2.5, e.clientX, e.clientY, v), live: false }));
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        setView((v) => ({ ...v, dx: 0, live: false }));
      }
      return;
    }
    if (g.type === 'swipe') {
      setView((v) => ({ ...v, dx: 0, live: false }));
      const fast = Date.now() - g.t0 < 300;
      if (Math.abs(dx) > Math.max(60, Math.abs(dy)) || (fast && Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy))) onStep(dx < 0 ? 1 : -1);
      else if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose();
      return;
    }
    setView((v) => (v.s < 1.05 ? RESET : { ...v, live: false }));
  };
  const onCancel = (e) => {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) {
      onHold?.(false);
      gesture.current = null;
      setView((v) => ({ ...v, dx: 0, live: false }));
    }
  };
  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setView((v) => ({ ...zoomAt(v.s * Math.exp(-e.deltaY / 200), e.clientX, e.clientY, v), live: false }));
  };

  return html`<div
    class=${cx('viewer__stage', view.s > 1 && 'is-zoomed')}
    ref=${stage}
    onPointerDown=${onDown}
    onPointerMove=${onMove}
    onPointerUp=${onUp}
    onPointerCancel=${onCancel}
    onWheel=${onWheel}
  >
    <${PhotoFrame}
      src=${src}
      fit="contain"
      label=${label}
      class="viewer__photo"
      style=${{ transform: `translate(${view.x + view.dx}px, ${view.y}px) scale(${view.s})`, transition: view.live ? 'none' : 'transform 0.25s var(--ease)' }}
    />
    ${children}
  </div>`;
}

// The final screen: the evening's most liked photo, and the way to all of them.
export function PhotoOfTheNight({ room, d, onAll }) {
  const best = d.photos.reduce((a, b) => (!a || likesOf(d, b.key) > likesOf(d, a.key) ? b : a), null);
  const thumb = useThumb(room, best, !!best);
  const full = useFullPhoto(room, best, !!best);
  if (!best) return null;
  const likes = likesOf(d, best.key);
  const p = d.players.get(best.pid);
  return html`<section class="section">
    <h2 class="section__title">📸 ${likes ? 'Aftenens billede' : 'Aftenens seneste billede'}</h2>
    <button type="button" class="potn" style=${{ aspectRatio: String(ratio(best)) }} onClick=${() => eventUi.set({ photo: best.key })} onContextMenu=${block} aria-label=${`Åbn ${photoLabel(d, best)}`}>
      <${PhotoFrame} src=${full.url || thumb.url} />
      <span class="potn__foot" aria-hidden="true">
        <${Avatar} player=${p} size=${28} />
        <span class="potn__who"><strong>${p?.isMe ? 'Dig' : p?.name}</strong>${best.cap ? html` — ${best.cap}` : null}</span>
        ${likes ? html`<span class="potn__likes">${LIKE} ${likes}</span>` : null}
      </span>
    </button>
    ${d.photos.length > 1
      ? html`<div class="potn__actions">
          <${Button} variant="secondary" icon="play" onClick=${() => playEvening(d)}>Afspil aftenen<//>
          <${Button} variant="secondary" icon="image" onClick=${onAll}>Se alle ${d.photos.length}<//>
        </div>`
      : null}
  </section>`;
}
