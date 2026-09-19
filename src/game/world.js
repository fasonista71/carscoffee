/*
  Simulation state and the fixed timestep step function. Deterministic:
  same seed plus same intent sequence gives an identical world, byte
  for byte. No browser globals, no wall clock, no ambient randomness.

  step() is called at exactly TUNING.logic.hz by the app loop, and by
  the headless tests directly.
*/

import { TUNING, TRAFFIC_VARIANTS, PLAYER_SPRITES, OBSTACLE_SPRITES } from './tuning.js';
import { seedToState, nextFloat01 } from './rng.js';
import { createPlayer, laneCenterXPx, playerLaneFloat } from './entities.js';
import { createGenState, nextRowSpec, notePlaced } from './generator.js';

export function createWorld({ seed, vehicle, environment }) {
  const weights = environment.obstacleWeights;
  const slickShare = weights ? weights.slick / (weights.slick + weights.rubble) : 0.5;
  return {
    frame: 0,
    rngState: seedToState(seed),
    distancePx: 0,
    speedMultiplier: vehicle.baseSpeedMultiplier,
    laneTweenMs: vehicle.laneTweenMs,
    vehicleId: vehicle.id,
    environmentId: environment.id,
    slickShare,
    status: 'running',
    deathCause: null,
    fuel: TUNING.fuel.max,
    boostFramesLeft: 0,
    /* Frames of boost that cost no coffee, granted by a nitro. */
    boostFreeFrames: 0,
    /* A banked nitro, spent by the ordinary boost gesture. */
    nitroCharges: 0,
    boostHint: false,
    /* Distance at which the next breakdown car may appear. */
    nextBreakdownAtPx: TUNING.traffic.breakdownEveryMeters * TUNING.speed.pxPerMeter,
    /* Hazard and forgiveness state. */
    slideLockFrames: 0,
    slowFrames: 0,
    hearts: TUNING.lives.start,
    invulnFrames: 0,
    spinFrames: 0,
    /* Difficulty tier state. speedTierMult ramps toward the current
       tier's speed rather than stepping. */
    tier: 0,
    speedTierMult: TUNING.tiers[0].speed,
    tierFlashFrames: 0,
    player: createPlayer(vehicle),
    /* Event names emitted this frame, drained by the app layer for
       sound and rumble. Plain strings; the simulation stays pure. */
    events: [],
    /* Fast sports cars passing from behind. */
    overtakers: [],
    /* Passes are scheduled by odometer, not rolled per second. The
       first waits out the opening stretch; every later one is set
       from the point the previous pass actually launched. */
    nextPassAtPx: TUNING.overtakers.firstPassAtMeters * TUNING.speed.pxPerMeter,
    /* Fires once per run, the first time a coffee cup comes into
       reading distance. The app layer decides whether to actually
       show the tip; the simulation only reports the moment. */
    coffeeSeen: false,
    /* Odometer of the last pursuit, so the next one can be held off.
       Negative infinity would do; a value one gap in the past means
       the first chase is never blocked. */
    lastChaseAtPx: -TUNING.overtakers.emergencyMinGapMeters * TUNING.speed.pxPerMeter,
    /* Traffic rows, ordered by distPx. A row is a lane pattern that
       moves as a unit at its own speed. */
    rows: [],
    /* Coffee cups. Tension cups ride with their row's speed, gap cups
       sit still. */
    pickups: [],
    /* Road hazards: oil slicks (with a telegraphed slide direction)
       and rubble. Static road features. */
    hazards: [],
    pendingSpec: null,
    /* Lanes guaranteed open through the current cluster, as a bit
       mask. Starts as all lanes; a full gap resets it to the open
       lanes of the row after the gap. */
    corridorMask: (1 << TUNING.road.laneCount) - 1,
    clusterLen: 0,
    /* Generation gets its own PRNG stream, decorrelated from the
       reserved main stream by a fixed mix constant. */
    gen: createGenState(seedToState((seed ^ 0x5bd1e995) >>> 0))
  };
}

export function isBoosting(world) {
  return world.boostFramesLeft > 0;
}

export function tierConfig(world) {
  return TUNING.tiers[world.tier];
}

export function currentSpeedPxPerSec(world) {
  const boost = isBoosting(world) ? TUNING.boost.speedMultiplier : 1;
  const slow = world.slowFrames > 0 ? TUNING.hazards.rubble.slowFactor : 1;
  return TUNING.speed.basePxPerSec * world.speedMultiplier * world.speedTierMult * boost * slow;
}

function baseSpeedPxPerSec(world) {
  return TUNING.speed.basePxPerSec * world.speedMultiplier * world.speedTierMult;
}

/*
  The speed to size a gap against.

  A row's fair gap is computed once, when the row spawns, but the
  player does not arrive until seconds later. speedTierMult ramps
  toward the tier's target the whole time, so a gap sized at the speed
  the player had at spawn is a gap they arrive at faster than it was
  built for. That is how seed 79 trapped the oracle at tier 9: the row
  asked for 274px of clearance, and by the time the player reached it
  the two lane crossing it demanded needed more.

  Sizing against the tier's target instead of the instantaneous value
  closes it. It only ever raises the number during a ramp, and once
  the ramp settles the two agree, so settled traffic density is
  unchanged. Boost is deliberately excluded: choosing to boost into a
  closing gap is the player's call, not an unfair road.
*/
function plannedSpeedPxPerSec(world) {
  const target = TUNING.tiers[world.tier].speed;
  const mult = Math.max(world.speedTierMult, target);
  return TUNING.speed.basePxPerSec * world.speedMultiplier * mult;
}

export function distanceMeters(world) {
  return world.distancePx / TUNING.speed.pxPerMeter;
}

/*
  The fair minimum separation between a specific pair of rows: a worst
  case two lane crossing plus reaction time at the player's current
  speed, PLUS the body extents involved. The extent term matters: gaps
  are measured center to center, but the road a player can actually
  maneuver in is what remains after the bodies' lengths are
  subtracted. Hitboxes vary per vehicle, so a truck behind a truck
  needs more room than two minis. Spawn spacing and the traffic clamp
  both derive from this, so the guarantee follows live tuning, tiers,
  and boost automatically.
*/
export function fairMinGapForPairPx(world, maxHA, maxHB) {
  const o = TUNING.obstacles;
  const v = plannedSpeedPxPerSec(world);
  const timePx = v * ((2 * world.laneTweenMs + o.reactionBufferMs) / 1000);
  const extentPx = world.player.hitbox.hPx + (maxHA + maxHB) / 2 - 2 * o.hitboxShrinkPx;
  return timePx + extentPx;
}

/* Tallest hitbox in the whole pool, for conservative scan bounds. */
export const TRAFFIC_MAX_H_PX = TRAFFIC_VARIANTS.reduce((m, v) => Math.max(m, v.hPx), 0);

function rowMaxHPx(lanes, variants) {
  let m = 0;
  for (let i = 0; i < lanes.length; i += 1) {
    if (lanes[i]) m = Math.max(m, TRAFFIC_VARIANTS[variants[i]].hPx);
  }
  return m;
}

