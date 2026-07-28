/*
  Simulation state and the fixed timestep step function. Deterministic:
  same seed plus same intent sequence gives an identical world, byte
  for byte. No browser globals, no wall clock, no ambient randomness.

  step() is called at exactly TUNING.logic.hz by the app loop, and by
  the headless tests directly.
*/

import { TUNING, TRAFFIC_VARIANTS } from './tuning.js';
import { seedToState } from './rng.js';
import { createPlayer, laneCenterXPx, playerLaneFloat } from './entities.js';
import { createGenState, nextRowSpec } from './generator.js';

export function createWorld({ seed, vehicle, environment }) {
  return {
    frame: 0,
    rngState: seedToState(seed),
    distancePx: 0,
    speedMultiplier: vehicle.baseSpeedMultiplier,
    laneTweenMs: vehicle.laneTweenMs,
    vehicleId: vehicle.id,
    environmentId: environment.id,
    status: 'running',
    deathCause: null,
    fuel: TUNING.fuel.max,
    boostFramesLeft: 0,
    player: createPlayer(vehicle),
    /* Traffic rows, ordered by distPx. A row is a lane pattern that
       moves as a unit at its own speed. */
    rows: [],
    /* Coffee cups. Tension cups ride with their row's speed, gap cups
       sit still. */
    pickups: [],
    pendingSpec: null,
    /* Generation gets its own PRNG stream, decorrelated from the
       reserved main stream by a fixed mix constant. */
    gen: createGenState(seedToState((seed ^ 0x5bd1e995) >>> 0))
  };
}

export function isBoosting(world) {
  return world.boostFramesLeft > 0;
}

export function currentSpeedPxPerSec(world) {
  const boost = isBoosting(world) ? TUNING.boost.speedMultiplier : 1;
  return TUNING.speed.basePxPerSec * world.speedMultiplier * boost;
}

