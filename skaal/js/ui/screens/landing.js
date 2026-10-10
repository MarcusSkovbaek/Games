import { html, useState, Button, Icon, Spinner } from '../kit.js';
import { DrinkArt } from '../drinkArt.js';
import { recentEvents, leaveFromList } from '../../app/session.js';
import { confirmDialog, toast } from '../ui-store.js';
import { formatCode } from '../../core/ids.js';
import { fmtAgo } from '../format.js';
import { navigate } from '../router.js';

export function Landing() {
  const [busy, setBusy] = useState(null);
  const [, refresh] = useState(0);
  const recent = recentEvents().filter((e) => e.name);
  // Leave an event (or, as its host, delete it) right from the list.
  const leave = async (e) => {
    const destroy = !!e.host;
    const ok = await confirmDialog(
      destroy
        ? { title: `Slet ${e.name}?`, text: 'Alle data og billeder slettes fra serverne og alles telefoner, og ingen kan åbne eventet igen. Det kan ikke fortrydes.', confirm: 'Slet alt', danger: true }
        : { title: `Forlad ${e.name}?`, text: 'Dine drinks og slag bliver stående, men eventet forsvinder fra din telefon.', confirm: 'Forlad', danger: true },
    );
    if (!ok) return;
    setBusy(e.code);
    const result = await leaveFromList(e.code, { destroy }).catch(() => null);
    setBusy(null);
    refresh((n) => n + 1);
    if (result === 'deleted') toast(`🗑️ ${e.name} er slettet`, { tone: 'good' });
    else if (result) toast(`👋 Du har forladt ${e.name}`, { tone: 'good' });
    else toast('Ingen forbindelse — prøv igen om lidt', { icon: '📡', tone: 'bad' });
  };
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
        <p class="landing__tagline">Live scoreboard, minigames, pub golf og billeder fra aftenen — direkte på alles telefoner.</p>
        <div class="landing__pills">
          <span class="pill">🍺 Tæl drinks</span>
          <span class="pill">🏆 Live stilling</span>
          <span class="pill">🎲 Minigames</span>
          <span class="pill">⛳ Pub golf</span>
          <span class="pill">📸 Fotos</span>
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
                (e) => html`<div class="recent__row" key=${e.code}>
                  <button type="button" class="recent__item" disabled=${!!busy} onClick=${() => navigate(`/e/${e.code}`)}>
                    <span class="recent__emoji">${e.type === 'pubgolf' ? '⛳' : e.host ? '👑' : '🍻'}</span>
                    <span class="recent__text">
                      <span class="recent__name">${e.name}</span>
                      <span class="recent__meta">${formatCode(e.code)} · ${fmtAgo(e.lastOpened, Date.now())}</span>
                    </span>
                    <${Icon} name="chevron-right" size=${18} />
                  </button>
                  <button type="button" class="icon-btn recent__act" aria-label=${`${e.host ? 'Slet' : 'Forlad'} ${e.name}`} disabled=${!!busy} onClick=${() => leave(e)}>
                    ${busy === e.code ? html`<${Spinner} size=${18} />` : html`<${Icon} name=${e.host ? 'trash' : 'log-out'} size=${18} />`}
                  </button>
                </div>`,
              )}
            </div>
          </section>`
        : null}

      <p class="footnote">Drik med omtanke — vand tæller også 💧<br />Data er end-to-end krypteret med eventets kode.</p>
    </div>
  </main>`;
}