/*
  intents drained by the caller since the previous logic frame, in
  arrival order. Three kinds:
    { type: 'lane', dir: -1 | 1 }   relative move (keys, swipes, thirds)
    { type: 'tapLane', lane: n }    positional tap on a lane
    { type: 'boost' }               fixed duration burst
  All input is ignored while a slick slide has steering locked.
*/
export function step(world, intents) {
  world.frame += 1;
  /* After death the world freezes; only the frame counter advances.
     The app layer decides what to show and when to restart. */
  if (world.status !== 'running') return world;
  world.events.length = 0;
  const dt = 1 / TUNING.logic.hz;

  updateTier(world);
  tickTimers(world);

  if (world.slideLockFrames === 0) {
    for (let i = 0; i < intents.length; i += 1) {
      applyIntent(world, intents[i]);
    }
  }
  advancePlayer(world);
  world.distancePx += currentSpeedPxPerSec(world) * dt;
  advanceTraffic(world, dt);
  updateYields(world);
  cullOvertakenSlicks(world);
  spawn(world);
  updateOvertakers(world, dt);
  maybeSpawnOvertaker(world);
  updateBoostHint(world);
  prune(world);
  drainFuel(world, dt);
  if (world.status !== 'running') return world;
  collectCoffee(world);
  checkHazards(world);
  if (world.status !== 'running') return world;
  checkCollision(world);
  if (world.status !== 'running') return world;
  checkOvertakerCollision(world);
  return world;
}

function updateTier(world) {
  const meters = distanceMeters(world);
  let idx = 0;
  for (let i = 0; i < TUNING.tiers.length; i += 1) {
    if (meters >= TUNING.tiers[i].atMeters) idx = i;
  }
  if (idx !== world.tier) {
    world.tier = idx;
    world.tierFlashFrames = 90;
    world.events.push('tier_up');
  }
  const target = TUNING.tiers[world.tier].speed;
  const rate = TUNING.tierRampPerFrame;
  if (world.speedTierMult < target) {
    world.speedTierMult = Math.min(target, world.speedTierMult + rate);
  } else if (world.speedTierMult > target) {
    world.speedTierMult = Math.max(target, world.speedTierMult - rate);
  }
}

function tickTimers(world) {
  if (world.boostFramesLeft > 0) {
    world.boostFramesLeft -= 1;
    if (world.boostFramesLeft === 0) world.events.push('boost_end');
  }
  if (world.boostFreeFrames > 0) world.boostFreeFrames -= 1;
  if (world.slideLockFrames > 0) world.slideLockFrames -= 1;
  if (world.slowFrames > 0) world.slowFrames -= 1;
  if (world.invulnFrames > 0) world.invulnFrames -= 1;
  if (world.spinFrames > 0) world.spinFrames -= 1;
  if (world.tierFlashFrames > 0) world.tierFlashFrames -= 1;
}

function tweenTotalFrames(world) {
  return Math.max(1, Math.round((world.laneTweenMs / 1000) * TUNING.logic.hz));
}

function laneInRange(lane) {
  return lane >= 0 && lane < TUNING.road.laneCount;
}

function msToFrames(ms) {
  return Math.max(1, Math.round((ms / 1000) * TUNING.logic.hz));
}

function applyIntent(world, intent) {
  const p = world.player;
  if (intent.type === 'lane') {
    if (!p.tween) {
      startTween(world, intent.dir);
    } else if (p.queuedDir === 0) {
      /* Exactly one queued input during a tween. Later arrivals are
         discarded, per the brief. */
      p.queuedDir = intent.dir;
    }
  } else if (intent.type === 'tapLane') {
    /* Positional tap, resolved against where the car is committed to
       be: the tween target mid tween, the current lane otherwise.
       One tap moves one lane toward the tapped lane, sharing the same
       single slot queue as relative moves. A tap on the committed
       lane itself is the boost gesture. */
    const committed = p.tween ? p.tween.to : p.lane;
    const diff = intent.lane - committed;
    if (diff === 0) {
      tryBoost(world);
    } else {
      const dir = diff > 0 ? 1 : -1;
      if (!p.tween) {
        startTween(world, dir);
      } else if (p.queuedDir === 0) {
        p.queuedDir = dir;
      }
    }
  } else if (intent.type === 'boost') {
    tryBoost(world);
  }
}

function tryBoost(world) {
  /* No extension or stacking: presses during an active boost are
     ignored. A banked nitro is spent first, and it ignores the fuel
     floor: being nearly dry is exactly when the escape move matters
     and exactly when coffee cannot pay for it. */
  if (world.boostFramesLeft > 0) return;
  if (world.nitroCharges > 0) {
    world.nitroCharges -= 1;
    world.boostFramesLeft = msToFrames(TUNING.boost.durationMs);
    world.boostFreeFrames = world.boostFramesLeft;
    world.events.push('boost_start');
    return;
  }
  if (world.fuel < TUNING.boost.minFuel) return;
  world.boostFramesLeft = msToFrames(TUNING.boost.durationMs);
  world.events.push('boost_start');
}

function startTween(world, dir) {
  const p = world.player;
  const target = p.lane + dir;
  if (!laneInRange(target)) return;
  p.tween = { from: p.lane, to: target, frame: 0, totalFrames: tweenTotalFrames(world) };
  world.events.push('lane_change');
}

function advancePlayer(world) {
  const p = world.player;
  if (!p.tween) return;
  p.tween.frame += 1;
  if (p.tween.frame >= p.tween.totalFrames) {
    p.lane = p.tween.to;
    p.tween = null;
    if (p.queuedDir !== 0) {
      const dir = p.queuedDir;
      p.queuedDir = 0;
      startTween(world, dir);
    }
  }
}

function advanceTraffic(world, dt) {
  const rows = world.rows;
  for (let i = 0; i < rows.length; i += 1) {
    rows[i].distPx += rows[i].speedPxPerSec * dt;
  }
  /* The traffic clamp, applied rear to front so slowdowns propagate
     through a chain in one pass: a row may never close within its
     pair's minimum gap of the row ahead. This is what keeps variable
     speeds from ever assembling an unfair wall, and it also means
     rows never trade places, so the array stays ordered by distPx. */
  for (let i = rows.length - 2; i >= 0; i -= 1) {
    const minGap = rows[i + 1].minGapPrevPx + TUNING.traffic.clampMarginPx;
    if (rows[i + 1].distPx - rows[i].distPx < minGap &&
        rows[i].speedPxPerSec > rows[i + 1].speedPxPerSec) {
      rows[i].speedPxPerSec = rows[i + 1].speedPxPerSec;
    }
  }
  const pickups = world.pickups;
  for (let i = 0; i < pickups.length; i += 1) {
    pickups[i].distPx += pickups[i].speedPxPerSec * dt;
  }
  if (!world.coffeeSeen) {
    const lead = TUNING.tips.coffeeLeadPx;
    for (let i = 0; i < pickups.length; i += 1) {
      const dy = pickups[i].distPx - world.distancePx;
      if (pickups[i].kind === 'coffee' && dy > 0 && dy < lead) {
        world.coffeeSeen = true;
        world.events.push('coffee_seen');
        break;
      }
    }
  }
}

