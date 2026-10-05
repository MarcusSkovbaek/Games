// Personal lucky wheels. A wheel is offered when something happens to a player (taking the lead,
// falling behind, hitting a milestone). Add a wheel or an outcome by editing this file.
//
// Effect types (applied by the UI through `effectToEntries`):
//   give   { n }                 — spinner hands out n sips to players of their choice
//   all    { n }                 — fællesskål: every other player drinks n sips (pops up on every phone)
//   target { n, unit, who }      — one player drinks (who: 'choose' | 'leader' | 'random')
//   self   { n }                 — the spinner drinks n sips
//   bonus  { n }                 — n bonus points (only if the host allows bonus points)
//   shield {}                    — a shield that cancels one future penalty
//   owe    { who }               — someone owes the spinner a drink ('choose' | 'leader' | 'random')
//   rule   {}                    — the spinner decides a rule for 15 minutes
//   fun    {}                    — no game effect, just for laughs

export const WHEELS = {
  king: {
    id: 'king',
    name: 'Kongehjulet',
    emoji: '👑',
    why: 'Du har taget føringen!',
    colors: ['#F6B73C', '#3A2A12'],
    outcomes: [
      { id: 'give2', emoji: '🍻', label: 'Giv 2', text: 'Del 2 slurke ud til hvem du vil', effect: { type: 'give', n: 2 }, weight: 3 },
      { id: 'all1', emoji: '🥂', label: 'Alle 1', text: 'Fællesskål! Alle andre drikker 1 slurk', effect: { type: 'all', n: 1 }, weight: 2 },
      { id: 'bonus1', emoji: '⭐', label: '+1 point', text: 'Du får 1 bonuspoint', effect: { type: 'bonus', n: 1 }, weight: 1.5 },
      { id: 'give4', emoji: '🍻', label: 'Giv 4', text: 'Del 4 slurke ud til hvem du vil', effect: { type: 'give', n: 4 }, weight: 2 },
      { id: 'shot', emoji: '🥃', label: 'Shot!', text: 'Vælg én, der skal tage et shot', effect: { type: 'target', n: 1, unit: 'shot', who: 'choose' }, weight: 1 },
      { id: 'shield', emoji: '🛡️', label: 'Skjold', text: 'Du får et skjold mod din næste straf', effect: { type: 'shield' }, weight: 1.2 },
      { id: 'rule', emoji: '📜', label: 'Ny regel', text: 'Du bestemmer en regel de næste 15 minutter', effect: { type: 'rule' }, weight: 1.5 },
      { id: 'self2', emoji: '😅', label: 'Uheld', text: 'Kongens byrde: Du drikker selv 2 slurke', effect: { type: 'self', n: 2 }, weight: 0.8 },
    ],
  },
  comeback: {
    id: 'comeback',
    name: 'Comeback-hjulet',
    emoji: '🔥',
    why: 'Du er bagud — tid til et comeback!',
    colors: ['#FF5C7A', '#3A1220'],
    outcomes: [
      { id: 'leader3', emoji: '👑', label: 'Føreren 3', text: 'Føreren drikker 3 slurke', effect: { type: 'target', n: 3, unit: 'sip', who: 'leader' }, weight: 2 },
      { id: 'bonus2', emoji: '⭐', label: '+2 point', text: 'Du får 2 bonuspoint', effect: { type: 'bonus', n: 2 }, weight: 1.2 },
      { id: 'give5', emoji: '🍻', label: 'Giv 5', text: 'Del 5 slurke ud til hvem du vil', effect: { type: 'give', n: 5 }, weight: 2 },
      { id: 'oweLeader', emoji: '🎁', label: 'Gave', text: 'Føreren skylder dig en drink', effect: { type: 'owe', who: 'leader' }, weight: 1.2 },
      { id: 'shield', emoji: '🛡️', label: 'Skjold', text: 'Du får et skjold mod din næste straf', effect: { type: 'shield' }, weight: 1.2 },
      { id: 'all2', emoji: '🥂', label: 'Alle 2', text: 'Fællesskål! Alle andre drikker 2 slurke', effect: { type: 'all', n: 2 }, weight: 1.5 },
      { id: 'bonus1', emoji: '⭐', label: '+1 point', text: 'Du får 1 bonuspoint', effect: { type: 'bonus', n: 1 }, weight: 1.5 },
      { id: 'oweChoose', emoji: '🎁', label: 'Vælg giver', text: 'Vælg én, der skylder dig en drink', effect: { type: 'owe', who: 'choose' }, weight: 1 },
    ],
  },
  lucky: {
    id: 'lucky',
    name: 'Lykkehjulet',
    emoji: '🎡',
    why: 'Milepæl nået!',
    colors: ['#B47CFF', '#24163A'],
    outcomes: [
      { id: 'give3', emoji: '🍻', label: 'Giv 3', text: 'Del 3 slurke ud til hvem du vil', effect: { type: 'give', n: 3 }, weight: 2.5 },
      { id: 'all1', emoji: '🥂', label: 'Alle 1', text: 'Fællesskål! Alle andre drikker 1 slurk', effect: { type: 'all', n: 1 }, weight: 1.5 },
      { id: 'bonus1', emoji: '⭐', label: '+1 point', text: 'Du får 1 bonuspoint', effect: { type: 'bonus', n: 1 }, weight: 1.5 },
      { id: 'oweRandom', emoji: '🎁', label: 'Gave', text: 'En tilfældig spiller skylder dig en drink', effect: { type: 'owe', who: 'random' }, weight: 1.2 },
      { id: 'shield', emoji: '🛡️', label: 'Skjold', text: 'Du får et skjold mod din næste straf', effect: { type: 'shield' }, weight: 1 },
      { id: 'rule', emoji: '📜', label: 'Ny regel', text: 'Du bestemmer en regel de næste 15 minutter', effect: { type: 'rule' }, weight: 1.2 },
      { id: 'dj', emoji: '🎵', label: 'DJ', text: 'Du er DJ — du vælger den næste sang', effect: { type: 'fun' }, weight: 1 },
      { id: 'self1', emoji: '😅', label: 'Uheld', text: 'Øv! Du drikker selv 1 slurk', effect: { type: 'self', n: 1 }, weight: 0.8 },
    ],
  },
};

