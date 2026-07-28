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

import { TUNING, TRAFFIC_VARIANTS } from './tuning.js';
import { nextFloat01, nextIntBetween } from './rng.js';

/* How many recent variant picks to avoid repeating. */
const RECENT_WINDOW = 6;
const REROLL_TRIES = 4;

export function createGenState(rngState) {
  return { rngState, recent: [] };
}

/*
  Picks an art variant, rerolling a bounded number of times to avoid
  anything used recently (previous rows or the other lane of this
  row). Bounded so it stays deterministic and cannot loop; with a 50+
  variant pool the first roll almost always lands.
*/
function pickVariant(genState, s, alsoAvoid) {
  let v = 0;
  for (let attempt = 0; attempt < REROLL_TRIES; attempt += 1) {
    [v, s] = nextIntBetween(s, 0, TRAFFIC_VARIANTS.length);
    if (!genState.recent.includes(v) && !alsoAvoid.includes(v)) break;
  }
  genState.recent.push(v);
  if (genState.recent.length > RECENT_WINDOW) genState.recent.shift();
  return [v, s];
}

/*
  Rolls the next row spec. Mutates genState.rngState. tierCfg carries
  the current tier's dials (doubleRowChance, stalledChance,
  speedFracMin, speedFracMax); the world resolves gap sizes, cluster
  membership, and hazard placement, so those arrive as raw rolls.

  Returns { lanes, variants, speedFrac, gapJitter, clusterRoll,
  tightJitter, coffee, hazard }, where coffee is null or
  { kind: 'tension' | 'gap', laneRoll } and hazard is null or
  { typeRoll, laneRoll }.
*/
/* Weighted lane pick from a normalized-enough weight list. */
function pickWeighted(s, weights) {
  let roll;
  [roll, s] = nextFloat01(s);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < weights.length; i += 1) {
    acc += weights[i] / total;
    if (roll < acc) return [i, s];
  }
  return [weights.length - 1, s];
}

export function nextRowSpec(genState, tierCfg) {
  const cfg = TUNING.coffee;
  const o = TUNING.obstacles;
  const laneCount = TUNING.road.laneCount;
  let s = genState.rngState;
  let roll;

  [roll, s] = nextFloat01(s);
  const lanes = new Array(laneCount).fill(false);
  if (roll < tierCfg.doubleRowChance) {
    let open;
    [open, s] = pickWeighted(s, o.doubleOpenWeights);
    for (let i = 0; i < laneCount; i += 1) lanes[i] = i !== open;
  } else {
    let blocked;
    [blocked, s] = pickWeighted(s, o.laneBlockWeights);
    lanes[blocked] = true;
  }

  const variants = new Array(laneCount).fill(-1);
  const usedThisRow = [];
  for (let i = 0; i < laneCount; i += 1) {
    if (lanes[i]) {
      let v;
      [v, s] = pickVariant(genState, s, usedThisRow);
      variants[i] = v;
      usedThisRow.push(v);
    }
  }

  let speedFrac = 0;
  [roll, s] = nextFloat01(s);
  if (roll >= tierCfg.stalledChance) {
    let f;
    [f, s] = nextFloat01(s);
    speedFrac = tierCfg.speedFracMin + f * (tierCfg.speedFracMax - tierCfg.speedFracMin);
  }

  let gapJitter;
  [gapJitter, s] = nextFloat01(s);
  let clusterRoll;
  [clusterRoll, s] = nextFloat01(s);
  let tightJitter;
  [tightJitter, s] = nextFloat01(s);

  let coffee = null;
  [roll, s] = nextFloat01(s);
  if (roll < cfg.spawnChancePerRow) {
    let tensionRoll;
    let laneRoll;
    [tensionRoll, s] = nextFloat01(s);
    [laneRoll, s] = nextFloat01(s);
    coffee = { kind: tensionRoll < cfg.tensionRatio ? 'tension' : 'gap', laneRoll };
  }

  let hazard = null;
  [roll, s] = nextFloat01(s);
  if (roll < TUNING.hazards.spawnChancePerGap) {
    let typeRoll;
    let laneRoll;
    let cupRoll;
    [typeRoll, s] = nextFloat01(s);
    [laneRoll, s] = nextFloat01(s);
    [cupRoll, s] = nextFloat01(s);
    hazard = { typeRoll, laneRoll, cupRoll };
  }

  let heartRoll;
  let heartLaneRoll;
  let aggroRoll;
  let aggroLaneRoll;
  [heartRoll, s] = nextFloat01(s);
  [heartLaneRoll, s] = nextFloat01(s);
  [aggroRoll, s] = nextFloat01(s);
  [aggroLaneRoll, s] = nextFloat01(s);

  /* One stagger roll per lane, rolled unconditionally so the rng
     stream never depends on which lanes ended up occupied (aggro may
     move cars between lanes after this). The world turns these into
     per car nose forward or hang back offsets. */
  const staggerRolls = new Array(laneCount);
  for (let i = 0; i < laneCount; i += 1) {
    [staggerRolls[i], s] = nextFloat01(s);
  }

  genState.rngState = s;
  return {
    lanes, variants, speedFrac, gapJitter, clusterRoll, tightJitter,
    coffee, hazard, heartRoll, heartLaneRoll, aggroRoll, aggroLaneRoll,
    staggerRolls
  };
}
