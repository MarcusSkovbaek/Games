// The "Bane" tab: the hole (bar) the group is at, your strokes, your team and — for the judge —
// the scoring panel.
import { html, useState, useEffect, useRef, useStore, Avatar, Button, Icon, cx } from '../kit.js';
import { PG, scoreName } from '../../game/pubgolf.js';
import { setStrokes } from '../../app/actions.js';
import { sfx, haptic, confetti } from '../feedback.js';
import { toast, confirmDialog } from '../ui-store.js';
import { eventUi } from '../screens/event.js';
import { FeedRow } from '../screens/feed.js';
import { ToPar, TeamChip, PlayerAvatar, holeTitle, mapsLink, MEDALS } from './common.js';
import { JudgePanel } from './judge.js';
import { TeamPickerSheet } from './teams.js';

export function CourseTab({ room, d }) {
  const pg = d.pg;
  const viewId = useStore(eventUi, (s) => s.pgHole);
  const hole = pg.holeById.get(viewId) || pg.current;
  const setView = (id) => eventUi.set({ pgHole: id === pg.current.id ? null : id });
  return html`<div class="stack stack--l">
    <h1 class="sr-only">Bane — ${d.meta.name}</h1>
    ${d.ended ? html`<${FinalResult} d=${d} />` : null}
    <${HoleHero} d=${d} hole=${hole} onView=${setView} />
    ${d.mePlayer && !d.ended ? html`<${MyStrokes} room=${room} d=${d} hole=${hole} />` : null}
    <${MyTeam} room=${room} d=${d} hole=${hole} />
    ${pg.isJudge && !d.ended ? html`<${JudgePanel} room=${room} d=${d} hole=${hole} />` : null}
    <${Recent} room=${room} d=${d} />
  </div>`;
}

