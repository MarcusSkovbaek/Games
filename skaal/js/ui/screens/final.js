// Shown when the host ends the event: podium, awards and a way back to the details.
import { html, useEffect, Avatar, Button } from '../kit.js';
import { DRINKS } from '../../game/drinks.js';
import { fmtPoints, fmtDecimal, fmtSince } from '../format.js';
import { confetti, sfx } from '../feedback.js';
import { reopenEvent } from '../../app/actions.js';
import { navigate } from '../router.js';
import { PhotoOfTheNight } from '../photos/photo.js';
import { eventUi } from './event.js';

export function awardsFor(d) {
  const ps = d.ranking.filter((p) => p.alcoholic || p.water || p.sipsTaken || p.sipsGiven);
  const best = (score, min = 1) => {
    let top = null;
    for (const p of ps) if (score(p) >= min && (!top || score(p) > score(top))) top = p;
    return top;
  };
  const list = [];
  const add = (emoji, title, p, value) => p && list.push({ emoji, title, p, value });
  for (const drink of DRINKS.filter((x) => x.alcoholic)) {
    const p = best((x) => x.counts[drink.id] || 0);
    add(drink.emoji, `Flest ${drink.plural}`, p, p && `${p.counts[drink.id]} stk.`);
  }
  const pace = best((x) => x.pace, 0.01);
  add('⚡', 'Højeste tempo', pace, pace && `${fmtDecimal(pace.pace)} pr. time`);
  const water = best((x) => x.water);
  add('💧', 'Vandhelten', water, water && `${water.water} glas vand`);
  const giver = best((x) => x.sipsGiven);
  add('🎁', 'Mest gavmild', giver, giver && `${giver.sipsGiven} slurke delt ud`);
  const taker = best((x) => x.sipsTaken);
  add('😵', 'Flest straffe', taker, taker && `${taker.sipsTaken} slurke drukket`);
  const fastest = ps.filter((p) => p.bestReaction).sort((a, b) => a.bestReaction - b.bestReaction)[0];
  add('🏎️', 'Hurtigste finger', fastest, fastest && `${fastest.bestReaction} ms`);
  const brain = best((x) => x.quizRight);
  add('🧠', 'Quizmester', brain, brain && `${brain.quizRight} rigtige`);
  return list;
}

export function FinalScreen({ room, d, onTab }) {
  const top = d.ranking.filter((p) => p.points > 0).slice(0, 3);
  const winner = top[0];
  const awards = awardsFor(d);
  const duration = (d.ended || d.t) - (d.meta.startedAt || d.meta.createdAt);

  useEffect(() => {
    const t = setTimeout(() => {
      sfx.win();
      confetti({ count: 140, y: 0.3 });
    }, 400);
    return () => clearTimeout(t);
  }, []);

  return html`<main class="page view-enter">
    <div class="stack stack--l">
      <div class="final-hero">
        <div class="final-hero__kicker">Eventet er slut · ${fmtSince(duration)}</div>
        <h1 class="final-hero__title">${d.meta.name}</h1>
      </div>

      ${winner
        ? html`<div class="card card--pad" style=${{ textAlign: 'center' }}>
            <div class="podium" style=${{ marginBottom: '6px' }}>
              ${[top[1], top[0], top[2]].map((p, i) => {
                if (!p) return html`<div></div>`;
                const place = [2, 1, 3][i];
                return html`<div class=${`podium__spot podium__spot--${place}`}>
                  ${place === 1 ? html`<span class="crown" aria-hidden="true">👑</span>` : null}
                  <${Avatar} player=${p} size=${place === 1 ? 80 : 58} ring=${place === 1} />
                  <span class="podium__name">${p.isMe ? 'Dig' : p.name}</span>
                  <span class="podium__pts">${fmtPoints(p.points)} <small>point</small></span>
                  <span class="podium__block">${place}</span>
                </div>`;
              })}
            </div>
            <p class="muted">${winner.isMe ? 'Du vandt! 🏆' : `${winner.name} vandt aftenen! 🏆`}</p>
          </div>`
        : html`<p class="muted" style=${{ textAlign: 'center' }}>Ingen point blev registreret.</p>`}

      <div class="stat-grid">
        <div class="stat"><div class="stat__value">${d.totals.alcoholic}</div><div class="stat__label">Drinks i alt</div></div>
        <div class="stat"><div class="stat__value">${d.ranking.length}</div><div class="stat__label">Deltagere</div></div>
        <div class="stat"><div class="stat__value">${d.games.filter((g) => g.result).length}</div><div class="stat__label">Minigames</div></div>
      </div>

      <${PhotoOfTheNight}
        room=${room}
        d=${d}
        onAll=${() => {
          eventUi.set({ feedView: 'photos' });
          onTab('feed');
        }}
      />

      ${awards.length
        ? html`<section class="section">
            <h2 class="section__title">Aftenens priser</h2>
            <div class="awards">
              ${awards.map(
                (a) => html`<div class="award">
                  <span class="award__emoji">${a.emoji}</span>
                  <span class="award__title">${a.title}</span>
                  <span class="award__who"><${Avatar} player=${a.p} size=${26} /><span>${a.p.isMe ? 'Dig' : a.p.name}</span></span>
                  <span class="award__value">${a.value}</span>
                </div>`,
              )}
            </div>
          </section>`
        : null}

      <div class="stack stack--s">
        <${Button} variant="secondary" block icon="trophy" onClick=${() => onTab('board')}>Se hele stillingen<//>
        <${Button} variant="secondary" block icon="activity" onClick=${() => onTab('feed')}>Se aftenens feed<//>
        ${d.isHost ? html`<${Button} variant="ghost" block icon="play" onClick=${() => reopenEvent(room)}>Genåbn eventet<//>` : null}
        <${Button} variant="ghost" block icon="house" onClick=${() => navigate('/')}>Til forsiden<//>
      </div>
    </div>
  </main>`;
}
