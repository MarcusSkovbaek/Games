// The "Konkurrencer" tab: who won what (with podiums everyone can see), challenges along the way
// and minigames for entertainment.
import { html, useState, useEffect, Sheet, Button, Icon, cx } from '../kit.js';
import { GAMES, gameById } from '../../minigames/index.js';
import { setPodium, startGame } from '../../app/actions.js';
import { getDerived } from '../../app/session.js';
import { confirmDialog, toast } from '../ui-store.js';
import { sfx } from '../feedback.js';
import { fmtAgo } from '../format.js';
import { eventUi } from '../screens/event.js';
import { InboxCard } from '../screens/home.js';
import { TeamChip, MEDALS, entrantName, entrantColor } from './common.js';
import { ChallengeSheet, CrownWinner } from './challenge.js';

export function CompetitionsTab({ room, d }) {
  const pg = d.pg;
  const [podiumFor, setPodiumFor] = useState(null);
  const [challenge, setChallenge] = useState(false);
  const decided = pg.comps.filter((c) => pg.results.get(c.id)?.places.some(Boolean)).length;
  const [b1, b2, b3] = pg.cfg.compBonus;
  return html`<div class="stack stack--l">
    <div class="section__head" style=${{ paddingTop: '6px' }}>
      <h1 class="section__title" style=${{ fontSize: '26px' }}>Konkurrencer</h1>
      <span class="faint" style=${{ fontSize: '13px' }}>${decided} af ${pg.comps.length} afgjort</span>
    </div>

    ${d.inbox.length
      ? html`<section class="section" aria-label="Venter på dig">
          ${d.inbox.slice(0, 4).map((ob) => html`<${InboxCard} room=${room} d=${d} ob=${ob} shields=${d.mePlayer?.shields || 0} />`)}
        </section>`
      : null}

    <div class="stack">
      ${pg.comps.map(
        (comp) => html`<${CompCard} key=${comp.id} d=${d} comp=${comp} result=${pg.results.get(comp.id)} canEdit=${pg.isJudge && !d.ended} onEdit=${() => setPodiumFor(comp.id)} />`,
      )}
    </div>
    ${b1 || b2 || b3
      ? html`<p class="faint" style=${{ fontSize: '12.5px', textAlign: 'center' }}>
          Podiet giver ${b1}, ${b2} og ${b3} slag i bonus til ${pg.cfg.teams.length ? 'holdene' : 'spillerne'}.${pg.isJudge ? '' : ' Dommeren afgør konkurrencerne.'}
        </p>`
      : null}

    <${Challenges} room=${room} d=${d} onNew=${() => setChallenge(true)} />
    <${Minigames} room=${room} d=${d} />

    <${PodiumSheet} room=${room} d=${d} comp=${pg.comps.find((c) => c.id === podiumFor) || null} onClose=${() => setPodiumFor(null)} />
    <${ChallengeSheet} room=${room} d=${d} open=${challenge} onClose=${() => setChallenge(false)} />
  </div>`;
}

