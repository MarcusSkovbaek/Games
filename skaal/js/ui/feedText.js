// Human readable (Danish) text for feed items and inbox obligations.
import { html } from './kit.js';
import { drinkById } from '../game/drinks.js';
import { wheelById, outcomeById } from '../game/wheels.js';
import { faceById } from '../game/tour.js';
import { gameById } from '../minigames/index.js';
import { fmtPoints, unitText, sips } from './format.js';
import { RULES } from '../game/content/prompts.js';

export function nameOf(d, pid, { me = true, capital = true } = {}) {
  if (me && pid === d.me) return capital ? 'Du' : 'dig';
  return d.players.get(pid)?.name || 'Nogen';
}

const B = (text) => html`<strong>${text}</strong>`;

export function effectText(d, effect) {
  const { type, e } = effect;
  switch (type) {
    case 'give': {
      const parts = Object.entries(e.to || {}).map(([pid, n]) => `${nameOf(d, pid, { capital: false })} ${n}`);
      return html`delte ${sips(Object.values(e.to || {}).reduce((a, b) => a + Number(b || 0), 0))} ud: ${parts.join(', ')}`;
    }
    case 'all':
      return html`alle andre drikker ${sips(e.n)}`;
    case 'pen':
      return html`${B(nameOf(d, e.to))} skal drikke ${unitText(e.n, e.u)}`;
    case 'self':
      return html`drikker selv ${sips(e.n)}`;
    case 'bon':
      return html`fik +${fmtPoints(e.n)} bonuspoint ⭐`;
    case 'shd':
      return html`fik et skjold 🛡️`;
    case 'owe':
      return html`${B(nameOf(d, e.from))} skylder en drink 🎁`;
    case 'rule':
      return html`ny regel: “${e.text}”`;
    default:
      return null;
  }
}

export function gameSummary(d, inst) {
  if (!inst.result) return html`er i gang`;
  const pens = inst.result.penalties.filter((p) => !p.done);
  if (inst.g === 'happyHour') return html`dobbelt point på ${B(drinkById(inst.p.k)?.plural || 'drinks')} i ${inst.p.mins} min`;
  if (inst.g === 'ruleCard') return html`“${RULES[inst.p.r] || 'ny regel'}” (${inst.p.mins} min)`;
  if (inst.g === 'cheers') return html`alle skålede`;
  if (!pens.length) return html`ingen skulle drikke 😇`;
  const names = pens.map((p) => nameOf(d, p.pid));
  const same = pens.every((p) => p.n === pens[0].n && p.unit === pens[0].unit);
  if (same) return html`${B(names.join(', '))} ${pens.length === 1 && pens[0].pid === d.me ? 'skulle drikke' : 'drikker'} ${unitText(pens[0].n, pens[0].unit)}`;
  return html`${pens.map((p, i) => html`${i ? ', ' : ''}${B(nameOf(d, p.pid))} ${unitText(p.n, p.unit)}`)}`;
}

