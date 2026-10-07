import { html, useState, useRef, useLayoutEffect, Avatar, Segmented, Empty, cx } from '../kit.js';
import { DRINKS } from '../../game/drinks.js';
import { enabledDrinks } from '../../game/settings.js';
import { fmtPoints, fmtDecimal } from '../format.js';
import { PointsChart } from '../chart.js';
import { eventUi } from './event.js';

export const TITLE_EMOJI = { leader: '👑', onfire: '🔥', hydrated: '💧' };

function metricsFor(d) {
  const drinks = enabledDrinks(d.settings).filter((x) => x.alcoholic);
  const used = new Set(DRINKS.filter((x) => x.alcoholic && d.ranking.some((p) => p.counts[x.id])).map((x) => x.id));
  const shown = DRINKS.filter((x) => x.alcoholic && (drinks.includes(x) || used.has(x.id)));
  return [
    { value: 'points', label: 'Point', unit: 'point', get: (p) => p.points },
    ...shown.map((x) => ({ value: x.id, label: x.name, icon: x.emoji, unit: 'stk.', get: (p) => p.counts[x.id] || 0 })),
    { value: 'pace', label: 'Tempo', icon: '⚡', unit: 'pr. time', get: (p) => p.pace, format: (v) => (v ? fmtDecimal(v) : '–') },
    { value: 'sips', label: 'Slurke', icon: '🍻', unit: 'slurke', get: (p) => p.sipsTaken },
  ];
}

export function BoardTab({ room, d }) {
  const [metricId, setMetricId] = useState('points');
  const metrics = metricsFor(d);
  const metric = metrics.find((m) => m.value === metricId) || metrics[0];
  const fmt = metric.format || fmtPoints;
  const rows =
    metric.value === 'points' ? d.ranking : [...d.ranking].sort((a, b) => metric.get(b) - metric.get(a) || a.rank - b.rank);
  const podium = rows.filter((p) => metric.get(p) > 0).slice(0, 3);
  const chartPlayers = d.ranking.filter((p) => p.points > 0).slice(0, 5);

  return html`<div class="stack stack--l">
    <div class="section__head" style=${{ paddingTop: '6px' }}>
      <h1 class="section__title" style=${{ fontSize: '26px' }}>Stilling</h1>
      <span class="faint" style=${{ fontSize: '13px' }}>Live · ${d.totals.alcoholic} drinks i alt</span>
    </div>
    <${Segmented} options=${metrics} value=${metric.value} onChange=${setMetricId} />

    ${podium.length >= 2 ? html`<${Podium} d=${d} spots=${podium} metric=${metric} fmt=${fmt} />` : null}

    ${rows.length
      ? html`<${BoardList} d=${d} rows=${rows} metric=${metric} fmt=${fmt} />`
      : html`<${Empty} icon="trophy" title="Ingen deltagere endnu" text="Invitér vennerne med QR-koden øverst." />`}

    ${metric.value === 'points' && chartPlayers.length
      ? html`<section class="section">
          <div class="section__head"><h2 class="section__title">Udvikling</h2><span class="faint" style=${{ fontSize: '13px' }}>Top ${chartPlayers.length} · tryk på grafen</span></div>
          <div class="card chart-card"><${PointsChart} d=${d} players=${chartPlayers} /></div>
        </section>`
      : null}
    <p class="faint" style=${{ fontSize: '12.5px', textAlign: 'center' }}>
      Ved pointlighed vinder den, der nåede scoren først. Pilene viser bevægelse de sidste 15 min.
    </p>
  </div>`;
}

function Podium({ d, spots, metric, fmt }) {
  const order = [spots[1], spots[0], spots[2]];
  return html`<div class="podium" aria-label="Top 3">
    ${order.map((p, i) => {
      if (!p) return html`<div></div>`;
      const place = [2, 1, 3][i];
      return html`<button type="button" class=${cx('podium__spot', `podium__spot--${place}`)} onClick=${() => eventUi.set({ player: p.pid })}>
        ${place === 1 ? html`<span class="crown" aria-hidden="true">👑</span>` : null}
        <${Avatar} player=${p} size=${place === 1 ? 74 : 58} ring=${place === 1} online=${p.online} />
        <span class="podium__name">${p.isMe ? 'Dig' : p.name}</span>
        <span class="podium__pts">${fmt(metric.get(p))} <small>${metric.unit}</small></span>
        <span class="podium__block">${place}</span>
      </button>`;
    })}
  </div>`;
}

// Rows animate to their new position when the order changes (FLIP). Positions are measured within
// the list — only when the order changes, not on every tick of the clock — so something appearing
// above it (the podium) doesn't set the rows moving.
function BoardList({ d, rows, metric, fmt }) {
  const list = useRef(null);
  const refs = useRef(new Map());
  const prev = useRef(new Map());
  const order = rows.map((p) => p.pid).join(' ');
  useLayoutEffect(() => {
    const base = list.current?.getBoundingClientRect().top || 0;
    const next = new Map();
    for (const [pid, el] of refs.current) {
      if (!el) continue;
      const top = el.getBoundingClientRect().top - base;
      next.set(pid, top);
      const before = prev.current.get(pid);
      if (before != null && Math.abs(before - top) > 2) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${before - top}px)`;
        requestAnimationFrame(() => {
          el.style.transition = '';
          el.style.transform = '';
        });
      }
    }
    prev.current = next;
  }, [order]);

  return html`<div class="board" ref=${list}>
    ${rows.map((p, i) => {
      const value = metric.get(p);
      const moved = metric.value === 'points' && p.prevRank ? p.prevRank - p.rank : 0;
      const breakdown = DRINKS.filter((x) => p.counts[x.id]).map((x) => html`<span>${x.emoji} ${p.counts[x.id]}</span>`);
      return html`<button
        type="button"
        key=${p.pid}
        ref=${(el) => refs.current.set(p.pid, el)}
        class=${cx('board-row', p.isMe && 'is-me', p.left && 'is-left')}
        onClick=${() => eventUi.set({ player: p.pid })}
      >
        <span class="board-row__rank">${value > 0 ? i + 1 : '–'}</span>
        <${Avatar} player=${p} size=${44} online=${p.online} />
        <span class="board-row__main">
          <span class="board-row__name">
            <span>${p.isMe ? `${p.name} (dig)` : p.name}</span>
            <span class="board-row__titles" aria-hidden="true">
              ${p.titles.map((t) => TITLE_EMOJI[t] || '')}${p.shields ? '🛡️' : ''}${p.paused ? '⏸️' : ''}
            </span>
          </span>
          <span class="board-row__breakdown">
            ${breakdown.length ? breakdown : html`<span>Ingen drinks endnu</span>`}
            ${p.pendingSips ? html`<span style=${{ color: '#ffb3c1' }}>· skylder ${p.pendingSips} slurke</span>` : null}
            ${p.left ? html`<span>· har forladt festen</span>` : null}
          </span>
        </span>
        <span class="board-row__score">
          <span class="board-row__pts">${fmt(value)}</span>
          <span class="board-row__unit">
            ${moved > 0 ? html`<span class="trend trend--up">▲${moved} </span>` : moved < 0 ? html`<span class="trend trend--down">▼${-moved} </span>` : null}${metric.unit}
          </span>
        </span>
      </button>`;
    })}
  </div>`;
}