export function CompCard({ d, comp, result, canEdit, onEdit }) {
  const pg = d.pg;
  const places = result?.places || [];
  const decided = places.some(Boolean);
  return html`<section class=${cx('card pg-comp', decided && 'is-decided')}>
    <div class="pg-comp__head">
      <span class="pg-comp__emoji" aria-hidden="true">${comp.emoji}</span>
      <span class="pg-comp__title">${comp.name}${comp.kind === 'photo' ? html`<span class="pg-comp__tag">Foto</span>` : null}</span>
      ${canEdit ? html`<button type="button" class="btn btn--secondary btn--sm" onClick=${onEdit}>${decided ? 'Ret podiet' : 'Sæt podiet'}</button>` : null}
    </div>
    ${decided
      ? html`<ol class="pg-places">
          ${places.map((pl, i) =>
            pl
              ? html`<li class=${cx('pg-place', `pg-place--${i + 1}`)} style=${{ '--tc': entrantColor(d, pl) }}>
                  <span class="pg-place__medal" role="img" aria-label=${`${i + 1}.-plads`}>${MEDALS[i]}</span>
                  ${pl.photo && pg.photoByKey.get(pl.photo)?.data ? html`<img class="pg-place__photo" src=${pg.photoByKey.get(pl.photo).data} alt="" />` : null}
                  <span class="pg-place__name">${entrantName(d, pl)}${pl.photo && pl.team ? html`<small>${d.players.get(pl.pid)?.name}</small>` : null}</span>
                  ${pg.cfg.compBonus[i] && (pl.team || !pg.cfg.teams.length) ? html`<span class="pg-place__bonus">−${pg.cfg.compBonus[i]}</span>` : null}
                </li>`
              : null,
          )}
        </ol>`
      : html`<p class="pg-comp__empty">${comp.kind === 'photo' ? 'Del jeres bedste billeder under Fotos — dommeren vælger podiet.' : 'Ikke afgjort endnu.'}</p>`}
  </section>`;
}

// Judge: pick 1st, 2nd and 3rd — teams (or players without teams), or photos for the photo
// competition.
function PodiumSheet({ room, d, comp, onClose }) {
  const pg = d.pg;
  const [picks, setPicks] = useState([null, null, null]);
  useEffect(() => {
    if (!comp) return;
    const r = pg.results.get(comp.id);
    setPicks([0, 1, 2].map((i) => (r?.places[i] ? (comp.kind === 'photo' ? r.places[i].photo : r.places[i].team || r.places[i].pid) : null)));
  }, [comp?.id]);
  if (!comp) return html`<${Sheet} open=${false} onClose=${onClose} />`;

  const photo = comp.kind === 'photo';
  const entrants = photo
    ? pg.photos.map((ph) => ({ id: ph.key, photo: ph }))
    : pg.cfg.teams.length
      ? pg.cfg.teams.map((t) => ({ id: t.id, team: pg.teamById.get(t.id) }))
      : d.ranking.filter((p) => !p.left).map((p) => ({ id: p.pid, player: p }));
  const placeOf = (id) => picks.indexOf(id);
  const assign = (place, id) => setPicks((cur) => cur.map((x, i) => (i === place ? (x === id ? null : id) : x === id ? null : x)));
  // Photos: tapping fills the next free place; tapping a placed photo takes it off.
  const tapPhoto = (id) => {
    const at = placeOf(id);
    if (at >= 0) assign(at, id);
    else {
      const free = picks.indexOf(null);
      if (free >= 0) assign(free, id);
      else toast('Podiet er fyldt — tryk på et valgt billede for at fjerne det', { icon: '🏆' });
    }
  };
  const save = () => {
    setPodium(room, comp, picks);
    sfx.win();
    toast(picks.some(Boolean) ? `🏆 ${comp.name} er afgjort` : `${comp.name}: podiet er nulstillet`, { tone: 'good' });
    onClose();
  };

  return html`<${Sheet}
    open=${!!comp}
    onClose=${onClose}
    title=${`${comp.emoji} ${comp.name}`}
    subtitle=${photo ? 'Tryk på billederne i rækkefølge: 1., 2. og 3.-plads.' : 'Vælg hvem der fik 1., 2. og 3.-plads.'}
    size=${photo ? 'tall' : 'auto'}
    footer=${html`<div class="btn-row">
      ${pg.results.get(comp.id)?.places.some(Boolean) ? html`<${Button} variant="secondary" onClick=${() => setPicks([null, null, null])}>Nulstil<//>` : null}
      <${Button} icon="check" disabled=${!picks[0] && !pg.results.get(comp.id)?.places.some(Boolean)} onClick=${save}>Gem podiet<//>
    </div>`}
  >
    ${photo
      ? pg.photos.length
        ? html`<div class="pg-photo-pick">
            ${entrants.map(({ id, photo: ph }) => {
              const at = placeOf(id);
              return html`<button type="button" class=${cx('pg-photo-pick__item', at >= 0 && 'is-on')} aria-pressed=${at >= 0} aria-label=${`Billede fra ${d.players.get(ph.pid)?.name}${at >= 0 ? `, ${at + 1}.-plads` : ''}`} onClick=${() => tapPhoto(id)}>
                ${ph.data ? html`<img src=${ph.data} alt="" />` : html`<span class="spinner"></span>`}
                ${at >= 0 ? html`<span class="pg-photo-pick__medal">${MEDALS[at]}</span>` : null}
                <span class="pg-photo-pick__who">${d.players.get(ph.pid)?.name}</span>
              </button>`;
            })}
          </div>`
        : html`<p class="muted">Der er ingen billeder endnu — de dukker op her, når nogen deler et under Fotos.</p>`
      : html`<div class="stack">
          ${[0, 1, 2].map(
            (place) => html`<div class="pg-podium-row">
              <span class="pg-podium-row__medal" aria-hidden="true">${MEDALS[place]}</span>
              <div class="chips">
                ${entrants.map(({ id, team, player }) =>
                  team
                    ? html`<${TeamChip} team=${team} active=${picks[place] === id} onClick=${() => assign(place, id)} />`
                    : html`<button type="button" class=${cx('chip', picks[place] === id && 'is-active')} aria-pressed=${picks[place] === id} onClick=${() => assign(place, id)}>${player.name}</button>`,
                )}
              </div>
            </div>`,
          )}
        </div>`}
  <//>`;
}