export function FeedText({ d, item, emoji = false }) {
  const who = B(nameOf(d, item.pid));
  switch (item.kind) {
    case 'join':
      return html`${who} ${item.pid === d.me ? 'sluttede dig' : 'sluttede sig'} til festen`;
    case 'drink': {
      const drink = drinkById(item.drink);
      return html`${who} drak ${drink?.phrase || 'en drink'}${item.mult > 1 ? html` <span class="faint">(×${item.mult} Happy Hour)</span>` : null}`;
    }
    case 'lead':
      return html`${emoji ? '👑 ' : ''}${who} overtog føringen${item.prev ? html` fra ${B(nameOf(d, item.prev, { capital: false }))}` : null}`;
    case 'milestone':
      return html`${emoji ? '🎉 ' : ''}${who} har rundet ${item.n} drinks`;
    case 'spin': {
      const wheel = wheelById(item.wheel);
      const outcome = outcomeById(item.wheel, item.outcome);
      return html`${who} spinnede ${wheel?.name || 'hjulet'} → ${B(outcome ? `${outcome.emoji} ${outcome.label}` : '?')}`;
    }
    case 'effect':
      return html`${who}: ${effectText(d, item.effect)}`;
    case 'ack':
      return ackText(d, item);
    case 'game': {
      const game = gameById(item.inst.g);
      return html`${emoji ? `${game?.emoji} ` : ''}${B(game?.name || 'Minigame')}${item.inst.auto ? ' (breaker)' : ''}: ${gameSummary(d, item.inst)}`;
    }
    case 'pause':
      return item.on ? html`${who} holder pause ⏸️` : html`${who} er tilbage fra pause ▶️`;
    case 'pghole': {
      const h = d.pg?.holeById.get(item.h);
      return html`${emoji ? '⛳ ' : ''}Videre til ${B(`hul ${h?.n ?? ''}`)}${h?.bar ? html` — ${h.bar}` : null} <span class="faint">(par ${h?.par})</span>`;
    }
    case 'pgace':
      return html`${emoji ? '🎯 ' : ''}${who} lavede ${B('hole in one')} på hul ${d.pg?.holeById.get(item.h)?.n ?? ''}!`;
    case 'pgpen':
    case 'pgbon':
      return adjustmentText(d, item.adj, emoji);
    case 'pgpodium': {
      const comp = d.pg?.comps.find((c) => c.id === item.result.comp);
      const places = item.result.places.map((pl, i) => (pl ? `${i + 1}. ${pl.team ? d.pg.teamById.get(pl.team)?.name : d.players.get(pl.pid)?.name}` : null)).filter(Boolean);
      return html`${emoji ? '🏆 ' : ''}${B(comp?.name || 'Konkurrence')}: ${places.length ? places.join(' · ') : 'podiet er nulstillet'}`;
    }
    case 'pgphoto':
      return html`${emoji ? '📸 ' : ''}${who} delte et billede`;
    case 'pgchal':
      return html`${emoji ? '🎲 ' : ''}Udfordring: ${item.text}`;
    case 'tour': {
      const face = faceById(item.face);
      return html`${emoji ? '🚴 ' : ''}${who} har kørt ${item.n} etaper → ${B(face ? `${face.name}: ${face.title}` : 'Tour de France')}`;
    }
    default:
      return null;
  }
}

function adjustmentText(d, adj, emoji) {
  const target = adj.team ? B(d.pg?.teamById.get(adj.team)?.name || 'Holdet') : B(nameOf(d, adj.p));
  const why = adj.why ? html` <span class="faint">(${adj.why})</span>` : null;
  return adj.kind === 'pen'
    ? html`${emoji ? '⚠️ ' : ''}${target} fik ${B(`+${adj.n} strafslag`)}${why}`
    : html`${emoji ? '⭐ ' : ''}${target} fik ${B(`−${adj.n} slag`)} i bonus${why}`;
}

function ackText(d, item) {
  const { ob, how } = item;
  const who = B(nameOf(d, item.pid));
  const from = ob.from ? B(nameOf(d, ob.from, { capital: false })) : null;
  if (ob.kind === 'owe') return html`${who} gav ${from} den skyldige drink 🎁`;
  if (how === 'shield') return html`${who} blokerede ${unitText(ob.n, ob.unit)}${from ? html` fra ${from}` : ''} med et skjold 🛡️`;
  const what = ob.unit === 'shot' ? (ob.n === 1 ? 'tog et shot' : `tog ${ob.n} shots`) : `drak ${unitText(ob.n, ob.unit)}`;
  if (ob.gid) return html`${who} ${what} ✓ <span class="faint">(${gameById(ob.game)?.name || 'minigame'})</span>`;
  return html`${who} ${what}${from ? html` fra ${from}` : ''} ✓`;
}

// Title line for an obligation addressed to the current player.
export function obligationTitle(d, ob) {
  const from = ob.from ? nameOf(d, ob.from) : null;
  if (ob.kind === 'owe') return html`Du skylder ${B(nameOf(d, ob.from))} en drink`;
  if (ob.self) return html`Du skal drikke ${B(unitText(ob.n, ob.unit))}`;
  if (ob.gid) return html`${B(gameById(ob.game)?.name || 'Minigame')}: drik ${B(unitText(ob.n, ob.unit))}`;
  if (ob.everyone) return html`${B(from)}: alle drikker ${B(unitText(ob.n, ob.unit))}`;
  return html`${B(from)} giver dig ${B(unitText(ob.n, ob.unit))}`;
}

export function obligationEmoji(ob) {
  if (ob.kind === 'owe') return '🎁';
  if (ob.unit === 'shot') return '🥃';
  if (ob.gid) return gameById(ob.game)?.emoji || '🎲';
  if (ob.why?.tour) return '🚴';
  return '🍻';
}

// Where an obligation came from (wheel or Tour face); game penalties name the game in the title.
export function whyText(ob) {
  if (ob.why?.wheel) return wheelById(ob.why.wheel)?.name || null;
  if (ob.why?.tour) return `${faceById(ob.why.face)?.name || 'Tour de France'} · Tour de France`;
  return null;
}
