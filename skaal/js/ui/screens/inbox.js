// Pops up a card when someone hands you sips, a game penalty lands on you, or you owe a drink.
import { html, useEffect, useStore, createStore, Sheet, Button } from '../kit.js';
import * as storage from '../../core/storage.js';
import { acknowledge } from '../../app/actions.js';
import { sfx, haptic } from '../feedback.js';
import { toast } from '../ui-store.js';
import { obligationTitle, obligationEmoji, whyText } from '../feedText.js';
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
  const overlayOpen = (active && !(ui.breakerHidden[active.gid] ?? !!d.mePlayer?.paused)) || !!ui.spin || !!ui.tour;
  const item = d.inbox.find((ob) => !seen.has(ob.key) && ob.ts > d.t - POP_WINDOW_MS && !(ob.gid && active?.gid === ob.gid));
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

  // Game penalties already name the game in the title.
  const why = item ? whyText(item) : null;
  const owe = item?.kind === 'owe';
  const shields = d.mePlayer?.shields || 0;
  return html`<${Sheet} open=${open} onClose=${() => item && markSeen(item.key)}>
    ${item
      ? html`<div class="inbox-modal">
          <div class="inbox-modal__emoji" key=${item.key}>${obligationEmoji(item)}</div>
          <div class="inbox-modal__title">${obligationTitle(d, item)}</div>
          ${why ? html`<div class="inbox-modal__sub">${why}</div>` : null}
          <div class="stack stack--s" style=${{ width: '100%', marginTop: '8px' }}>
            <${Button} size="lg" block onClick=${() => ack('ok')}>${owe ? 'Jeg har givet den ✓' : 'Skål — drukket ✓'}<//>
            ${!owe && !item.self && shields
              ? html`<${Button} variant="secondary" block onClick=${() => ack('shield')}>🛡️ Brug skjold (${shields})<//>`
              : null}
            <${Button} variant="ghost" block onClick=${() => markSeen(item.key)}>Senere</${Button}>
          </div>
        </div>`
      : null}
  <//>`;
}
