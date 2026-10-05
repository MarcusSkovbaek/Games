import { html, useState, useStore, Avatar, Icon, IconButton, Sheet, Switch, Empty } from '../kit.js';
import { DrinkArt } from '../drinkArt.js';
import { drinkById } from '../../game/drinks.js';
import { fmtPoints, fmtDecimal, fmtClock, fmtAgo } from '../format.js';
import { undo, setPaused, endEvent, reopenEvent, leaveEvent } from '../../app/actions.js';
import { forgetEvent } from '../../app/session.js';
import { prefs, confirmDialog, toast } from '../ui-store.js';
import { navigate, tvLink } from '../router.js';
import { formatCode } from '../../core/ids.js';
import { APP } from '../../config.js';
import { ProfileForm } from './profile.js';
import { HostSheet } from './host.js';
import { ConnectionSheet } from './connection.js';
import { session } from '../../app/session.js';
import { eventUi } from './event.js';

export function MeTab({ room, d }) {
  const me = d.mePlayer;
  const p = useStore(prefs);
  const [editing, setEditing] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const sync = useStore(session, (s) => s.sync);
  const [showAll, setShowAll] = useState(false);
  if (!me) return null;

  const drinks = d.myEntries.filter((e) => e.t === 'd' && !d.voided.has(`${room.pid}:${e.id}`));
  const shown = showAll ? drinks : drinks.slice(0, 8);

  const removeDrink = async (e) => {
    const drink = drinkById(e.k);
    const ok = await confirmDialog({
      title: `Slet ${drink?.phrase || 'drink'}?`,
      text: `Registreret kl. ${fmtClock(e.ts)}. Point og statistik opdateres for alle.`,
      confirm: 'Slet',
      danger: true,
    });
    if (ok) {
      undo(room, e.id);
      toast('Drink slettet', { icon: '🗑️' });
    }
  };

  const togglePause = (on) => {
    setPaused(room, on);
    toast(on ? 'Du holder pause ⏸️' : 'Velkommen tilbage ▶️');
  };

  const end = async () => {
    const ok = await confirmDialog({
      title: 'Afslut eventet?',
      text: 'Stillingen fryses, og alle ser de endelige resultater. Du kan genåbne det bagefter.',
      confirm: 'Afslut event',
    });
    if (ok) endEvent(room);
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Slet eventet permanent?',
      text: 'Alle data slettes fra serverne, og ingen kan åbne eventet igen. Det kan ikke fortrydes.',
      confirm: 'Slet alt',
      danger: true,
    });
    if (!ok) return;
    await room.destroy();
    forgetEvent(room.code);
    navigate('/');
  };

  const leave = async () => {
    const ok = await confirmDialog({
      title: 'Forlad eventet?',
      text: 'Du forsvinder fra minigames, men dine drinks bliver stående på tavlen.',
      confirm: 'Forlad',
      danger: true,
    });
    if (!ok) return;
    leaveEvent(room);
    forgetEvent(room.code);
    navigate('/');
  };

  return html`<div class="stack stack--l">
    <h1 class="sr-only">Mig</h1>
    <div class="card profile-card">
      <${Avatar} player=${me} size=${64} ring />
      <div class="spacer" style=${{ minWidth: 0 }}>
        <div class="profile-card__name">${me.name}</div>
        <div class="muted" style=${{ fontSize: '14px' }}>${me.points > 0 ? `#${me.rank} · ` : ''}${fmtPoints(me.points)} point${d.isHost ? ' · vært 👑' : ''}</div>
      </div>
      <${IconButton} icon="pencil" label="Redigér profil" onClick=${() => setEditing(true)} />
    </div>

    <div class="stat-grid">
      <div class="stat"><div class="stat__value">${fmtPoints(me.points)}</div><div class="stat__label">Point</div></div>
      <div class="stat"><div class="stat__value">${me.alcoholic}</div><div class="stat__label">Drinks</div></div>
      <div class="stat"><div class="stat__value">${me.pace ? fmtDecimal(me.pace) : '–'}</div><div class="stat__label">pr. time</div></div>
      <div class="stat"><div class="stat__value">${me.sipsTaken}</div><div class="stat__label">Slurke drukket</div></div>
      <div class="stat"><div class="stat__value">${me.sipsGiven}</div><div class="stat__label">Slurke delt ud</div></div>
      <div class="stat"><div class="stat__value">${me.shields}</div><div class="stat__label">Skjolde 🛡️</div></div>
    </div>

    <section class="section">
      <div class="section__head"><h2 class="section__title">Mine drinks</h2><span class="faint" style=${{ fontSize: '13px' }}>Tryk 🗑️ for at rette fejl</span></div>
      ${drinks.length
        ? html`<div class="card" style=${{ padding: '4px 10px' }}>
            ${shown.map((e) => {
              const drink = drinkById(e.k);
              return html`<div class="history-item" key=${e.id}>
                <${DrinkArt} id=${e.k} size=${34} />
                <span class="history-item__text">
                  <div class="history-item__name">${drink?.name || e.k}</div>
                  <div class="history-item__time">kl. ${fmtClock(e.ts)} · ${fmtAgo(e.ts, d.t)}</div>
                </span>
                ${!d.ended ? html`<${IconButton} icon="trash" label=${`Slet ${drink?.name || 'drink'}`} size=${18} onClick=${() => removeDrink(e)} />` : null}
              </div>`;
            })}
            ${drinks.length > shown.length
              ? html`<button type="button" class="btn btn--ghost btn--sm btn--block" onClick=${() => setShowAll(true)}>Vis alle ${drinks.length}</button>`
              : null}
          </div>`
        : html`<div class="card"><${Empty} icon="beer" title="Ingen drinks endnu" text="Gå til Drik-fanen og registrér din første." /></div>`}
    </section>

    <section class="section">
      <h2 class="section__title">Event</h2>
      <div class="list">
        <button type="button" class="list-item" onClick=${() => eventUi.set({ invite: true })}>
          <span class="list-item__icon"><${Icon} name="qr-code" size=${18} /></span>
          <span class="list-item__text"><div class="list-item__title">Invitér venner</div><div class="list-item__sub">Kode ${formatCode(room.code)}</div></span>
          <${Icon} name="chevron-right" size=${18} />
        </button>
        <button type="button" class="list-item" onClick=${() => setConnOpen(true)}>
          <span class="list-item__icon"><${Icon} name=${sync?.online ? 'wifi' : 'wifi-off'} size=${18} /></span>
          <span class="list-item__text">
            <div class="list-item__title">Forbindelse</div>
            <div class="list-item__sub">${sync?.online ? `Online · ${sync.online} af ${sync.total} servere · krypteret` : 'Offline — gemmes lokalt'}</div>
          </span>
          <${Icon} name="chevron-right" size=${18} />
        </button>
        <a class="list-item" href=${tvLink(room.code)} target="_blank" rel="noopener">
          <span class="list-item__icon"><${Icon} name="tv" size=${18} /></span>
          <span class="list-item__text"><div class="list-item__title">Storskærm</div><div class="list-item__sub">Live stilling til tv eller computer</div></span>
          <${Icon} name="external-link" size=${16} />
        </a>
        ${d.isHost
          ? html`<button type="button" class="list-item" onClick=${() => setHostOpen(true)}>
              <span class="list-item__icon"><${Icon} name="sliders-horizontal" size=${18} /></span>
              <span class="list-item__text"><div class="list-item__title">Event-indstillinger</div><div class="list-item__sub">Point, drinks, breakers og minigames</div></span>
              <${Icon} name="chevron-right" size=${18} />
            </button>`
          : null}
      </div>
    </section>

    <section class="section">
      <h2 class="section__title">Indstillinger</h2>
      <div class="list">
        <${Switch} label="Lyd" hint="Klirr, fanfarer og nedtællinger" checked=${p.sound} onChange=${(sound) => prefs.set({ sound })} />
        <${Switch} label="Vibration" hint="Haptisk feedback (understøttede telefoner)" checked=${p.haptics} onChange=${(haptics) => prefs.set({ haptics })} />
        <${Switch} label="Pause" hint="Ude af minigames og straffe — dine drinks tæller stadig" checked=${me.paused} disabled=${!!d.ended} onChange=${togglePause} />
      </div>
    </section>

    ${d.isHost
      ? html`<section class="section">
          <h2 class="section__title">Vært</h2>
          <div class="list">
            ${d.ended
              ? html`<button type="button" class="list-item" onClick=${() => reopenEvent(room)}>
                  <span class="list-item__icon"><${Icon} name="play" size=${18} /></span>
                  <span class="list-item__text"><div class="list-item__title">Genåbn eventet</div><div class="list-item__sub">Fortsæt festen</div></span>
                </button>`
              : html`<button type="button" class="list-item" onClick=${end}>
                  <span class="list-item__icon"><${Icon} name="flag" size=${18} /></span>
                  <span class="list-item__text"><div class="list-item__title">Afslut eventet</div><div class="list-item__sub">Frys stillingen og kår vinderne</div></span>
                </button>`}
            <button type="button" class="list-item list-item--danger" onClick=${remove}>
              <span class="list-item__icon"><${Icon} name="trash" size=${18} /></span>
              <span class="list-item__text"><div class="list-item__title">Slet eventet</div><div class="list-item__sub">Fjerner alle data permanent</div></span>
            </button>
          </div>
        </section>`
      : null}

    <div class="list">
      <button type="button" class="list-item" onClick=${() => navigate('/')}>
        <span class="list-item__icon"><${Icon} name="house" size=${18} /></span>
        <span class="list-item__text"><div class="list-item__title">Til forsiden</div><div class="list-item__sub">Du forbliver i eventet</div></span>
      </button>
      ${!d.isHost
        ? html`<button type="button" class="list-item list-item--danger" onClick=${leave}>
            <span class="list-item__icon"><${Icon} name="log-out" size=${18} /></span>
            <span class="list-item__text"><div class="list-item__title">Forlad eventet</div></span>
          </button>`
        : null}
    </div>

    <p class="footnote">
      ${APP.name} v${APP.version} · End-to-end krypteret med eventkoden<br />
      Drik med omtanke: kend din grænse, drik vand undervejs, og kør aldrig efter at have drukket.
    </p>

    <${Sheet} open=${editing} onClose=${() => setEditing(false)} title="Redigér profil">
      ${editing
        ? html`<${ProfileForm}
            initialName=${me.name}
            initialPhoto=${me.photo}
            submitLabel="Gem"
            onSubmit=${({ name, photo }) => {
              room.setProfile({ name, photo });
              setEditing(false);
              toast('Profil opdateret ✨', { tone: 'good' });
            }}
          />`
        : null}
    <//>
    ${d.isHost ? html`<${HostSheet} room=${room} d=${d} open=${hostOpen} onClose=${() => setHostOpen(false)} />` : null}
    <${ConnectionSheet} room=${room} d=${d} open=${connOpen} onClose=${() => setConnOpen(false)} />
  </div>`;
}