/*
  The intelligence dial. A share of full gap rows (rising per tier)
  target the player directly: a single block lands on the player's
  committed lane, and a forced row opens the lane farthest from the
  player. Spacing and corridor rules are untouched, so every targeted
  pattern is still provably escapable; it just refuses to be dodged by
  standing still.
*/
function applyAggro(world, spec, cfg) {
  if (spec.aggroApplied) return;
  spec.aggroApplied = true;
  if (spec.aggroRoll >= cfg.aggro) return;
  const laneCount = TUNING.road.laneCount;
  const p = world.player;
  const committed = p.tween ? p.tween.to : p.lane;
  const blockedLanes = [];
  for (let i = 0; i < laneCount; i += 1) {
    if (spec.lanes[i]) blockedLanes.push(i);
  }
  if (blockedLanes.length === 1) {
    const from = blockedLanes[0];
    if (from === committed) return;
    const v = spec.variants[from];
    spec.lanes = spec.lanes.slice();
    spec.variants = spec.variants.slice();
    spec.lanes[from] = false;
    spec.variants[from] = -1;
    spec.lanes[committed] = true;
    spec.variants[committed] = v;
  } else if (blockedLanes.length === laneCount - 1) {
    let far;
    if (committed === 0) far = laneCount - 1;
    else if (committed === laneCount - 1) far = 0;
    else far = spec.aggroLaneRoll < 0.5 ? 0 : laneCount - 1;
    if (spec.lanes.indexOf(false) === far) return;
    const rolledVariants = blockedLanes.map((l) => spec.variants[l]);
    const lanes = new Array(laneCount).fill(true);
    lanes[far] = false;
    const variants = new Array(laneCount).fill(-1);
    let vi = 0;
    for (let i = 0; i < laneCount; i += 1) {
      if (lanes[i]) {
        variants[i] = rolledVariants[vi];
        vi += 1;
      }
    }
    spec.lanes = lanes;
    spec.variants = variants;
  }
}

function openMaskOf(lanes) {
  let m = 0;
  for (let i = 0; i < lanes.length; i += 1) {
    if (!lanes[i]) m |= 1 << i;
  }
  return m;
}

/*
  While a pass is running, new rows must never conflict with it. Two
  conflicts exist. A row with a car in the speeder's lane would be
  driven straight through (the pass vetting at spawn time cannot see
  rows that do not exist yet). And a double row would either force
  the player INTO the pass lane (its sole open lane is the speeder's)
  or put a car in it. So while a speeder is on the road, every
  conflicting or double spec is rebuilt as one car on a lane the
  speeder does not use, picked by the rolled lane die. Difficulty
  dips for those few seconds, which reads as traffic hanging back
  while the lights scream past.
*/
function protectPassLane(world, spec) {
  if (world.overtakers.length === 0) return;
  const laneCount = TUNING.road.laneCount;
  const ovLane = world.overtakers[0].lane;
  let blockedCount = 0;
  for (let i = 0; i < laneCount; i += 1) {
    if (spec.lanes[i]) blockedCount += 1;
  }
  if (blockedCount === 1 && !spec.lanes[ovLane]) return;
  const candidates = [];
  for (let i = 0; i < laneCount; i += 1) {
    if (i !== ovLane) candidates.push(i);
  }
  const keep = candidates[Math.min(candidates.length - 1,
    Math.floor(spec.aggroLaneRoll * candidates.length))];
  let variant = -1;
  for (let i = 0; i < laneCount; i += 1) {
    if (spec.lanes[i]) {
      variant = spec.variants[i];
      break;
    }
  }
  const lanes = new Array(laneCount).fill(false);
  lanes[keep] = true;
  const variants = new Array(laneCount).fill(-1);
  variants[keep] = variant;
  spec.lanes = lanes;
  spec.variants = variants;
}

