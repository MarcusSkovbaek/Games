// The "Stilling" tab: teams, players and the full scorecard.
import { html, useState, Segmented, Avatar, Sheet, Empty, cx } from '../kit.js';
import { scoreName } from '../../game/pubgolf.js';
import { ToPar, TeamBadge, PlayerAvatar, holeTitle } from './common.js';

export function StandingsTab({ room, d }) {
  const pg = d.pg;
  const hasTeams = pg.cfg.teams.length > 0;
  const [view, setView] = useState(hasTeams ? 'teams' : 'players');
  const [player, setPlayer] = useState(null);
  const options = [...(hasTeams ? [{ value: 'teams', label: 'Hold' }] : []), { value: 'players', label: 'Spillere' }, { value: 'card', label: 'Scorekort' }];
  return html`<div class="stack stack--l">
    <div class="section__head" style=${{ paddingTop: '6px' }}>
      <h1 class="section__title" style=${{ fontSize: '26px' }}>Stilling</h1>
      <span class="faint" style=${{ fontSize: '13px' }}>Hul ${pg.current.n} af ${pg.holes.length} · par ${pg.par}</span>
    </div>
    <${Segmented} options=${options} value=${view} onChange=${setView} />
    ${view === 'teams' ? html`<${TeamBoard} d=${d} onPlayer=${setPlayer} />` : null}
    ${view === 'players' ? html`<${PlayerBoard} d=${d} onPlayer=${setPlayer} />` : null}
    ${view === 'card' ? html`<${ScoreCard} d=${d} onPlayer=${setPlayer} />` : null}
    <p class="faint" style=${{ fontSize: '12.5px', textAlign: 'center' }}>
      Laveste score vinder. Scoren er slag i forhold til par på de spillede huller, plus straf og minus bonus.
    </p>
    <${PlayerSheet} d=${d} pid=${player} onClose=${() => setPlayer(null)} />
  </div>`;
}

function TeamBoard({ d, onPlayer }) {
  const pg = d.pg;
  const started = (tm) => tm.played > 0 || tm.pen || tm.bon;
  const podium = pg.teams.filter(started).slice(0, 3);
  return html`<div class="stack">
    ${podium.length >= 2
      ? html`<div class="pg-podium" aria-label="Top 3 hold">
          ${[podium[1], podium[0], podium[2]].map((tm, i) => {
            if (!tm) return html`<div></div>`;
            const place = [2, 1, 3][i];
            return html`<div class=${cx('pg-podium__spot', `pg-podium__spot--${place}`)} style=${{ '--tc': tm.color }}>
              ${place === 1 ? html`<span class="crown" aria-hidden="true">👑</span>` : null}
              <${TeamBadge} team=${tm} size=${place === 1 ? 64 : 50} />
              <span class="pg-podium__name">${tm.name}</span>
              <${ToPar} n=${tm.score} class="pg-podium__score" />
              <span class="pg-podium__block">${place}</span>
            </div>`;
          })}
        </div>`
      : null}
    <div class="board">
      ${pg.teams.map(
        (tm) => html`<div class=${cx('pg-trow', pg.myTeam?.id === tm.id && 'is-me')} style=${{ '--tc': tm.color }} key=${tm.id}>
          <span class="board-row__rank">${started(tm) ? tm.rank : '–'}</span>
          <${TeamBadge} team=${tm} size=${42} />
          <span class="pg-trow__main">
            <span class="pg-trow__name">${tm.name}</span>
            <span class="pg-trow__members">
              ${tm.members.length
                ? tm.members.map((pid) => html`<button type="button" class="pg-trow__member" onClick=${() => onPlayer(pid)} aria-label=${d.players.get(pid)?.name}><${Avatar} player=${d.players.get(pid)} size=${24} /></button>`)
                : html`<span class="faint">Ingen spillere endnu</span>`}
            </span>
            ${tm.pen || tm.bon ? html`<span class="pg-trow__adj">${tm.pen ? `+${tm.pen} straf` : ''}${tm.pen && tm.bon ? ' · ' : ''}${tm.bon ? `−${tm.bon} bonus` : ''}</span>` : null}
          </span>
          <span class="pg-trow__score">
            <${ToPar} n=${tm.score} played=${started(tm)} />
            <small>${tm.strokes} slag</small>
          </span>
        </div>`,
      )}
    </div>
    ${pg.cfg.teamScore === 'avg' ? html`<p class="faint" style=${{ fontSize: '12.5px', textAlign: 'center' }}>Holdscore = gennemsnit af spillernes score.</p>` : null}
  </div>`;
}

function PlayerBoard({ d, onPlayer }) {
  const pg = d.pg;
  const rows = pg.individuals.filter((x) => d.players.has(x.pid));
  if (!rows.length) return html`<${Empty} icon="trophy" title="Ingen spillere endnu" text="Invitér vennerne med QR-koden øverst." />`;
  return html`<div class="board">
    ${rows.map((x) => {
      const p = d.players.get(x.pid);
      const team = pg.teamById.get(x.team);
      return html`<button type="button" class=${cx('board-row', p.isMe && 'is-me', p.left && 'is-left')} key=${x.pid} onClick=${() => onPlayer(x.pid)}>
        <span class="board-row__rank">${x.rank || '–'}</span>
        <${PlayerAvatar} d=${d} pid=${x.pid} size=${44} online=${p.online} />
        <span class="board-row__main">
          <span class="board-row__name"><span>${p.name}</span>${x.pid === pg.judge ? html`<span class="pg-judge-tag">Dommer</span>` : null}</span>
          <span class="board-row__breakdown">
            ${team ? html`<span style=${{ color: team.color, fontWeight: 700 }}>${team.name}</span>` : null}
            <span>${x.played}/${pg.holes.length} huller</span>
            ${x.aces ? html`<span>🎯 ${x.aces}</span>` : null}
          </span>
        </span>
        <span class="board-row__score"><${ToPar} n=${x.toPar} class="board-row__pts" played=${x.played > 0 || x.pen || x.bon} /><span class="board-row__unit">${x.total} slag</span></span>
      </button>`;
    })}
  </div>`;
}