function HoleHero({ d, hole, onView }) {
  const pg = d.pg;
  const current = pg.current;
  const state = hole.id === current.id ? 'Nu' : hole.n < current.n ? 'Spillet' : 'Kommer';
  const link = mapsLink(hole);
  const mine = pg.me?.holes || {};
  // On small phones (and long courses) the holes scroll sideways: fade the cut-off edges and keep
  // the hole being viewed in sight.
  const strip = useRef(null);
  const [edges, setEdges] = useState('');
  const measure = () => {
    const el = strip.current;
    if (!el) return;
    const more = el.scrollWidth - el.clientWidth;
    setEdges(more > 1 ? cx(el.scrollLeft > 1 && 'is-fade-start', el.scrollLeft < more - 1 && 'is-fade-end') : '');
  };
  useEffect(() => {
    const el = strip.current;
    const dot = el?.querySelector('.is-view');
    if (dot && el.scrollWidth > el.clientWidth) el.scrollTo({ left: dot.offsetLeft - (el.clientWidth - dot.offsetWidth) / 2, behavior: 'smooth' });
    measure();
  }, [hole.id, pg.holes.length]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return html`<section class="pg-hero" aria-label=${`Hul ${hole.n}`}>
    <div class="pg-hero__row">
      <div class="pg-hole" aria-hidden="true">
        <span class="pg-hole__label">Hul</span>
        <span class="pg-hole__n">${hole.n}</span>
        <span class="pg-hole__of">af ${pg.holes.length}</span>
      </div>
      <div class="pg-hero__main">
        <div class="pg-hero__kicker"><span class=${cx('pg-state', state === 'Nu' && 'is-now')}>${state}</span> Par ${hole.par}</div>
        <div class="pg-hero__bar">${holeTitle(hole)}</div>
        <div class="pg-hero__drink">🍺 ${hole.drink || 'Valgfri drik'}</div>
        ${link
          ? html`<a class="pg-hero__addr" href=${link} target="_blank" rel="noopener noreferrer"><${Icon} name="map-pin" size=${15} />${hole.addr || 'Vis på kort'}</a>`
          : null}
      </div>
    </div>
    <div class=${cx('pg-holes', edges)} ref=${strip} onScroll=${measure} role="group" aria-label="Huller">
      ${pg.holes.map(
        (h) => html`<button
          type="button"
          class=${cx('pg-holes__dot', h.id === hole.id && 'is-view', h.id === current.id && 'is-current', mine[h.id] && 'is-done')}
          aria-label=${`Hul ${h.n}${h.bar ? `: ${h.bar}` : ''}${h.id === current.id ? ' (nu)' : ''}`}
          aria-pressed=${h.id === hole.id}
          onClick=${() => onView(h.id)}
        >
          ${h.n}
        </button>`,
      )}
    </div>
  </section>`;
}

// Your own strokes on this hole (when the judge lets players score themselves).
function MyStrokes({ room, d, hole }) {
  const pg = d.pg;
  const mine = pg.me?.holes[hole.id] || null;
  const locked = !!mine?.official && !pg.isOfficial;
  const canScore = (pg.cfg.selfScore && !locked) || pg.isOfficial;
  const max = Math.max(8, hole.par + PG.giveUpOver);
  const set = (s) => {
    if (s === mine?.s) return;
    setStrokes(room, room.pid, hole.id, s);
    haptic(12);
    if (s === 1 && hole.par > 1) {
      sfx.win();
      confetti({ count: 120 });
      toast('🎯 Hole in one!', { tone: 'good' });
    } else {
      sfx.clink();
      toast(`⛳ Hul ${hole.n}: ${s} slag · ${scoreName(s, hole.par)}`, { tone: 'good', key: 'pg-score' });
    }
  };
  const giveUp = async () => {
    const ok = await confirmDialog({
      title: 'Kunne du ikke drikke den?',
      text: `Du får ${hole.par + PG.giveUpOver} slag på hullet (par + ${PG.giveUpOver}).`,
      confirm: 'Opgiv hullet',
    });
    if (ok) set(hole.par + PG.giveUpOver);
  };
  return html`<section class="card pg-mine">
    <div class="pg-mine__head">
      <span class="pg-mine__title">Dine slag på hul ${hole.n}</span>
      ${mine ? html`<span class=${cx('pg-name', mine.s < hole.par && 'is-good')}>${scoreName(mine.s, hole.par)}</span>` : html`<span class="faint">Par ${hole.par}</span>`}
    </div>
    ${canScore
      ? html`<div class="pg-strokes" role="group" aria-label="Antal slurke">
            ${Array.from({ length: max }, (_, i) => i + 1).map(
              (n) => html`<button
                type="button"
                class=${cx('pg-stroke', n < hole.par ? 'is-under' : n === hole.par ? 'is-par' : 'is-over', mine?.s === n && 'is-on')}
                aria-pressed=${mine?.s === n}
                aria-label=${`${n} slag`}
                onClick=${() => set(n)}
              >
                ${n}
              </button>`,
            )}
          </div>
          <div class="pg-mine__foot">
            <span>${mine?.official && !pg.isOfficial ? '🔒 Sat af dommeren' : mine ? 'Tryk på et andet tal for at rette' : 'Hvor mange slurke brugte du?'}</span>
            ${!mine || mine.s !== hole.par + PG.giveUpOver ? html`<button type="button" class="text-link" onClick=${giveUp}>Opgiv hullet</button>` : null}
          </div>`
      : html`<p class="pg-mine__locked">
          ${mine
            ? html`Du har <strong>${mine.s} slag</strong> på hullet. ${locked ? '🔒 Sat af dommeren.' : ''}`
            : 'Dommeren noterer slagene — sig til, hvor mange slurke du brugte.'}
        </p>`}
  </section>`;
}

function MyTeam({ room, d, hole }) {
  const pg = d.pg;
  const [picking, setPicking] = useState(false);
  if (!pg.cfg.teams.length || !d.mePlayer) return null;
  const team = pg.myTeam && pg.teamById.get(pg.myTeam.id);
  const canPick = !pg.cfg.lockTeams || pg.isOfficial;
  if (!team) {
    return html`<section class="card pg-team pg-team--empty">
      <span class="pg-team__icon" aria-hidden="true">👥</span>
      <span class="spacer"><strong>Du er ikke på et hold endnu</strong><br /><span class="faint">${canPick ? 'Vælg dit hold for at tælle med i holdkonkurrencen.' : 'Værten fordeler holdene.'}</span></span>
      ${canPick ? html`<${Button} size="sm" onClick=${() => setPicking(true)}>Vælg hold<//>` : null}
      <${TeamPickerSheet} room=${room} d=${d} open=${picking} onClose=${() => setPicking(false)} />
    </section>`;
  }
  return html`<section class="card pg-team" style=${{ '--tc': team.color }}>
    <div class="pg-team__head">
      <${TeamChip} team=${team} />
      <span class="faint">${team.rank}.-plads</span>
      <${ToPar} n=${team.score} class="pg-team__score" played=${team.played > 0 || team.pen || team.bon} />
    </div>
    <div class="pg-team__members">
      ${team.members.map((pid) => {
        const sc = pg.players.get(pid)?.holes[hole.id];
        return html`<div class="pg-member" key=${pid}>
          <${Avatar} player=${d.players.get(pid)} size=${38} online=${d.players.get(pid)?.online} />
          <span class="pg-member__name">${pid === d.me ? 'Dig' : d.players.get(pid)?.name}</span>
          <span class=${cx('pg-member__s', sc && (sc.s < hole.par ? 'is-under' : sc.s > hole.par ? 'is-over' : 'is-par'))}>${sc ? sc.s : '–'}</span>
        </div>`;
      })}
    </div>
  </section>`;
}

function Recent({ room, d }) {
  const items = d.feed.filter((f) => f.kind !== 'join').slice(0, 5);
  if (!items.length) return null;
  return html`<section class="section">
    <div class="section__head"><h2 class="section__title">Seneste</h2></div>
    <div class="card" style=${{ padding: '2px 14px' }}>
      <div class="feed">${items.map((item) => html`<${FeedRow} key=${item.key} room=${room} d=${d} item=${item} compact />`)}</div>
    </div>
  </section>`;
}

// Shown at the top of the course once the host has ended the event.
function FinalResult({ d }) {
  const pg = d.pg;
  const teams = pg.teams.filter((tm) => tm.played > 0 || tm.pen || tm.bon).slice(0, 3);
  const best = pg.individuals.find((x) => x.played > 0);
  return html`<section class="pg-final" aria-label="Slutresultat">
    <div class="pg-final__kicker">Slutresultat</div>
    ${teams.length
      ? html`<div class="pg-final__title">${teams[0].name} vinder! 🏆</div>
          <div class="pg-final__teams">
            ${teams.map(
              (tm, i) => html`<div class="pg-final__team" style=${{ '--tc': tm.color }}>
                <span class="pg-final__medal">${MEDALS[i]}</span>
                <span class="pg-final__name">${tm.name}</span>
                <${ToPar} n=${tm.score} />
              </div>`,
            )}
          </div>`
      : null}
    ${best
      ? html`<div class="pg-final__best">
          <${PlayerAvatar} d=${d} pid=${best.pid} size=${44} />
          <span><small>Bedste spiller</small><strong>${d.players.get(best.pid)?.name}</strong></span>
          <${ToPar} n=${best.toPar} />
        </div>`
      : null}
  </section>`;
}
