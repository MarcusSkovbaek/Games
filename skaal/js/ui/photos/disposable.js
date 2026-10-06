// The disposable camera (an event setting, see DISPOSABLE in game/photos.js): you shoot without
// seeing what you shoot. There is no viewfinder and no second look — each shot is shared at once
// and develops for everyone, the one who took it included, 24 hours later. 23 shots each.
// The camera picture is there (it has to be, to take the photo) but always covered up.
import { html, useState, useEffect, useLayoutEffect, useRef, useModalFocus, Icon, IconButton, Button, Spinner, cx } from '../kit.js';
import { preparePhoto, sharePhoto } from '../../app/photos.js';
import { DISPOSABLE } from '../../game/photos.js';
import { toast } from '../ui-store.js';
import { sfx, haptic } from '../feedback.js';
import { fmtWhen } from '../format.js';
import { useCameraStream, useSelfTimer, Countdown, FlashTool, TimerTool, FlipTool } from './stream.js';

export const shotsLeft = (d) => Math.max(0, DISPOSABLE.shots - d.shotsUsed);

export function DisposableCamera({ room, d, onClose }) {
  const root = useRef(null);
  useModalFocus(root);
  const video = useRef(null);
  const [torch, setTorch] = useState(false); // the phone's light can flash (back camera)
  const [flash, setFlash] = useState(false);
  const [lit, setLit] = useState(false); // the white screen that lights up a selfie
  const [busy, setBusy] = useState(false);
  const shooting = useRef(false); // one shot at a time, even for a quick double tap
  const [blink, setBlink] = useState(0);
  const [clicked, setClicked] = useState(null); // when the shot just taken develops
  const selfTimer = useSelfTimer();
  // Counted here too, until the shot just taken is in the log.
  const taken = useRef(0);
  const used = Math.max(d.shotsUsed, taken.current);
  const left = Math.max(0, DISPOSABLE.shots - used);
  // With the film used up, the camera isn't needed.
  const { status, facing, start, flip, track } = useCameraStream(video, (_, caps) => setTorch(!!caps.torch), left > 0);
  // Our shots that no broker has yet (no connection): they go out by themselves later.
  const waiting = d.undeveloped.filter((ph) => ph.pid === room.pid && d.t - ph.ts > 5000 && !room.photoSent(ph.asset)).length;

  useLayoutEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !e.defaultPrevented && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!clicked) return undefined;
    const t = setTimeout(() => setClicked(null), 4000);
    return () => clearTimeout(t);
  }, [clicked]);

  // The flash: the phone's light on the back, a white screen for a selfie.
  const light = async (on) => {
    if (facing === 'user') setLit(on);
    else await track()?.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
  };

  const capture = async () => {
    const v = video.current;
    if (!v || status !== 'live' || !v.videoWidth || shooting.current || left <= 0) return;
    shooting.current = true;
    setBusy(true);
    const flashing = flash && (facing === 'user' || torch);
    try {
      if (flashing) {
        await light(true);
        await new Promise((r) => setTimeout(r, 300)); // let the camera adjust to the light
      }
      sfx.shutter();
      haptic(20);
      const prepared = await preparePhoto(v, { mirror: facing === 'user' });
      if (flashing) await light(false);
      setBlink((b) => b + 1);
      if (!prepared) throw new Error('No picture');
      const entry = await sharePhoto(room, prepared, '', { disposable: true });
      taken.current = used + 1;
      setClicked(entry.ts + DISPOSABLE.developMs);
      sfx.wind();
    } catch {
      toast('Billedet blev ikke taget — prøv igen', { icon: '🎞️', tone: 'bad' });
    } finally {
      if (flashing) light(false);
      shooting.current = false;
      setBusy(false);
    }
  };

  const ready = status === 'live' || status === 'starting' || status === 'off';
  return html`<div class="camera dispo" ref=${root} tabindex="-1" role="dialog" aria-modal="true" aria-label="Engangskamera">
    <video ref=${video} class="camera__video is-on" autoplay muted playsinline aria-hidden="true"></video>
    <div class="dispo__body" aria-hidden="true"></div>
    ${blink ? html`<div class="camera__blink" key=${blink} aria-hidden="true"></div>` : null}
    ${lit ? html`<div class="camera__lit" aria-hidden="true"></div>` : null}
    <${Countdown} count=${selfTimer.count} />

    <header class="camera__top">
      <${IconButton} icon="x" label="Luk kameraet" onClick=${onClose} />
      <span class="spacer"></span>
      ${status === 'live'
        ? html`
            ${torch || facing === 'user' ? html`<${FlashTool} on=${flash} onClick=${() => setFlash(!flash)} />` : null}
            <${TimerTool} timer=${selfTimer.timer} onClick=${selfTimer.next} />
            <${FlipTool} facing=${facing} onClick=${flip} />`
        : null}
    </header>

    ${ready
      ? html`<div class="dispo__main">
            <div class="dispo__window" role="status">
              ${clicked
                ? html`<strong key=${clicked}>Klik! 📸</strong><span>Fremkaldes ${fmtWhen(clicked, d.t)}</span>`
                : !left
                  ? html`<strong>Filmen er brugt op 🎞️</strong><span>Dine billeder fremkaldes 24 timer efter, de er taget</span>`
                  : status === 'starting'
                    ? html`<${Spinner} size=${26} /><span>Starter kameraet …</span>`
                    : html`<strong>Sigt — og skyd</strong><span>Ingen ser billederne, før de er fremkaldt</span>`}
            </div>
            <div class=${cx('dispo__counter', !left && 'is-empty')}>
              <span class="dispo__digits" key=${left} aria-hidden="true">${String(left).padStart(2, '0')}</span>
              <span class="dispo__label">${left === 1 ? 'billede tilbage' : 'billeder tilbage'}<span class="sr-only">: ${left}</span></span>
            </div>
            <div class="dispo__film" aria-hidden="true">
              ${Array.from({ length: DISPOSABLE.shots }, (_, i) => html`<i class=${i < used ? 'is-used' : null}></i>`)}
            </div>
          </div>
          <div class="dispo__controls">
            <button
              type="button"
              data-autofocus
              class=${cx('camera__shutter dispo__shutter', selfTimer.count && 'is-counting')}
              aria-label=${selfTimer.count ? 'Stop selvudløseren' : `Tag billede (${left} tilbage)`}
              onClick=${() => selfTimer.press(capture)}
              disabled=${status !== 'live' || busy || !left}
            >
              <span></span>
            </button>
            <p class="camera__note">
              ${waiting
                ? html`<${Icon} name="clock" size=${13} />${waiting === 1 ? 'Et billede' : `${waiting} billeder`} sendes, når der er forbindelse`
                : html`<${Icon} name="lock" size=${13} />Kun folk i eventet ser billederne, når de er fremkaldt`}
            </p>
          </div>`
      : html`<div class="camera__fallback">
          <span class="camera__fallback-icon" aria-hidden="true">🎞️</span>
          <h2>${status === 'denied' ? 'Appen har ikke adgang til kameraet' : 'Kameraet kan ikke åbnes her'}</h2>
          <p>
            ${status === 'denied'
              ? 'Engangskameraet tager billederne direkte i appen. Giv adgang til kameraet i browserens indstillinger, og prøv igen.'
              : 'Engangskameraet tager billederne direkte i appen. Prøv igen — eller åbn eventet i telefonens browser.'}
          </p>
          <div class="stack">
            <${Button} onClick=${() => start()}>Prøv kameraet igen<//>
            <${Button} variant="ghost" onClick=${onClose}>Luk<//>
          </div>
        </div>`}
  </div>`;
}
