// What the cameras in the app share (the camera, and the disposable camera): the camera stream
// itself, the self-timer and the buttons in the top bar.
import { html, useState, useEffect, useRef, Icon, cx } from '../kit.js';
import { prefs } from '../ui-store.js';
import { sfx } from '../feedback.js';

export const TIMERS = [0, 3, 10];

// zoom: true asks for the camera's own zoom where the browser offers it (Chrome on Android).
function constraints(facing) {
  return { audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 }, zoom: true } };
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

// The camera, playing in `video` while `on`: let go of while the app is in the background and when
// the camera closes (also if that happens while it is still opening). `onTrack(track,
// capabilities)` sets up each new stream. status: starting | live | denied | unavailable | off.
export function useCameraStream(video, onTrack, on = true) {
  const stream = useRef(null);
  const tries = useRef(0); // a newer start (or a stop) makes a stream still on its way stale
  const wanted = useRef(on);
  wanted.current = on;
  const [status, setStatus] = useState(on ? 'starting' : 'off');
  const [facing, setFacing] = useState(() => prefs.get().cameraFacing || 'environment');
  const facingNow = useRef(facing);
  const setup = useRef(onTrack);
  setup.current = onTrack;

  const stop = () => {
    tries.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const start = async (which = facingNow.current) => {
    stop();
    const mine = tries.current;
    setStatus('starting');
    try {
      const s = await openStream(which);
      if (mine !== tries.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      const track = s.getVideoTracks()[0];
      // Another app took the camera (or it was unplugged): say so and offer to try again.
      if (track) track.onended = () => stream.current === s && setStatus('unavailable');
      setup.current?.(track, track?.getCapabilities?.() || {});
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
      }
      if (mine === tries.current) setStatus('live');
    } catch (err) {
      if (mine === tries.current) setStatus(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'unavailable');
    }
  };

  const flip = () => {
    const next = facingNow.current === 'user' ? 'environment' : 'user';
    facingNow.current = next;
    setFacing(next);
    prefs.set({ cameraFacing: next });
    start(next);
  };

  useEffect(() => {
    document.documentElement.classList.add('scroll-locked', 'media-open');
    const onVis = () => {
      if (document.visibilityState === 'hidden') stop();
      else if (!stream.current && wanted.current) start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.documentElement.classList.remove('scroll-locked', 'media-open');
      stop();
    };
  }, []);
  useEffect(() => {
    if (on) start();
    else {
      stop();
      setStatus('off');
    }
  }, [on]);

  return { status, facing, start, flip, track: () => stream.current?.getVideoTracks()[0] || null };
}

// The self-timer: `press(shoot)` shoots at once — or after the countdown, which pressing again
// stops.
export function useSelfTimer() {
  const [timer, setTimer] = useState(0);
  const [count, setCount] = useState(0);
  const countdown = useRef(null);
  useEffect(() => () => clearInterval(countdown.current), []);
  const press = (shoot) => {
    if (count) {
      clearInterval(countdown.current);
      setCount(0);
      return;
    }
    if (!timer) {
      shoot();
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
        shoot();
      }
    }, 1000);
  };
  return { timer, count, press, next: () => setTimer(TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length]) };
}

export function Countdown({ count }) {
  return count ? html`<div class="camera__count" aria-live="assertive" key=${count}>${count}</div>` : null;
}

export function FlashTool({ on, onClick }) {
  return html`<button type="button" class=${cx('camera__tool', on && 'is-on')} aria-pressed=${on} aria-label="Blitz" onClick=${onClick}>
    <${Icon} name="zap" size=${20} />
  </button>`;
}

export function TimerTool({ timer, onClick }) {
  return html`<button type="button" class=${cx('camera__tool', timer && 'is-on')} aria-label=${`Selvudløser: ${timer ? `${timer} sekunder` : 'fra'}`} onClick=${onClick}>
    <${Icon} name="timer" size=${20} />${timer ? html`<small>${timer}s</small>` : null}
  </button>`;
}

export function FlipTool({ facing, onClick }) {
  return html`<button type="button" class="camera__tool" aria-label=${facing === 'user' ? 'Skift til bagkameraet' : 'Skift til selfie-kameraet'} onClick=${onClick}>
    <${Icon} name="switch-camera" size=${20} />
  </button>`;
}
