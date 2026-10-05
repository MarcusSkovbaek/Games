import { html, Button, Icon } from '../kit.js';
import { DrinkArt } from '../drinkArt.js';
import { recentEvents } from '../../app/session.js';
import { formatCode } from '../../core/ids.js';
import { fmtAgo } from '../format.js';
import { navigate } from '../router.js';

export function Landing() {
  const recent = recentEvents().filter((e) => e.name);
  return html`<main class="page view-enter">
    <div class="landing">
      <div class="landing__hero">
        <div class="landing__art" aria-hidden="true">
          <span class="glass-left"><${DrinkArt} id="beer" size=${104} /></span>
          <span class="glass-right"><${DrinkArt} id="beer" size=${104} /></span>
          <svg class="spark" viewBox="0 0 46 46">
            <path d="M23 2l3.2 13.2L39 9l-8 11.4L44 23l-13 2.8L39 37l-12.8-6.2L23 44l-3.2-13.2L7 37l8-11.2L2 23l13-2.6L7 9l12.8 6.2z" fill="#FFE08F" />
          </svg>
        </div>
        <h1 class="logo landing__logo">SKÅL</h1>
        <p class="landing__tagline">Live scoreboard, lykkehjul og minigames til festen — direkte på alles telefoner.</p>
        <div class="landing__pills">
          <span class="pill">🍺 Tæl drinks</span>
          <span class="pill">🏆 Live stilling</span>
          <span class="pill">🎡 Lykkehjul</span>
          <span class="pill">🎲 Minigames</span>
        </div>
      </div>

      <div class="landing__actions">
        <${Button} size="lg" block icon="party-popper" onClick=${() => navigate('/ny')}>Opret event<//>
        <${Button} size="lg" block variant="secondary" icon="log-in" onClick=${() => navigate('/deltag')}>Deltag med kode<//>
      </div>

      ${recent.length
        ? html`<section class="section">
            <div class="section__head"><h2 class="section__title">Dine events</h2></div>
            <div class="recent">
              ${recent.map(
                (e) => html`<button type="button" class="recent__item" onClick=${() => navigate(`/e/${e.code}`)}>
                  <span class="recent__emoji">${e.host ? '👑' : '🍻'}</span>
                  <span class="recent__text">
                    <span class="recent__name">${e.name}</span>
                    <span class="recent__meta">${formatCode(e.code)} · ${fmtAgo(e.lastOpened, Date.now())}</span>
                  </span>
                  <${Icon} name="chevron-right" size=${18} />
                </button>`,
              )}
            </div>
          </section>`
        : null}

      <p class="footnote">Drik med omtanke — vand tæller også 💧<br />Data er end-to-end krypteret med eventets kode.</p>
    </div>
  </main>`;
}