export function wheelById(id) {
  return WHEELS[id] || null;
}

export function outcomeById(wheelId, outcomeId) {
  return WHEELS[wheelId]?.outcomes.find((o) => o.id === outcomeId) || null;
}

// The outcomes a wheel actually shows for the current settings/room.
export function activeOutcomes(wheel, { bonusEnabled = true } = {}) {
  return wheel.outcomes.filter((o) => bonusEnabled || o.effect.type !== 'bonus');
}

// Does an outcome need input from the spinner before it can be applied?
export function outcomeNeeds(outcome) {
  const e = outcome.effect;
  if (e.type === 'give') return 'distribute';
  if ((e.type === 'target' || e.type === 'owe') && e.who === 'choose') return 'choosePlayer';
  if (e.type === 'rule') return 'ruleText';
  return null;
}

// Handing out sips by tapping players: every tap is one sip, and sips not tapped out yet are
// shared evenly among the tapped players (in the order they were first tapped). `picks` maps
// pid → taps; the result maps pid → sips and always adds up to `total` (unless nobody is picked).
export function allocateSips(total, picks) {
  const out = new Map();
  let used = 0;
  for (const [pid, n] of picks) {
    if (n <= 0) continue;
    out.set(pid, n);
    used += n;
  }
  if (!out.size) return out;
  const left = Math.max(0, total - used);
  const each = Math.floor(left / out.size);
  let extra = left % out.size;
  for (const [pid, n] of out) {
    out.set(pid, n + each + (extra > 0 ? 1 : 0));
    extra--;
  }
  return out;
}

// Turn an applied outcome into log entries. `input` holds what the spinner chose:
//   { distribution: { pid: n }, target: pid, rule: 'text' }
// `ctx` gives `others` (eligible pids except the spinner), `leader` (pid or null) and `random`.
export function effectToEntries(outcome, input, ctx, spinId) {
  const e = outcome.effect;
  const src = spinId;
  const resolveWho = (who) => {
    if (who === 'leader') return ctx.leader && ctx.leader !== ctx.me ? ctx.leader : null;
    if (who === 'random') return ctx.others.length ? ctx.others[Math.floor(ctx.random() * ctx.others.length)] : null;
    return input?.target || null;
  };
  switch (e.type) {
    case 'give': {
      const to = {};
      for (const [pid, n] of Object.entries(input?.distribution || {})) {
        if (n > 0 && ctx.others.includes(pid)) to[pid] = Math.round(n);
      }
      return Object.keys(to).length ? [{ t: 'give', to, src }] : [];
    }
    case 'all':
      return [{ t: 'all', n: e.n, src }];
    case 'target': {
      const pid = resolveWho(e.who);
      return pid ? [{ t: 'pen', to: pid, n: e.n, u: e.unit || 'sip', src }] : [];
    }
    case 'self':
      return [{ t: 'self', n: e.n, src }];
    case 'bonus':
      return [{ t: 'bon', n: e.n, src }];
    case 'shield':
      return [{ t: 'shd', src }];
    case 'owe': {
      const pid = resolveWho(e.who);
      return pid ? [{ t: 'owe', from: pid, src }] : [];
    }
    case 'rule': {
      const text = String(input?.rule || '').trim().slice(0, 140);
      return text ? [{ t: 'rule', text, mins: 15, src }] : [];
    }
    default:
      return [];
  }
}
