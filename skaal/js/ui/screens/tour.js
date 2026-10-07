// Tour de France mode: the face that pops up on every phone (and the big screen) when a rider
// reaches 21 drinks, the song button, and the Tour card on the drinks tab.
import { html, useState, useEffect, useStore, Avatar, Button, IconButton, Icon, cx } from '../kit.js';
import { TOUR, TOUR_FACES, faceById } from '../../game/tour.js';
import * as storage from '../../core/storage.js';
import { acknowledge } from '../../app/actions.js';
import { sfx, haptic, confetti } from '../feedback.js';
import { song, playTourSong, stopTourSong, stopIfGone, songPageLink, playsSong } from '../tourSong.js';
import { clearToasts, toast } from '../ui-store.js';
import { TourFace } from '../tourArt.js';
import { unitText, fmtPoints } from '../format.js';
import { nameOf } from '../feedText.js';
import { markInboxSeen } from './inbox.js';
import { eventUi } from './event.js';
import { useHeld } from '../covered.js';

const seenKey = (room) => `tourSeen:${room.roomId}`;

// Fresh enough to pop up (a little slack for phone clocks that run behind).
const isLive = (m, t) => t - m.ts < TOUR.momentMs && m.ts - t < 120_000;

export function TourOverlay({ room, d, tv = false }) {
  const [seen, setSeen] = useState(() => new Set(storage.load(seenKey(room), [])));
  // Players on a break are left alone (as with breakers); the moment is in their feed. Under the
  // camera or a photo it waits (see ui/covered.js).
  const away = d.ended || (!tv && d.mePlayer?.paused);
  const moment = useHeld({
    tv,
    t: d.t,
    kind: 'tour',
    keyOf: (m) => m.key,
    notice: (m) => `🚴 ${nameOf(d, m.pid)} har kørt ${m.n} etaper!`,
    pick: (held) => (away ? null : d.tour.moments.find((m) => !seen.has(m.key) && (isLive(m, d.t) || held(m.key, m.ts))) || null),
  });
  const key = moment?.key || null;

  useEffect(() => {
    if (!tv) eventUi.set({ tour: key });
  }, [key]);
  // An undone 21st drink takes its moment along — stop the song too.
  useEffect(() => stopIfGone(d));

  if (!moment) return null;
  const close = () => {
    setSeen((prev) => {
      const next = new Set(prev).add(moment.key);
      storage.save(seenKey(room), [...next].slice(-100));
      return next;
    });
    // The overlay already told this player what to drink; the inbox doesn't pop it up again.
    markInboxSeen(room.roomId, d.inbox.filter((ob) => ob.why?.tour === moment.key).map((ob) => ob.key));
  };
  return html`<${TourMoment} key=${moment.key} room=${room} d=${d} moment=${moment} tv=${tv} onClose=${close} />`;
}

// Face roulette timing: flick through the faces, slowing down, then land on the one that came up.
const ROLL_START_MS = 450;
const ROLL_STEPS = [70, 70, 75, 80, 90, 100, 115, 135, 160, 195, 240, 300, 380];

