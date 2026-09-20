/*
  Which scenery a tier is painted in.

  The authored ladder in TUNING.tiers runs out at ten. Speed stops
  climbing before that on purpose, and the rest of the difficulty
  stops at the last rung, but until now the road stopped changing
  too: every metre past the last tier looked identical, which is
  exactly the stretch a good run spends most of its time in.

  Past the last authored tier the scenes cycle instead, one per tier
  step, in an order shuffled once per run from the run's own seed.
  The shuffle draws from a stream of its own, salted off the run seed
  and never touched again, so adding this moved no traffic anywhere:
  the same seed still lays out exactly the road it always did.
*/
import { seedToState, nextIntBetween } from './rng.js';
import { TUNING } from './tuning.js';

/* Keeps the shuffle's draws clear of the generator's stream. */
const SCENE_SALT = 0x5ce4e;

/*
  A per run order for the scenes past the last authored tier. Fisher
  Yates over the cycle list, then one fixup: the tour must not open
  with the scene the player has just spent a kilometre looking at.
*/
export function sceneOrderForSeed(seed) {
  const order = TUNING.sceneryCycle.slice();
  let s = seedToState(((seed | 0) ^ SCENE_SALT) >>> 0);
  for (let i = order.length - 1; i > 0; i -= 1) {
    let j;
    [j, s] = nextIntBetween(s, 0, i + 1);
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }
  const lastAuthored = TUNING.tiers[TUNING.tiers.length - 1].theme;
  if (order.length > 1 && order[0] === lastAuthored) {
    order[0] = order[1];
    order[1] = lastAuthored;
  }
  return order;
}

/*
  The scene key for a tier index. Inside the authored ladder the tier
  names its own theme; past it the run's shuffled order repeats. A
  missing order falls back to the unshuffled cycle so a title screen
  or a test can ask without a run in hand.
*/
export function sceneKeyForTier(tier, order) {
  const tiers = TUNING.tiers;
  const last = tiers.length - 1;
  const t = tier > 0 ? Math.floor(tier) : 0;
  if (t <= last) return tiers[t].theme;
  const list = order && order.length > 0 ? order : TUNING.sceneryCycle;
  return list[(t - last - 1) % list.length];
}
