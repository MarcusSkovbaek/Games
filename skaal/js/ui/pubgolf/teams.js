// Picking a team — for yourself, or (judge/host) for someone else.
import { html, Sheet, Avatar, Icon, cx } from '../kit.js';
import { setTeam } from '../../app/actions.js';
import { toast } from '../ui-store.js';
import { haptic } from '../feedback.js';

export function TeamPickerSheet({ room, d, open, onClose, pid }) {
  const pg = d.pg;
  const who = pid || d.me;
  const current = pg.players.get(who)?.team || null;
  const name = who === d.me ? null : d.players.get(who)?.name;
  const pick = (teamId) => {
    if (teamId !== current) {
      setTeam(room, who, teamId);
      haptic(12);
      const team = pg.teamById.get(teamId);
      toast(team ? `${name || 'Du'} er nu på ${team.name}` : `${name || 'Du'} er ikke på et hold`, { tone: 'good' });
    }
    onClose();
  };
  return html`<${Sheet} open=${open} onClose=${onClose} title=${name ? `Hold for ${name}` : 'Vælg dit hold'} subtitle="Holdets score er summen af medlemmernes slag.">
    <div class="team-pick">
      ${pg.cfg.teams.map((cfgTeam) => {
        const team = pg.teamById.get(cfgTeam.id);
        const on = current === team.id;
        return html`<button type="button" class=${cx('team-pick__item', on && 'is-on')} style=${{ '--tc': team.color }} aria-pressed=${on} onClick=${() => pick(team.id)}>
          <span class="team-pick__swatch" aria-hidden="true"></span>
          <span class="team-pick__text">
            <span class="team-pick__name">${team.name}</span>
            <span class="team-pick__count">${team.members.length} ${team.members.length === 1 ? 'spiller' : 'spillere'}</span>
          </span>
          <span class="avatar-stack">${team.members.slice(0, 4).map((m) => html`<${Avatar} player=${d.players.get(m)} size=${26} />`)}</span>
          ${on ? html`<${Icon} name="check" size=${18} stroke=${3} />` : null}
        </button>`;
      })}
      <button type="button" class=${cx('team-pick__item', 'team-pick__item--none', !current && 'is-on')} aria-pressed=${!current} onClick=${() => pick(null)}>
        <span class="team-pick__text"><span class="team-pick__name">Intet hold</span><span class="team-pick__count">Spil kun for dig selv</span></span>
      </button>
    </div>
  <//>`;
}
