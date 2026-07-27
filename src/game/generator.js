/*
  Track generation with the fairness invariant built in, not checked
  after the fact.

  Guarantees, by construction:
  1. A row never blocks every lane.
  2. The gap to the next row always allows a full crossing from the
     worst lane into an open lane at the current speed and lane tween
     duration, plus a human reaction buffer. Rule 2 of the brief.
  3. Everything is driven by the seeded PRNG, so the same seed gives
     the same track.

  Oil slicks and rubble join in build step 7; the conditional
  lethality rules (brief rules 3 and 4) land with them.

  The solvability test in test/fairness.test.js verifies these
  guarantees with a forward search across 100 seeds at six speeds.
*/

import { TUNING } from './tuning.js';
import { nextFloat01, nextIntBetween } from './rng.js';

export function createGenState(rngState) {
  return { rngState, nextDistPx: TUNING.obstacles.firstSpawnDistPx };
}

/*
  Emits rows until coverage reaches toDistPx. Mutates genState, returns
  the new rows. A row is { distPx, lanes: [bool per lane], variants:
  [artvariant per lane, -1 where open] }.
*/
export function generateAhead(genState, { speedPxPerSec, laneTweenMs, toDistPx }) {
  const o = TUNING.obstacles;
  const laneCount = TUNING.road.laneCount;
  const rows = [];
  while (genState.nextDistPx <= toDistPx) {
    let s = genState.rngState;
    let roll;
    [roll, s] = nextFloat01(s);
    const double = roll < o.doubleRowChance;
    const lanes = new Array(laneCount).fill(false);
    if (double) {
      let openLane;
      [openLane, s] = nextIntBetween(s, 0, laneCount);
      for (let i = 0; i < laneCount; i += 1) lanes[i] = i !== openLane;
    } else {
      let blocked;
      [blocked, s] = nextIntBetween(s, 0, laneCount);
      lanes[blocked] = true;
    }
    const variants = new Array(laneCount).fill(-1);
    for (let i = 0; i < laneCount; i += 1) {
      if (lanes[i]) {
        let v;
        [v, s] = nextIntBetween(s, 0, o.stalledVariantCount);
        variants[i] = v;
      }
    }
    rows.push({ distPx: genState.nextDistPx, lanes, variants });

    /* Fair minimum gap: a full worst case crossing (two lane changes)
       plus reaction time, converted to road distance at the current
       speed. Jitter only ever adds distance on top. */
    const tweenPx = speedPxPerSec * (laneTweenMs / 1000);
    const reactionPx = speedPxPerSec * (o.reactionBufferMs / 1000);
    const minGapPx = 2 * tweenPx + reactionPx;
    let jitter;
    [jitter, s] = nextFloat01(s);
    genState.nextDistPx += minGapPx * (1 + jitter * (o.gapJitterMax - 1));
    genState.rngState = s;
  }
  return rows;
}
