/*
  Simulation state and the fixed timestep step function. Deterministic:
  same seed plus same intent sequence gives an identical world, byte
  for byte. No browser globals, no wall clock, no ambient randomness.

  step() is called at exactly TUNING.logic.hz by the app loop, and by
  the headless tests directly.
*/

import { TUNING, TRAFFIC_VARIANTS } from './tuning.js';
import { seedToState, nextFloat01 } from './rng.js';
import { createPlayer, laneCenterXPx, playerLaneFloat } from './entities.js';
import { createGenState, nextRowSpec } from './generator.js';

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
    /* Fast sports cars passing from behind, past tier 1. */
    overtakers: [],
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
  const v = currentSpeedPxPerSec(world);
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
  cullOvertakenSlicks(world);
  spawn(world);
  updateOvertakers(world, dt);
  maybeSpawnOvertaker(world);
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
     ignored. Gated only by minimum fuel; no separate cooldown. */
  if (world.boostFramesLeft > 0) return;
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
}

function openMaskOf(lanes) {
  let m = 0;
  for (let i = 0; i < lanes.length; i += 1) {
    if (!lanes[i]) m |= 1 << i;
  }
  return m;
}

function spawn(world) {
  const cfg = tierConfig(world);
  if (!world.pendingSpec) world.pendingSpec = nextRowSpec(world.gen, cfg);
  let spec = world.pendingSpec;
  const t = TUNING.traffic;
  const last = world.rows.length > 0 ? world.rows[world.rows.length - 1] : null;

  /* A row may pack tightly behind the previous one only if EVERY
     current corridor lane stays open through it. Then a player
     driving any corridor lane survives the whole cluster without
     needing a lane change there is no room to make. Anything else
     takes a full fair gap, which allows a worst case crossing.
     When a cluster wants to continue but the rolled pattern is
     incompatible, reroll a bounded number of times; this is what
     keeps the road crowded. */
  const wantTight = last !== null
    && world.clusterLen < t.clusterMaxLen
    && spec.clusterRoll < cfg.clusterChance;
  if (wantTight) {
    let rerolls = 0;
    while (rerolls < t.clusterRerolls
        && (openMaskOf(spec.lanes) & world.corridorMask) !== world.corridorMask) {
      spec = nextRowSpec(world.gen, cfg);
      rerolls += 1;
    }
  }
  const specMaxH = rowMaxHPx(spec.lanes, spec.variants);
  const openMask = openMaskOf(spec.lanes);
  const keepsCorridor = (openMask & world.corridorMask) === world.corridorMask;
  const tight = wantTight && keepsCorridor;

  let minGapPrevPx;
  let gapPx;
  if (tight) {
    minGapPrevPx = (last.maxHPx + specMaxH) / 2 + t.tightExtraGapPx;
    gapPx = minGapPrevPx * (1 + spec.tightJitter * 0.35);
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
  const row = {
    distPx: at,
    speedPxPerSec: spec.speedFrac * baseSpeedPxPerSec(world),
    lanes: spec.lanes,
    variants: spec.variants,
    maxHPx: specMaxH,
    minGapPrevPx
  };
  world.rows.push(row);
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
     they precede, offset from where cups and rubble sit. */
  if (!tight && last !== null && !hazardPlaced
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
  world.pendingSpec = null;
}

/* Room a forced slide needs before the next row: slide lock plus two
   lane changes plus reaction time at current speed, plus body
   extents. */
function slickRecoveryPx(world, rowMaxH) {
  const hz = TUNING.hazards;
  const v = currentSpeedPxPerSec(world);
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
    world.hazards.push({ type, lane, distPx: at });
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
    + (isBoosting(world) ? TUNING.fuel.boostDrainPerSec : 0);
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
    const box = item.kind === 'heart' ? TUNING.lives.hitbox : c.hitbox;
    const halfW = (p.hitbox.wPx + box.wPx) / 2 + c.pickupSlopPx;
    const halfH = (p.hitbox.hPx + box.hPx) / 2 + c.pickupSlopPx;
    const dy = item.distPx - world.distancePx;
    if (dy < -halfH || dy > halfH) continue;
    if (Math.abs(px - laneCenterXPx(item.lane)) < halfW) {
      world.pickups.splice(i, 1);
      if (item.kind === 'heart') {
        world.hearts = Math.min(TUNING.lives.max, world.hearts + 1);
        world.events.push('heart_pickup');
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
      world.fuel -= hz.rubble.fuelCost;
      world.slowFrames = Math.max(world.slowFrames, msToFrames(hz.rubble.slowMs));
      world.boostFramesLeft = 0;
      world.events.push('rubble_hit');
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
  const maxHalfH = (p.hitbox.hPx + TRAFFIC_MAX_H_PX) / 2;
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
      if (Math.abs(dy) < halfH && Math.abs(px - laneCenterXPx(lane)) < halfW) {
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
const OVERTAKER_VARIANT_IDS = ['lambo', 'lambo2', 'camaro', 'camaro2',
  'mustang2', 'mustang3', 'challenger2', 'challenger3']
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

function overtakerLaneClear(world, lane, vO) {
  const o = TUNING.overtakers;
  for (let i = 0; i < world.rows.length; i += 1) {
    const dy = world.rows[i].distPx - world.distancePx;
    if (dy < -o.clearLanePx) continue;
    if (dy > o.clearLanePx) break;
    if (world.rows[i].lanes[lane]) return false;
  }
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
  const tMeetMin = o.spawnBehindPx / Math.max(1, vO - vSlow);
  const tMeetMax = o.spawnBehindPx / Math.max(1, vO - vFast);
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
  if (world.tier < o.minTier) return;
  if (world.overtakers.length >= o.maxActive) return;
  if (world.frame % TUNING.logic.hz !== 0) return;
  let s = world.rngState;
  let roll;
  [roll, s] = nextFloat01(s);
  if (roll < o.chancePerSec) {
    let laneRoll;
    let speedRoll;
    let variantRoll;
    [laneRoll, s] = nextFloat01(s);
    [speedRoll, s] = nextFloat01(s);
    [variantRoll, s] = nextFloat01(s);
    /* Edge lanes only. Crossing between corridors always transits the
       middle lane, so a middle lane overtaker can wall off the only
       path exactly when a corridor shift demands it. Edges never
       carry transit. */
    const lane = laneRoll < 0.5 ? 0 : TUNING.road.laneCount - 1;
    const vO = baseSpeedPxPerSec(world) * (o.speedMultMin + speedRoll * (o.speedMultMax - o.speedMultMin));
    if (OVERTAKER_VARIANT_IDS.length > 0 && overtakerLaneClear(world, lane, vO)) {
      const variant = OVERTAKER_VARIANT_IDS[Math.min(OVERTAKER_VARIANT_IDS.length - 1,
        Math.floor(variantRoll * OVERTAKER_VARIANT_IDS.length))];
      world.overtakers.push({ lane, distPx: world.distancePx - o.spawnBehindPx, speedPxPerSec: vO, variant });
      world.events.push('overtake');
    }
  }
  world.rngState = s;
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
