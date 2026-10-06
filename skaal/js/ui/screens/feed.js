import { html, useState, useStore, Avatar, Empty, Icon, Segmented, cx } from '../kit.js';
import { FeedText, effectText } from '../feedText.js';
import { drinkById } from '../../game/drinks.js';
import { wheelById } from '../../game/wheels.js';
import { gameById } from '../../minigames/index.js';
import { toggleReaction } from '../../app/actions.js';
import { fmtAgo } from '../format.js';
import { haptic } from '../feedback.js';
import { FeedPhoto, PhotoGrid, PlayButton } from '../photos/photo.js';
import { CameraCard } from '../photos/layer.js';
import { eventUi } from './event.js';

// ❤️ is also the like in the photo viewer, so likes given there show here too.
const REACTIONS = ['❤️', '🍻', '🔥', '😂', '👑', '😱'];

function glyphFor(item) {
  switch (item.kind) {
    case 'drink':
      return drinkById(item.drink)?.emoji || '🍹';
    case 'lead':
      return '👑';
    case 'milestone':
      return '🎉';
    case 'spin':
      return wheelById(item.wheel)?.emoji || '🎡';
    case 'ack':
      return item.how === 'shield' ? '🛡️' : item.ob.kind === 'owe' ? '🎁' : '✅';
    case 'game':
      return gameById(item.inst.g)?.emoji || '🎲';
    case 'join':
      return '👋';
    case 'pause':
      return item.on ? '⏸️' : '▶️';
    case 'tour':
      return '🚴';
    case 'pghole':
      return '⛳';
    case 'pgace':
      return '🎯';
    case 'pgpen':
      return '⚠️';
    case 'pgbon':
      return '⭐';
    case 'pgpodium':
      return '🏆';
    case 'photo':
      return '📸';
    case 'pgchal':
      return '🎲';
    default:
      return '✨';
  }
}

export function FeedRow({ room, d, item, compact }) {
  const actor = item.pid ? d.players.get(item.pid) : null;
  const glyph = glyphFor(item);
  // Bonus/shield effects are already spelled out by the wheel outcome itself.
  const details =
    item.kind === 'spin' ? item.effects.filter((ef) => ef.type !== 'bon' && ef.type !== 'shd') : item.kind === 'tour' ? item.effects : [];
  return html`<div class="feed-item">
    <div class="feed-item__icon">
      ${actor
        ? html`<${Avatar} player=${actor} size=${40} /><span class="feed-item__glyph" aria-hidden="true">${glyph}</span>`
        : html`<span class="feed-item__system" aria-hidden="true">${glyph}</span>`}
    </div>
    <div class="feed-item__body">
      <div class="feed-item__text"><${FeedText} d=${d} item=${item} /></div>
      ${details.length ? html`<div class="feed-item__detail">${details.map((ef, i) => html`${i ? html`<br />` : null}${effectText(d, ef)}`)}</div>` : null}
      ${item.kind === 'photo' ? html`<${FeedPhoto} room=${room} d=${d} photo=${item.photo} compact=${compact} />` : null}
      <div class="feed-item__meta">
        <span>${fmtAgo(item.ts, d.t)}</span>
        ${compact ? null : html`<${Reactions} room=${room} d=${d} itemKey=${item.key} />`}
      </div>
    </div>
  </div>`;
}

function Reactions({ room, d, itemKey }) {
  const [open, setOpen] = useState(false);
  const byEmoji = d.reactions.get(itemKey);
  const present = REACTIONS.filter((e) => byEmoji?.get(e)?.size);
  const react = (emoji) => {
    toggleReaction(room, d, itemKey, emoji);
    haptic(8);
    setOpen(false);
  };
  if (open) {
    return html`<div class="reacts">
      <div class="react-picker" role="menu">
        ${REACTIONS.map((e) => html`<button type="button" role="menuitem" aria-label=${`Reagér med ${e}`} onClick=${() => react(e)}>${e}</button>`)}
      </div>
    </div>`;
  }
  return html`<div class="reacts">
    ${present.map((e) => {
      const who = byEmoji.get(e);
      const mine = who.has(room.pid);
      return html`<button type="button" class=${cx('react', mine && 'is-mine')} aria-pressed=${mine} onClick=${() => react(e)}>${e} ${who.size}</button>`;
    })}
    <button type="button" class="react react--add" aria-label="Tilføj reaktion" onClick=${() => setOpen(true)}><${Icon} name="plus" size=${14} /></button>
  </div>`;
}

export function FeedTab({ room, d }) {
  const [limit, setLimit] = useState(60);
  const view = useStore(eventUi, (s) => s.feedView || 'all');
  const items = d.feed;
  const photos = d.photos;
  return html`<div class="stack">
    <div class="section__head" style=${{ paddingTop: '6px' }}>
      <h1 class="section__title" style=${{ fontSize: '26px' }}>Feed</h1>
      <span class="faint" style=${{ fontSize: '13px' }}>${items.length} hændelser · ${photos.length} ${photos.length === 1 ? 'billede' : 'billeder'}</span>
    </div>
    <${CameraCard} room=${room} d=${d} />
    <${Segmented}
      options=${[
        { value: 'all', label: 'Alt' },
        { value: 'photos', label: `Fotos${photos.length ? ` · ${photos.length}` : ''}` },
      ]}
      value=${view}
      onChange=${(feedView) => eventUi.set({ feedView })}
    />
    ${view === 'photos'
      ? photos.length
        ? html`<${PlayButton} d=${d} /><${PhotoGrid} room=${room} d=${d} photos=${photos} />`
        : html`<${Empty} icon="camera" title="Ingen billeder endnu" text="Tag det første billede fra aftenen — det dukker op her og i feedet hos alle." />`
      : items.length
        ? html`<div class="card" style=${{ padding: '2px 14px' }}>
            <div class="feed">${items.slice(0, limit).map((item) => html`<${FeedRow} key=${item.key} room=${room} d=${d} item=${item} />`)}</div>
          </div>`
        : html`<${Empty} icon="activity" title="Stille før stormen" text="Her dukker alt op: drinks, billeder, førerskifte, lykkehjul og minigames." />`}
    ${view === 'all' && items.length > limit
      ? html`<button type="button" class="btn btn--secondary btn--md" onClick=${() => setLimit((l) => l + 60)}>Vis flere</button>`
      : null}
  </div>`;
}