function spawn(world) {
  const cfg = tierConfig(world);
  if (!world.pendingSpec) world.pendingSpec = nextRowSpec(world.gen, cfg);
  let spec = world.pendingSpec;
  const t = TUNING.traffic;
  const last = world.rows.length > 0 ? world.rows[world.rows.length - 1] : null;

  /* A row may pack tightly behind the previous one only if EVERY
     lane the previous row left open stays open through it: inside a
     cluster the open set may grow but never shrink. Tight spacing
     leaves no room to cross, so any lane a player might legally be
     driving through the cluster must stay driveable to its end. A
     pattern that narrows the road (seed 71 taught this: three middle
     blocked rows luring the player left, then two tight double rows
     walling the left at 80px spacing) instead takes a full fair gap,
     which buys the worst case two lane crossing. When a cluster wants
     to continue but the rolled pattern narrows, reroll a bounded
     number of times; this is what keeps the road crowded. */
  const lastOpenMask = last !== null ? openMaskOf(last.lanes) : 0;
  const wantTight = last !== null
    && world.clusterLen < t.clusterMaxLen
    && spec.clusterRoll < cfg.clusterChance;
  if (wantTight) {
    let rerolls = 0;
    while (rerolls < t.clusterRerolls
        && (openMaskOf(spec.lanes) & lastOpenMask) !== lastOpenMask) {
      spec = nextRowSpec(world.gen, cfg);
      rerolls += 1;
    }
  }
  const keepsOpenLanes = (openMaskOf(spec.lanes) & lastOpenMask) === lastOpenMask;
  let tight = wantTight && keepsOpenLanes;
  /* A tight continuation that conflicts with a running pass drops
     out of the cluster so protectPassLane may rebuild it. */
  if (tight && world.overtakers.length > 0) {
    const ovLane = world.overtakers[0].lane;
    let blockedCount = 0;
    for (let l = 0; l < TUNING.road.laneCount; l += 1) {
      if (spec.lanes[l]) blockedCount += 1;
    }
    if (spec.lanes[ovLane] || blockedCount > 1) tight = false;
  }
  if (!tight) {
    applyAggro(world, spec, cfg);
    protectPassLane(world, spec);
  }
  /* The stored extent covers the full stagger span, so every gap
     floor, the traffic clamp, and the oracle's windows stay
     conservative no matter how the cars lean inside the row. */
  const specMaxH = rowMaxHPx(spec.lanes, spec.variants) + 2 * t.staggerMaxPx;
  const openMask = openMaskOf(spec.lanes);

  let minGapPrevPx;
  let gapPx;
  if (tight) {
    minGapPrevPx = (last.maxHPx + specMaxH) / 2 + t.tightExtraGapPx;
    gapPx = minGapPrevPx * (1 + spec.tightJitter * t.tightGapJitterSpan);
  } else {
    minGapPrevPx = fairMinGapForPairPx(world, last ? last.maxHPx : specMaxH, specMaxH);
    gapPx = minGapPrevPx * (1 + spec.gapJitter * (cfg.gapJitterMax - 1));
    /* A slick claims a gap that fits its recovery guarantee instead
       of hoping one gets rolled; that is what makes slicks actually
       appear on the road. */
    if (last !== null && spec.hazard && spec.hazard.typeRoll < world.slickShare) {
      gapPx = Math.max(gapPx, slickRecoveryPx(world, specMaxH) + TUNING.hazards.slick.gapClaimExtraPx);
    }
  }

  const at = last ? last.distPx + gapPx : Math.max(TUNING.obstacles.firstSpawnDistPx, world.distancePx + gapPx);
  const horizon = Math.max(TUNING.obstacles.horizonPx,
    currentSpeedPxPerSec(world) * TUNING.obstacles.horizonSecs);
  if (world.distancePx + horizon < at) return;
  /* Stopped dead is reserved for breakdowns, on the jittered distance
     cadence: the first full gap row past the mark becomes one stopped
     car with its flashers on. A double row that draws the breakdown
     sheds down to a single car first, so two flashing cars never sit
     side by side. Everything else that rolled stalled crawls at the
     tier's slowest fraction, so packs still jam up between marks. */
  let blockedCount = 0;
  for (let l = 0; l < TUNING.road.laneCount; l += 1) {
    if (spec.lanes[l]) blockedCount += 1;
  }
  let breakdown = false;
  let speedFrac = spec.speedFrac;
  if (!tight && blockedCount >= 1 && at >= world.nextBreakdownAtPx) {
    if (blockedCount > 1) {
      const blockedLanes = [];
      for (let l = 0; l < TUNING.road.laneCount; l += 1) {
        if (spec.lanes[l]) blockedLanes.push(l);
      }
      const keep = blockedLanes[Math.min(blockedLanes.length - 1,
        Math.floor(spec.aggroLaneRoll * blockedLanes.length))];
      const lanes = new Array(TUNING.road.laneCount).fill(false);
      lanes[keep] = true;
      const variants = new Array(TUNING.road.laneCount).fill(-1);
      variants[keep] = spec.variants[keep];
      spec.lanes = lanes;
      spec.variants = variants;
    }
    breakdown = true;
    speedFrac = 0;
    const j = t.breakdownJitterFrac;
    const intervalPx = t.breakdownEveryMeters * TUNING.speed.pxPerMeter;
    world.nextBreakdownAtPx = at + intervalPx * (1 - j / 2 + spec.breakdownRoll * j);
  } else if (speedFrac === 0) {
    speedFrac = cfg.speedFracMin;
  }
  /* Per car stagger: nose forward or hang back of the row line. */
  const offsets = new Array(TUNING.road.laneCount).fill(0);
  for (let l = 0; l < TUNING.road.laneCount; l += 1) {
    if (spec.lanes[l]) {
      offsets[l] = Math.round((spec.staggerRolls[l] - 0.5) * 2 * t.staggerMaxPx);
    }
  }
  const row = {
    distPx: at,
    speedPxPerSec: speedFrac * baseSpeedPxPerSec(world),
    lanes: spec.lanes,
    variants: spec.variants,
    offsets,
    breakdown,
    tight,
    yield: null,
    maxHPx: specMaxH,
    minGapPrevPx
  };
  world.rows.push(row);
  /* Tell the generator what actually landed, so the next few rows can
     avoid it regardless of how many specs clustering threw away. */
  notePlaced(world.gen, row.variants);
  if (tight) {
    world.corridorMask &= openMask;
    world.clusterLen += 1;
  } else {
    world.corridorMask = openMask;
    world.clusterLen = 0;
  }
  /* Each row remembers the guaranteed corridor as of its spawn; the
     overtaker squeeze guard reads it. */
  row.corridorMask = world.corridorMask;
  /* Hazards live in full gaps only; cluster interiors have no room
     for a slide or a recovery. */
  let hazardPlaced = false;
  if (!tight && last !== null && spec.hazard) {
    hazardPlaced = addHazard(world, spec, row, gapPx, last);
  }
  /* Free cups need a real gap to sit in, and never share one with a
     hazard; inside a cluster only tension cups make sense. */
  if (spec.coffee && !((tight || hazardPlaced) && spec.coffee.kind === 'gap')) {
    addCoffee(world, spec.coffee, row, gapPx);
  }
  /* Rare heart pickups, gap only, always in a lane open in the row
     they precede, offset from where cups and rubble sit. The road
     offers no refill until enough hearts are spent. */
  if (!tight && last !== null && !hazardPlaced
      && TUNING.lives.max - world.hearts >= TUNING.lives.minSpentForPickup
      && spec.heartRoll < TUNING.lives.pickupChancePerGap) {
    const open = [];
    for (let l = 0; l < TUNING.road.laneCount; l += 1) {
      if (!row.lanes[l]) open.push(l);
    }
    const lane = open[Math.min(open.length - 1, Math.floor(spec.heartLaneRoll * open.length))];
    const at = row.distPx - gapPx * 0.35;
    if (at > last.distPx + 50) {
      world.pickups.push({ kind: 'heart', lane, distPx: at, speedPxPerSec: 0 });
    }
  }
  /* Nitro, same shape as a heart but with no state gate: it is a
     reward for reading the road, not a rescue the game doles out. */
  if (!tight && last !== null && !hazardPlaced
      && spec.nitroRoll < TUNING.nitro.pickupChancePerGap) {
    const open = [];
    for (let l = 0; l < TUNING.road.laneCount; l += 1) {
      if (!row.lanes[l]) open.push(l);
    }
    const lane = open[Math.min(open.length - 1, Math.floor(spec.nitroLaneRoll * open.length))];
    const at = row.distPx - gapPx * 0.55;
    if (at > last.distPx + 50) {
      world.pickups.push({ kind: 'nitro', lane, distPx: at, speedPxPerSec: 0 });
    }
  }
  world.pendingSpec = null;
}

/* Room a forced slide needs before the next row: slide lock plus two
   lane changes plus reaction time at the tier's settled speed,
   plus body extents. */
function slickRecoveryPx(world, rowMaxH) {
  const hz = TUNING.hazards;
  /* Spawn time sizing, so the same ramp argument as
     fairMinGapForPairPx applies: the player arrives faster than they
     were travelling when the puddle was placed. */
  const v = plannedSpeedPxPerSec(world);
  return v * ((hz.slick.slideLockMs + 2 * world.laneTweenMs + TUNING.obstacles.reactionBufferMs) / 1000)
    + world.player.hitbox.hPx + rowMaxH / 2;
}

