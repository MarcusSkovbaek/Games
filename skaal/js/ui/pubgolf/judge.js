// The judge's panel on the course: everyone's strokes on the hole, penalties and bonuses for
// players and teams, moving the round on, and challenges.
import { html, useState, Sheet, Button, Icon, Avatar, Segmented, Stepper, cx } from '../kit.js';
import { PG, PENALTIES, BONUSES, scoreName } from '../../game/pubgolf.js';
import { setStrokes, adjustScore, moveToHole } from '../../app/actions.js';
import { sfx, haptic } from '../feedback.js';
import { toast, confirmDialog } from '../ui-store.js';
import { ToPar, TeamChip, holeTitle } from './common.js';
import { ChallengeSheet } from './challenge.js';
import { TeamPickerSheet } from './teams.js';

export function JudgePanel({ room, d, hole }) {
  const pg = d.pg;
  const [scoreFor, setScoreFor] = useState(null);
  const [adjustFor, setAdjustFor] = useState(null);
  const [teamFor, setTeamFor] = useState(null);
  const [challenge, setChallenge] = useState(false);
  const isCurrent = hole.id === pg.current.id;
  const next = pg.holes[hole.n] || null;
  const active = d.ranking.filter((p) => !p.left);
  const scored = active.filter((p) => pg.players.get(p.pid)?.holes[hole.id]).length;
  const groups = [
    ...pg.teams.map((team) => ({ team, pids: team.members.filter((pid) => !d.players.get(pid)?.left) })),
    { team: null, pids: active.filter((p) => !pg.players.get(p.pid)?.team).map((p) => p.pid) },
  ].filter((g) => g.pids.length || g.team);

  const goTo = async (target) => {
    const missing = active.length - scored;
    const ok = await confirmDialog({
      title: `Videre til hul ${target.n}?`,
      text: `Alle telefoner skifter til ${holeTitle(target)} (par ${target.par}).${missing && isCurrent ? ` ${missing} mangler stadig slag på hul ${hole.n} — de kan noteres bagefter.` : ''}`,
      confirm: `Hul ${target.n}`,
    });
    if (!ok) return;
    moveToHole(room, target.id);
    sfx.whoosh();
  };

  return html`<section class="pg-judge" aria-label="Dommerpanel">
    <div class="pg-judge__head">
      <span class="pg-judge__badge"><${Icon} name="scale" size=${16} />Dommer</span>
      <${Button} variant="secondary" size="sm" icon="dice-5" onClick=${() => setChallenge(true)}>Udfordring<//>
    </div>
    ${isCurrent
      ? next
        ? html`<${Button} block iconRight="chevron-right" onClick=${() => goTo(next)}>Videre til hul ${next.n}<//>`
        : html`<span class="pg-judge__last">Sidste hul — afslut runden under “Mig”, når I er færdige.</span>`
      : html`<${Button} block variant="secondary" onClick=${() => goTo(hole)}>Gør hul ${hole.n} til det aktuelle<//>`}
    <span class="pg-judge__progress">${scored} af ${active.length} har slag på hul ${hole.n} · tryk på tallet for at notere</span>

    ${groups.map(
      (g) => html`<div class="pg-jgroup" style=${{ '--tc': g.team?.color || 'var(--line-2)' }} key=${g.team?.id || 'none'}>
        <div class="pg-jgroup__head">
          ${g.team ? html`<${TeamChip} team=${g.team} />` : html`<span class="pg-jgroup__none">Uden hold</span>`}
          ${g.team
            ? html`<${ToPar} n=${g.team.score} played=${g.team.played > 0 || g.team.pen || g.team.bon} />
                <button type="button" class="pg-jgroup__adj" onClick=${() => setAdjustFor({ team: g.team.id })} aria-label=${`Straf eller bonus til ${g.team.name}`}>±</button>`
            : null}
        </div>
        ${g.pids.map((pid) => {
          const p = d.players.get(pid);
          const x = pg.players.get(pid);
          const sc = x?.holes[hole.id];
          return html`<div class="pg-jrow" key=${pid}>
            <button type="button" class="pg-jrow__who" onClick=${() => setTeamFor(pid)} aria-label=${`Skift hold for ${p.name}`}>
              <${Avatar} player=${p} size=${36} online=${p.online} />
              <span class="pg-jrow__name">
                <span>${pid === d.me ? `${p.name} (dig)` : p.name}</span>
                <small>${x?.played ? html`<${ToPar} n=${x.toPar} /> · ${x.played} huller` : 'Ingen slag endnu'}${x?.pen ? ` · +${x.pen} straf` : ''}${x?.bon ? ` · −${x.bon} bonus` : ''}</small>
              </span>
            </button>
            <button type="button" class="pg-jrow__adj" onClick=${() => setAdjustFor({ p: pid })} aria-label=${`Straf eller bonus til ${p.name}`}>±</button>
            <button
              type="button"
              class=${cx('pg-jrow__s', sc && (sc.s < hole.par ? 'is-under' : sc.s > hole.par ? 'is-over' : 'is-par'))}
              onClick=${() => setScoreFor(pid)}
              aria-label=${sc ? `${p.name}: ${sc.s} slag. Ret` : `Notér slag for ${p.name}`}
            >
              ${sc ? sc.s : html`<${Icon} name="plus" size=${18} />`}
            </button>
          </div>`;
        })}
      </div>`,
    )}

    <${ScoreSheet} room=${room} d=${d} hole=${hole} pid=${scoreFor} onClose=${() => setScoreFor(null)} />
    <${AdjustSheet} room=${room} d=${d} hole=${hole} target=${adjustFor} onClose=${() => setAdjustFor(null)} />
    <${TeamPickerSheet} room=${room} d=${d} pid=${teamFor} open=${!!teamFor} onClose=${() => setTeamFor(null)} />
    <${ChallengeSheet} room=${room} d=${d} open=${challenge} onClose=${() => setChallenge(false)} />
  </section>`;
}

function ScoreSheet({ room, d, hole, pid, onClose }) {
  const pg = d.pg;
  const p = pid ? d.players.get(pid) : null;
  const sc = pid ? pg.players.get(pid)?.holes[hole.id] : null;
  const max = Math.max(10, hole.par + PG.giveUpOver);
  const set = (s) => {
    setStrokes(room, pid, hole.id, s);
    haptic(12);
    sfx.clink();
    toast(s ? `${p.name}: ${s} slag på hul ${hole.n} · ${scoreName(s, hole.par)}` : `${p.name}: slag på hul ${hole.n} slettet`, { tone: 'good', key: 'pg-judge' });
    onClose();
  };
  return html`<${Sheet} open=${!!pid} onClose=${onClose} title=${p ? `${p.name} · hul ${hole.n}` : ''} subtitle=${`Par ${hole.par} · ${hole.drink || 'valgfri drik'}`}>
    ${p
      ? html`<div class="stack">
          <div class="pg-numpad" role="group" aria-label="Antal slag">
            ${Array.from({ length: max }, (_, i) => i + 1).map(
              (n) => html`<button
                type="button"
                class=${cx('pg-stroke pg-stroke--big', n < hole.par ? 'is-under' : n === hole.par ? 'is-par' : 'is-over', sc?.s === n && 'is-on')}
                aria-pressed=${sc?.s === n}
                onClick=${() => set(n)}
              >
                ${n}
              </button>`,
            )}
          </div>
          <div class="btn-row">
            <${Button} variant="secondary" onClick=${() => set(hole.par + PG.giveUpOver)}>Opgav (${hole.par + PG.giveUpOver})<//>
            ${sc ? html`<${Button} variant="ghost" icon="trash" onClick=${() => set(0)}>Slet<//>` : null}
          </div>
        </div>`
      : null}
  <//>`;
}

