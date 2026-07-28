/*
  Track generation with the fairness invariant built in, not checked
  after the fact.

  The generator is a pure pattern source: it rolls what the next row
  looks like (blocked lanes, art variants, traffic speed, gap jitter,
  and whether a coffee cup comes along). Placement is done by the
  world, which spaces rows by the live fair minimum gap: a worst case
  two lane crossing plus reaction time at the player's current speed.
  Traffic dynamics (rows moving at different speeds) are kept fair at
  runtime by the traffic clamp in world.js: rear rows slow to match
  the row ahead before the fair gap could be violated, so rows can
  never bunch into an unfair wall and never trade places.

  Guarantees:
  1. A row never blocks every lane.
  2. Row spacing at spawn is at least the fair minimum, and the clamp
     preserves at least that separation for the life of the rows.
  3. Everything is driven by the seeded PRNG: same seed, same track.

  Coffee placement rules (brief section 5): most cups are in tension,
  attached to a row, either in the single forced open lane of a double
  row or directly beside the blocked car of a single row. Free cups go
  mid gap, and only ever in a lane that is open in the row they
  precede, so a cup can never lure the player into a blocked lane.

  Oil slicks and rubble join in build step 7. The solvability test in
  test/fairness.test.js drives the real simulation with a dodging
  oracle across 100 seeds at six speeds.
*/

import { TUNING } from './tuning.js';
import { nextFloat01, nextIntBetween } from './rng.js';

export function createGenState(rngState) {
  return { rngState };
}

/*
  Rolls the next row spec. Mutates genState.rngState. Returns
  { lanes, variants, speedFrac, gapJitter, coffee }, where coffee is
  null or { kind: 'tension' | 'gap', laneRoll }.
*/
export function nextRowSpec(genState) {
  const o = TUNING.obstacles;
  const t = TUNING.traffic;
  const cfg = TUNING.coffee;
  const laneCount = TUNING.road.laneCount;
  let s = genState.rngState;
  let roll;

  [roll, s] = nextFloat01(s);
  const lanes = new Array(laneCount).fill(false);
  if (roll < o.doubleRowChance) {
    let open;
    [open, s] = nextIntBetween(s, 0, laneCount);
    for (let i = 0; i < laneCount; i += 1) lanes[i] = i !== open;
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

  let speedFrac = 0;
  [roll, s] = nextFloat01(s);
  if (roll >= t.stalledChance) {
    let f;
    [f, s] = nextFloat01(s);
    speedFrac = t.speedFracMin + f * (t.speedFracMax - t.speedFracMin);
  }

  let gapJitter;
  [gapJitter, s] = nextFloat01(s);

  let coffee = null;
  [roll, s] = nextFloat01(s);
  if (roll < cfg.spawnChancePerRow) {
    let tensionRoll;
    let laneRoll;
    [tensionRoll, s] = nextFloat01(s);
    [laneRoll, s] = nextFloat01(s);
    coffee = { kind: tensionRoll < cfg.tensionRatio ? 'tension' : 'gap', laneRoll };
  }

  genState.rngState = s;
  return { lanes, variants, speedFrac, gapJitter, coffee };
}