/*
  Hazard placement safety, brief section 4 rules 3 and 4:
  - A slick's slide target lane must be open in the next row ahead AND
    in the row behind, so the forced slide can never deliver the
    player into a stalled car even if the rear row has crept forward.
  - The slick sits a full recovery ahead of the next row: slide lock
    plus two lane changes plus reaction time at current speed, plus
    body extents. A player forced through it can always get back out
    of the way.
  - Rubble is not lethal; it only ever sits in a lane that is open in
    the row it precedes, so it taxes the tempting line rather than
    baiting a trap.
  Returns true when a hazard was actually placed.
*/
function addHazard(world, spec, row, gapPx, last) {
  const hz = TUNING.hazards;
  const laneCount = TUNING.road.laneCount;
  const type = spec.hazard.typeRoll < world.slickShare ? 'slick' : 'rubble';
  if (type === 'rubble') {
    const open = [];
    for (let l = 0; l < laneCount; l += 1) {
      if (!row.lanes[l]) open.push(l);
    }
    const lane = open[Math.min(open.length - 1, Math.floor(spec.hazard.laneRoll * open.length))];
    const at = row.distPx - gapPx * 0.5;
    if (at < last.distPx + 60) return false;
    const art = Math.min(OBSTACLE_SPRITES.length - 1,
      Math.floor(spec.hazard.artRoll * OBSTACLE_SPRITES.length));
    world.hazards.push({ type, lane, distPx: at, art });
    return true;
  }
  const pairs = [];
  for (let lane = 0; lane < laneCount; lane += 1) {
    for (let d = -1; d <= 1; d += 2) {
      const target = lane + d;
      if (target < 0 || target >= laneCount) continue;
      if (row.lanes[target]) continue;
      if (last.lanes[target]) continue;
      pairs.push({ lane, dir: d });
    }
  }
  if (pairs.length === 0) return false;
  const pick = pairs[Math.min(pairs.length - 1, Math.floor(spec.hazard.laneRoll * pairs.length))];
  const at = row.distPx - slickRecoveryPx(world, row.maxHPx);
  if (at < last.distPx + 60) return false;
  if (at < world.distancePx + 200) return false;
  world.hazards.push({ type, lane: pick.lane, dir: pick.dir, distPx: at });
  /* The brief's deliberate classic: a cup just past the slick, in the
     slick's own lane. Grabbing it means threading into that lane
     after the puddle; the safe line and the fueled line differ. */
  if (spec.hazard.cupRoll < hz.slick.cupChance) {
    world.pickups.push({ kind: 'coffee', lane: pick.lane, distPx: at + hz.slick.cupAheadPx, speedPxPerSec: 0 });
  }
  return true;
}

function addCoffee(world, coffee, row, gapPx) {
  const laneCount = TUNING.road.laneCount;
  if (coffee.kind === 'tension') {
    /* In tension: either the single forced open lane of a double row
       (the safe line and the fueled line coincide), or the lane
       directly beside the blocked car of a single row.

       Every cup sits still on the road. One consistent movement
       treatment, by request: cups beside stalled rows stay in tension
       for good, cups beside moving rows watch their row pull away. */
    let lane;
    const blockedCount = row.lanes.reduce((n, b) => n + (b ? 1 : 0), 0);
    if (blockedCount >= laneCount - 1) {
      lane = row.lanes.indexOf(false);
    } else {
      const blocked = row.lanes.indexOf(true);
      const options = [];
      if (blocked - 1 >= 0 && !row.lanes[blocked - 1]) options.push(blocked - 1);
      if (blocked + 1 < laneCount && !row.lanes[blocked + 1]) options.push(blocked + 1);
      lane = options[Math.min(options.length - 1, Math.floor(coffee.laneRoll * options.length))];
    }
    world.pickups.push({ kind: 'coffee', lane, distPx: row.distPx, speedPxPerSec: 0 });
  } else {
    /* Free cup, mid gap, and only in a lane that is open in the row
       it precedes, so a cup never lures the player into a blocked
       lane. Sits still. */
    const open = [];
    for (let l = 0; l < laneCount; l += 1) {
      if (!row.lanes[l]) open.push(l);
    }
    const lane = open[Math.min(open.length - 1, Math.floor(coffee.laneRoll * open.length))];
    world.pickups.push({ kind: 'coffee', lane, distPx: row.distPx - gapPx * 0.5, speedPxPerSec: 0 });
  }
}

function prune(world) {
  const cutoff = world.distancePx - TUNING.obstacles.despawnBehindPx;
  while (world.rows.length > 0 && world.rows[0].distPx < cutoff) {
    world.rows.shift();
  }
  for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
    if (world.pickups[i].distPx < cutoff) world.pickups.splice(i, 1);
  }
  for (let i = world.hazards.length - 1; i >= 0; i -= 1) {
    if (world.hazards[i].distPx < cutoff) world.hazards.splice(i, 1);
  }
}

function drainFuel(world, dt) {
  /* Passive drain scales with the tier's speed, per the brief. */
  const before = world.fuel;
  const rate = TUNING.fuel.passiveDrainPerSec * world.speedTierMult
    + ((isBoosting(world) && world.boostFreeFrames === 0) ? TUNING.fuel.boostDrainPerSec : 0);
  world.fuel -= rate * dt;
  if (world.fuel <= 0) {
    world.fuel = 0;
    world.status = 'dead';
    world.deathCause = 'fuel';
    world.events.push('game_over');
    return;
  }
  if (before > TUNING.fuel.lowThreshold && world.fuel <= TUNING.fuel.lowThreshold) {
    world.events.push('fuel_low');
  }
}

function collectCoffee(world) {
  const p = world.player;
  const c = TUNING.coffee;
  const px = laneCenterXPx(playerLaneFloat(p));
  for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
    const item = world.pickups[i];
    const box = item.kind === 'heart' ? TUNING.lives.hitbox
      : (item.kind === 'nitro' ? TUNING.nitro.hitbox : c.hitbox);
    const halfW = (p.hitbox.wPx + box.wPx) / 2 + c.pickupSlopPx;
    const halfH = (p.hitbox.hPx + box.hPx) / 2 + c.pickupSlopPx;
    const dy = item.distPx - world.distancePx;
    if (dy < -halfH || dy > halfH) continue;
    if (Math.abs(px - laneCenterXPx(item.lane)) < halfW) {
      world.pickups.splice(i, 1);
      if (item.kind === 'heart') {
        world.hearts = Math.min(TUNING.lives.max, world.hearts + 1);
        world.events.push('heart_pickup');
      } else if (item.kind === 'nitro') {
        /*
          Banks a charge rather than firing one.

          It used to fire on pickup, and that broke the fairness
          invariant outright: every gap on the road is sized against
          the speed the player will be doing, and the whole model
          assumes boosting is a choice. A pickup that accelerates you
          to 1.65x without asking throws you into gaps built for 1.0x.
          The oracle proved it, doomed on seed 3 at tier 7 while in a
          nitro boost it never requested.

          Banked, it is still a free full boost that works below the
          fuel floor. It is just spent when the player decides.
        */
        world.nitroCharges = Math.min(TUNING.nitro.maxCharges, world.nitroCharges + 1);
        world.events.push('nitro_pickup');
      } else {
        world.fuel = Math.min(TUNING.fuel.max, world.fuel + TUNING.fuel.coffeeRefill);
        world.events.push('coffee_pickup');
      }
    }
  }
}

/*
  Static puddles versus moving traffic: spawn time checks cannot
  prevent a fast cluster from rolling forward over a parked slick and
  parking cars where its slide points. Two runtime guards close that
  hole. Traffic that overlaps a slick smears it off the road, and a
  slick never fires its slide unless the target lane is clear for the
  whole steering lock distance ahead.
*/
function cullOvertakenSlicks(world) {
  const cull = TUNING.hazards.slick.cullOverlapPx;
  for (let i = world.hazards.length - 1; i >= 0; i -= 1) {
    const h = world.hazards[i];
    if (h.type !== 'slick') continue;
    const target = h.lane + h.dir;
    for (let r = 0; r < world.rows.length; r += 1) {
      const dy = world.rows[r].distPx - h.distPx;
      if (dy > cull) break;
      if (dy < -cull) continue;
      if (world.rows[r].lanes[h.lane] || world.rows[r].lanes[target]) {
        world.hazards.splice(i, 1);
        break;
      }
    }
  }
}

