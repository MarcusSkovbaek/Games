// Fællesskål: when a wheel makes everyone drink, the toast pops up on every phone — the one who
// raised it too — and on the big screen, with a 3-2-1 countdown and a live view of who has drunk.
import { html, useState, useEffect, useStore, Avatar, Button, IconButton, cx } from '../kit.js';
import * as storage from '../../core/storage.js';
import { acknowledge } from '../../app/actions.js';
import { wheelById } from '../../game/wheels.js';
import { sfx, haptic, confetti } from '../feedback.js';
import { clearToasts, toast } from '../ui-store.js';
import { sips } from '../format.js';
import { GAMEPLAY } from '../../config.js';
import { markInboxSeen } from './inbox.js';
import { eventUi } from './event.js';
import { useHeld } from '../covered.js';

const STEP_MS = 750;

const seenKey = (room) => `toastSeen:${room.roomId}`;
// Fresh enough to pop up (with a little slack for phone clocks that run behind).
const isLive = (x, t) => t - x.ts < GAMEPLAY.toastLiveMs && x.ts - t < 120_000;

export function GroupToastOverlay({ room, d, tv = false }) {
  const ui = useStore(eventUi);
  const [seen, setSeen] = useState(() => new Set(storage.load(seenKey(room), [])));
  // Wait for whatever else is on screen (minigame, wheel, Tour moment) on phones.
  const active = d.activeGame;
  const busy = !tv && ((active && !(ui.breakerHidden[active.gid] ?? !!d.mePlayer?.paused)) || !!ui.spin || !!ui.tour);
  const away = d.ended || (!tv && d.mePlayer?.paused);
  // Under the camera or a photo it waits (see ui/covered.js).
  const item = useHeld({
    tv,
    t: d.t,
    kind: 'gtoast',
    keyOf: (x) => x.key,
    notice: (x) => `🥂 Fællesskål! ${x.pid === d.me ? 'Du udbringer en skål' : `${d.players.get(x.pid)?.name || 'Nogen'} udbringer en skål`}`,
    pick: (held) => (away || busy ? null : d.toasts.find((x) => !seen.has(x.key) && (isLive(x, d.t) || held(x.key, x.ts))) || null),
  });
  const key = item?.key || null;

  useEffect(() => {
    if (!tv) eventUi.set({ toast: key });
  }, [key]);

  if (!item) return null;
  const close = () => {
    setSeen((prev) => {
      const next = new Set(prev).add(item.key);
      storage.save(seenKey(room), [...next].slice(-100));
      return next;
    });
    markInboxSeen(room.roomId, [item.key]);
  };
  return html`<${GroupToast} key=${item.key} room=${room} d=${d} item=${item} tv=${tv} onClose=${close} />`;
}

