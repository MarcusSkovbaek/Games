// The camera, right in the app: a live viewfinder, front/back camera, flash, zoom, self-timer, and
// a look at the picture before it is shared. Photos taken here never land in the phone's camera
// roll — they only exist inside the event. Where the browser can't open the camera directly, the
// phone's own camera (or the camera roll) is used instead.
import { html, useState, useEffect, useLayoutEffect, useRef, useModalFocus, Icon, IconButton, Button, Spinner, cx } from '../kit.js';
import { preparePhoto, bitmapFromFile, sharePhoto, PHOTO } from '../../app/photos.js';
import { eventUi } from '../screens/event.js';
import { toast } from '../ui-store.js';
import { sfx, haptic } from '../feedback.js';
import { PhotoFrame } from './photo.js';
import { useCameraStream, useSelfTimer, Countdown, FlashTool, TimerTool, FlipTool } from './stream.js';

// Photos picked from the camera roll in one go.
const MAX_PICK = 10;
// Zooming by cropping the picture (where the camera can't zoom itself) stops at 3×, before it
// gets too blurry.
const DIGITAL_MAX = 3;
const zoomText = (z) => `${String(Math.round(z * 10) / 10).replace('.', ',')}×`;

export function Camera({ room, onClose }) {
  const root = useRef(null);
  useModalFocus(root);
  const video = useRef(null);
  const [lit, setLit] = useState(false); // the white screen that lights up a selfie
  const [torch, setTorch] = useState({ can: false, on: false });
  const [flash, setFlash] = useState(false); // screen flash for the front camera
  const selfTimer = useSelfTimer();
  const [shot, setShot] = useState(null); // { prepared, url }
  const [batch, setBatch] = useState(null); // several from the camera roll: [{ prepared, url }]
  const [progress, setProgress] = useState(null); // "3 af 8" while preparing or sharing them
  const [busy, setBusy] = useState(false);
  const [blink, setBlink] = useState(0);
  const [last, setLast] = useState(null);
  // Zoom: the camera's own where it has one ({ min, max }), otherwise by cropping the picture.
  const [zoom, setZoom] = useState(1);
  const [lens, setLens] = useState(null);
  const zoomNow = useRef(1);
  zoomNow.current = zoom;
  const lensNow = useRef(null);
  lensNow.current = lens;

  const { status, facing, start, flip, track: liveTrack } = useCameraStream(video, (track, caps) => {
    setTorch({ can: !!caps.torch, on: false });
    const hw = caps.zoom?.max > 1 ? { min: Math.max(1, caps.zoom.min || 1), max: Math.min(8, caps.zoom.max) } : null;
    setLens(hw);
    lensNow.current = hw;
    setZoom(1);
    zoomNow.current = 1;
    if (hw) track.applyConstraints({ advanced: [{ zoom: hw.min }] }).catch(() => {});
  });

  useEffect(() => () => shot?.url && URL.revokeObjectURL(shot.url), [shot]);

  // Escape: from the review back to the camera, from the camera out.
  const escape = useRef(null);
  escape.current = () => (shot ? setShot(null) : batch ? !busy && setBatch(null) : onClose());
  useLayoutEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !e.defaultPrevented && escape.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The camera's own zoom takes a moment per change: send only the latest one while it works.
  const lensBusy = useRef(false);
  const lensWant = useRef(1);
  const zoomLens = (z) => {
    lensWant.current = z;
    const track = liveTrack();
    if (lensBusy.current || !track || !lensNow.current) return;
    lensBusy.current = true;
    track
      .applyConstraints({ advanced: [{ zoom: Math.max(lensNow.current.min, z) }] })
      .catch(() => {
        // It wouldn't: crop the picture instead.
        lensNow.current = null;
        setLens(null);
      })
      .finally(() => {
        lensBusy.current = false;
        if (lensWant.current !== z) zoomLens(lensWant.current);
      });
  };
  const zoomTo = (z) => {
    const max = lensNow.current ? lensNow.current.max : DIGITAL_MAX;
    const next = Math.round(Math.min(max, Math.max(1, z)) * 20) / 20;
    if (next === zoomNow.current) return;
    zoomNow.current = next;
    setZoom(next);
    if (lensNow.current) zoomLens(next);
  };
  // Pinch the viewfinder to zoom (or ctrl/⌘ + scroll on a computer).
  const fingers = useRef({ at: new Map(), d0: 0, z0: 1 });
  const spread = () => {
    const [a, b] = [...fingers.current.at.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };
  const finger = {
    onPointerDown: (e) => {
      const f = fingers.current;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* not a real pointer */
      }
      f.at.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (f.at.size === 2) {
        f.d0 = spread();
        f.z0 = zoomNow.current;
      }
    },
    onPointerMove: (e) => {
      const f = fingers.current;
      if (!f.at.has(e.pointerId)) return;
      f.at.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (f.at.size === 2) zoomTo((f.z0 * spread()) / f.d0);
    },
    onPointerUp: (e) => fingers.current.at.delete(e.pointerId),
    onPointerCancel: (e) => fingers.current.at.delete(e.pointerId),
    onWheel: (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoomNow.current * Math.exp(-e.deltaY / 200));
    },
  };

  const toggleTorch = async () => {
    const on = !torch.on;
    try {
      await liveTrack()?.applyConstraints({ advanced: [{ torch: on }] });
      setTorch({ can: true, on });
    } catch {
      setTorch({ can: false, on: false });
    }
  };

  const review = (prepared) => {
    if (!prepared) {
      toast('Billedet kunne ikke bruges — prøv igen', { icon: '📷', tone: 'bad' });
      return;
    }
    setShot({ prepared, url: URL.createObjectURL(new Blob([prepared.full], { type: 'image/jpeg' })) });
  };

  const capture = async () => {
    const v = video.current;
    if (!v || status !== 'live' || !v.videoWidth) return;
    setBusy(true);
    const screenFlash = flash && facing === 'user';
    if (screenFlash) {
      setLit(true);
      await new Promise((r) => setTimeout(r, 280)); // let the camera adjust to the light
    }
    sfx.shutter();
    haptic(20);
    try {
      const prepared = await preparePhoto(v, { mirror: facing === 'user', zoom: lens ? 1 : zoom });
      setLit(false);
      setBlink((b) => b + 1);
      review(prepared);
    } finally {
      setLit(false);
      setBusy(false);
    }
  };

  // A picture from the phone, ready to share (the decoded original is let go of at once).
  const prepareFile = async (file) => {
    const picture = await bitmapFromFile(file);
    try {
      return await preparePhoto(picture);
    } finally {
      picture.close?.();
    }
  };

  const onFile = async (e) => {
    const all = [...(e.currentTarget.files || [])];
    e.currentTarget.value = '';
    if (!all.length) return;
    const files = all.filter((f) => f.type.startsWith('image/'));
    if (!files.length) {
      toast('Vælg venligst et billede', { icon: '🖼️', tone: 'bad' });
      return;
    }
    setBusy(true);
    try {
      if (files.length === 1) {
        review(await prepareFile(files[0]));
        return;
      }
      const picked = files.slice(0, MAX_PICK);
      const ready = [];
      for (const [i, file] of picked.entries()) {
        setProgress(`Gør billederne klar … ${i + 1} af ${picked.length}`);
        const prepared = await prepareFile(file).catch(() => null);
        if (prepared) ready.push({ prepared, url: URL.createObjectURL(new Blob([prepared.thumb], { type: 'image/jpeg' })) });
      }
      if (files.length > MAX_PICK) toast(`Højst ${MAX_PICK} ad gangen — de første ${MAX_PICK} er med`, { icon: '🖼️' });
      if (ready.length < picked.length) toast(`${picked.length - ready.length} af billederne kunne ikke åbnes`, { icon: '🖼️', tone: 'bad' });
      if (ready.length) setBatch(ready);
    } catch {
      toast('Billedet kunne ikke åbnes', { icon: '🖼️', tone: 'bad' });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  useEffect(() => () => batch?.forEach((b) => URL.revokeObjectURL(b.url)), [batch]);

  // Several photos: shared one by one; the caption goes with the first. If one fails, the rest
  // stay here to try again.
  const shareBatch = async (items, caption) => {
    setBusy(true);
    let done = 0;
    let entry = null;
    try {
      for (const item of items) {
        setProgress(`Deler ${done + 1} af ${items.length} …`);
        entry = await sharePhoto(room, item.prepared, done === 0 ? caption : '');
        done++;
      }
      setBatch(null);
      toast(`📸 ${done} billeder delt med alle i eventet`, { tone: 'good' });
    } catch {
      toast(done ? `${done} af ${items.length} billeder blev delt — prøv igen med resten` : 'Billederne kunne ikke deles', { icon: '📷', tone: 'bad' });
      if (done) setBatch(items.slice(done));
    } finally {
      if (entry) {
        const lastItem = items[done - 1];
        setLast({ key: `${room.pid}:${entry.id}`, url: URL.createObjectURL(new Blob([lastItem.prepared.full], { type: 'image/jpeg' })) });
        sfx.pop();
        haptic(15);
      }
      setBusy(false);
      setProgress(null);
    }
  };

  const share = async (caption) => {
    setBusy(true);
    try {
      const entry = await sharePhoto(room, shot.prepared, caption);
      setLast({ key: `${room.pid}:${entry.id}`, url: URL.createObjectURL(new Blob([shot.prepared.full], { type: 'image/jpeg' })) });
      sfx.pop();
      haptic(15);
      toast('📸 Delt med alle i eventet', { tone: 'good' });
      setShot(null);
    } catch {
      toast('Billedet kunne ikke deles', { icon: '📷', tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => () => last?.url && URL.revokeObjectURL(last.url), [last]);

  // Looking at what was taken or picked, before it is shared.
  const reviewing = !!shot || !!batch;

  // The camera roll lets you pick several at once; the phone's own camera takes one.
  const filePicker = (label, icon, { capture, name } = {}) =>
    html`<label class=${cx('camera__pick', !label && 'camera__pick--icon')}>
      <input type="file" accept="image/*" capture=${capture || null} multiple=${!capture} class="sr-only" aria-label=${name || label} onChange=${onFile} disabled=${busy} />
      <${Icon} name=${icon} size=${label ? 20 : 24} />${label}
    </label>`;

  return html`<div class="camera" ref=${root} tabindex="-1" role="dialog" aria-modal="true" aria-label="Kamera">
    <video
      ref=${video}
      class=${cx('camera__video', facing === 'user' && 'is-mirrored', status === 'live' && !reviewing && 'is-on')}
      style=${{ '--zoom': lens ? 1 : zoom }}
      autoplay
      muted
      playsinline
      aria-hidden="true"
    ></video>
    ${status === 'live' && !reviewing ? html`<div class="camera__finder" aria-hidden="true" ...${finger}></div>` : null}
    ${blink ? html`<div class="camera__blink" key=${blink} aria-hidden="true"></div>` : null}
    ${lit ? html`<div class="camera__lit" aria-hidden="true"></div>` : null}
    <${Countdown} count=${selfTimer.count} />

    <header class="camera__top">
      <${IconButton} icon="x" label="Luk kameraet" onClick=${onClose} />
      <span class="spacer"></span>
      ${status === 'live' && !reviewing
        ? html`
            ${torch.can || facing === 'user'
              ? html`<${FlashTool} on=${torch.can ? torch.on : flash} onClick=${() => (torch.can ? toggleTorch() : setFlash(!flash))} />`
              : null}
            <${TimerTool} timer=${selfTimer.timer} onClick=${selfTimer.next} />
            <${FlipTool} facing=${facing} onClick=${flip} />`
        : null}
    </header>

    ${shot
      ? html`<${Review} shot=${shot} busy=${busy} onRetake=${() => setShot(null)} onShare=${share} />`
      : batch
        ? html`<${BatchReview}
            items=${batch}
            busy=${busy}
            progress=${progress}
            onRemove=${(i) => setBatch(batch.length > 1 ? batch.filter((_, j) => j !== i) : null)}
            onCancel=${() => setBatch(null)}
            onShare=${(cap) => shareBatch(batch, cap)}
          />`
      : status === 'live' || status === 'starting'
        ? html`<div class="camera__live">
            ${status === 'starting' ? html`<div class="camera__wait"><${Spinner} size=${30} /><span>Starter kameraet …</span></div>` : null}
            ${status === 'live'
              ? html`<button type="button" class=${cx('camera__zoom', zoom > 1 && 'is-on')} aria-label=${`Zoom: ${zoomText(zoom)}`} onClick=${() => zoomTo(zoom >= 1.95 ? 1 : 2)}>
                  ${zoomText(zoom)}
                </button>`
              : null}
            <div class="camera__controls">
              ${filePicker('', 'image', { name: 'Vælg fra kamerarullen' })}
              <button
                type="button"
                data-autofocus
                class=${cx('camera__shutter', selfTimer.count && 'is-counting')}
                aria-label=${selfTimer.count ? 'Stop selvudløseren' : 'Tag billede'}
                onClick=${() => selfTimer.press(capture)}
                disabled=${status !== 'live' || busy}
              >
                <span></span>
              </button>
              ${last
                ? html`<button type="button" class="camera__last" aria-label="Se det sidste billede" onClick=${() => eventUi.set({ camera: false, photo: last.key })}>
                    <${PhotoFrame} src=${last.url} />
                  </button>`
                : html`<span class="camera__last is-empty"></span>`}
            </div>
            <p class="camera__note"><${Icon} name="lock" size=${13} />Kun folk i eventet kan se billederne — de gemmes ikke i din kamerarulle.</p>
          </div>`
        : html`<div class="camera__fallback">
            <span class="camera__fallback-icon" aria-hidden="true">📷</span>
            <h2>${status === 'denied' ? 'Appen har ikke adgang til kameraet' : 'Kameraet kan ikke åbnes her'}</h2>
            <p>${status === 'denied' ? 'Giv adgang til kameraet i browserens indstillinger og prøv igen — eller brug telefonens eget kamera.' : 'Brug telefonens eget kamera i stedet — billedet deles stadig kun i eventet.'}</p>
            <div class="stack">
              ${filePicker('Åbn telefonens kamera', 'camera', { capture: 'environment' })}
              ${filePicker('Vælg fra kamerarullen', 'image')}
              <${Button} variant="ghost" onClick=${() => start()}>Prøv kameraet igen<//>
            </div>
          </div>`}
    ${busy && !reviewing
      ? html`<div class="camera__busy" role="status">
          <${Spinner} size=${34} />
          ${progress ? html`<span>${progress}</span>` : null}
        </div>`
      : null}
  </div>`;
}

function BatchReview({ items, busy, progress, onRemove, onCancel, onShare }) {
  const [cap, setCap] = useState('');
  const n = items.length;
  return html`<div class="camera__review">
    <div class="camera__batch" aria-label="Valgte billeder">
      ${items.map(
        (it, i) => html`<div class="camera__batch-item" key=${it.url}>
          <${PhotoFrame} src=${it.url} label=${`Billede ${i + 1} af ${n}`} />
          <button type="button" class="camera__batch-remove" aria-label=${`Fjern billede ${i + 1}`} onClick=${() => onRemove(i)} disabled=${busy}>
            <${Icon} name="x" size=${16} />
          </button>
        </div>`,
      )}
    </div>
    <div class="camera__form">
      <input class="input" maxlength=${PHOTO.captionMax} placeholder="Skriv en tekst (valgfri)" aria-label="Tekst til billederne" value=${cap} onInput=${(e) => setCap(e.currentTarget.value)} />
      <p class="camera__batch-note" aria-live="polite">${progress || 'Teksten kommer med det første billede.'}</p>
      <div class="btn-row">
        <${Button} variant="secondary" onClick=${onCancel} disabled=${busy}>Annullér<//>
        <${Button} icon="check" loading=${busy} onClick=${() => onShare(cap)}>Del ${n} ${n === 1 ? 'billede' : 'billeder'}<//>
      </div>
    </div>
  </div>`;
}

function Review({ shot, busy, onRetake, onShare }) {
  const [cap, setCap] = useState('');
  return html`<div class="camera__review">
    <${PhotoFrame} src=${shot.url} fit="contain" label="Billedet du har taget" class="camera__shot" />
    <div class="camera__form">
      <input class="input" maxlength=${PHOTO.captionMax} placeholder="Skriv en tekst (valgfri)" aria-label="Tekst til billedet" value=${cap} onInput=${(e) => setCap(e.currentTarget.value)} />
      <div class="btn-row">
        <${Button} variant="secondary" icon="rotate-ccw" onClick=${onRetake} disabled=${busy}>Tag om<//>
        <${Button} icon="check" loading=${busy} onClick=${() => onShare(cap)}>Del med alle<//>
      </div>
    </div>
  </div>`;
}