function TourMoment({ room, d, moment, tv, onClose }) {
  const face = faceById(moment.face);
  const rider = d.players.get(moment.pid);
  const fresh = d.t - moment.ts < 6000;
  const [phase, setPhase] = useState(fresh ? 'roll' : 'reveal');
  const [shown, setShown] = useState(fresh ? null : face.id);
  const songState = useStore(song);
  const revealed = phase === 'reveal';

  useEffect(() => {
    if (!tv) clearToasts();
    document.documentElement.classList.add('scroll-locked');
    haptic([20, 40, 20]);
    playTourSong(d, moment, { tv }).catch((err) => console.warn('[tour] song', err));
    return () => document.documentElement.classList.remove('scroll-locked');
  }, []);

  useEffect(() => {
    if (phase !== 'roll') return undefined;
    const ids = TOUR_FACES.map((f) => f.id);
    let i = (ids.indexOf(face.id) - ROLL_STEPS.length + ids.length * ROLL_STEPS.length) % ids.length;
    let step = 0;
    let timer = null;
    const next = () => {
      if (step >= ROLL_STEPS.length) {
        setPhase('reveal');
        return;
      }
      i = (i + 1) % ids.length;
      setShown(ids[i]);
      sfx.tick();
      timer = setTimeout(next, ROLL_STEPS[step++]);
    };
    timer = setTimeout(next, ROLL_START_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!revealed || !fresh) return;
    haptic([40, 60, 40]);
    confetti({ count: tv ? 160 : 110, colors: [face.color, '#ffd400', '#ffffff', '#ffe98a'] });
  }, [revealed]);

  const mine = d.inbox.filter((ob) => ob.why?.tour === moment.key);
  const hits = d.obligations.filter((ob) => ob.why?.tour === moment.key);
  const bonus = moment.effects.filter((ef) => ef.type === 'bon');
  const isRider = moment.pid === d.me;
  const shields = d.mePlayer?.shields || 0;
  const canShield = mine.length > 0 && mine.every((ob) => !ob.self) && shields > 0;
  const link = playsSong(d, moment, { tv }) || d.settings.tourSongAll || isRider ? songPageLink(d) : null;
  const shownFace = shown ? faceById(shown) : null;

  const ack = (how) => {
    for (const ob of mine) acknowledge(room, ob.key, how);
    if (how === 'shield') {
      sfx.pop();
      toast('Skjold brugt — du slap! 🛡️', { tone: 'good' });
    } else {
      sfx.clink();
      toast('Skål! 🍻', { tone: 'good' });
    }
    onClose();
  };

  return html`<div
    class=${cx('overlay tour', tv && 'tour--tv', revealed && 'is-revealed')}
    style=${{ '--c': revealed ? face.color : 'var(--jersey)' }}
    role="dialog"
    aria-modal="true"
    aria-label="Tour de France"
    onClick=${tv ? onClose : null}
  >
    <div class="overlay__inner">
      <div class="overlay__head">
        ${rider ? html`<${Avatar} player=${rider} size=${tv ? 72 : 46} />` : null}
        <div class="overlay__titles">
          <div class="overlay__kicker">Tour de France · Etape ${moment.n}</div>
          <div class="overlay__title">${isRider ? 'Du har' : `${rider?.name || 'En rytter'} har`} kørt ${moment.n} etaper!</div>
        </div>
        ${tv ? null : html`<${IconButton} icon="x" label="Luk" onClick=${onClose} />`}
      </div>

      <div class="overlay__body tour__body">
        <div class="tour__stage">
          <div class=${cx('tour__disc', !revealed && 'is-rolling', revealed && 'is-landed')} style=${{ '--fc': shownFace?.color || 'var(--jersey)' }} key=${revealed ? 'landed' : shown || 'wait'}>
            ${shownFace ? html`<${TourFace} d=${d} id=${shownFace.id} size=${tv ? 340 : 240} />` : html`<span class="tour__wait" aria-hidden="true">🚴</span>`}
          </div>
          <div class="tour__name" aria-live="polite">${revealed ? face.name : 'Hvem dukker op …?'}</div>
        </div>

        ${revealed
          ? html`<div class="tour__verdict">
              <div class="tour__title">${face.title}</div>
              <p class="tour__text">${face.text({ bonus: d.settings.bonus })}</p>
              ${hits.length || bonus.length
                ? html`<div class="tour__hits">
                    ${bonus.map(
                      (ef) => html`<span class="tour-hit is-good" key=${ef.key}>
                        <${Avatar} player=${d.players.get(ef.pid)} size=${tv ? 40 : 28} />
                        <span>${nameOf(d, ef.pid)}</span><b>+${fmtPoints(ef.e.n)} point</b>
                      </span>`,
                    )}
                    ${hits.map(
                      (ob) => html`<span class=${cx('tour-hit', ob.acked && 'is-done')} key=${`${ob.key}|${ob.target}`}>
                        <${Avatar} player=${d.players.get(ob.target)} size=${tv ? 40 : 28} />
                        <span>${nameOf(d, ob.target)}</span><b>${unitText(ob.n, ob.unit)}</b>${ob.acked ? html`<span role="img" aria-label=${ob.how === 'shield' ? 'skjold brugt' : 'drukket'}>${ob.how === 'shield' ? '🛡️' : '✓'}</span>` : null}
                      </span>`,
                    )}
                  </div>`
                : html`<p class="tour__text faint">Ingen andre ryttere i nærheden — feltet slap denne gang.</p>`}
            </div>`
          : null}

        ${tv
          ? null
          : html`<div class="tour__actions">
              ${revealed && mine.length
                ? html`<${Button} size="lg" block onClick=${() => ack('ok')}>Skål — drukket ✓<//>
                    ${canShield ? html`<${Button} variant="secondary" block onClick=${() => ack('shield')}>🛡️ Brug skjold (${shields})<//>` : null}`
                : html`<${Button} size="lg" block variant=${revealed ? 'primary' : 'secondary'} onClick=${onClose}>${revealed ? 'Videre i feltet 🚴' : 'Spring over'}<//>`}
              <div class="tour__song">
                ${link
                  ? html`<a class="btn btn--ghost btn--sm" href=${link} target="_blank" rel="noopener noreferrer"><${Icon} name="music" size=${16} /><span class="btn__label">Spil Tour-sangen</span></a>`
                  : null}
                ${songState.playing
                  ? html`<button type="button" class="btn btn--ghost btn--sm" onClick=${() => stopTourSong()}><${Icon} name="square" size=${14} /><span class="btn__label">Stop sangen</span></button>`
                  : null}
              </div>
            </div>`}
      </div>
    </div>
  </div>`;
}