function GroupToast({ room, d, item, tv, onClose }) {
  const fresh = d.t - item.ts < 4000;
  const [count, setCount] = useState(fresh ? 3 : 0);
  const host = d.players.get(item.pid);
  const isMe = item.pid === d.me;
  const obs = d.obligations.filter((ob) => ob.key === item.key);
  const mine = obs.find((ob) => ob.target === d.me) || null;
  const drunk = obs.filter((ob) => ob.acked).length;
  const wheel = item.why?.wheel ? wheelById(item.why.wheel) : null;
  const shields = d.mePlayer?.shields || 0;

  useEffect(() => {
    if (!tv) clearToasts();
    document.documentElement.classList.add('scroll-locked');
    haptic([20, 40, 20]);
    if (!fresh) sfx.clink();
    return () => document.documentElement.classList.remove('scroll-locked');
  }, []);

  // 3 · 2 · 1 · SKÅL!
  useEffect(() => {
    if (count <= 0) return undefined;
    sfx.tick();
    const timer = setTimeout(() => setCount((c) => c - 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [count]);
  useEffect(() => {
    if (count !== 0 || !fresh) return;
    sfx.clink();
    setTimeout(() => sfx.clink(), 140);
    haptic([30, 50, 30]);
    confetti({ count: tv ? 140 : 90, colors: ['#f7c04a', '#ffe08f', '#ffffff', '#ff4f8b'] });
  }, [count]);

  // My sips were drunk (or shielded) somewhere else, e.g. from the drinks tab: done here.
  const myDone = !!mine?.acked;
  useEffect(() => {
    if (myDone && !tv) onClose();
  }, [myDone]);
  // The big screen closes itself once everyone has drunk.
  useEffect(() => {
    if (!tv || !obs.length || drunk < obs.length) return undefined;
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [drunk]);

  const ack = (how) => {
    acknowledge(room, mine.key, how);
    if (how === 'shield') {
      sfx.pop();
      toast('Skjold brugt — du slap! 🛡️', { tone: 'good' });
    } else {
      sfx.clink();
      toast('Skål! 🍻', { tone: 'good' });
    }
    onClose();
  };

  const text = isMe
    ? `${obs.length === 1 ? 'Den anden' : 'Alle andre'} drikker ${sips(item.n)} — skål!`
    : mine
      ? `Hæv glasset: du drikker ${sips(item.n)}${obs.length > 1 ? ' sammen med de andre' : ''}`
      : `Alle drikker ${sips(item.n)}`;

  return html`<div
    class=${cx('overlay gtoast', tv && 'gtoast--tv')}
    role="dialog"
    aria-modal="true"
    aria-label="Fællesskål"
    onClick=${tv ? onClose : null}
  >
    <div class="overlay__inner">
      <div class="overlay__head">
        <div class="overlay__titles">
          <div class="overlay__kicker">${wheel ? `${wheel.emoji} ${wheel.name} · ` : ''}Fællesskål</div>
          <div class="overlay__title">${isMe ? 'Du udbringer en skål!' : `${host?.name || 'Nogen'} udbringer en skål!`}</div>
        </div>
        ${tv ? null : html`<${IconButton} icon="x" label="Luk" onClick=${onClose} />`}
      </div>

      <div class="overlay__body gtoast__body">
        <div class="gtoast__stage">
          <span class="gtoast__glow" aria-hidden="true"></span>
          ${host ? html`<${Avatar} player=${host} size=${tv ? 150 : 112} ring />` : null}
          <span class="gtoast__glasses" aria-hidden="true">🥂</span>
        </div>
        <div class=${cx('gtoast__count', count === 0 && 'is-go')} key=${count} aria-live="polite">${count > 0 ? count : 'SKÅL!'}</div>
        <p class="gtoast__text">${text}</p>

        <div class="gtoast__crowd" aria-label=${`${drunk} af ${obs.length} har drukket`}>
          ${obs.map(
            (ob) => html`<span class=${cx('gtoast__p', ob.acked && 'is-done')} key=${ob.target} title=${d.players.get(ob.target)?.name}>
              <${Avatar} player=${d.players.get(ob.target)} size=${tv ? 60 : 42} />
              ${ob.acked ? html`<span class="gtoast__tick" aria-hidden="true">${ob.how === 'shield' ? '🛡️' : '✓'}</span>` : null}
            </span>`,
          )}
        </div>
        <div class="gtoast__progress">${drunk} af ${obs.length} har skålet</div>

        ${tv
          ? null
          : html`<div class="gtoast__actions">
              ${mine && !mine.acked
                ? html`<${Button} size="lg" block disabled=${count > 0} onClick=${() => ack('ok')}>Skål — drukket ✓<//>
                    ${shields ? html`<${Button} variant="secondary" block onClick=${() => ack('shield')}>🛡️ Brug skjold (${shields})<//>` : null}`
                : html`<${Button} size="lg" block onClick=${onClose}>${isMe ? 'Skål! 🥂' : 'Luk'}<//>`}
            </div>`}
      </div>
    </div>
  </div>`;
}