function baseSpeedPxPerSec(world) {
  return TUNING.speed.basePxPerSec * world.speedMultiplier;
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
  subtracted. Hitboxes vary per vehicle now, so a truck behind a truck
  needs more room than two minis; that is why this takes the two rows'
  tallest hitboxes. Spawn spacing and the traffic clamp both derive
  from this, so the guarantee follows live tuning and boost
  automatically.
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
*/
export function step(world, intents) {
  world.frame += 1;
  /* After death the world freezes; only the frame counter advances.
     The app layer decides what to show and when to restart. */
  if (world.status !== 'running') return world;
  const dt = 1 / TUNING.logic.hz;
  for (let i = 0; i < intents.length; i += 1) {
    applyIntent(world, intents[i]);
  }
  advancePlayer(world);
  if (world.boostFramesLeft > 0) world.boostFramesLeft -= 1;
  world.distancePx += currentSpeedPxPerSec(world) * dt;
  advanceTraffic(world, dt);
  spawn(world);
  prune(world);
  drainFuel(world, dt);
  if (world.status !== 'running') return world;
  collectCoffee(world);
  checkCollision(world);
  return world;
}

function tweenTotalFrames(world) {
  return Math.max(1, Math.round((world.laneTweenMs / 1000) * TUNING.logic.hz));
}

function laneInRange(lane) {
  return lane >= 0 && lane < TUNING.road.laneCount;
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
  world.boostFramesLeft = Math.max(1, Math.round((TUNING.boost.durationMs / 1000) * TUNING.logic.hz));
}

function startTween(world, dir) {
  const p = world.player;
  const target = p.lane + dir;
  if (!laneInRange(target)) return;
  p.tween = { from: p.lane, to: target, frame: 0, totalFrames: tweenTotalFrames(world) };
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
     through a chain in one pass: a row may never close within the
     fair gap of the row ahead. This is what keeps variable speeds
     from ever assembling an unfair wall, and it also means rows never
     trade places, so the array stays ordered by distPx. */
  for (let i = rows.length - 2; i >= 0; i -= 1) {
    const minGap = fairMinGapForPairPx(world, rows[i].maxHPx, rows[i + 1].maxHPx)
      + TUNING.traffic.clampMarginPx;
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

function spawn(world) {
  if (!world.pendingSpec) world.pendingSpec = nextRowSpec(world.gen);
  const spec = world.pendingSpec;
  const last = world.rows.length > 0 ? world.rows[world.rows.length - 1] : null;
  const specMaxH = rowMaxHPx(spec.lanes, spec.variants);
  const fairMin = fairMinGapForPairPx(world, last ? last.maxHPx : specMaxH, specMaxH);
  const gapPx = fairMin * (1 + spec.gapJitter * (TUNING.obstacles.gapJitterMax - 1));
  const at = last ? last.distPx + gapPx : Math.max(TUNING.obstacles.firstSpawnDistPx, world.distancePx + gapPx);
  if (world.distancePx + TUNING.obstacles.horizonPx < at) return;
  const row = {
    distPx: at,
    speedPxPerSec: spec.speedFrac * baseSpeedPxPerSec(world),
    lanes: spec.lanes,
    variants: spec.variants,
    maxHPx: specMaxH
  };
  world.rows.push(row);
  if (spec.coffee) addCoffee(world, spec.coffee, row, gapPx);
  world.pendingSpec = null;
}

function addCoffee(world, coffee, row, gapPx) {
  const laneCount = TUNING.road.laneCount;
  if (coffee.kind === 'tension') {
    /* In tension: either the single forced open lane of a double row
       (the safe line and the fueled line coincide, and later diverge
       once slicks arrive in step 7), or the lane directly beside the
       blocked car of a single row. Rides with the row. */
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
    world.pickups.push({ lane, distPx: row.distPx, speedPxPerSec: row.speedPxPerSec });
  } else {
    /* Free cup, mid gap, and only in a lane that is open in the row
       it precedes, so a cup never lures the player into a blocked
       lane. Sits still. */
    const open = [];
    for (let l = 0; l < laneCount; l += 1) {
      if (!row.lanes[l]) open.push(l);
    }
    const lane = open[Math.min(open.length - 1, Math.floor(coffee.laneRoll * open.length))];
    world.pickups.push({ lane, distPx: row.distPx - gapPx * 0.5, speedPxPerSec: 0 });
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
}

function drainFuel(world, dt) {
  /* Passive drain will scale with speed tiers in build step 9; for
     now there is one tier. */
  const rate = TUNING.fuel.passiveDrainPerSec + (isBoosting(world) ? TUNING.fuel.boostDrainPerSec : 0);
  world.fuel -= rate * dt;
  if (world.fuel <= 0) {
    world.fuel = 0;
    world.status = 'dead';
    world.deathCause = 'fuel';
  }
}

function collectCoffee(world) {
  const p = world.player;
  const c = TUNING.coffee;
  const px = laneCenterXPx(playerLaneFloat(p));
  const halfW = (p.hitbox.wPx + c.hitbox.wPx) / 2 + c.pickupSlopPx;
  const halfH = (p.hitbox.hPx + c.hitbox.hPx) / 2 + c.pickupSlopPx;
  for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
    const cup = world.pickups[i];
    const dy = cup.distPx - world.distancePx;
    if (dy < -halfH || dy > halfH) continue;
    if (Math.abs(px - laneCenterXPx(cup.lane)) < halfW) {
      world.pickups.splice(i, 1);
      world.fuel = Math.min(TUNING.fuel.max, world.fuel + TUNING.fuel.coffeeRefill);
    }
  }
}

/*
  Collision uses the interpolated lane position, so a car mid tween is
  hit where it visually is. A row's distPx equals world.distancePx
  exactly when it draws level with the player.
*/
function checkCollision(world) {
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
        world.status = 'dead';
        world.deathCause = 'crash';
        return;
      }
    }
  }
}
