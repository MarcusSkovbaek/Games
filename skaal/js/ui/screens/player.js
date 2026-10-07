import { html, Avatar, Sheet, Button } from '../kit.js';
import { DrinkArt } from '../drinkArt.js';
import { DRINKS } from '../../game/drinks.js';
import { fmtPoints, fmtDecimal, fmtAgo } from '../format.js';
import { removePlayer } from '../../app/actions.js';
import { confirmDialog, toast } from '../ui-store.js';
import { FeedRow } from './feed.js';
import { TITLE_EMOJI } from './board.js';

const TITLE_TEXT = { leader: 'Fører', onfire: 'On fire', hydrated: 'Hydreret' };

export function PlayerSheet({ room, d, pid, onClose }) {
  const p = pid ? d.players.get(pid) : null;
  return html`<${Sheet} open=${!!p} onClose=${onClose} size="tall">
    ${p ? html`<${PlayerDetail} room=${room} d=${d} p=${p} onClose=${onClose} />` : null}
  <//>`;
}

function PlayerDetail({ room, d, p, onClose }) {
  const drinks = DRINKS.filter((x) => p.counts[x.id]);
  const activity = d.feed.filter((f) => f.pid === p.pid && f.kind !== 'join').slice(0, 6);
  const tags = [
    `#${p.rank} af ${d.ranking.length}`,
    p.isHost ? 'Vært 👑' : null,
    p.online ? 'Online nu' : null,
    ...p.titles.map((t) => `${TITLE_EMOJI[t]} ${TITLE_TEXT[t]}`),
    p.shields ? `🛡️ ${p.shields} skjold` : null,
    p.paused ? '⏸️ Pause' : null,
  ].filter(Boolean);

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Fjern ${p.name}?`,
      text: 'Spilleren forsvinder fra eventet med alle sine drinks og billeder. Brug det til dubletter og fejl.',
      confirm: 'Fjern',
      danger: true,
    });
    if (!ok) return;
    removePlayer(room, p.pid);
    onClose();
    toast(`${p.name} er fjernet`, { icon: '🗑️' });
  };

  return html`<div class="stack stack--l">
    <div class="player-hero">
      <${Avatar} player=${p} size=${108} ring online=${p.online} />
      <h2 class="player-hero__name">${p.name}${p.isMe ? ' (dig)' : ''}</h2>
      <div class="player-hero__tags">${tags.map((t) => html`<span class="pill">${t}</span>`)}</div>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat__value">${fmtPoints(p.points)}</div><div class="stat__label">Point</div></div>
      <div class="stat"><div class="stat__value">${p.alcoholic}</div><div class="stat__label">Drinks</div></div>
      <div class="stat"><div class="stat__value">${p.pace ? fmtDecimal(p.pace) : '–'}</div><div class="stat__label">pr. time</div></div>
      <div class="stat"><div class="stat__value">${p.sipsTaken}</div><div class="stat__label">Slurke drukket</div></div>
      <div class="stat"><div class="stat__value">${p.sipsGiven}</div><div class="stat__label">Slurke delt ud</div></div>
      <div class="stat"><div class="stat__value">${p.bestReaction ? `${p.bestReaction}` : '–'}</div><div class="stat__label">Bedste ms</div></div>
    </div>
    ${drinks.length
      ? html`<section class="section">
          <h3 class="section__title">Drinks</h3>
          <div class="breakdown-list">
            ${drinks.map(
              (x) => html`<div class="breakdown-item">
                <${DrinkArt} id=${x.id} size=${34} />
                <span class="breakdown-item__name">${x.name}</span>
                <span class="breakdown-item__count">${p.counts[x.id]}</span>
              </div>`,
            )}
          </div>
          ${p.lastDrinkAt ? html`<p class="faint" style=${{ fontSize: '13px' }}>Seneste drink ${fmtAgo(p.lastDrinkAt, d.t)}</p>` : null}
        </section>`
      : null}
    ${activity.length
      ? html`<section class="section">
          <h3 class="section__title">Seneste aktivitet</h3>
          <div class="feed">${activity.map((item) => html`<${FeedRow} key=${item.key} room=${room} d=${d} item=${item} compact />`)}</div>
        </section>`
      : null}
    ${d.isHost && !p.isMe
      ? html`<${Button} variant="ghost" icon="trash" onClick=${remove} style=${{ color: 'var(--red)' }}>Fjern fra event<//>`
      : null}
  </div>`;
}
