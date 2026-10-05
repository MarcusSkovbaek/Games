// Big screen for pub golf: team standings, the hole the group is at, the latest photos and the
// competition winners — plus challenges and podiums as they happen.
import { html, Avatar, Icon, cx } from '../kit.js';
import { formatCode } from '../../core/ids.js';
import { QR } from '../qr.js';
import { eventLink } from '../router.js';
import { ToPar, TeamBadge, PlayerAvatar, holeTitle, MEDALS, entrantName } from './common.js';
import { ChallengeOverlay, PodiumOverlay } from './overlays.js';

export function PgTv({ room, d, code }) {
  const pg = d.pg;
  const hole = pg.current;
  const started = (tm) => tm.played > 0 || tm.pen || tm.bon;
  const top = pg.individuals.filter((x) => x.played > 0).slice(0, 5);
  const recent = pg.photos.filter((ph) => ph.data).slice(0, 8);
  const photo = recent.length ? recent[Math.floor(d.t / 8000) % recent.length] : null;
  const decided = pg.comps.map((c) => ({ comp: c, first: pg.results.get(c.id)?.places[0] || null })).filter((x) => x.first);

  return html`<div class="tv tv--pg">
    <header class="tv__head">
      <span class="logo tv__logo">SKÅL</span>
      <div class="spacer">
        <h1 class="tv__title">${d.meta.name}</h1>
        <div class="row faint" style=${{ fontWeight: 600 }}>
          <span class=${cx('sync-dot', room.status.online ? 'is-online' : 'is-offline')}></span>
          ${d.ended ? 'Afsluttet' : 'Live'} · ⛳ Pub golf · ${d.ranking.filter((p) => !p.left).length} spillere
        </div>
      </div>
      <button type="button" class="btn btn--secondary btn--sm" onClick=${() => document.documentElement.requestFullscreen?.()}>
        <${Icon} name="maximize-2" size=${16} /><span class="btn__label">Fuld skærm</span>
      </button>
    </header>

    <section class="tv__board pg-tv">
      <div class="pg-tv__hole">
        <span class="pg-tv__n"><small>Hul</small>${hole.n}<small>/${pg.holes.length}</small></span>
        <span class="pg-tv__bar">
          <strong>${holeTitle(hole)}</strong>
          <span>🍺 ${hole.drink || 'Valgfri drik'} · par ${hole.par}${hole.addr ? ` · ${hole.addr}` : ''}</span>
        </span>
        <span class="pg-tv__progress">${pg.progress.done}/${pg.progress.of}<small>har slag</small></span>
      </div>

      ${pg.cfg.teams.length
        ? html`<div class="board">
            ${pg.teams.map(
              (tm) => html`<div class="pg-trow pg-trow--tv" style=${{ '--tc': tm.color }} key=${tm.id}>
                <span class="board-row__rank">${started(tm) ? (tm.rank === 1 ? '👑' : tm.rank) : '–'}</span>
                <${TeamBadge} team=${tm} size=${54} />
                <span class="pg-trow__main">
                  <span class="pg-trow__name">${tm.name}</span>
                  <span class="pg-trow__members">${tm.members.map((pid) => html`<${Avatar} player=${d.players.get(pid)} size=${30} />`)}</span>
                </span>
                <span class="pg-trow__score"><${ToPar} n=${tm.score} played=${started(tm)} /><small>${tm.strokes} slag</small></span>
              </div>`,
            )}
          </div>`
        : null}

      ${top.length
        ? html`<div class="pg-tv__players">
            ${top.map(
              (x, i) => html`<div class="pg-tv__player" key=${x.pid}>
                <span class="pg-tv__rank">${i + 1}</span>
                <${PlayerAvatar} d=${d} pid=${x.pid} size=${40} />
                <span class="pg-tv__name">${d.players.get(x.pid)?.name}</span>
                <${ToPar} n=${x.toPar} />
              </div>`,
            )}
          </div>`
        : null}
    </section>

    <aside class="tv__side">
      ${photo
        ? html`<figure class="card pg-tv__photo" key=${photo.key}>
            <img src=${photo.data} alt="" />
            <figcaption>
              <${Avatar} player=${d.players.get(photo.pid)} size=${28} />
              <span><strong>${d.players.get(photo.pid)?.name}</strong>${photo.cap ? html` — ${photo.cap}` : null}</span>
            </figcaption>
          </figure>`
        : html`<div class="card card--pad pg-tv__nophoto">📸 Del billeder i appen — de vises her</div>`}

      ${decided.length
        ? html`<div class="card pg-tv__comps">
            ${decided.map(
              ({ comp, first }) => html`<div class="pg-tv__comp">
                <span aria-hidden="true">${comp.emoji}</span>
                <span class="spacer">${comp.name}</span>
                <span>${MEDALS[0]} <strong>${entrantName(d, first)}</strong></span>
              </div>`,
            )}
          </div>`
        : null}

      <div class="card tv__join">
        <${QR} text=${eventLink(code)} />
        <div>
          <div class="code-label">Scan for at deltage</div>
          <div class="code-display" style=${{ fontSize: '34px' }}>${formatCode(code)}</div>
        </div>
      </div>
    </aside>
    <${ChallengeOverlay} room=${room} d=${d} tv />
    <${PodiumOverlay} room=${room} d=${d} tv />
  </div>`;
}