function slideTargetBlocked(world, slick) {
  const hz = TUNING.hazards.slick;
  const target = slick.lane + slick.dir;
  const v = currentSpeedPxPerSec(world);
  const guardPx = v * ((hz.slideLockMs + world.laneTweenMs) / 1000)
    + world.player.hitbox.hPx + hz.guardExtraPx;
  for (let i = 0; i < world.rows.length; i += 1) {
    const dy = world.rows[i].distPx - slick.distPx;
    if (dy > guardPx) break;
    if (dy < -hz.cullOverlapPx) continue;
    if (world.rows[i].lanes[target]) return true;
  }
  /* Never slide into a lane an overtaker will blast through before
     the slide lock ends and the player has had time to escape. */
  const ovWindowSec = (hz.slideLockMs + 2 * world.laneTweenMs + TUNING.obstacles.reactionBufferMs) / 1000 + 0.4;
  for (let i = 0; i < world.overtakers.length; i += 1) {
    const ov = world.overtakers[i];
    if (ov.lane !== target) continue;
    const rel = ov.speedPxPerSec - v;
    if (rel <= 0) continue;
    const tCenter = -(ov.distPx - world.distancePx) / rel;
    if (tCenter > -0.3 && tCenter < ovWindowSec) return true;
  }
  return false;
}

function startSlide(world, slick) {
  const p = world.player;
  const target = slick.lane + slick.dir; /* in range by construction */
  p.queuedDir = 0;
  p.lane = slick.lane;
  p.tween = { from: slick.lane, to: target, frame: 0, totalFrames: tweenTotalFrames(world) };
  world.slideLockFrames = msToFrames(TUNING.hazards.slick.slideLockMs);
  world.events.push('slick_slide');
}

function checkHazards(world) {
  if (world.invulnFrames > 0) return;
  const p = world.player;
  const hz = TUNING.hazards;
  const px = laneCenterXPx(playerLaneFloat(p));
  for (let i = world.hazards.length - 1; i >= 0; i -= 1) {
    const h = world.hazards[i];
    const box = h.type === 'slick' ? hz.slick.hitbox : hz.rubble.hitbox;
    const halfH = (p.hitbox.hPx + box.hPx) / 2;
    const dy = h.distPx - world.distancePx;
    if (dy < -halfH || dy > halfH) continue;
    const halfW = (p.hitbox.wPx + box.wPx) / 2;
    if (Math.abs(px - laneCenterXPx(h.lane)) >= halfW) continue;
    if (h.type === 'slick') {
      /* One slide at a time; the lock also guards against the same
         puddle re triggering while still overlapping. And never slide
         into a lane that traffic has since parked in. */
      if (world.slideLockFrames > 0) continue;
      if (slideTargetBlocked(world, h)) continue;
      startSlide(world, h);
    } else {
      world.hazards.splice(i, 1);
      const fuelBefore = world.fuel;
      world.fuel -= hz.rubble.fuelCost;
      world.slowFrames = Math.max(world.slowFrames, msToFrames(hz.rubble.slowMs));
      world.boostFramesLeft = 0;
      /* The free stretch belongs to the boost that just ended. Leave
         it running and the next boost, a paid one, drains nothing for
         the remainder, and the coffee economy lies about its cost. */
      world.boostFreeFrames = 0;
      world.events.push('rubble_hit');
      /* drainFuel owns the rising edge, but it is not the only thing
         that subtracts fuel. Rubble taking the player from 30 to 18
         used to cross the low threshold in silence, and the warning
         then stayed off for the rest of the run because the edge had
         already been passed. */
      if (fuelBefore > TUNING.fuel.lowThreshold
          && world.fuel <= TUNING.fuel.lowThreshold
          && world.fuel > 0) {
        world.events.push('fuel_low');
      }
      if (world.fuel <= 0) {
        world.fuel = 0;
        world.status = 'dead';
        world.deathCause = 'fuel';
        world.events.push('game_over');
        return;
      }
    }
  }
}

/*
  Collision uses the interpolated lane position, so a car mid tween is
  hit where it visually is. A row's distPx equals world.distancePx
  exactly when it draws level with the player.

  The first lethal contact in a run is the stumble: spin, speed drop,
  and a stretch of invulnerability instead of death. The second ends
  the run.
*/
function checkCollision(world) {
  if (world.invulnFrames > 0) return;
  const p = world.player;
  const o = TUNING.obstacles;
  const px = laneCenterXPx(playerLaneFloat(p));
  const maxHalfH = (p.hitbox.hPx + TRAFFIC_MAX_H_PX) / 2 + TUNING.traffic.staggerMaxPx;
  for (let i = 0; i < world.rows.length; i += 1) {
    const row = world.rows[i];
    const dy = row.distPx - world.distancePx;
    if (dy > maxHalfH) break; /* rows stay ordered by distPx */
    if (dy < -maxHalfH) continue;
    for (let lane = 0; lane < TUNING.road.laneCount; lane += 1) {
      if (!row.lanes[lane]) continue;
      const v = TRAFFIC_VARIANTS[row.variants[lane]];
      const halfW = (p.hitbox.wPx + v.wPx) / 2 - o.hitboxShrinkPx;
      const halfH = (p.hitbox.hPx + v.hPx) / 2 - o.hitboxShrinkPx;
      const dyCar = dy + (row.offsets ? row.offsets[lane] : 0);
      if (Math.abs(dyCar) < halfH && Math.abs(px - laneCenterXPx(lane)) < halfW) {
        lethalHit(world);
        return;
      }
    }
  }
}

function lethalHit(world) {
  world.hearts -= 1;
  if (world.hearts > 0) {
    world.invulnFrames = msToFrames(TUNING.stumble.invulnMs);
    world.spinFrames = msToFrames(TUNING.stumble.spinMs);
    world.slowFrames = Math.max(world.slowFrames, msToFrames(TUNING.stumble.slowMs));
    world.boostFramesLeft = 0;
    world.boostFreeFrames = 0;
    world.slideLockFrames = 0;
    world.events.push('stumble');
  } else {
    world.status = 'dead';
    world.deathCause = 'crash';
    world.events.push('crash');
    world.events.push('game_over');
  }
}

/* Sports cars from behind: spectacle with teeth. Lethal on contact
   like any traffic, telegraphed by the warning chevrons the renderer
   draws while they approach. */
const OVERTAKER_VARIANT_IDS = ['muscle', 'super_car', 'rally',
  'hot_hatch', 'sport_white']
  /* Never a car the player might be driving. The player's three cars
     are not in TRAFFIC_VARIANTS at all, so this cannot bite today; it
     stays as the guard for whoever adds a fourth. */
  .filter((name) => !PLAYER_SPRITES.includes(name))
  .map((name) => TRAFFIC_VARIANTS.findIndex((v) => v.sprite === name))
  .filter((i) => i >= 0);

/* The pursuit fleet: a city cruiser, a state car, a sheriff's car and
   a SWAT van. These ride behind a speeder. */
const EMERGENCY_VARIANT_IDS = ['police_cruiser', 'state_police', 'sheriff', 'swat']
  .map((name) => TRAFFIC_VARIANTS.findIndex((v) => v.sprite === name))
  .filter((i) => i >= 0);

