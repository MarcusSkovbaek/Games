// Lucky wheel rendered on canvas. The outcome is decided before the spin; the animation simply
// lands on it with a long ease-out, ticking as segments pass the pointer.
import { html, useEffect, useRef } from './kit.js';
import { sfx, haptic } from './feedback.js';

const PALETTES = {
  king: [
    { bg: '#F7C04A', fg: '#2A1B05' },
    { bg: '#2B2134', fg: '#FFE7A8' },
    { bg: '#FF9F43', fg: '#2A1405' },
    { bg: '#1E1A2B', fg: '#FFE7A8' },
  ],
  comeback: [
    { bg: '#FF5C7A', fg: '#2B0710' },
    { bg: '#2A1520', fg: '#FFD0DA' },
    { bg: '#FF8A5C', fg: '#2B1006' },
    { bg: '#1F1420', fg: '#FFD0DA' },
  ],
  lucky: [
    { bg: '#B47CFF', fg: '#1B0B33' },
    { bg: '#1D1830', fg: '#E7D8FF' },
    { bg: '#5BC8F5', fg: '#06212D' },
    { bg: '#16142A', fg: '#E7D8FF' },
  ],
};

const TAU = Math.PI * 2;

function draw(canvas, outcomes, palette) {
  const size = canvas.clientWidth || 320;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = size / 2;
  const seg = TAU / outcomes.length;
  ctx.clearRect(0, 0, size, size);
  ctx.translate(r, r);
  outcomes.forEach((o, i) => {
    const p = palette[i % palette.length];
    const a0 = -Math.PI / 2 + i * seg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, a0, a0 + seg);
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
    g.addColorStop(0, p.bg);
    g.addColorStop(1, shade(p.bg, -0.18));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.rotate(a0 + seg / 2);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `${Math.round(r * 0.15)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(o.emoji, r * 0.8, 0);
    ctx.fillStyle = p.fg;
    ctx.textAlign = 'right';
    ctx.font = `700 ${Math.round(r * 0.105)}px "Bricolage Grotesque", Inter, sans-serif`;
    ctx.fillText(o.label, r * 0.67, 1);
    ctx.restore();
  });
  // Rim dots
  for (let i = 0; i < outcomes.length * 2; i++) {
    const a = -Math.PI / 2 + (i * seg) / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (r - 7), Math.sin(a) * (r - 7), 2.6, 0, TAU);
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.45)' : 'rgba(255,240,200,0.95)';
    ctx.fill();
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + c * amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// target: index to land on (null = idle). onDone is called once the wheel has stopped.
export function Wheel({ wheelId, outcomes, target, onDone, emoji, small = false }) {
  const canvasRef = useRef(null);
  const pointerRef = useRef(null);
  const angle = useRef(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const palette = PALETTES[wheelId] || PALETTES.king;
    const redraw = () => draw(canvas, outcomes, palette);
    redraw();
    // Redraw once the display font has loaded so labels use it.
    document.fonts?.ready?.then(redraw);
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, [wheelId, outcomes.length]);

  useEffect(() => {
    if (target == null) return;
    const canvas = canvasRef.current;
    const seg = TAU / outcomes.length;
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const jitter = (Math.random() - 0.5) * 0.6;
    const landing = (TAU - (target + 0.5 + jitter) * seg + TAU) % TAU;
    const from = angle.current;
    const base = from - (from % TAU);
    const to = base + TAU * (reduce ? 1 : 6) + landing;
    const duration = reduce ? 600 : 5200;
    const start = performance.now();
    let lastIdx = -1;
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - k) ** 4;
      const a = from + (to - from) * eased;
      angle.current = a;
      canvas.style.transform = `rotate(${a}rad)`;
      const idx = Math.floor((((TAU - (a % TAU)) % TAU) / seg) % outcomes.length);
      if (idx !== lastIdx) {
        if (lastIdx !== -1) {
          sfx.tick();
          const pointer = pointerRef.current;
          if (pointer) {
            pointer.classList.remove('is-tick');
            void pointer.getBoundingClientRect();
            pointer.classList.add('is-tick');
          }
        }
        lastIdx = idx;
      }
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        haptic([20, 40, 20]);
        doneRef.current?.();
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return html`<div class=${small ? 'wheel-wrap wheel-wrap--small' : 'wheel-wrap'}>
    <svg class="wheel-pointer" ref=${pointerRef} viewBox="0 0 34 44" aria-hidden="true">
      <defs>
        <linearGradient id="wp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFF4CF" />
          <stop offset="1" stop-color="#F0A92A" />
        </linearGradient>
      </defs>
      <path d="M17 42 3 12a14 14 0 1 1 28 0z" fill="url(#wp)" stroke="#fff" stroke-width="2" />
      <circle cx="17" cy="13" r="4.5" fill="#2A1B05" />
    </svg>
    <canvas ref=${canvasRef} role="img" aria-label="Lykkehjul"></canvas>
    <div class="wheel-hub" aria-hidden="true">${emoji}</div>
  </div>`;
}
