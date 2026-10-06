import { html, useState, useEffect, Button, IconButton, Icon, Avatar, Sheet, Spinner } from '../kit.js';
import { normalizeCode, isValidCode, formatCode, CODE_LENGTH, LEGACY_CODE_LENGTH } from '../../core/ids.js';
import { closeEvent, openEvent, rememberEvent } from '../../app/session.js';
import { now } from '../../core/clock.js';
import { ProfileForm } from './profile.js';
import { navigate } from '../router.js';
import { fmtPoints, plural } from '../format.js';
import { pickPlayerColor } from '../../game/derive.js';
import { setTeam } from '../../app/actions.js';
import { TeamChip } from '../pubgolf/common.js';

// Step 1: type the code.
export function JoinCode({ initial }) {
  const [value, setValue] = useState(initial ? formatCode(normalizeCode(initial)) : '');
  const [error, setError] = useState(null);
  const code = normalizeCode(value);

  const onInput = (e) => {
    setValue(formatCode(normalizeCode(e.currentTarget.value).slice(0, CODE_LENGTH)));
    setError(null);
  };
  const submit = (e) => {
    e.preventDefault();
    if (!isValidCode(code)) {
      setError(code.length < CODE_LENGTH && code.length !== LEGACY_CODE_LENGTH ? `Koden har ${CODE_LENGTH} tegn.` : 'Koden ser ikke rigtig ud — tjek den igen.');
      return;
    }
    navigate(`/e/${code}`);
  };

  return html`<main class="page view-enter">
    <div class="flow-head">
      <${IconButton} icon="chevron-left" label="Tilbage" onClick=${() => navigate('/')} />
      <span class="flow-head__title">Deltag</span>
    </div>
    <h1 class="flow-title">Hvad er koden?</h1>
    <p class="flow-sub">Spørg værten — eller scan QR-koden på værtens telefon med dit kamera.</p>
    <form class="stack stack--l" onSubmit=${submit} novalidate>
      <input
        class="input code-input"
        inputmode="text"
        autocapitalize="characters"
        autocomplete="off"
        autocorrect="off"
        spellcheck=${false}
        placeholder="XXXX-XXXX-XXXX"
        aria-label="Eventkode"
        value=${value}
        onInput=${onInput}
        autofocus
      />
      ${error ? html`<div class="form-error" role="alert"><${Icon} name="info" size=${18} />${error}</div>` : null}
      <${Button} type="submit" size="lg" block disabled=${code.length !== CODE_LENGTH && code.length !== LEGACY_CODE_LENGTH} iconRight="chevron-right">Find event<//>
    </form>
  </main>`;
}

