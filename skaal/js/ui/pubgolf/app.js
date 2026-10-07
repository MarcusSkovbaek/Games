// A pub golf event: the course (bars as holes), standings, competitions, photos and "me".
import { html, useState, useEffect, useRef, useStore, useNow, Icon, cx } from '../kit.js';
import { session, getDerived, rememberEvent } from '../../app/session.js';
import { now } from '../../core/clock.js';
import * as storage from '../../core/storage.js';
import { restorePhotos } from '../../app/photos.js';
import { PhotoLayer } from '../photos/layer.js';
import { toast } from '../ui-store.js';
import { sfx, haptic } from '../feedback.js';
import { eventUi, Topbar } from '../screens/event.js';
import { InviteSheet } from '../screens/invite.js';
import { BreakerOverlay } from '../screens/breaker.js';
import { InboxPopup } from '../screens/inbox.js';
import { CourseTab } from './course.js';
import { StandingsTab } from './standings.js';
import { CompetitionsTab } from './comps.js';
import { PhotosTab, PhotoPlaces } from './photos.js';
import { PgMeTab } from './me.js';
import { ChallengeOverlay, CompStartOverlay, PodiumOverlay } from './overlays.js';
import { holeTitle } from './common.js';

const TABS = [
  { id: 'course', label: 'Bane', icon: 'flag' },
  { id: 'standings', label: 'Stilling', icon: 'trophy' },
  { id: 'comps', label: 'Konkurrencer', icon: 'medal' },
  { id: 'photos', label: 'Fotos', icon: 'camera' },
  { id: 'me', label: 'Mig', icon: 'user-round' },
];
const TAB_IDS = new Set(TABS.map((t) => t.id));

export function PgEventApp({ room }) {
  useNow(1000);
  useStore(session, (s) => s.version);
  const sync = useStore(session, (s) => s.sync);
  const ui = useStore(eventUi);
  const d = getDerived(room, now());
  const pg = d.pg;
  const [photosSeen, setPhotosSeen] = useState(() => storage.load(`photosSeen:${room.roomId}`, 0));

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    eventUi.set({ tab: 'course', invite: false, player: null, spin: null, breakerHidden: {}, tour: null, toast: null, pgHole: null, camera: false, photo: null, show: false, comments: false, scope: null, photosBy: null });
    rememberEvent(room.code, { name: d.meta.name, host: d.isHost, type: 'pubgolf' });
    restorePhotos(room);
    if (d.isHost && d.players.size <= 1 && !storage.load(`invited:${room.roomId}`)) {
      storage.save(`invited:${room.roomId}`, true);
      eventUi.set({ invite: true });
    }
  }, [room]);

  // Everybody hears it when the group moves on to the next bar.
  const lastHole = useRef(pg.current.id);
  useEffect(() => {
    if (lastHole.current === pg.current.id) return;
    lastHole.current = pg.current.id;
    eventUi.set({ pgHole: null });
    sfx.notify();
    haptic([30, 50, 30]);
    toast(`⛳ Videre til hul ${pg.current.n}: ${holeTitle(pg.current)}`, { duration: 5000 });
  }, [pg.current.id]);

  const tab = TAB_IDS.has(ui.tab) ? ui.tab : 'course';
  const setTab = (id) => {
    eventUi.set({ tab: id });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // New photos: someone else's — or developed ones from the disposable camera (ours too).
  const isNews = (ph) => ph.pid !== room.pid || ph.ds;
  const newestPhoto = Math.max(0, ...d.photos.filter(isNews).map((ph) => ph.shown));
  useEffect(() => {
    if (tab === 'photos' && newestPhoto > photosSeen) {
      setPhotosSeen(newestPhoto);
      storage.save(`photosSeen:${room.roomId}`, newestPhoto);
    }
  }, [tab, newestPhoto]);
  const badges = {
    photos: tab === 'photos' ? 0 : d.photos.filter((ph) => ph.shown > photosSeen && isNews(ph)).length,
    comps: d.inbox.length,
  };

  let content;
  if (tab === 'standings') content = html`<${StandingsTab} room=${room} d=${d} />`;
  else if (tab === 'comps') content = html`<${CompetitionsTab} room=${room} d=${d} />`;
  else if (tab === 'photos') content = html`<${PhotosTab} room=${room} d=${d} />`;
  else if (tab === 'me') content = html`<${PgMeTab} room=${room} d=${d} />`;
  else content = html`<${CourseTab} room=${room} d=${d} />`;

  return html`<div class="app app--pg">
    <${Topbar} room=${room} d=${d} sync=${sync} />
    <main class="app-main" key=${tab}>
      <div class="view-enter">${content}</div>
    </main>
    <nav class="tabbar" aria-label="Navigation">
      <div class="tabbar__inner">
        ${TABS.map(
          (t) => html`<button type="button" class=${cx('tab', tab === t.id && 'is-active')} aria-current=${tab === t.id ? 'page' : null} onClick=${() => setTab(t.id)}>
            <${Icon} name=${t.icon} size=${23} stroke=${tab === t.id ? 2.3 : 1.9} />
            <span>${t.label}</span>
            ${badges[t.id] ? html`<span class="tab__badge">${badges[t.id] > 9 ? '9+' : badges[t.id]}</span>` : null}
          </button>`,
        )}
      </div>
    </nav>
    <${BreakerOverlay} room=${room} d=${d} />
    <${ChallengeOverlay} room=${room} d=${d} />
    <${CompStartOverlay} room=${room} d=${d} />
    <${PodiumOverlay} room=${room} d=${d} />
    <${InboxPopup} room=${room} d=${d} />
    <${InviteSheet} room=${room} d=${d} open=${ui.invite} onClose=${() => eventUi.set({ invite: false })} />
    <${PhotoLayer} room=${room} d=${d} extra=${(photo) => html`<${PhotoPlaces} room=${room} d=${d} photo=${photo} />`} />
  </div>`;
}
