// Full-screen minigame overlay shown on every phone while a minigame runs.
import { html, useStore, useEffect, useRef, Ring, IconButton, Button, Icon, Spinner } from '../kit.js';
import { gameById } from '../../minigames/index.js';
import { respond, acknowledge } from '../../app/actions.js';
import { GAMEPLAY } from '../../config.js';
import { fmtDuration, unitText } from '../format.js';
import { sfx, haptic, confetti } from '../feedback.js';
import { toast, clearToasts } from '../ui-store.js';
import { eventUi } from './event.js';
import { uncover } from '../covered.js';

export function BreakerOverlay({ room, d }) {
  const ui = useStore(eventUi);
  const inst = d.activeGame;
  const played = useRef(new Map()); // gid -> Set(phase) for one-shot sounds
  const playStartedAt = useRef(new Map()); // gid -> performance.now() when play was first shown
  const me = d.mePlayer;
  const hiddenFlag = inst ? ui.breakerHidden[inst.gid] : undefined;
  const hidden = hiddenFlag ?? !!me?.paused;
  const visible = !!inst && !hidden;

  useEffect(() => {
    if (!inst) return;
    const done = played.current.get(inst.gid) || new Set();
    played.current.set(inst.gid, done);
    if (done.has(inst.phase)) return;
    done.add(inst.phase);
    if (inst.phase === 'intro') {
      sfx.fanfare();
      haptic([40, 60, 40]);
    } else if (inst.phase === 'play' && inst.responders.includes(d.me)) {
      haptic(25);
    } else if (inst.phase === 'result' && inst.result && visible) {
      const mine = inst.result.penalties.some((p) => p.pid === d.me && !p.done);
      const won = inst.result.bonus.some((b) => b.pid === d.me);
      if (mine) sfx.fail();
      else sfx.win();
      if (won) confetti({ count: 80 });
    } else if (inst.phase === 'result' && !inst.result) {
      done.delete('result'); // try again once the result is in
    }
  }, [inst?.gid, inst?.phase, !!inst?.result]);

  useEffect(() => {
    if (!visible) return;
    clearToasts();
    // Under the camera or a photo the minigame can't be seen: a heads-up on top, and a way to it.
    const { camera, photo } = eventUi.get();
    if ((camera || photo) && inst.phase !== 'result') {
      const g = gameById(inst.g);
      toast(`${g?.emoji || '🎲'} ${g?.name || 'Et minigame'} starter nu!`, {
        key: 'breaker',
        duration: Math.min(15_000, Math.max(5000, inst.playEnd - d.t)),
        action: { label: 'Spil med', onClick: uncover },
      });
    }
    document.documentElement.classList.add('scroll-locked');
    const onKey = (e) => e.key === 'Escape' && hide();
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('scroll-locked');
      window.removeEventListener('keydown', onKey);
    };
  }, [visible, inst?.gid]);

  if (!inst) return null;
  const game = gameById(inst.g);
  if (!game) return null;

  function hide() {
    eventUi.set((s) => ({ breakerHidden: { ...s.breakerHidden, [inst.gid]: true } }));
  }
  const show = () => eventUi.set((s) => ({ breakerHidden: { ...s.breakerHidden, [inst.gid]: false } }));

  const t = d.t;
  let progress;
  let left;
  if (inst.phase === 'intro') {
    left = inst.playStart - t;
    progress = 1 - left / GAMEPLAY.introMs;
  } else if (inst.phase === 'play') {
    left = inst.playEnd - t;
    progress = left / inst.dur;
  } else {
    left = inst.until - t;
    progress = left / GAMEPLAY.resultMs;
  }

  if (!visible) {
    return html`<button type="button" class="min-pill" style=${{ '--c': game.color }} onClick=${show}>
      <span class="min-pill__emoji">${game.emoji}</span>
      <span>${game.name} · ${inst.phase === 'result' ? 'resultat' : fmtDuration(left)}</span>
      <${Icon} name="maximize-2" size=${16} />
    </button>`;
  }

  if (inst.phase === 'play' && !playStartedAt.current.has(inst.gid)) playStartedAt.current.set(inst.gid, performance.now());
  const by = inst.by ? d.players.get(inst.by) : null;
  const props = {
    inst,
    game,
    d,
    room,
    me: d.me,
    phase: inst.phase,
    responses: inst.responses,
    mine: inst.responses.get(d.me) || null,
    canRespond: inst.phase === 'play' && inst.responders.includes(d.me),
    respond: (v) => {
      if (inst.phase !== 'play') return;
      respond(room, inst.gid, v);
      haptic(10);
    },
    result: inst.result,
    shownAt: playStartedAt.current.get(inst.gid) || performance.now(),
  };

  return html`<div class="overlay" style=${{ '--c': game.color }} role="dialog" aria-modal="true" aria-label=${game.name}>
    <div class="overlay__inner">
      <div class="overlay__head">
        <div class="overlay__titles">
          <div class="overlay__kicker">${inst.auto ? 'Breaker' : by ? `Startet af ${by.isMe ? 'dig' : by.name}` : 'Minigame'}</div>
          <div class="overlay__title">${game.emoji} ${game.name}</div>
        </div>
        <${Ring} progress=${progress} size=${48} stroke=${4} color=${game.color}>
          <span>${Math.max(0, Math.ceil(left / 1000))}</span>
        <//>
        <${IconButton} icon="chevron-down" label="Minimér" onClick=${hide} />
      </div>
      <div class="overlay__body">
        ${inst.phase === 'intro'
          ? html`<${Intro} game=${game} inst=${inst} d=${d} left=${left} />`
          : inst.phase === 'play'
            ? html`<${game.Play} ...${props} />`
            : inst.result
              ? html`<${game.Result} ...${props} />`
              : html`<div class="intro"><${Spinner} size=${34} /><div class="intro__tag">Tæller op…</div></div>`}
      </div>
      ${inst.phase === 'result'
        ? html`<div class="overlay__footer stack stack--s">
            <${MyPenalty} room=${room} d=${d} inst=${inst} />
            <${Button} variant="secondary" block onClick=${hide}>Luk</${Button}>
          </div>`
        : null}
    </div>
  </div>`;
}

