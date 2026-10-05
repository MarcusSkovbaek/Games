// Pops up on your phone when someone hands you sips, a game penalty lands on you, or you owe a
// drink — one at a time, until you have drunk it (or tap "Senere").
import { html, useEffect, useStore, createStore, Sheet, Button, Avatar } from '../kit.js';
import * as storage from '../../core/storage.js';
import { acknowledge } from '../../app/actions.js';
import { sfx, haptic } from '../feedback.js';
import { toast } from '../ui-store.js';
import { obligationEmoji, whyText, nameOf } from '../feedText.js';
import { gameById } from '../../minigames/index.js';
import { amountParts } from '../format.js';
import { GAMEPLAY } from '../../config.js';
import { TOUR } from '../../game/tour.js';
import { eventUi } from './event.js';

const POP_WINDOW_MS = 30 * 60 * 1000;

// Obligations already shown (here, or in the Tour overlay) don't pop up again.
let seenCache = { roomId: null, keys: new Set() };
const seenVersion = createStore({ v: 0 });

function seenKeys(roomId) {
  if (seenCache.roomId !== roomId) seenCache = { roomId, keys: new Set(storage.load(`seen:${roomId}`, [])) };
  return seenCache.keys;
}

export function markInboxSeen(roomId, keys) {
  const set = seenKeys(roomId);
  for (const k of keys) set.add(k);
  storage.save(`seen:${roomId}`, [...set].slice(-400));
  seenVersion.set((s) => ({ v: s.v + 1 }));
}

export function InboxPopup({ room, d }) {
  const ui = useStore(eventUi);
  useStore(seenVersion, (s) => s.v);
  const seen = seenKeys(room.roomId);
  const active = d.activeGame;
  const overlayOpen =
    (active && !(ui.breakerHidden[active.gid] ?? !!d.mePlayer?.paused)) || !!ui.spin || !!ui.tour || !!ui.toast || !!ui.pgChal || !!ui.pgPodium;
  // Sips from a live fællesskål or Tour moment are shown by that pop-up; a minigame's by its overlay.
  const claimed = (ob) =>
    (ob.gid && active?.gid === ob.gid) ||
    (ob.everyone && d.t - ob.ts < GAMEPLAY.toastLiveMs) ||
    (ob.why?.tour && d.t - ob.ts < TOUR.momentMs);
  const waiting = d.inbox.filter((ob) => !seen.has(ob.key) && ob.ts > d.t - POP_WINDOW_MS && !claimed(ob));
  const item = waiting[0] || null;
  const open = !!item && !overlayOpen && !d.mePlayer?.paused;

  useEffect(() => {
    if (open) {
      sfx.notify();
      haptic([30, 60, 30]);
    }
  }, [open && item?.key]);

  const markSeen = (key) => markInboxSeen(room.roomId, [key]);

  const ack = (how) => {
    acknowledge(room, item.key, how);
    markSeen(item.key);
    if (how === 'shield') toast('Skjold brugt — du slap! 🛡️', { tone: 'good' });
    else {
      sfx.clink();
      toast(item.kind === 'owe' ? 'Gælden er betalt 🎁' : 'Skål! 🍻', { tone: 'good' });
    }
  };

  return html`<${Sheet} open=${open} onClose=${() => item && markSeen(item.key)} class="sheet--alert" label="Du skal drikke">
    ${item
      ? html`<${DrinkCard}
          key=${item.key}
          d=${d}
          ob=${item}
          shields=${d.mePlayer?.shields || 0}
          more=${waiting.length - 1}
          onAck=${ack}
          onLater=${() => markSeen(item.key)}
        />`
      : null}
  <//>`;
}

// "Mads giver dig 2 slurke": who it is from, how much, and why.
function DrinkCard({ d, ob, shields, more, onAck, onLater }) {
  const owe = ob.kind === 'owe';
  const from = ob.from && !ob.self ? d.players.get(ob.from) : null;
  const game = ob.gid ? gameById(ob.game) : null;
  const why = whyText(ob);
  const [num, word] = amountParts(ob.n, ob.unit);
  const name = (pid) => html`<strong>${nameOf(d, pid)}</strong>`;
  let title;
  if (owe) title = html`Du skylder ${name(ob.from)}`;
  else if (ob.self) title = 'Du skal selv drikke';
  else if (game) title = html`<strong>${game.name}</strong> — du skal drikke`;
  else if (ob.everyone) title = html`${name(ob.from)} udbragte en fællesskål`;
  else title = html`${name(ob.from)} giver dig`;
  return html`<div class="drink-pop">
    <div class="drink-pop__art">
      ${from
        ? html`<${Avatar} player=${from} size=${80} ring />
            <span class="drink-pop__badge" aria-hidden="true">${obligationEmoji(ob)}</span>`
        : html`<span class="drink-pop__emoji" aria-hidden="true">${obligationEmoji(ob)}</span>`}
    </div>
    <div class="drink-pop__title">${title}</div>
    <div class="drink-pop__amount"><span class="drink-pop__n">${num}</span><span class="drink-pop__unit">${word}</span></div>
    ${why ? html`<div class="drink-pop__why">${why}</div>` : null}
    <div class="drink-pop__actions">
      <${Button} size="lg" block onClick=${() => onAck('ok')}>${owe ? 'Jeg har givet den ✓' : 'Skål — drukket ✓'}<//>
      ${!owe && !ob.self && shields ? html`<${Button} variant="secondary" block onClick=${() => onAck('shield')}>🛡️ Brug skjold (${shields})<//>` : null}
      <${Button} variant="ghost" block onClick=${onLater}>Senere<//>
    </div>
    ${more > 0 ? html`<p class="drink-pop__more">${more} mere venter på dig</p>` : null}
  </div>`;
}
