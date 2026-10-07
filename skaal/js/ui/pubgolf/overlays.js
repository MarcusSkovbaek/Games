// Pub golf moments that pop up on every phone and the big screen: a new challenge, a competition
// the judge starts, and a competition podium the judge has just decided.
import { html, useState, useEffect, useStore, Button, IconButton, cx } from '../kit.js';
import * as storage from '../../core/storage.js';
import { PG } from '../../game/pubgolf.js';
import { sfx, haptic, confetti } from '../feedback.js';
import { clearToasts } from '../ui-store.js';
import { useHeld } from '../covered.js';
import { eventUi } from '../screens/event.js';
import { TeamBadge, MEDALS, entrantName, entrantColor } from './common.js';
import { CrownWinner } from './challenge.js';
import { PhotoThumb } from '../photos/photo.js';
import { canTakePhotos } from '../photos/layer.js';

const isLive = (ts, t) => t - ts < PG.momentMs && ts - t < 120_000;

// Shared plumbing: remembers what this device has seen and waits for a running minigame — and for
// the camera or a photo, with `notice(item)` on top (see ui/covered.js).
// `group` names what an item is about: a newer item in a group this device has just seen doesn't
// pop up again (the judge filling in a podium one place at a time) — an open pop-up just updates.
function useMoment({ room, d, tv, kind, items, waitFor, group = (x) => x.key, notice }) {
  const ui = useStore(eventUi);
  const storeKey = `${kind}Seen:${room.roomId}`;
  const [seen, setSeen] = useState(() => {
    const raw = storage.load(storeKey, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  });
  const active = d.activeGame;
  // One moment at a time (also on the big screen); phones also wait for a running minigame.
  const busy = (!tv && active && !(ui.breakerHidden[active.gid] ?? !!d.mePlayer?.paused)) || [].concat(waitFor || []).some((k) => ui[k]);
  const fresh = (x) => !(group(x) in seen) || x.ts > seen[group(x)] + PG.momentMs;
  const item = useHeld({
    tv,
    t: d.t,
    kind,
    keyOf: group,
    notice,
    pick: (held) => (d.ended || busy ? null : items.find((x) => fresh(x) && (isLive(x.ts, d.t) || held(group(x), x.ts))) || null),
  });
  const id = item ? group(item) : null;
  useEffect(() => {
    eventUi.set({ [kind]: id });
  }, [id]);
  const close = () =>
    setSeen((prev) => {
      const next = Object.fromEntries(
        Object.entries({ ...prev, [id]: item.ts })
          .sort((a, b) => b[1] - a[1])
          .slice(0, 100),
      );
      storage.save(storeKey, next);
      return next;
    });
  return { item, id, close };
}

function useOverlayMount(tv, sound) {
  useEffect(() => {
    if (!tv) clearToasts();
    document.documentElement.classList.add('scroll-locked');
    haptic([30, 50, 30]);
    sound();
    return () => document.documentElement.classList.remove('scroll-locked');
  }, []);
}

export function ChallengeOverlay({ room, d, tv = false }) {
  const items = [...d.pg.challenges].reverse();
  const notice = (x) => `🎲 ${x.by === d.me ? 'Din udfordring er sendt' : `${d.players.get(x.by)?.name || 'Dommeren'} udfordrer jer!`}`;
  const { item, close } = useMoment({ room, d, tv, kind: 'pgChal', items, notice });
  if (!item) return null;
  return html`<${ChallengeMoment} key=${item.key} room=${room} d=${d} item=${item} tv=${tv} onClose=${close} />`;
}

function ChallengeMoment({ room, d, item, tv, onClose }) {
  const pg = d.pg;
  useOverlayMount(tv, () => sfx.fanfare());
  const judge = d.players.get(item.by);
  const won = item.winners.length > 0;
  return html`<div class=${cx('overlay pg-moment', tv && 'pg-moment--tv')} style=${{ '--c': 'var(--teal)' }} role="dialog" aria-modal="true" aria-label="Udfordring" onClick=${tv ? onClose : null}>
    <div class="overlay__inner">
      <div class="overlay__head">
        <div class="overlay__titles">
          <div class="overlay__kicker">Udfordring · hul ${pg.current.n}</div>
          <div class="overlay__title">${item.by === d.me ? 'Du har sendt en udfordring' : `${judge?.name || 'Dommeren'} udfordrer jer!`}</div>
        </div>
        ${tv ? null : html`<${IconButton} icon="x" label="Luk" onClick=${onClose} />`}
      </div>
      <div class="overlay__body pg-moment__body">
        <div class="pg-moment__icon" aria-hidden="true">🎲</div>
        <p class="pg-moment__text">${item.text}</p>
        <p class="pg-moment__sub">
          ${won
            ? html`🏅 ${item.winners.map((w, i) => html`${i ? ', ' : ''}<strong>${w.team ? pg.teamById.get(w.team)?.name : d.players.get(w.p)?.name}</strong>`)} vandt`
            : 'Vinderen får slag i bonus — dommeren afgør.'}
        </p>
        ${tv
          ? null
          : html`<div class="pg-moment__actions">
              ${pg.isJudge && !won ? html`<${CrownWinner} room=${room} d=${d} challenge=${item} onDone=${onClose} />` : null}
              <${Button} size="lg" block variant=${pg.isJudge && !won ? 'secondary' : 'primary'} onClick=${onClose}>
                ${pg.isJudge && !won ? 'Kår vinderen senere' : 'Vi er klar! 💪'}
              <//>
            </div>`}
      </div>
    </div>
  </div>`;
}

// A competition starts. The judge who starts it knows (and gets a toast), so it pops up for
// everyone else — with the competitions kept secret, this is when the players first see it.
export function CompStartOverlay({ room, d, tv = false }) {
  const items = [...d.pg.started.values()].filter((s) => tv || s.by !== room.pid).sort((a, b) => b.ts - a.ts);
  const notice = (x) => `🏁 ${d.pg.cfg.comps.find((c) => c.id === x.comp)?.name || 'En konkurrence'} starter!`;
  const { item, close } = useMoment({ room, d, tv, kind: 'pgComp', items, waitFor: 'pgChal', notice });
  if (!item) return null;
  return html`<${CompStartMoment} key=${item.key} room=${room} d=${d} item=${item} tv=${tv} onClose=${close} />`;
}

function CompStartMoment({ room, d, item, tv, onClose }) {
  const pg = d.pg;
  const comp = pg.cfg.comps.find((c) => c.id === item.comp);
  useOverlayMount(tv, () => sfx.fanfare());
  const [b1, b2, b3] = pg.cfg.compBonus;
  const photo = comp?.kind === 'photo';
  const shoot = photo && !tv && canTakePhotos(room, d);
  return html`<div class=${cx('overlay pg-moment', tv && 'pg-moment--tv')} style=${{ '--c': 'var(--gold)' }} role="dialog" aria-modal="true" aria-label=${`${comp?.name || 'Konkurrence'} starter`} onClick=${tv ? onClose : null}>
    <div class="overlay__inner">
      <div class="overlay__head">
        <div class="overlay__titles">
          <div class="overlay__kicker">Ny konkurrence · hul ${pg.current.n}</div>
          <div class="overlay__title">Konkurrencen starter!</div>
        </div>
        ${tv ? null : html`<${IconButton} icon="x" label="Luk" onClick=${onClose} />`}
      </div>
      <div class="overlay__body pg-moment__body">
        <div class="pg-moment__icon" aria-hidden="true">${comp?.emoji || '🏆'}</div>
        <p class="pg-moment__text">${comp?.name || 'Konkurrence'}</p>
        <p class="pg-moment__sub">
          ${!photo
            ? 'Dommeren afgør, hvem der vinder.'
            : d.settings.disposable
              ? 'Tag jeres bedste billeder med engangskameraet — dommeren kårer de bedste, når de er fremkaldt.'
              : 'Tag jeres bedste billeder — dommeren vælger podiet.'}
          ${b1 || b2 || b3 ? ` Podiet giver ${b1}, ${b2} og ${b3} slag i bonus.` : ''}
        </p>
        ${tv
          ? null
          : html`<div class="pg-moment__actions">
              ${shoot
                ? html`<${Button}
                    size="lg"
                    block
                    icon="camera"
                    onClick=${() => {
                      onClose();
                      eventUi.set({ camera: true });
                    }}
                  >
                    Tag et billede
                  <//>`
                : null}
              <${Button} size="lg" block variant=${shoot ? 'secondary' : 'primary'} onClick=${onClose}>Vi er klar! 💪<//>
            </div>`}
      </div>
    </div>
  </div>`;
}

// The judge who sets a podium already knows it (and gets a toast), so it pops up for everyone else.
export function PodiumOverlay({ room, d, tv = false }) {
  const items = [...d.pg.results.values()].filter((r) => r.places.some(Boolean) && (tv || r.by !== room.pid)).sort((a, b) => b.ts - a.ts);
  const notice = (r) => `🏆 ${d.pg.comps.find((c) => c.id === r.comp)?.name || 'En konkurrence'} er afgjort`;
  const { item, id, close } = useMoment({ room, d, tv, kind: 'pgPodium', items, waitFor: ['pgChal', 'pgComp'], group: (r) => r.comp, notice });
  if (!item) return null;
  return html`<${PodiumMoment} key=${id} room=${room} d=${d} result=${item} tv=${tv} onClose=${close} />`;
}

function PodiumMoment({ room, d, result, tv, onClose }) {
  const pg = d.pg;
  const comp = pg.comps.find((c) => c.id === result.comp);
  useOverlayMount(tv, () => {
    sfx.win();
    setTimeout(() => confetti({ count: tv ? 180 : 130 }), 350);
  });
  const order = [1, 0, 2];
  return html`<div class=${cx('overlay pg-moment pg-moment--podium', tv && 'pg-moment--tv')} role="dialog" aria-modal="true" aria-label=${`${comp?.name} er afgjort`} onClick=${tv ? onClose : null}>
    <div class="overlay__inner">
      <div class="overlay__head">
        <div class="overlay__titles">
          <div class="overlay__kicker">Konkurrence afgjort</div>
          <div class="overlay__title">${comp?.emoji} ${comp?.name}</div>
        </div>
        ${tv ? null : html`<${IconButton} icon="x" label="Luk" onClick=${onClose} />`}
      </div>
      <div class="overlay__body pg-moment__body">
        <div class="pg-stage" aria-label="Podie">
          ${order.map((i) => {
            const place = result.places[i];
            if (!place) return html`<div class="pg-stage__spot is-empty"></div>`;
            const photo = place.photo ? d.photoByKey.get(place.photo) : null;
            const team = place.team ? pg.teamById.get(place.team) : null;
            return html`<div class=${cx('pg-stage__spot', `pg-stage__spot--${i + 1}`)} style=${{ '--tc': entrantColor(d, place) }}>
              ${photo
                ? html`<${PhotoThumb} room=${room} photo=${photo} class="pg-stage__photo" />`
                : team
                  ? html`<${TeamBadge} team=${team} size=${i === 0 ? 72 : 56} />`
                  : html`<span class="pg-stage__emoji" aria-hidden="true">${MEDALS[i]}</span>`}
              <span class="pg-stage__name">${entrantName(d, place)}</span>
              ${pg.cfg.compBonus[i] && (place.team || !pg.cfg.teams.length) ? html`<span class="pg-stage__bonus">−${pg.cfg.compBonus[i]} slag</span>` : null}
              <span class="pg-stage__block"><span aria-hidden="true">${MEDALS[i]}</span><span class="sr-only">${i + 1}.-plads</span></span>
            </div>`;
          })}
        </div>
        ${tv ? null : html`<div class="pg-moment__actions"><${Button} size="lg" block onClick=${onClose}>Tillykke! 🎉<//></div>`}
      </div>
    </div>
  </div>`;
}