// Classic golf scorecard: circles for birdies, squares for bogeys.
function ScoreCard({ d, onPlayer }) {
  const pg = d.pg;
  const rows = pg.individuals.filter((x) => d.players.has(x.pid));
  return html`<div class="card pg-card">
    <div class="pg-card__scroll">
      <table class="pg-card__table">
        <thead>
          <tr>
            <th class="pg-card__who" scope="col">Hul</th>
            ${pg.holes.map((h) => html`<th scope="col" class=${cx(h.id === pg.current.id && 'is-current')}>${h.n}</th>`)}
            <th scope="col">Slag</th>
            <th scope="col">±</th>
          </tr>
          <tr class="pg-card__par">
            <th class="pg-card__who" scope="row">Par</th>
            ${pg.holes.map((h) => html`<td>${h.par}</td>`)}
            <td>${pg.par}</td>
            <td></td>
          </tr>
        </thead>
        <tbody>
          ${rows.map((x) => {
            const p = d.players.get(x.pid);
            return html`<tr key=${x.pid}>
              <th class="pg-card__who" scope="row">
                <button type="button" onClick=${() => onPlayer(x.pid)}><${PlayerAvatar} d=${d} pid=${x.pid} size=${24} /><span>${p.name}</span></button>
              </th>
              ${pg.holes.map((h) => {
                const sc = x.holes[h.id];
                return html`<td><span class=${cx('pg-cell', sc && cellClass(sc.s - h.par))} title=${sc ? scoreName(sc.s, h.par) : ''}>${sc ? sc.s : ''}</span></td>`;
              })}
              <td class="pg-card__total">${x.total}</td>
              <td class="pg-card__total"><${ToPar} n=${x.toPar} played=${x.played > 0 || x.pen || x.bon} /></td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>
    <div class="pg-card__legend" aria-hidden="true">
      <span><span class="pg-cell is-eagle">2</span> Eagle</span>
      <span><span class="pg-cell is-birdie">2</span> Birdie</span>
      <span><span class="pg-cell is-bogey">4</span> Bogey</span>
      <span><span class="pg-cell is-double">5</span> Dobbelt+</span>
    </div>
  </div>`;
}

const cellClass = (diff) => (diff <= -2 ? 'is-eagle' : diff === -1 ? 'is-birdie' : diff === 0 ? 'is-par' : diff === 1 ? 'is-bogey' : 'is-double');

function PlayerSheet({ d, pid, onClose }) {
  const pg = d.pg;
  const p = pid ? d.players.get(pid) : null;
  const x = pid ? pg.players.get(pid) : null;
  const team = x ? pg.teamById.get(x.team) : null;
  const adj = pid ? pg.adjustments.filter((a) => a.p === pid) : [];
  return html`<${Sheet} open=${!!p} onClose=${onClose} title=${p?.name || ''} subtitle=${team ? team.name : 'Intet hold'}>
    ${p && x
      ? html`<div class="stack">
          <div class="stat-grid">
            <div class="stat"><div class="stat__value"><${ToPar} n=${x.toPar} played=${x.played > 0 || x.pen || x.bon} /></div><div class="stat__label">Score</div></div>
            <div class="stat"><div class="stat__value">${x.total}</div><div class="stat__label">Slag i alt</div></div>
            <div class="stat"><div class="stat__value">${x.played}/${pg.holes.length}</div><div class="stat__label">Huller</div></div>
          </div>
          <div class="list">
            ${pg.holes.map((h) => {
              const sc = x.holes[h.id];
              return html`<div class="list-item pg-holerow">
                <span class="pg-holerow__n">${h.n}</span>
                <span class="list-item__text"><span class="list-item__title">${holeTitle(h)}</span><span class="list-item__sub">${h.drink} · par ${h.par}</span></span>
                ${sc ? html`<span class=${cx('pg-cell', cellClass(sc.s - h.par))}>${sc.s}</span>` : html`<span class="faint">–</span>`}
              </div>`;
            })}
          </div>
          ${adj.length
            ? html`<div class="list">
                ${adj.map(
                  (a) => html`<div class="list-item">
                    <span class="list-item__icon">${a.kind === 'pen' ? '⚠️' : a.comp ? '🏆' : '⭐'}</span>
                    <span class="list-item__text"><span class="list-item__title">${a.why || (a.kind === 'pen' ? 'Straf' : 'Bonus')}</span></span>
                    <strong>${a.kind === 'pen' ? `+${a.n}` : `−${a.n}`}</strong>
                  </div>`,
                )}
              </div>`
            : null}
          ${x.aces ? html`<p class="muted" style=${{ textAlign: 'center' }}>🎯 ${x.aces} hole in one${x.aces > 1 ? 's' : ''}</p>` : null}
        </div>`
      : null}
  <//>`;
}