function AdjustSheet({ room, d, hole, target, onClose }) {
  const pg = d.pg;
  const [kind, setKind] = useState('pen');
  const [n, setN] = useState(1);
  const [why, setWhy] = useState('');
  const name = target?.team ? pg.teamById.get(target.team)?.name : target ? d.players.get(target.p)?.name : '';
  const presets = kind === 'pen' ? PENALTIES : BONUSES;
  const give = (amount, reason) => {
    adjustScore(room, kind, { ...target, n: amount, why: reason, h: hole.id });
    if (kind === 'pen') sfx.fail();
    else sfx.win();
    haptic(15);
    toast(kind === 'pen' ? `⚠️ ${name}: +${amount} strafslag` : `⭐ ${name}: −${amount} slag i bonus`, { tone: kind === 'pen' ? 'default' : 'good' });
    setWhy('');
    setN(1);
    onClose();
  };
  return html`<${Sheet} open=${!!target} onClose=${onClose} title=${kind === 'pen' ? `Straf til ${name}` : `Bonus til ${name}`} subtitle=${target?.team ? 'Gælder holdets samlede score.' : 'Lægges til (straf) eller trækkes fra (bonus) spillerens slag.'}>
    <div class="stack">
      <${Segmented}
        options=${[
          { value: 'pen', label: 'Straf (+ slag)' },
          { value: 'bon', label: 'Bonus (− slag)' },
        ]}
        value=${kind}
        onChange=${setKind}
      />
      <div class="pg-presets">
        ${presets.map(
          (pr) => html`<button type="button" class=${cx('pg-preset', kind === 'pen' ? 'is-pen' : 'is-bon')} onClick=${() => give(pr.n, pr.label)}>
            <span class="pg-preset__emoji" aria-hidden="true">${pr.emoji}</span>
            <span class="pg-preset__label">${pr.label}</span>
            <span class="pg-preset__n">${kind === 'pen' ? '+' : '−'}${pr.n}</span>
          </button>`,
        )}
      </div>
      <div class="field">
        <span class="field__label">Eller selv</span>
        <div class="pg-custom">
          <input class="input" maxlength="60" placeholder=${kind === 'pen' ? 'Hvorfor? Fx Snød med sugerør' : 'Hvorfor? Fx Bedste dansemove'} value=${why} onInput=${(e) => setWhy(e.currentTarget.value)} />
          <${Stepper} value=${n} steps=${[1, 2, 3, 4, 5]} format=${(v) => `${kind === 'pen' ? '+' : '−'}${v}`} onChange=${setN} />
        </div>
        <${Button} block variant=${kind === 'pen' ? 'secondary' : 'primary'} disabled=${!why.trim()} onClick=${() => give(n, why.trim())}>
          ${kind === 'pen' ? `Giv ${n} strafslag` : `Giv ${n} slag i bonus`}
        <//>
      </div>
    </div>
  <//>`;
}