// Step 2 (inside the event route): event preview + profile. Also lets a returning player
// continue as their existing player on a new phone.
export function JoinProfile({ room, d }) {
  const [busy, setBusy] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const meta = room.state.meta;
  const players = d.ranking.filter((p) => !p.left);
  const host = d.players.get(meta.hostId);
  const isHost = meta.hostId === room.pid;
  const pg = d.pg;
  const teams = pg && !pg.cfg.lockTeams ? pg.teams : [];
  // Suggest the team with the fewest players.
  const [team, setTeamChoice] = useState(() => [...teams].sort((a, b) => a.members.length - b.members.length)[0]?.id || null);

  const submit = ({ name, photo }) => {
    setBusy(true);
    room.setProfile({ name, photo, joinedAt: now(), left: 0, color: room.me?.profile?.color || pickPlayerColor(room) });
    if (team && !pg.players.get(room.pid)?.team) setTeam(room, room.pid, team);
    rememberEvent(room.code, { name: meta.name, host: isHost, type: meta.type || 'party' });
  };

  const claim = async (pid) => {
    setClaimOpen(false);
    const code = room.code;
    closeEvent();
    rememberEvent(code, { pid });
    await openEvent(code);
  };

  return html`<main class="page view-enter">
    <div class="flow-head">
      <${IconButton} icon="chevron-left" label="Tilbage" onClick=${() => navigate('/')} />
      <span class="flow-head__title">${isHost ? 'Din profil' : 'Deltag'}</span>
    </div>
    <div class="card event-preview">
      <span class="event-preview__kicker">${isHost ? 'Du er vært for' : 'Du er inviteret til'}</span>
      <h1 class="event-preview__name">${meta.name}</h1>
      ${players.length
        ? html`<div class="row">
            <span class="avatar-stack">${players.slice(0, 6).map((p) => html`<${Avatar} player=${p} size=${30} />`)}</span>
            <span class="muted" style=${{ fontSize: '14px' }}>${players.length} ${players.length === 1 ? 'deltager' : 'deltagere'}${host && !isHost ? ` · vært: ${host.name}` : ''}</span>
          </div>`
        : html`<span class="muted" style=${{ fontSize: '14px' }}>${isHost ? 'Opret din profil — så kan du invitere de andre.' : 'Du er den første!'}</span>`}
    </div>
    <div style=${{ height: '22px' }}></div>
    <${ProfileForm} submitLabel=${isHost ? 'Gem og invitér' : pg ? 'Deltag i pub golf' : 'Deltag i festen'} busy=${busy} onSubmit=${submit}>
      ${teams.length
        ? html`<div class="field">
            <span class="field__label">Dit hold</span>
            <div class="chips">
              ${teams.map((tm) => html`<${TeamChip} team=${tm} active=${team === tm.id} onClick=${() => setTeamChoice(tm.id)}>${tm.name} · ${tm.members.length}<//>`)}
            </div>
            <span class="field__hint">Kan skiftes senere under “Mig”.</span>
          </div>`
        : null}
      ${!isHost && players.length
        ? html`<button type="button" class="text-link" onClick=${() => setClaimOpen(true)}>
            Allerede med fra en anden telefon? Fortsæt som dig selv
          </button>`
        : null}
    <//>
    <${Sheet} open=${claimOpen} onClose=${() => setClaimOpen(false)} title="Hvem er du?" subtitle="Fortsæt med din stilling fra en anden telefon.">
      <div class="list">
        ${players.map(
          (p) => html`<button type="button" class="list-item" onClick=${() => claim(p.pid)}>
            <${Avatar} player=${p} size=${40} />
            <span class="list-item__text">
              <span class="list-item__title">${p.name}</span>
              <span class="list-item__sub">${pg ? `${pg.players.get(p.pid)?.played || 0} huller spillet` : `${fmtPoints(p.points)} point · ${plural(p.alcoholic, 'drink', 'drinks')}`}</span>
            </span>
            <${Icon} name="chevron-right" size=${18} />
          </button>`,
        )}
      </div>
    <//>
  </main>`;
}

// Shown while we wait for the event meta to arrive from a broker.
export function Finding({ room, onRetry }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - started), 500);
    return () => clearInterval(t);
  }, [room]);
  const status = room?.status;
  const connected = (status?.online || 0) > 0;
  const settled = room?.brokers?.some((b) => b.settled);
  const giveUp = elapsed > 9000 && (settled || !connected);

  return html`<main class="page view-enter">
    <div class="flow-head">
      <${IconButton} icon="chevron-left" label="Tilbage" onClick=${() => navigate('/')} />
      <span class="flow-head__title">${formatCode(room?.code || '')}</span>
    </div>
    ${giveUp
      ? html`<div class="empty" style=${{ paddingTop: '60px' }}>
          <span class="empty__icon"><${Icon} name=${connected ? 'circle-question-mark' : 'wifi-off'} size=${26} /></span>
          <div class="empty__title">${connected ? 'Eventet blev ikke fundet' : 'Ingen forbindelse'}</div>
          <p class="empty__text">
            ${connected
              ? 'Tjek at koden er rigtig. Hvis eventet er nyt, så bed værten om at have appen åben et øjeblik.'
              : 'Vi kan ikke nå serverne lige nu. Tjek din internetforbindelse og prøv igen.'}
          </p>
          <div class="btn-row" style=${{ width: '100%', maxWidth: '360px', marginTop: '12px' }}>
            <${Button} variant="secondary" onClick=${() => navigate('/deltag')}>Ret koden<//>
            <${Button} icon="refresh-cw" onClick=${onRetry}>Prøv igen<//>
          </div>
        </div>`
      : html`<div class="empty" style=${{ paddingTop: '80px' }}>
          <${Spinner} size=${34} />
          <div class="empty__title">${connected ? 'Finder eventet…' : 'Forbinder…'}</div>
          <p class="empty__text">Henter stillingen sikkert og krypteret.</p>
        </div>`}
  </main>`;
}
