// Pops up a card when someone hands you sips, a game penalty lands on you, or you owe a drink.
import { html, useState, useEffect, useStore, Sheet, Button } from '../kit.js';
import * as storage from '../../core/storage.js';
import { acknowledge } from '../../app/actions.js';
import { wheelById } from '../../game/wheels.js';
import { sfx, haptic } from '../feedback.js';
import { toast } from '../ui-store.js';
import { obligationTitle, obligationEmoji } from '../feedText.js';
import { eventUi } from './event.js';

const POP_WINDOW_MS = 30 * 60 * 1000;

export function InboxPopup({ room, d }) {
  const ui = useStore(eventUi);
  const [seen, setSeen] = useState(() => new Set(storage.load(`seen:${room.roomId}`, [])));
  const active = d.activeGame;
  const overlayOpen = (active && !(ui.breakerHidden[active.gid] ?? !!d.mePlayer?.paused)) || !!ui.spin;
  const item = d.inbox.find((ob) => !seen.has(ob.key) && ob.ts > d.t - POP_WINDOW_MS && !(ob.gid && active?.gid === ob.gid));
  const open = !!item && !overlayOpen && !d.mePlayer?.paused;

  useEffect(() => {
    if (open) {
      sfx.notify();
      haptic([30, 60, 30]);
    }
  }, [open && item?.key]);

  const markSeen = (key) => {
    setSeen((prev) => {
      const next = new Set(prev);
      next.add(key);
      storage.save(`seen:${room.roomId}`, [...next].slice(-400));
      return next;
    });
  };

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
  const why = item?.why ? wheelById(item.why.wheel)?.name : null;
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
