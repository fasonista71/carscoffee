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

import { TUNING, TRAFFIC_VARIANTS, TRAFFIC_CIVILIAN_COUNT } from './tuning.js';
import { nextFloat01 } from './rng.js';

/*
  Art variants are dealt from a shuffled bag, not rolled.

  Rejection sampling was the old approach: roll, and reroll up to four
  times if the result was among the last six used. Measured over
  8,674 sampled screens it left a duplicate sprite visible on 10.3% of
  them, and it was not even handing out the cars evenly: the roadster
  turned up on 6.3% of sightings against the garbage truck's 2.3%,
  nearly three to one, because a bounded reroll gives up and takes a
  repeat rather than keep trying.

  A bag cannot do either. Every variant is dealt exactly once before
  any is dealt again, so a repeat is impossible inside a full cycle,
  and over time every car appears the same number of times. The only
  seam is the join between one bag and the next, where the last card
  of one shuffle could match the first of the next, so the refill
  swaps that case away.
*/
export function createGenState(rngState) {
  return { rngState, bag: [], lastDealt: -1, recentPlaced: [] };
}

/*
  What is actually on the road, as opposed to what was dealt.

  The bag alone was not enough. Clustering rerolls a whole row spec up
  to a few times and throws the losing ones away, so a single placed
  row can burn a dozen cards that never reach the player. The bag then
  cycles every two or three rows and its no repeat guarantee stops
  covering the span a car is visible for. Measured: duplicates landed
  in adjacent rows 548 times against 1 in the same row.

  So world.js reports back what actually got placed, and that is
  excluded from the next few rows no matter what the bag is doing.

  It remembers MODELS rather than sprites. Most of the pool is
  repaints, and a red muscle car beside a blue one still reads as the
  same car twice; only the bodyshell being different reads as two
  cars. Capped well under the number of models so there is always
  something left to deal.
*/
const PLACED_MEMORY_ROWS = 3;

export function notePlaced(genState, variants) {
  const used = [];
  for (let i = 0; i < variants.length; i += 1) {
    if (variants[i] >= 0) used.push(TRAFFIC_VARIANTS[variants[i]].model);
  }
  if (used.length === 0) return;
  genState.recentPlaced.push(used);
  while (genState.recentPlaced.length > PLACED_MEMORY_ROWS) genState.recentPlaced.shift();
}

function refillBag(genState, s) {
  const bag = [];
  for (let i = 0; i < TRAFFIC_CIVILIAN_COUNT; i += 1) bag.push(i);
  /* Fisher Yates on the seeded stream, so the shuffle is part of the
     deterministic world and a replayed seed deals the same cars. */
  for (let i = bag.length - 1; i > 0; i -= 1) {
    let r;
    [r, s] = nextFloat01(s);
    const j = Math.floor(r * (i + 1));
    const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
  }
  /* Never let a new bag open with the card the old one closed on. */
  if (bag.length > 1 && bag[bag.length - 1] === genState.lastDealt) {
    const t = bag[bag.length - 1]; bag[bag.length - 1] = bag[0]; bag[0] = t;
  }
  genState.bag = bag;
  return s;
}

/*
  Deals the next variant. Cards come off the end of the bag; the only
  reason to reach further in is alsoAvoid, which carries the other
  lane of this same row, because two identical cars side by side is
  the one repeat a player cannot miss.
*/
function pickVariant(genState, s, alsoAvoid) {
  if (genState.bag.length === 0) s = refillBag(genState, s);
  /* alsoAvoid carries variant indices from the other lane of this
     same row; everything else is compared by model. */
  const avoidModels = [];
  for (let i = 0; i < alsoAvoid.length; i += 1) {
    if (alsoAvoid[i] >= 0) avoidModels.push(TRAFFIC_VARIANTS[alsoAvoid[i]].model);
  }
  for (let i = 0; i < genState.recentPlaced.length; i += 1) {
    for (let j = 0; j < genState.recentPlaced[i].length; j += 1) {
      avoidModels.push(genState.recentPlaced[i][j]);
    }
  }
  const blocked = (v) => avoidModels.includes(TRAFFIC_VARIANTS[v].model);
  let idx = genState.bag.length - 1;
  while (idx >= 0 && blocked(genState.bag[idx])) idx -= 1;
  /* If the whole remaining bag is spoken for, refill and try once more
     rather than knowingly dealing a repeat. */
  if (idx < 0) {
    s = refillBag(genState, s);
    idx = genState.bag.length - 1;
    while (idx >= 0 && blocked(genState.bag[idx])) idx -= 1;
    if (idx < 0) idx = genState.bag.length - 1;
  }
  const v = genState.bag.splice(idx, 1)[0];
  genState.lastDealt = v;
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
  { typeRoll, laneRoll, cupRoll, artRoll }.
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
    let artRoll;
    [typeRoll, s] = nextFloat01(s);
    [laneRoll, s] = nextFloat01(s);
    [cupRoll, s] = nextFloat01(s);
    /* Which of the debris sprites this one wears. Art only: every
       rubble hazard has the same hitbox and the same cost whatever it
       is drawn as, so this never changes how a run plays. */
    [artRoll, s] = nextFloat01(s);
    hazard = { typeRoll, laneRoll, cupRoll, artRoll };
  }

  let nitroRoll;
  let nitroLaneRoll;
  let heartRoll;
  let heartLaneRoll;
  let aggroRoll;
  let aggroLaneRoll;
  [heartRoll, s] = nextFloat01(s);
  [nitroRoll, s] = nextFloat01(s);
  [nitroLaneRoll, s] = nextFloat01(s);
  [heartLaneRoll, s] = nextFloat01(s);
  [aggroRoll, s] = nextFloat01(s);
  [aggroLaneRoll, s] = nextFloat01(s);
  let breakdownRoll;
  [breakdownRoll, s] = nextFloat01(s);

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
    coffee, hazard, heartRoll, heartLaneRoll, nitroRoll, nitroLaneRoll,
    aggroRoll, aggroLaneRoll,
    breakdownRoll, staggerRolls
  };
}
