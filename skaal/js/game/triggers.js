// Personal wheel offers. Checked on the player's own phone right after they log a drink, by
// comparing the standings before and after the drink.
import { GAMEPLAY } from '../config.js';
import { drinkById } from './drinks.js';

export function detectTrigger({ before, after, me, drinkId }) {
  if (!after.settings.triggers || after.ended) return null;
  if (!drinkById(drinkId)?.alcoholic) return null;
  const p = after.players.get(me);
  if (!p || p.paused) return null;
  const recent = (why, ms) => after.myOffers.some((o) => o.why === why && o.ts > after.t - ms);
  const present = after.ranking.filter((x) => !x.left);

  // 1. Took the lead.
  const scoring = present.filter((x) => x.points > 0);
  const wasLeader = before.ranking[0]?.pid === me && before.ranking[0].points > 0;
  if (after.ranking[0]?.pid === me && !wasLeader && scoring.length >= 2 && !recent('lead', GAMEPLAY.leadCooldownMs)) {
    return { w: 'king', why: 'lead' };
  }

  // 2. Far behind (bottom third and a real gap to the leader).
  const n = present.length;
  const leader = after.ranking[0];
  if (n >= 3 && leader && leader.pid !== me) {
    const gap = leader.points - p.points;
    const bottom = p.rank === n || p.rank > Math.ceil((n * 2) / 3);
    if (bottom && gap >= Math.max(3, leader.points * 0.3) && !recent('comeback', GAMEPLAY.comebackCooldownMs)) {
      return { w: 'comeback', why: 'comeback' };
    }
  }

  // 3. Milestone (every 5th drink).
  if (p.alcoholic > 0 && p.alcoholic % GAMEPLAY.milestoneEvery === 0 && !after.myOffers.some((o) => o.why === 'milestone' && o.n === p.alcoholic)) {
    return { w: 'lucky', why: 'milestone', n: p.alcoholic };
  }
  return null;
}
