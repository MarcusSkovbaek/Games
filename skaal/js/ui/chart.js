// "Udvikling": cumulative points over time as step lines, one per player, with a crosshair
// tooltip. Series colours are the players' own identity colours (validated palette), so a line
// keeps its colour when ranks change.
import { html, useState, useRef, useEffect } from './kit.js';
import { fmtPoints, fmtClock } from './format.js';

const M = { top: 12, right: 14, bottom: 26, left: 34 };

function niceStep(max, count) {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return Math.max(step * mag, 1);
}

function valueAt(timeline, t) {
  let v = 0;
  for (const [ts, pts] of timeline) {
    if (ts > t) break;
    v = pts;
  }
  return v;
}

export function PointsChart({ d, players, height = 210 }) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const firstTs = Math.min(...players.map((p) => p.timeline[0]?.[0] || Infinity));
  const t0 = Math.min(d.meta.startedAt || firstTs, firstTs);
  const t1 = Math.max(t0 + 60000, d.ended || d.t);
  const maxPts = Math.max(1, ...players.map((p) => p.points));
  const yStep = niceStep(maxPts, 4);
  const yMax = Math.ceil(maxPts / yStep) * yStep;
  const W = width || 320;
  const H = height;
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (t) => M.left + ((t - t0) / (t1 - t0)) * iw;
  const y = (v) => M.top + (1 - v / yMax) * ih;

  const yTicks = [];
  for (let v = 0; v <= yMax + 1e-9; v += yStep) yTicks.push(v);
  const spanMin = (t1 - t0) / 60000;
  const xStepMin = [5, 10, 15, 30, 60, 120, 180].find((m) => spanMin / m <= 4) || 240;
  const xTicks = [];
  const first = Math.ceil(t0 / (xStepMin * 60000)) * xStepMin * 60000;
  for (let t = first; t <= t1; t += xStepMin * 60000) xTicks.push(t);

  const path = (p) => {
    let dStr = `M${x(t0).toFixed(1)},${y(0).toFixed(1)}`;
    for (const [ts, v] of p.timeline) dStr += `H${x(ts).toFixed(1)}V${y(v).toFixed(1)}`;
    return `${dStr}H${x(t1).toFixed(1)}`;
  };

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = t0 + ((Math.max(M.left, Math.min(W - M.right, px)) - M.left) / iw) * (t1 - t0);
    setHover(t);
  };

  const rows = hover != null ? players.map((p) => ({ p, v: valueAt(p.timeline, hover) })).sort((a, b) => b.v - a.v) : [];
  const hx = hover != null ? x(hover) : 0;
  const tipLeft = hx > W / 2;

  return html`<div class="chart-box" ref=${boxRef} style=${{ position: 'relative' }}>
    ${width
      ? html`<svg
          class="chart"
          width=${W}
          height=${H}
          viewBox=${`0 0 ${W} ${H}`}
          role="img"
          aria-label="Point over tid for de førende spillere"
          style=${{ touchAction: 'pan-y' }}
          onPointerMove=${onMove}
          onPointerDown=${onMove}
          onPointerLeave=${() => setHover(null)}
        >
          <g class="grid">
            ${yTicks.map((v) => html`<line x1=${M.left} x2=${W - M.right} y1=${y(v)} y2=${y(v)} />`)}
          </g>
          ${yTicks.map((v) => html`<text x=${M.left - 8} y=${y(v) + 4} text-anchor="end" class="tabular">${fmtPoints(v)}</text>`)}
          ${xTicks.map((t) => html`<text x=${x(t)} y=${H - 6} text-anchor="middle">${fmtClock(t)}</text>`)}
          <line x1=${M.left} x2=${W - M.right} y1=${y(0)} y2=${y(0)} stroke="rgba(255,255,255,0.16)" />
          ${players.map(
            (p) => html`<path d=${path(p)} fill="none" stroke=${p.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`,
          )}
          ${players.map(
            (p) => html`<circle cx=${x(t1)} cy=${y(p.points)} r="4.5" fill=${p.color} stroke="#121118" stroke-width="2" />`,
          )}
          ${hover != null
            ? html`<line x1=${hx} x2=${hx} y1=${M.top} y2=${M.top + ih} stroke="rgba(255,255,255,0.45)" stroke-width="1" />
                ${rows.map((r) => html`<circle cx=${hx} cy=${y(r.v)} r="4" fill=${r.p.color} stroke="#121118" stroke-width="2" />`)}`
            : null}
        </svg>`
      : html`<div style=${{ height: `${H}px` }}></div>`}
    ${hover != null
      ? html`<div class="chart-tip" style=${tipLeft ? { right: `${W - hx + 10}px` } : { left: `${hx + 10}px` }}>
          <div class="chart-tip__time">kl. ${fmtClock(hover)}</div>
          ${rows.map(
            (r) => html`<div class="chart-tip__row">
              <i style=${{ background: r.p.color }}></i>
              <strong class="tabular">${fmtPoints(r.v)}</strong>
              <span>${r.p.name}</span>
            </div>`,
          )}
        </div>`
      : null}
    <div class="chart-legend">
      ${players.map((p) => html`<span><i style=${{ background: p.color }}></i>${p.name} · ${fmtPoints(p.points)}</span>`)}
    </div>
  </div>`;
}
