// The event route: connects, handles "not found"/join, and hosts the tabbed app.
import { html, useState, useEffect, useStore, useNow, Icon, IconButton, createStore, cx } from '../kit.js';
import { session, openEvent, closeEvent, getDerived, rememberEvent, forgetEvent } from '../../app/session.js';
import { isValidCode } from '../../core/ids.js';
import { now } from '../../core/clock.js';
import * as storage from '../../core/storage.js';
import { prefs } from '../ui-store.js';
import { navigate } from '../router.js';
import { Finding, JoinProfile } from './join.js';
import { HomeTab } from './home.js';
import { BoardTab } from './board.js';
import { GamesTab } from './games.js';
import { FeedTab } from './feed.js';
import { MeTab } from './me.js';
import { InviteSheet } from './invite.js';
import { PlayerSheet } from './player.js';
import { BreakerOverlay } from './breaker.js';
import { SpinOverlay } from './spin.js';
import { InboxPopup } from './inbox.js';
import { FinalScreen } from './final.js';
import { TourOverlay, SongButton } from './tour.js';
import { GroupToastOverlay } from './groupToast.js';
import { PgEventApp } from '../pubgolf/app.js';
import { PhotoLayer, CameraButton } from '../photos/layer.js';
import { restorePhotos } from '../../app/photos.js';
import { stopTourSong } from '../tourSong.js';

// UI state that should survive switching tabs.
export const eventUi = createStore({ tab: 'home', invite: false, player: null, spin: null, breakerHidden: {}, tour: null, toast: null, camera: false, photo: null, show: false, comments: false, scope: null, feedView: 'all', photosBy: null });

export function EventRoute({ code }) {
  const [attempt, setAttempt] = useState(0);
  const room = useStore(session, (s) => (s.code === code ? s.room : null));
  useStore(session, (s) => s.version);
  useStore(session, (s) => s.sync);

  useEffect(() => {
    if (!isValidCode(code)) return;
    openEvent(code).catch((err) => console.error('[event] open failed', err));
  }, [code, attempt]);

  useEffect(() => () => closeEvent(), []);

  if (!isValidCode(code)) {
    return html`<main class="page"><div class="empty" style=${{ paddingTop: '80px' }}>
      <span class="empty__icon"><${Icon} name="circle-question-mark" size=${26} /></span>
      <div class="empty__title">Ugyldigt link</div>
      <p class="empty__text">Linket indeholder ikke en gyldig eventkode.</p>
      <button class="btn btn--primary btn--md" onClick=${() => navigate('/')}>Til forsiden</button>
    </div></main>`;
  }

  const meta = room?.state.meta;
  if (!room || !meta || !room.metaSeen) {
    return html`<${Finding}
      room=${room}
      onRetry=${() => {
        closeEvent();
        setAttempt((a) => a + 1);
      }}
    />`;
  }
  if (meta.deleted) return html`<${Deleted} code=${code} />`;

  const d = getDerived(room, now());
  const me = room.state.players[room.pid]?.profile;
  if ((meta.removed || []).includes(room.pid)) return html`<${Removed} code=${code} />`;
  if (!me || !me.name || me.left) {
    return html`<${JoinProfile} room=${room} d=${d} />`;
  }
  return d.pg ? html`<${PgEventApp} room=${room} />` : html`<${EventApp} room=${room} />`;
}

function Removed({ code }) {
  useEffect(() => forgetEvent(code), [code]);
  return html`<main class="page"><div class="empty" style=${{ paddingTop: '80px' }}>
    <span class="empty__icon"><${Icon} name="door-open" size=${26} /></span>
    <div class="empty__title">Du er ikke længere med</div>
    <p class="empty__text">Værten har fjernet din profil fra eventet. Spørg værten, hvis det er en fejl.</p>
    <button class="btn btn--primary btn--md" onClick=${() => navigate('/')}>Til forsiden</button>
  </div></main>`;
}

function Deleted({ code }) {
  useEffect(() => forgetEvent(code), [code]);
  return html`<main class="page"><div class="empty" style=${{ paddingTop: '80px' }}>
    <span class="empty__icon"><${Icon} name="trash" size=${26} /></span>
    <div class="empty__title">Eventet er slettet</div>
    <p class="empty__text">Værten har slettet eventet og alle data.</p>
    <button class="btn btn--primary btn--md" onClick=${() => navigate('/')}>Til forsiden</button>
  </div></main>`;
}

const TABS = [
  { id: 'home', label: 'Drik', icon: 'beer' },
  { id: 'board', label: 'Stilling', icon: 'trophy' },
  { id: 'games', label: 'Spil', icon: 'gamepad-2' },
  { id: 'feed', label: 'Feed', icon: 'activity' },
  { id: 'me', label: 'Mig', icon: 'user-round' },
];

