// Sound effects (synthesised with Web Audio — no audio files), haptics and confetti.
import { prefs } from './ui-store.js';

let ctx = null;
let master = null;

function audio() {
  if (!prefs.get().sound) return null;
  try {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// iOS only allows audio after a user gesture — unlock on the first touch.
export function installAudioUnlock() {
  const unlock = () => {
    const a = audio();
    if (a) {
      const b = a.createBuffer(1, 1, 22050);
      const s = a.createBufferSource();
      s.buffer = b;
      s.connect(master);
      s.start(0);
    }
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
}

function tone({ freq = 440, to, type = 'sine', at = 0, dur = 0.15, gain = 0.3, attack = 0.005 }) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise({ at = 0, dur = 0.3, gain = 0.15, from = 800, to = 3000 }) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + at;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  // Glass "clink" for logging a drink.
  clink() {
    tone({ freq: 2093, type: 'sine', dur: 0.5, gain: 0.18 });
    tone({ freq: 3136, type: 'sine', dur: 0.35, gain: 0.08, at: 0.005 });
    tone({ freq: 4186, type: 'triangle', dur: 0.18, gain: 0.04, at: 0.01 });
  },
  pop() {
    tone({ freq: 420, to: 900, type: 'sine', dur: 0.09, gain: 0.25 });
  },
  tick() {
    tone({ freq: 1800, type: 'square', dur: 0.025, gain: 0.05 });
  },
  whoosh() {
    noise({ dur: 0.45, gain: 0.12, from: 400, to: 2600 });
  },
  notify() {
    tone({ freq: 880, type: 'sine', dur: 0.16, gain: 0.22 });
    tone({ freq: 1320, type: 'sine', dur: 0.22, gain: 0.2, at: 0.12 });
  },
  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.2, at: i * 0.09 }));
  },
  win() {
    [784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.3, gain: 0.18, at: i * 0.07 }));
    noise({ at: 0.1, dur: 0.5, gain: 0.05, from: 3000, to: 8000 });
  },
  fail() {
    tone({ freq: 330, to: 160, type: 'sawtooth', dur: 0.4, gain: 0.09 });
  },
  go() {
    tone({ freq: 1046, type: 'square', dur: 0.12, gain: 0.08 });
  },
};

export function haptic(pattern = 12) {
  if (!prefs.get().haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Lightweight canvas confetti.
export function confetti({ x = 0.5, y = 0.35, count = 90, spread = 1, colors } = {}) {
  if (reduceMotion() || typeof document === 'undefined') return;
  const palette = colors || ['#F7C04A', '#FFDF8A', '#FF4F8B', '#8B5CF6', '#2DD4BF', '#FFFFFF'];
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  const ox = window.innerWidth * x;
  const oy = window.innerHeight * y;
  const parts = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1 * spread;
    const speed = 7 + Math.random() * 9;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: palette[Math.floor(Math.random() * palette.length)],
      shape: Math.random() < 0.3 ? 'circle' : 'rect',
    };
  });
  const start = performance.now();
  const frame = (t) => {
    const elapsed = t - start;
    c.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      c.save();
      c.globalAlpha = Math.max(0, 1 - elapsed / 2600);
      c.translate(p.x, p.y);
      c.rotate(p.r);
      c.fillStyle = p.color;
      if (p.shape === 'circle') {
        c.beginPath();
        c.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      }
      c.restore();
    }
    if (elapsed < 2700) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
