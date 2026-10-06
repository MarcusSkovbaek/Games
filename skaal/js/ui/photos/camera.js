// The camera, right in the app: a live viewfinder, front/back camera, flash, self-timer, and a
// look at the picture before it is shared. Photos taken here never land in the phone's camera
// roll — they only exist inside the event. Where the browser can't open the camera directly, the
// phone's own camera (or the camera roll) is used instead.
import { html, useState, useEffect, useRef, useStore, Icon, IconButton, Button, Spinner, cx } from '../kit.js';
import { preparePhoto, bitmapFromFile, sharePhoto, PHOTO } from '../../app/photos.js';
import { eventUi } from '../screens/event.js';
import { prefs, toast } from '../ui-store.js';
import { sfx, haptic } from '../feedback.js';
import { PhotoFrame } from './photo.js';

const TIMERS = [0, 3, 10];

function constraints(facing) {
  return { audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } } };
}

async function openStream(facing) {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
  try {
    return await md.getUserMedia(constraints(facing));
  } catch (err) {
    if (err?.name === 'OverconstrainedError') return md.getUserMedia({ audio: false, video: true });
    throw err;
  }
}

export function CameraOverlay({ room }) {
  const open = useStore(eventUi, (s) => s.camera);
  if (!open) return null;
  return html`<${Camera} room=${room} onClose=${() => eventUi.set({ camera: false })} />`;
}

function Camera({ room, onClose }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [facing, setFacing] = useState(() => prefs.get().cameraFacing || 'environment');
  const facingNow = useRef(facing);
  facingNow.current = facing;
  const [lit, setLit] = useState(false); // the white screen that lights up a selfie
  const [status, setStatus] = useState('starting'); // starting | live | denied | unavailable
  const [torch, setTorch] = useState({ can: false, on: false });
  const [flash, setFlash] = useState(false); // screen flash for the front camera
  const [timer, setTimer] = useState(0);
  const [count, setCount] = useState(0);
  const [shot, setShot] = useState(null); // { prepared, url }
  const [busy, setBusy] = useState(false);
  const [blink, setBlink] = useState(0);
  const [last, setLast] = useState(null);
  const countdown = useRef(null);

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const start = async (which = facingNow.current) => {
    stop();
    setStatus('starting');
    try {
      const s = await openStream(which);
      stream.current = s;
      const track = s.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() || {};
      setTorch({ can: !!caps.torch, on: false });
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
      }
      setStatus('live');
    } catch (err) {
      setStatus(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'unavailable');
    }
  };

  useEffect(() => {
    document.documentElement.classList.add('scroll-locked', 'media-open');
    start();
    // Let go of the camera while the app is in the background.
    const onVis = () => {
      if (document.visibilityState === 'hidden') stop();
      else if (!stream.current) start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.documentElement.classList.remove('scroll-locked', 'media-open');
      clearInterval(countdown.current);
      stop();
    };
  }, []);

  useEffect(() => () => shot?.url && URL.revokeObjectURL(shot.url), [shot]);

  const flip = () => {
    const next = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    prefs.set({ cameraFacing: next });
    start(next);
  };

  const toggleTorch = async () => {
    const on = !torch.on;
    try {
      await stream.current?.getVideoTracks()[0]?.applyConstraints({ advanced: [{ torch: on }] });
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
      const prepared = await preparePhoto(v, { mirror: facing === 'user' });
      setLit(false);
      setBlink((b) => b + 1);
      review(prepared);
    } finally {
      setLit(false);
      setBusy(false);
    }
  };

  const shutter = () => {
    if (count) {
      clearInterval(countdown.current);
      setCount(0);
      return;
    }
    if (!timer) {
      capture();
      return;
    }
    let left = timer;
    setCount(left);
    countdown.current = setInterval(() => {
      left -= 1;
      if (left > 0) {
        setCount(left);
        sfx.tick();
      } else {
        clearInterval(countdown.current);
        setCount(0);
        capture();
      }
    }, 1000);
  };

  const onFile = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Vælg venligst et billede', { icon: '🖼️', tone: 'bad' });
      return;
    }
    setBusy(true);
    try {
      review(await preparePhoto(await bitmapFromFile(file)));
    } catch {
      toast('Billedet kunne ikke åbnes', { icon: '🖼️', tone: 'bad' });
    } finally {
      setBusy(false);
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

  const filePicker = (label, icon, { capture, name } = {}) =>
    html`<label class=${cx('camera__pick', !label && 'camera__pick--icon')}>
      <input type="file" accept="image/*" capture=${capture || null} class="sr-only" aria-label=${name || label} onChange=${onFile} disabled=${busy} />
      <${Icon} name=${icon} size=${label ? 20 : 24} />${label}
    </label>`;

  return html`<div class="camera" role="dialog" aria-modal="true" aria-label="Kamera">
    <video ref=${video} class=${cx('camera__video', facing === 'user' && 'is-mirrored', status === 'live' && !shot && 'is-on')} autoplay muted playsinline aria-hidden="true"></video>
    ${blink ? html`<div class="camera__blink" key=${blink} aria-hidden="true"></div>` : null}
    ${lit ? html`<div class="camera__lit" aria-hidden="true"></div>` : null}
    ${count ? html`<div class="camera__count" aria-live="assertive" key=${count}>${count}</div>` : null}

    <header class="camera__top">
      <${IconButton} icon="x" label="Luk kameraet" onClick=${onClose} />
      <span class="spacer"></span>
      ${status === 'live' && !shot
        ? html`
            ${torch.can || facing === 'user'
              ? html`<button
                  type="button"
                  class=${cx('camera__tool', (torch.on || (flash && facing === 'user')) && 'is-on')}
                  aria-pressed=${torch.can ? torch.on : flash}
                  aria-label="Blitz"
                  onClick=${() => (torch.can ? toggleTorch() : setFlash(!flash))}
                >
                  <${Icon} name="zap" size=${20} />
                </button>`
              : null}
            <button type="button" class=${cx('camera__tool', timer && 'is-on')} aria-label=${`Selvudløser: ${timer ? `${timer} sekunder` : 'fra'}`} onClick=${() => setTimer(TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length])}>
              <${Icon} name="timer" size=${20} />${timer ? html`<small>${timer}s</small>` : null}
            </button>
            <button type="button" class="camera__tool" aria-label=${facing === 'user' ? 'Skift til bagkameraet' : 'Skift til selfie-kameraet'} onClick=${flip}>
              <${Icon} name="switch-camera" size=${20} />
            </button>`
        : null}
    </header>

    ${shot
      ? html`<${Review} shot=${shot} busy=${busy} onRetake=${() => setShot(null)} onShare=${share} />`
      : status === 'live' || status === 'starting'
        ? html`<div class="camera__live">
            ${status === 'starting' ? html`<div class="camera__wait"><${Spinner} size=${30} /><span>Starter kameraet …</span></div>` : null}
            <div class="camera__controls">
              ${filePicker('', 'image', { name: 'Vælg fra kamerarullen' })}
              <button type="button" class=${cx('camera__shutter', count && 'is-counting')} aria-label=${count ? 'Stop selvudløseren' : 'Tag billede'} onClick=${shutter} disabled=${status !== 'live' || busy}>
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
              ${status === 'denied' ? html`<${Button} variant="ghost" onClick=${() => start()}>Prøv igen<//>` : null}
            </div>
          </div>`}
    ${busy && !shot ? html`<div class="camera__busy"><${Spinner} size=${34} /></div>` : null}
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