function EventApp({ room }) {
  useNow(1000);
  useStore(session, (s) => s.version);
  const sync = useStore(session, (s) => s.sync);
  const ui = useStore(eventUi);
  const d = getDerived(room, now());
  const [feedSeen, setFeedSeen] = useState(() => storage.load(`feedSeen:${room.roomId}`, 0));

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    // Every event starts on the drinks tab with nothing open.
    eventUi.set({ tab: 'home', invite: false, player: null, spin: null, breakerHidden: {}, tour: null, toast: null, camera: false, photo: null, show: false, comments: false, scope: null, feedView: 'all', photosBy: null });
    rememberEvent(room.code, { name: d.meta.name, host: d.isHost, type: d.meta.type || 'party' });
    restorePhotos(room);
    // A fresh host gets the invitation (QR code) straight away.
    if (d.isHost && d.players.size <= 1 && !storage.load(`invited:${room.roomId}`)) {
      storage.save(`invited:${room.roomId}`, true);
      eventUi.set({ invite: true });
    }
    return () => stopTourSong();
  }, [room]);

  const setTab = (tab) => {
    eventUi.set({ tab });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // When the host ends the event, show everyone the final results once (they can still open
  // the board, feed and their profile afterwards).
  useEffect(() => {
    if (d.ended) eventUi.set({ tab: 'home', invite: false, player: null, spin: null });
  }, [d.ended]);

  // News in the feed: what others did — and our own photos from the disposable camera, which we
  // haven't seen either until they develop.
  const news = (f) => f.pid !== room.pid || !!(f.photo || f.photos?.[0])?.ds;
  const latestFeed = d.feed.find(news)?.ts || 0;
  useEffect(() => {
    if (ui.tab === 'feed' && latestFeed > feedSeen) {
      setFeedSeen(latestFeed);
      storage.save(`feedSeen:${room.roomId}`, latestFeed);
    }
  }, [ui.tab, latestFeed]);
  const unreadFeed = ui.tab === 'feed' ? 0 : d.feed.filter((f) => f.ts > feedSeen && news(f) && f.kind !== 'join').length;

  if (d.ended && ui.tab !== 'board' && ui.tab !== 'feed' && ui.tab !== 'me') {
    return html`<${FinalScreen} room=${room} d=${d} onTab=${setTab} /><${PhotoLayer} room=${room} d=${d} />`;
  }

  const badges = {
    home: d.inbox.length,
    games: d.offers.length,
    feed: unreadFeed,
  };

  let content;
  if (ui.tab === 'board') content = html`<${BoardTab} room=${room} d=${d} />`;
  else if (ui.tab === 'games') content = html`<${GamesTab} room=${room} d=${d} />`;
  else if (ui.tab === 'feed') content = html`<${FeedTab} room=${room} d=${d} />`;
  else if (ui.tab === 'me') content = html`<${MeTab} room=${room} d=${d} />`;
  else content = html`<${HomeTab} room=${room} d=${d} />`;

  return html`<div class="app">
    <${Topbar} room=${room} d=${d} sync=${sync} />
    <main class="app-main" key=${ui.tab}>
      <div class="view-enter">${content}</div>
    </main>
    <nav class="tabbar" aria-label="Navigation">
      <div class="tabbar__inner">
        ${TABS.map(
          (t) => html`<button type="button" class=${cx('tab', ui.tab === t.id && 'is-active')} aria-current=${ui.tab === t.id ? 'page' : null} onClick=${() => setTab(t.id)}>
            <${Icon} name=${t.icon} size=${23} stroke=${ui.tab === t.id ? 2.3 : 1.9} />
            <span>${t.label}</span>
            ${badges[t.id] ? html`<span class="tab__badge">${badges[t.id] > 9 ? '9+' : badges[t.id]}</span>` : null}
          </button>`,
        )}
      </div>
    </nav>
    <${BreakerOverlay} room=${room} d=${d} />
    <${SpinOverlay} room=${room} d=${d} />
    <${TourOverlay} room=${room} d=${d} />
    <${GroupToastOverlay} room=${room} d=${d} />
    <${InboxPopup} room=${room} d=${d} />
    <${InviteSheet} room=${room} d=${d} open=${ui.invite} onClose=${() => eventUi.set({ invite: false })} />
    <${PlayerSheet} room=${room} d=${d} pid=${ui.player} onClose=${() => eventUi.set({ player: null })} />
    <${PhotoLayer} room=${room} d=${d} />
  </div>`;
}

export function Topbar({ room, d, sync }) {
  const sound = useStore(prefs, (s) => s.sound);
  const online = sync?.online || 0;
  const syncState = online ? 'online' : sync?.brokers?.some((b) => b.status === 'connecting') ? 'connecting' : 'offline';
  const count = d.ranking.filter((p) => !p.left).length;
  const onlineNow = d.ranking.filter((p) => p.online && !p.left).length;
  return html`<header class="topbar">
    <div class="topbar__inner">
      <button type="button" class="event-chip" onClick=${() => eventUi.set({ invite: true })} aria-label="Event-info og invitation">
        <span class="event-chip__logo" aria-hidden="true">${d.isHost ? '👑' : '🍻'}</span>
        <span class="event-chip__text">
          <span class="event-chip__name">${d.meta.name}</span>
          <span class="event-chip__meta">
            <span class=${cx('sync-dot', `is-${syncState}`)} aria-hidden="true"></span>
            ${syncState === 'online'
              ? `${onlineNow} online · ${count} ${count === 1 ? 'deltager' : 'deltagere'}`
              : syncState === 'connecting'
                ? 'Forbinder…'
                : 'Offline — gemmes lokalt'}
          </span>
        </span>
      </button>
      <${SongButton} />
      <${CameraButton} room=${room} d=${d} />
      <${IconButton} icon="qr-code" label="Invitér" onClick=${() => eventUi.set({ invite: true })} />
      <${IconButton} icon=${sound ? 'volume-2' : 'volume-x'} label=${sound ? 'Slå lyd fra' : 'Slå lyd til'} onClick=${() => prefs.set({ sound: !sound })} />
    </div>
  </header>`;
}