/* On a call, alone. An ambulance or a fire truck does not chase
   anybody, so instead of riding behind a speeder it replaces one: the
   pass is a single vehicle, lights and siren, going somewhere. This
   is the only way these two appear now that they are out of ordinary
   traffic, and it reuses the pass machinery whole. */
const SOLO_CALL_VARIANT_IDS = ['ambulance', 'fire_truck']
  .map((name) => TRAFFIC_VARIANTS.findIndex((v) => v.sprite === name))
  .filter((i) => i >= 0);

function updateOvertakers(world, dt) {
  const o = TUNING.overtakers;
  for (let i = world.overtakers.length - 1; i >= 0; i -= 1) {
    const ov = world.overtakers[i];
    ov.distPx += ov.speedPxPerSec * dt;
    if (ov.distPx - world.distancePx > o.despawnAheadPx) {
      world.overtakers.splice(i, 1);
    }
  }
}

/*
  Traffic yields to a pass: cars in the speeder's lane inside the
  pass corridor pull over into the middle instead of blocking the
  spawn outright, and the pulled over car becomes a brand new
  obstacle for the player. A car may only yield when the maneuver is
  fair to everyone:
  - it is the only car in its row (a packed row has nowhere to go),
  - the row is not bumper to bumper in a cluster (no room to merge),
  - it is not a breakdown (a dead car cannot move),
  - and, when the row is visible or ahead, it is at least
    yieldMinAheadPx out so the merge never lands in the player's
    face. Rows far behind the player may yield at any distance; the
    player never meets them again.
  Any car that cannot yield blocks the pass from spawning, exactly
  like the old hard clear lane rule.
*/
function planYields(world, lane) {
  const o = TUNING.overtakers;
  const yields = [];
  /* Every existing row ahead is vetted, not just a fixed span: a
     slow speeder is on the road long enough to catch rows far past
     the old 400px check, and an unvetted row is exactly how a pass
     once drove straight through traffic. Rows spawned DURING the
     pass are handled separately by protectPassLane. */
  for (let i = 0; i < world.rows.length; i += 1) {
    const row = world.rows[i];
    const dy = row.distPx - world.distancePx;
    if (dy < -o.clearLanePx) continue;
    if (!row.lanes[lane]) continue;
    /* A dead car cannot move, and a row already mid maneuver cannot
       start another. Either blocks the pass entirely. */
    if (row.yield || row.breakdown) return null;
    let blockedCount = 0;
    for (let l = 0; l < TUNING.road.laneCount; l += 1) {
      if (row.lanes[l]) blockedCount += 1;
    }
    /* Only a lane to lane merge exists (the road has no usable
       shoulder), and a merge must be fair: the car must be alone in
       its row, and when the row is visible or ahead of the player it
       must be far enough out and not packed in a cluster, so the
       merge never lands in the player's face. Rows well behind the
       player may merge freely; the player never meets them again. */
    if (blockedCount !== 1) return null;
    if (dy > -60) {
      const next = world.rows[i + 1];
      if (dy < o.yieldMinAheadPx || row.tight || (next && next.tight)) return null;
    }
    yields.push(row);
  }
  return yields;
}

/*
  The pulled over car merges out of the speeder's lane into the
  middle. While it slides both lanes count as occupied, which is the
  conservative truth of a car straddling the line, and the merge
  always finishes long before the row reaches the player because of
  the yieldMinAheadPx floor. The merged car then sits in the middle
  lane: the pass leaves the road genuinely rearranged.
*/
function startYield(row, fromLane) {
  const total = Math.max(1, msToFrames(TUNING.overtakers.yieldMs));
  row.lanes = row.lanes.slice();
  row.variants = row.variants.slice();
  row.offsets = row.offsets ? row.offsets.slice() : new Array(TUNING.road.laneCount).fill(0);
  const toLane = fromLane === 0 ? 1 : TUNING.road.laneCount - 2;
  row.yield = { from: fromLane, to: toLane, frame: 0, total };
  row.lanes[toLane] = true;
  row.variants[toLane] = row.variants[fromLane];
  row.offsets[toLane] = row.offsets[fromLane];
}

function updateYields(world) {
  for (let i = 0; i < world.rows.length; i += 1) {
    const row = world.rows[i];
    if (!row.yield) continue;
    row.yield.frame += 1;
    if (row.yield.frame >= row.yield.total) {
      row.lanes[row.yield.from] = false;
      row.variants[row.yield.from] = -1;
      row.offsets[row.yield.from] = 0;
      row.yield = null;
    }
  }
}

/* behindFarPx covers a chase pair: the pass interval runs from the
   lead car's earliest arrival to the trailing car's latest. For a
   lone car both bounds come from the same spawn distance. */
function overtakerLaneClear(world, lane, vO, behindPx, behindFarPx = behindPx) {
  const o = TUNING.overtakers;
  /* Squeeze guard: never pass while any row the player meets around
     the same moment has a guaranteed corridor that collapses to the
     overtaker's lane. Clusters pin the player to their corridor, so
     this checks the stored corridor mask, not just single rows.

     All timing reasons over the player's possible speed RANGE, from
     rubble slowed through boosted, never the transient instant. A
     momentary slowdown once made a fatal cluster look comfortably far
     away; the slow expired and the timeline compressed onto the
     player. */
  const vBase = baseSpeedPxPerSec(world);
  const vFast = vBase * TUNING.boost.speedMultiplier;
  const vSlow = vBase * TUNING.hazards.rubble.slowFactor;
  const g = o.squeezeGuardSec;
  const tMeetMin = behindPx / Math.max(1, vO - vSlow);
  /* Latest possible meet: boost is a bounded burst, not a sustained
     speed, so the honest bound is base speed plus the extra road two
     full boosts can buy (fuel allows back to back bursts). Dividing
     by (vO - vFast) instead would explode toward infinity as the
     boost multiplier nears the slowest overtaker's. */
  const boostExtraPx = (vFast - vBase) * (TUNING.boost.durationMs / 1000) * 2;
  const tMeetMax = (behindFarPx + boostExtraPx) / Math.max(1, vO - vBase);
  const laneBit = 1 << lane;
  const fullMask = (1 << TUNING.road.laneCount) - 1;
  for (let i = 0; i < world.rows.length; i += 1) {
    const row = world.rows[i];
    const dy = row.distPx - world.distancePx;
    if (dy <= 0) continue;
    /* A row's arrival is an interval too: it may clamp to stalled
       traffic ahead, and the player's own speed varies. */
    const tRowMin = dy / vFast;
    const slowClosing = vSlow - row.speedPxPerSec;
    const tRowMax = slowClosing > 0 ? dy / slowClosing : Infinity;
    if (tRowMax < tMeetMin - g || tRowMin > tMeetMax + g) continue;
    if ((row.corridorMask & fullMask & ~laneBit) === 0) return false;
  }
  /* Into the player's own lane only on open road: a corridor lane
     existing is not enough when a cluster has the player pinned with
     no room to reach it. If the first row ahead can arrive before the
     pass is over, pick another lane. */
  const committed = world.player.tween ? world.player.tween.to : world.player.lane;
  if (lane === committed) {
    for (let i = 0; i < world.rows.length; i += 1) {
      const dy = world.rows[i].distPx - world.distancePx;
      if (dy < 0) continue;
      if (dy / vFast < tMeetMax + g) return false;
      break;
    }
  }
  return true;
}

