import { html, Button, Icon, Ring } from '../kit.js';
import { GAMES, gameById } from '../../minigames/index.js';
import { wheelById } from '../../game/wheels.js';
import { pickWeighted } from '../../core/rng.js';
import { randomFloat } from '../../core/ids.js';
import { startGame } from '../../app/actions.js';
import { getDerived } from '../../app/session.js';
import { fmtDuration } from '../format.js';
import { confirmDialog, toast } from '../ui-store.js';
import { sfx } from '../feedback.js';
import { eventUi } from './event.js';

export function GamesTab({ room, d }) {
  const active = d.activeGame;
  const players = d.ranking.filter((p) => !p.left && !p.paused).length;
  const allowed = d.settings.anyoneCanStart || d.isHost;
  const canStart = !d.ended && !active && allowed;

  const start = async (game) => {
    if (!canStart) return;
    const ok = await confirmDialog({
      title: `${game.emoji} Start ${game.name}?`,
      text: `${game.tagline}. Spillet popper op på alles telefoner med det samme.`,
      confirm: 'Start for alle',
    });
    if (!ok) return;
    const fresh = getDerived(room);
    if (fresh.activeGame) {
      toast('Et andet spil er lige startet', { icon: '🎲' });
      return;
    }
    startGame(room, fresh, game.id);
    sfx.whoosh();
  };

  const startRandom = () => {
    const pool = GAMES.filter((g) => g.manual !== false && d.settings.games[g.id] && players >= (g.minPlayers || 2));
    const game = pickWeighted(randomFloat, pool.length ? pool : GAMES.filter((g) => players >= (g.minPlayers || 2)));
    if (game) start(game);
  };

  return html`<div class="stack stack--l">
    <div class="section__head" style=${{ paddingTop: '6px' }}>
      <h1 class="section__title" style=${{ fontSize: '26px' }}>Spil</h1>
      <span class="faint" style=${{ fontSize: '13px' }}>${players} spillere klar</span>
    </div>

    ${active
      ? html`<button type="button" class="offer-card" style=${{ '--c': gameById(active.g)?.color }} onClick=${() => eventUi.set((s) => ({ breakerHidden: { ...s.breakerHidden, [active.gid]: false } }))}>
          <span class="offer-card__emoji">${gameById(active.g)?.emoji}</span>
          <span class="spacer" style=${{ textAlign: 'left' }}>
            <span class="offer-card__title">${gameById(active.g)?.name} er i gang</span>
            <span class="offer-card__sub" style=${{ display: 'block' }}>Tryk for at være med</span>
          </span>
          <${Icon} name="chevron-right" size=${20} />
        </button>`
      : null}

    ${d.offers.map((o) => {
      const wheel = wheelById(o.w);
      return html`<button type="button" class="offer-card" onClick=${() => eventUi.set({ spin: o.id })}>
        <span class="offer-card__emoji">${wheel?.emoji}</span>
        <span class="spacer" style=${{ textAlign: 'left' }}>
          <span class="offer-card__title">Spin ${wheel?.name}</span>
          <span class="offer-card__sub" style=${{ display: 'block' }}>${wheel?.why}</span>
        </span>
        <${Icon} name="chevron-right" size=${20} />
      </button>`;
    })}

    <${NextBreaker} d=${d} onStart=${canStart && players >= 2 ? startRandom : null} />

    <section class="section">
      <div class="section__head">
        <h2 class="section__title">Start for alle</h2>
        ${!allowed ? html`<span class="faint" style=${{ fontSize: '13px' }}>Kun værten kan starte</span>` : null}
      </div>
      <div class="game-grid">
        ${GAMES.filter((g) => g.manual !== false).map((g) => {
          const enough = players >= (g.minPlayers || 2);
          return html`<button type="button" class="game-card" style=${{ '--c': g.color }} disabled=${!canStart || !enough} onClick=${() => start(g)}>
            <span class="game-card__emoji" aria-hidden="true">${g.emoji}</span>
            <span class="game-card__name">${g.name}</span>
            <span class="game-card__tag">${enough ? g.tagline : `Kræver ${g.minPlayers} spillere`}</span>
          </button>`;
        })}
      </div>
    </section>

    ${d.rules.length
      ? html`<section class="section">
          <h2 class="section__title">Aktive regler</h2>
          <div class="rule-list">
            ${d.rules.map(
              (r) => html`<div class="banner" style=${{ '--c': 'var(--violet)' }}>
                <span class="banner__icon">📜</span>
                <span class="banner__text"><div class="banner__sub" style=${{ color: 'var(--text)' }}>${r.text}</div></span>
                <span class="banner__aside">${fmtDuration(r.to - d.t)}</span>
              </div>`,
            )}
          </div>
        </section>`
      : null}

    <section class="section">
      <h2 class="section__title">Sådan virker det</h2>
      <div class="card card--pad">
        <ul class="how-list">
          <li><span class="how-list__icon">🍺</span><span><strong>Registrér hver drink</strong> — øl, shot, drink og Jägerbomb giver point. Vand tæller også i statistikken.</span></li>
          <li><span class="how-list__icon">👑</span><span><strong>Tag føringen</strong> og spin Kongehjulet — del slurke ud, lav regler eller få bonuspoint.</span></li>
          <li><span class="how-list__icon">🔥</span><span><strong>Langt bagud?</strong> Comeback-hjulet giver dig fordele og lader føreren drikke.</span></li>
          <li><span class="how-list__icon">🎡</span><span><strong>Hver 5. drink</strong> udløser Lykkehjulet.</span></li>
          <li><span class="how-list__icon">🎲</span><span><strong>Breakers</strong> popper op på alles telefoner med jævne mellemrum — eller start et spil selv her.</span></li>
          <li><span class="how-list__icon">🛡️</span><span><strong>Skjolde</strong> kan bruges til at slippe for en straf.</span></li>
          <li><span class="how-list__icon">⏸️</span><span><strong>Pause</strong> under "Mig" tager dig ud af minigames og straffe.</span></li>
        </ul>
      </div>
    </section>
  </div>`;
}

function NextBreaker({ d, onStart }) {
  const every = d.settings.breakerMin;
  const next = d.nextAuto;
  if (d.ended) return null;
  if (!every || !next) {
    return html`<div class="next-breaker">
      <span style=${{ fontSize: '30px' }}>🎲</span>
      <div class="next-breaker__text">
        <div class="next-breaker__title">${every ? 'Breakers venter på flere spillere' : 'Automatiske breakers er slået fra'}</div>
        <div class="next-breaker__sub">${every ? 'Der skal være mindst 2 aktive spillere.' : d.isHost ? 'Slå dem til under Mig → Event-indstillinger.' : 'Værten kan slå dem til.'}</div>
      </div>
      ${onStart ? html`<${Button} size="sm" icon="dice-5" onClick=${onStart}>Start nu<//>` : null}
    </div>`;
  }
  const left = next.start - d.t;
  const progress = 1 - left / (every * 60000);
  return html`<div class="next-breaker">
    <${Ring} progress=${progress} size=${62} stroke=${5} color="var(--teal)">
      <span style=${{ fontSize: '12px' }}>${fmtDuration(left)}</span>
    <//>
    <div class="next-breaker__text">
      <div class="next-breaker__title">Næste breaker</div>
      <div class="next-breaker__sub">Tilfældigt minigame · hver ${every}. min</div>
    </div>
    ${onStart ? html`<${Button} size="sm" variant="secondary" icon="dice-5" onClick=${onStart}>Nu<//>` : null}
  </div>`;
}