function Intro({ game, inst, d, left }) {
  const count = Math.max(1, Math.ceil(left / 1000));
  const spectator = !inst.responders.includes(d.me) && game.respond;
  return html`<div class="intro">
    <div class="intro__emoji">${game.emoji}</div>
    <div class="intro__name">${game.name}</div>
    <div class="intro__tag">${game.tagline}</div>
    ${spectator ? html`<div class="pill">Du ser med i denne runde</div>` : null}
    <div class="intro__count" aria-live="polite"><span key=${count}>${count}</span></div>
  </div>`;
}

function MyPenalty({ room, d, inst }) {
  const ob = d.obligations.find((o) => o.gid === inst.gid && o.target === d.me);
  if (!ob) return null;
  if (ob.acked) {
    return html`<div class="my-penalty" style=${{ background: 'rgba(61,220,151,0.12)', borderColor: 'rgba(61,220,151,0.4)' }}>
      <div class="my-penalty__text">${ob.how === 'shield' ? 'Skjold brugt 🛡️' : 'Klaret ✓'}</div>
    </div>`;
  }
  const shields = d.mePlayer?.shields || 0;
  const ack = (how) => {
    acknowledge(room, ob.key, how);
    if (how === 'shield') toast('Skjold brugt — du slap! 🛡️', { tone: 'good' });
    else {
      sfx.clink();
      toast('Skål! 🍻', { tone: 'good' });
    }
  };
  return html`<div class="my-penalty">
    <div class="my-penalty__text">Du skal drikke ${unitText(ob.n, ob.unit)} 🍻</div>
    <div class="btn-row">
      ${shields ? html`<${Button} variant="secondary" onClick=${() => ack('shield')}>🛡️ Brug skjold<//>` : null}
      <${Button} onClick=${() => ack('ok')}>Skål — drukket ✓<//>
    </div>
  </div>`;
}