// Shown in the top bar while the Tour song plays.
export function SongButton({ label = false }) {
  const playing = useStore(song, (s) => s.playing);
  if (!playing) return null;
  return html`<button type="button" class=${cx('song-btn', label && 'song-btn--label')} aria-label="Stop Tour-sangen" title="Stop Tour-sangen" onClick=${() => stopTourSong()}>
    <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    ${label ? html`<span>Stop sangen</span>` : null}
  </button>`;
}

// Drinks tab: who wears the yellow jersey and how far you are in the Tour.
export function TourCard({ d }) {
  const me = d.mePlayer;
  if (!d.tour.on || !me) return null;
  const leader = d.tour.leader ? d.players.get(d.tour.leader) : null;
  const done = d.tour.moments.find((m) => m.pid === d.me);
  const stage = Math.min(me.alcoholic, TOUR.stages);
  const pct = (stage / TOUR.stages) * 100;
  return html`<section class="tour-card" aria-label="Tour de France">
    <div class="tour-card__head">
      <span class="tour-card__badge" aria-hidden="true"><${Icon} name="bike" size=${22} stroke=${2.2} /></span>
      <div class="tour-card__text">
        <div class="tour-card__title">Tour de France</div>
        <div class="tour-card__sub">
          ${done ? html`I mål! ${faceById(done.face)?.name || 'Et ansigt'} dukkede op` : html`Etape ${stage} af ${TOUR.stages}`}
        </div>
      </div>
      ${leader
        ? html`<span class="tour-card__jersey">
            <${Avatar} player=${leader} size=${34} />
            <span class="tour-card__jersey-text"><small>Gul trøje</small><span>${leader.isMe ? 'Dig' : leader.name}</span></span>
          </span>`
        : html`<span class="tour-card__jersey tour-card__jersey--empty"><small>Gul trøje</small><span>Ledig</span></span>`}
    </div>
    <div class="tour-card__road" role="progressbar" aria-label="Etaper" aria-valuemin="0" aria-valuemax=${TOUR.stages} aria-valuenow=${stage}>
      <span class="tour-card__fill" style=${{ width: `${pct}%` }}></span>
      <span class="tour-card__flag" aria-hidden="true">🏁</span>
    </div>
  </section>`;
}
