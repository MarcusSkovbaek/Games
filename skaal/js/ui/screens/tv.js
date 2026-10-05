// Big-screen mode (#/tv/<code>): a read-only live view for a TV or laptop at the party.
import { html, useEffect, useStore, useNow, Avatar, Icon, Ring, Spinner } from '../kit.js';
import { session, openEvent, closeEvent, getDerived } from '../../app/session.js';
import { isValidCode, formatCode } from '../../core/ids.js';
import { now } from '../../core/clock.js';
import { gameById } from '../../minigames/index.js';
import { drinkById } from '../../game/drinks.js';
import { QR } from '../qr.js';
import { eventLink, navigate } from '../router.js';
import { fmtPoints, fmtDuration, fmtAgo } from '../format.js';
import { FeedText, gameSummary } from '../feedText.js';
import { TITLE_EMOJI } from './board.js';

export function TvRoute({ code }) {
  const room = useStore(session, (s) => (s.code === code ? s.room : null));
  useStore(session, (s) => s.version);
  useNow(1000);

  useEffect(() => {
    if (!isValidCode(code)) return;
    openEvent(code).catch((err) => console.error('[tv] open failed', err));
    let lock = null;
    navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release?.().catch(() => {});
      closeEvent();
    };
  }, [code]);

  if (!isValidCode(code)) {
    return html`<main class="page"><div class="empty" style=${{ paddingTop: '120px' }}>
      <div class="empty__title">Ugyldig eventkode</div>
      <button class="btn btn--primary btn--md" onClick=${() => navigate('/')}>Til forsiden</button>
    </div></main>`;
  }
  if (!room || !room.state.meta) {
    return html`<main class="page"><div class="empty" style=${{ paddingTop: '120px' }}><${Spinner} size=${34} /><div class="empty__title">Forbinder til ${formatCode(code)}…</div></div></main>`;
  }
  const d = getDerived(room, now());
  const rows = d.ranking.filter((p) => !p.left).slice(0, 10);
  const inst = d.activeGame;
  const game = inst ? gameById(inst.g) : null;

  return html`<div class="tv">
    <header class="tv__head">
      <span class="logo tv__logo">SKÅL</span>
      <div class="spacer">
        <h1 class="tv__title">${d.meta.name}</h1>
        <div class="row faint" style=${{ fontWeight: 600 }}>
          <span class="sync-dot ${room.status.online ? 'is-online' : 'is-offline'}"></span>
          ${d.ended ? 'Afsluttet' : 'Live'} · ${d.ranking.length} deltagere · ${d.totals.alcoholic} drinks
        </div>
      </div>
      <button type="button" class="btn btn--secondary btn--sm" onClick=${() => document.documentElement.requestFullscreen?.()}>
        <${Icon} name="maximize-2" size=${16} /><span class="btn__label">Fuld skærm</span>
      </button>
    </header>

    <section class="tv__board board">
      ${rows.map(
        (p, i) => html`<div class=${`board-row ${i === 0 && p.points > 0 ? 'is-me' : ''}`} key=${p.pid}>
          <span class="board-row__rank">${i === 0 && p.points > 0 ? '👑' : i + 1}</span>
          <${Avatar} player=${p} size=${56} online=${p.online} />
          <span class="board-row__main">
            <span class="board-row__name"><span>${p.name}</span><span class="board-row__titles">${p.titles.filter((t) => t !== 'leader').map((t) => TITLE_EMOJI[t] || '')}</span></span>
            <span class="board-row__breakdown">${Object.entries(p.counts).map(([k, n]) => html`<span>${drinkById(k)?.emoji || '🍹'} ${n}</span>`)}</span>
          </span>
          <span class="board-row__score"><span class="board-row__pts">${fmtPoints(p.points)}</span><span class="board-row__unit">point</span></span>
        </div>`,
      )}
    </section>

    <aside class="tv__side">
      ${inst && game
        ? html`<div class="card card--pad" style=${{ '--c': game.color, borderColor: game.color }}>
            <div class="row">
              <span style=${{ fontSize: '44px' }}>${game.emoji}</span>
              <div class="spacer">
                <div class="overlay__kicker">${inst.phase === 'result' ? 'Resultat' : inst.auto ? 'Breaker i gang' : 'Minigame i gang'}</div>
                <div class="overlay__title" style=${{ fontSize: '30px' }}>${game.name}</div>
              </div>
              ${inst.phase !== 'result'
                ? html`<${Ring} progress=${inst.phase === 'intro' ? 1 : (inst.playEnd - d.t) / inst.dur} size=${64} stroke=${5} color=${game.color}>
                    <span style=${{ fontSize: '18px' }}>${Math.max(0, Math.ceil(((inst.phase === 'intro' ? inst.playStart : inst.playEnd) - d.t) / 1000))}</span>
                  <//>`
                : null}
            </div>
            <p class="muted" style=${{ marginTop: '10px', fontSize: '18px' }}>
              ${inst.phase === 'result' && inst.result ? gameSummary(d, inst) : game.tagline}
            </p>
            ${inst.phase === 'play' && inst.responders.length && game.respond
              ? html`<p class="faint" style=${{ marginTop: '6px' }}>${inst.responders.filter((pid) => inst.responses.has(pid)).length} af ${inst.responders.length} har svaret</p>`
              : null}
          </div>`
        : d.nextAuto && !d.ended
          ? html`<div class="next-breaker">
              <${Ring} progress=${1 - (d.nextAuto.start - d.t) / (d.settings.breakerMin * 60000)} size=${72} stroke=${6} color="var(--teal)">
                <span style=${{ fontSize: '14px' }}>${fmtDuration(d.nextAuto.start - d.t)}</span>
              <//>
              <div class="next-breaker__text"><div class="next-breaker__title" style=${{ fontSize: '24px' }}>Næste breaker</div><div class="next-breaker__sub">Hold telefonen klar 📱</div></div>
            </div>`
          : null}

      ${d.modifiers.map(
        (m) => html`<div class="banner" style=${{ '--c': 'var(--green)' }}><span class="banner__icon">⏰</span><span class="banner__text"><div class="banner__title">Happy Hour: ${drinkById(m.k)?.name || m.k} ×${m.mult}</div></span><span class="banner__aside">${fmtDuration(m.to - d.t)}</span></div>`,
      )}
      ${d.rules.map(
        (r) => html`<div class="banner" style=${{ '--c': 'var(--violet)' }}><span class="banner__icon">📜</span><span class="banner__text"><div class="banner__sub" style=${{ color: 'var(--text)', fontSize: '16px' }}>${r.text}</div></span></div>`,
      )}

      <div class="card tv__feed">
        <div class="feed">
          ${d.feed.slice(0, 12).map(
            (item) => html`<div class="feed-item" key=${item.key}>
              <div class="feed-item__body">
                <div class="feed-item__text" style=${{ fontSize: '17px' }}><${FeedText} d=${d} item=${item} emoji /></div>
                <div class="feed-item__meta" style=${{ minHeight: 0 }}>${fmtAgo(item.ts, d.t)}</div>
              </div>
            </div>`,
          )}
        </div>
      </div>

      <div class="card tv__join">
        <${QR} text=${eventLink(code)} />
        <div>
          <div class="code-label">Scan for at deltage</div>
          <div class="code-display" style=${{ fontSize: '34px' }}>${formatCode(code)}</div>
        </div>
      </div>
    </aside>
  </div>`;
}