function Challenges({ room, d, onNew }) {
  const pg = d.pg;
  const list = [...pg.challenges].reverse();
  return html`<section class="section">
    <div class="section__head">
      <h2 class="section__title">Udfordringer</h2>
      ${pg.isJudge && list.length && !d.ended ? html`<button type="button" class="section__link" onClick=${onNew}>+ Ny udfordring</button>` : null}
    </div>
    ${list.length
      ? list.map(
          (c) => html`<div class="card pg-chal" key=${c.key}>
            <p class="pg-chal__text"><span aria-hidden="true">🎲 </span>${c.text}</p>
            <div class="pg-chal__meta">${fmtAgo(c.ts, d.t)}</div>
            ${c.winners.length
              ? html`<div class="pg-chal__winners">
                  🏅 ${c.winners.map((w, i) => html`${i ? ', ' : ''}<strong>${w.team ? pg.teamById.get(w.team)?.name : d.players.get(w.p)?.name}</strong> −${w.n}`)}
                </div>`
              : pg.isJudge && !d.ended
                ? html`<${CrownWinner} room=${room} d=${d} challenge=${c} />`
                : html`<div class="faint" style=${{ fontSize: '13px' }}>Dommeren kårer vinderen.</div>`}
          </div>`,
        )
      : html`<div class="card card--pad pg-chal-empty">
          <span aria-hidden="true" style=${{ fontSize: '30px' }}>🎲</span>
          <span class="spacer">${pg.isJudge ? 'Send en sjov udfordring til holdene — vinderen får slag i bonus.' : 'Dommeren kan sende sjove udfordringer til holdene undervejs.'}</span>
          ${pg.isJudge && !d.ended ? html`<${Button} size="sm" onClick=${onNew}>Træk en<//>` : null}
        </div>`}
  </section>`;
}

function Minigames({ room, d }) {
  const active = d.activeGame;
  const players = d.ranking.filter((p) => !p.left && !p.paused).length;
  const allowed = d.settings.anyoneCanStart || d.isHost || d.pg.isJudge;
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
  return html`<section class="section">
    <div class="section__head">
      <h2 class="section__title">Minigames</h2>
      <span class="faint" style=${{ fontSize: '13px' }}>${allowed ? 'Underholdning undervejs' : 'Dommeren starter dem'}</span>
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
  </section>`;
}
