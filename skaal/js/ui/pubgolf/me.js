// "Mig" in a pub golf event: your round, your team, the judge, and the host's controls.
import { html, useState, useStore, Avatar, Icon, IconButton, Sheet, Switch } from '../kit.js';
import { setPaused, endEvent, reopenEvent, leaveEvent, appointJudge, shuffleTeams } from '../../app/actions.js';
import { forgetEvent, session } from '../../app/session.js';
import { saveProfile, avatarUrl } from '../../app/avatars.js';
import { PhotoHostSection } from '../photos/host.js';
import { prefs, confirmDialog, toast } from '../ui-store.js';
import { navigate, tvLink } from '../router.js';
import { formatCode } from '../../core/ids.js';
import { APP } from '../../config.js';
import { ProfileForm } from '../screens/profile.js';
import { ConnectionSheet } from '../screens/connection.js';
import { eventUi } from '../screens/event.js';
import { ToPar, TeamChip } from './common.js';
import { TeamPickerSheet } from './teams.js';
import { PgSettingsSheet } from './setup.js';
import { HandOverSheet, HandOverItem } from '../screens/handover.js';

export function PgMeTab({ room, d }) {
  const pg = d.pg;
  const me = d.mePlayer;
  const x = pg.me;
  const p = useStore(prefs);
  const sync = useStore(session, (s) => s.sync);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [judgeOpen, setJudgeOpen] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const [handOver, setHandOver] = useState(false);
  if (!me || !x) return null;
  const judge = d.players.get(pg.judge);
  const canPickTeam = pg.cfg.teams.length && (!pg.cfg.lockTeams || pg.isOfficial) && !d.ended;
  const started = x.played > 0 || x.pen || x.bon;

  const end = async () => {
    const ok = await confirmDialog({
      title: 'Afslut runden?',
      text: 'Stillingen fryses, og alle ser slutresultatet. Du kan genåbne bagefter.',
      confirm: 'Afslut',
    });
    if (ok) endEvent(room);
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Slet eventet permanent?',
      text: 'Alle data og billeder slettes fra serverne, og ingen kan åbne eventet igen. Det kan ikke fortrydes.',
      confirm: 'Slet alt',
      danger: true,
    });
    if (!ok) return;
    await room.destroy();
    forgetEvent(room);
    navigate('/');
  };
  const leave = async () => {
    const ok = await confirmDialog({ title: 'Forlad eventet?', text: 'Dine slag bliver stående på scorekortet.', confirm: 'Forlad', danger: true });
    if (!ok) return;
    leaveEvent(room);
    forgetEvent(room);
    navigate('/');
  };
  const shuffle = async () => {
    const ok = await confirmDialog({
      title: 'Bland holdene?',
      text: `Alle ${d.ranking.filter((q) => !q.left).length} spillere fordeles tilfældigt på ${pg.cfg.teams.length} hold.`,
      confirm: 'Bland',
    });
    if (!ok) return;
    shuffleTeams(room, d);
    toast('Holdene er blandet 🎲', { tone: 'good' });
  };

  return html`<div class="stack stack--l">
    <h1 class="sr-only">Mig</h1>
    <div class="card profile-card">
      <${Avatar} player=${me} size=${64} ring />
      <div class="spacer" style=${{ minWidth: 0 }}>
        <div class="profile-card__name">${me.name}</div>
        <div class="pg-roles">
          ${pg.myTeam ? html`<${TeamChip} team=${pg.myTeam} />` : null}
          ${pg.isJudge ? html`<span class="pg-judge-tag">Dommer</span>` : null}
          ${d.isHost ? html`<span class="pg-host-tag">Vært 👑</span>` : null}
        </div>
      </div>
      <${IconButton} icon="pencil" label="Redigér profil" onClick=${() => setEditing(true)} />
    </div>

    <div class="stat-grid">
      <div class="stat"><div class="stat__value"><${ToPar} n=${x.toPar} played=${started} /></div><div class="stat__label">Score</div></div>
      <div class="stat"><div class="stat__value">${x.total}</div><div class="stat__label">Slag</div></div>
      <div class="stat"><div class="stat__value">${x.played}/${pg.holes.length}</div><div class="stat__label">Huller</div></div>
      <div class="stat"><div class="stat__value">${x.rank || '–'}</div><div class="stat__label">Placering</div></div>
      <div class="stat"><div class="stat__value">${x.pen ? `+${x.pen}` : 0}</div><div class="stat__label">Strafslag</div></div>
      <div class="stat"><div class="stat__value">${x.aces || 0}</div><div class="stat__label">Hole in one 🎯</div></div>
    </div>

    <section class="section">
      <h2 class="section__title">Hold og dommer</h2>
      <div class="list">
        ${pg.cfg.teams.length
          ? html`<button type="button" class="list-item" disabled=${!canPickTeam} onClick=${() => setTeamOpen(true)}>
              <span class="list-item__icon"><${Icon} name="users" size=${18} /></span>
              <span class="list-item__text">
                <div class="list-item__title">${pg.myTeam ? pg.myTeam.name : 'Vælg hold'}</div>
                <div class="list-item__sub">${canPickTeam ? 'Tryk for at skifte hold' : pg.cfg.lockTeams ? 'Holdene er låst af værten' : 'Dit hold'}</div>
              </span>
              ${canPickTeam ? html`<${Icon} name="chevron-right" size=${18} />` : null}
            </button>`
          : null}
        <button type="button" class="list-item" disabled=${!d.isHost} onClick=${() => setJudgeOpen(true)}>
          <span class="list-item__icon"><${Icon} name="scale" size=${18} /></span>
          <span class="list-item__text">
            <div class="list-item__title">Dommer: ${judge ? (judge.isMe ? `${judge.name} (dig)` : judge.name) : 'ingen'}</div>
            <div class="list-item__sub">${d.isHost ? 'Tryk for at vælge en anden — der er kun én dommer' : 'Dommeren noterer slag, straffe, bonus og vindere'}</div>
          </span>
          ${d.isHost ? html`<${Icon} name="chevron-right" size=${18} />` : null}
        </button>
        ${(d.isHost || pg.isJudge) && pg.cfg.teams.length && !d.ended
          ? html`<button type="button" class="list-item" onClick=${shuffle}>
              <span class="list-item__icon"><${Icon} name="dice-5" size=${18} /></span>
              <span class="list-item__text"><div class="list-item__title">Bland holdene</div><div class="list-item__sub">Fordel alle tilfældigt</div></span>
            </button>`
          : null}
      </div>
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
          <span class="list-item__text"><div class="list-item__title">Storskærm</div><div class="list-item__sub">Stilling, billeder og podier til tv'et</div></span>
          <${Icon} name="external-link" size=${16} />
        </a>
        ${d.isHost
          ? html`<button type="button" class="list-item" onClick=${() => setSettings(true)}>
              <span class="list-item__icon"><${Icon} name="sliders-horizontal" size=${18} /></span>
              <span class="list-item__text"><div class="list-item__title">Bane, hold og konkurrencer</div><div class="list-item__sub">Barer, par, hold, konkurrencer og regler</div></span>
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
        <${Switch} label="Pause" hint="Ude af minigames — dine slag tæller stadig" checked=${me.paused} disabled=${!!d.ended} onChange=${(on) => setPaused(room, on)} />
      </div>
    </section>

    <${PhotoHostSection} room=${room} d=${d} />

    ${d.isHost
      ? html`<section class="section">
          <h2 class="section__title">Vært</h2>
          <div class="list">
            ${d.ended
              ? html`<button type="button" class="list-item" onClick=${() => reopenEvent(room)}>
                  <span class="list-item__icon"><${Icon} name="play" size=${18} /></span>
                  <span class="list-item__text"><div class="list-item__title">Genåbn runden</div><div class="list-item__sub">Fortsæt hvor I slap</div></span>
                </button>`
              : html`<button type="button" class="list-item" onClick=${end}>
                  <span class="list-item__icon"><${Icon} name="flag" size=${18} /></span>
                  <span class="list-item__text"><div class="list-item__title">Afslut runden</div><div class="list-item__sub">Frys stillingen og kår vinderne</div></span>
                </button>`}
            <${HandOverItem} onClick=${() => setHandOver(true)} />
            <button type="button" class="list-item list-item--danger" onClick=${remove}>
              <span class="list-item__icon"><${Icon} name="trash" size=${18} /></span>
              <span class="list-item__text"><div class="list-item__title">Slet eventet</div><div class="list-item__sub">Fjerner alle data og billeder permanent</div></span>
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
            initialPhoto=${avatarUrl(me) || me.photo}
            submitLabel="Gem"
            onSubmit=${({ name, photo }) => {
              saveProfile(room, { name, photo });
              setEditing(false);
              toast('Profil opdateret ✨', { tone: 'good' });
            }}
          />`
        : null}
    <//>
    <${TeamPickerSheet} room=${room} d=${d} open=${teamOpen} onClose=${() => setTeamOpen(false)} />
    ${d.isHost ? html`<${JudgeSheet} room=${room} d=${d} open=${judgeOpen} onClose=${() => setJudgeOpen(false)} />` : null}
    ${d.isHost ? html`<${PgSettingsSheet} room=${room} d=${d} open=${settings} onClose=${() => setSettings(false)} />` : null}
    ${d.isHost ? html`<${HandOverSheet} room=${room} d=${d} open=${handOver} onClose=${() => setHandOver(false)} />` : null}
    <${ConnectionSheet} room=${room} d=${d} open=${connOpen} onClose=${() => setConnOpen(false)} />
  </div>`;
}

// Host: appoint the judge. There is only ever one; they can also play on a team.
function JudgeSheet({ room, d, open, onClose }) {
  const pg = d.pg;
  const pick = (pid) => {
    if (pid !== pg.judge) {
      appointJudge(room, pid);
      toast(`${d.players.get(pid)?.name} er nu dommer ⚖️`, { tone: 'good' });
    }
    onClose();
  };
  return html`<${Sheet} open=${open} onClose=${onClose} title="Vælg dommer" subtitle="Dommeren noterer slag, giver straffe og bonus og afgør konkurrencerne. Der er kun én dommer, og dommeren kan godt spille med på et hold.">
    <div class="list">
      ${d.ranking
        .filter((q) => !q.left)
        .map((q) => {
          const team = pg.teamById.get(pg.players.get(q.pid)?.team);
          return html`<button type="button" class="list-item" aria-pressed=${q.pid === pg.judge} onClick=${() => pick(q.pid)}>
            <${Avatar} player=${q} size=${40} />
            <span class="list-item__text">
              <span class="list-item__title">${q.name}${q.isMe ? ' (dig)' : ''}</span>
              <span class="list-item__sub">${team ? team.name : 'Intet hold'}${q.pid === pg.judge ? ' · dommer nu' : ''}</span>
            </span>
            ${q.pid === pg.judge ? html`<${Icon} name="check" size=${18} stroke=${3} />` : null}
          </button>`;
        })}
    </div>
  <//>`;
}
