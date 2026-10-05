// Minigame registry. To add a game: create a file next to this one that exports a game object
// (see quiz.js for a documented example of every field) and add it to the list below.
//
// Game object fields:
//   id, name, emoji, color, tagline   identity and presentation
//   minPlayers, weight                eligibility and how often the auto-breaker picks it
//   auto / manual (default true)      part of automatic breakers / startable from "Spil"
//   duration                          play time in ms
//   respond                           'first' | 'last' | null — which answer counts
//   responders(inst)                  optional: who may answer (default: all eligible players)
//   setup(ctx) -> params              ctx: { rng, players, history, settings, drinks }
//   resolve(ctx) -> result            ctx: { p, responses, eligible, settings } →
//                                     { penalties: [{ pid, n, unit, done? }], bonus: [{ pid, n }], summary }
//   modifiers(inst), rules(inst)      optional: scoring multipliers / table rules it creates
//   Play, Result                      Preact components

import mostLikely from './mostLikely.js';
import reaction from './reaction.js';
import neverHave from './neverHave.js';
import quiz from './quiz.js';
import victim from './victim.js';
import cheers from './cheers.js';
import happyHour from './happyHour.js';
import ruleCard from './ruleCard.js';
import duel from './duel.js';
import truthDare from './truthDare.js';
import categories from './categories.js';

export const GAMES = [quiz, mostLikely, reaction, neverHave, duel, victim, truthDare, categories, cheers, happyHour, ruleCard];

const BY_ID = new Map(GAMES.map((g) => [g.id, g]));

export function gameById(id) {
  return BY_ID.get(id) || null;
}