function maybeSpawnOvertaker(world) {
  const o = TUNING.overtakers;
  /* Exactly one pass event at a time: a lone speeder or one pursuit
     pair. The next cannot start until this one is done. */
  if (world.overtakers.length > 0) return;
  /* Scheduled by road travelled, not by a per second roll. Until the
     odometer reaches the mark there is nothing to do; past it we try
     once a second until an attempt actually lands, so a pass blocked
     by traffic is deferred rather than skipped. */
  if (world.distancePx < world.nextPassAtPx) return;
  if (world.frame % TUNING.logic.hz !== 0) return;
  let s = world.rngState;
  {
    let laneRoll;
    let speedRoll;
    let variantRoll;
    let behindRoll;
    let emergencyRoll;
    let chaseRoll;
    [laneRoll, s] = nextFloat01(s);
    [speedRoll, s] = nextFloat01(s);
    [variantRoll, s] = nextFloat01(s);
    [behindRoll, s] = nextFloat01(s);
    [emergencyRoll, s] = nextFloat01(s);
    [chaseRoll, s] = nextFloat01(s);
    /* Edge lanes only. Crossing between corridors always transits the
       middle lane, so a middle lane overtaker can wall off the only
       path exactly when a corridor shift demands it. Edges never
       carry transit.

       Between the two edges, prefer the one where traffic will have
       to pull over: the yield IS the spectacle, and the merged car
       becomes the player's next problem. Ties fall back to the
       rolled coin. */
    const vO = baseSpeedPxPerSec(world) * (o.speedMultMin + speedRoll * (o.speedMultMax - o.speedMultMin));
    const behindPx = o.spawnBehindPx * (1 - o.spawnBehindJitter / 2 + behindRoll * o.spawnBehindJitter);
    /* Emergency vehicles only ever appear in pursuit: the speeder in
       front, the lights behind. Never solo, never leading. */
    const sinceChasePx = world.distancePx - world.lastChaseAtPx;
    const chase = EMERGENCY_VARIANT_IDS.length > 0
      && emergencyRoll < o.emergencyChance
      && sinceChasePx >= o.emergencyMinGapMeters * TUNING.speed.pxPerMeter;
    /* Not a pursuit, so the pass may instead be one vehicle on a call.
       Reads off the same roll from the far end, so no extra draw and
       the two outcomes cannot both fire. */
    const soloCall = !chase && SOLO_CALL_VARIANT_IDS.length > 0
      && emergencyRoll > 1 - o.soloCallChance;
    const behindFarPx = chase ? behindPx + o.chaseGapPx : behindPx;
    const edgeA = laneRoll < 0.5 ? 0 : TUNING.road.laneCount - 1;
    const edgeB = TUNING.road.laneCount - 1 - edgeA;
    const planA = OVERTAKER_VARIANT_IDS.length > 0 ? planYields(world, edgeA) : null;
    const planB = OVERTAKER_VARIANT_IDS.length > 0 ? planYields(world, edgeB) : null;
    const candidates = [];
    if (planA !== null) candidates.push({ lane: edgeA, yields: planA });
    if (planB !== null) candidates.push({ lane: edgeB, yields: planB });
    candidates.sort((a, b) => b.yields.length - a.yields.length);
    let lane = -1;
    let yields = null;
    for (let c = 0; c < candidates.length; c += 1) {
      if (overtakerLaneClear(world, candidates[c].lane, vO, behindPx, behindFarPx)) {
        lane = candidates[c].lane;
        yields = candidates[c].yields;
        break;
      }
    }
    if (yields !== null) {
      for (let i = 0; i < yields.length; i += 1) startYield(yields[i], lane);
      const pick = (ids, r) => ids[Math.min(ids.length - 1, Math.floor(r * ids.length))];
      world.overtakers.push({
        lane, distPx: world.distancePx - behindPx, speedPxPerSec: vO,
        variant: soloCall ? pick(SOLO_CALL_VARIANT_IDS, variantRoll)
                          : pick(OVERTAKER_VARIANT_IDS, variantRoll),
        /* emergency drives the wig wag lights and the siren, so the
           lone caller carries it exactly like a pursuit car does */
        emergency: soloCall
      });
      if (soloCall) {
        world.events.push('siren');
      } else if (chase) {
        world.overtakers.push({
          lane, distPx: world.distancePx - behindFarPx, speedPxPerSec: vO,
          variant: pick(EMERGENCY_VARIANT_IDS, chaseRoll), emergency: true
        });
        world.events.push('siren');
        world.lastChaseAtPx = world.distancePx;
      } else {
        world.events.push('overtake');
      }
      /* The next gap is measured from the pass that actually
         launched, so blocked attempts never bunch two passes up. */
      let gapRoll;
      [gapRoll, s] = nextFloat01(s);
      const gapPx = o.passEveryMeters * TUNING.speed.pxPerMeter
        * (1 - o.passJitter / 2 + gapRoll * o.passJitter);
      world.nextPassAtPx = world.distancePx + gapPx;
    }
  }
  world.rngState = s;
}

/*
  The boost prompt: while a speeding car is bearing down from behind
  and a boost is banked, say so. Scooting forward moves the player
  past the spot where the pass and the traffic would squeeze
  together, which is exactly the moment Jason described. The app
  layer pulses the meter and flashes a callout; the rising edge also
  gets a sound and a rumble. The lane chevrons already say where the
  car is coming; this says the escape move is ready.
*/
function updateBoostHint(world) {
  const was = world.boostHint;
  world.boostHint = false;
  /* A banked nitro is usable below the fuel floor, which tuning.js
     calls the whole point of it: the moment you most need an escape
     is the moment you can least afford one. Checking fuel alone made
     the prompt go silent in exactly that case, while tryBoost and
     view.boostReady both said the boost was available. */
  const canBoost = world.fuel >= TUNING.boost.minFuel || world.nitroCharges > 0;
  if (!canBoost || isBoosting(world)) return;
  const o = TUNING.overtakers;
  const windowPx = o.spawnBehindPx + o.chaseGapPx;
  for (let i = 0; i < world.overtakers.length; i += 1) {
    const dy = world.overtakers[i].distPx - world.distancePx;
    if (dy > -windowPx && dy < -40) {
      world.boostHint = true;
      if (!was) world.events.push('boost_hint');
      return;
    }
  }
}

function checkOvertakerCollision(world) {
  if (world.invulnFrames > 0) return;
  const p = world.player;
  const px = laneCenterXPx(playerLaneFloat(p));
  for (let i = 0; i < world.overtakers.length; i += 1) {
    const ov = world.overtakers[i];
    const v = TRAFFIC_VARIANTS[ov.variant];
    const halfW = (p.hitbox.wPx + v.wPx) / 2 - TUNING.obstacles.hitboxShrinkPx;
    const halfH = (p.hitbox.hPx + v.hPx) / 2 - TUNING.obstacles.hitboxShrinkPx;
    const dy = ov.distPx - world.distancePx;
    if (Math.abs(dy) < halfH && Math.abs(px - laneCenterXPx(ov.lane)) < halfW) {
      lethalHit(world);
      return;
    }
  }
}
