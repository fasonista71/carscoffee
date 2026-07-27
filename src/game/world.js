/*
  Simulation state and the fixed timestep step function. Deterministic:
  same seed plus same intent sequence gives an identical world, byte
  for byte. No browser globals, no wall clock, no ambient randomness.

  step() is called at exactly TUNING.logic.hz by the app loop, and by
  the headless tests directly.
*/

import { TUNING } from './tuning.js';
import { seedToState } from './rng.js';
import { createPlayer, laneCenterXPx, playerLaneFloat } from './entities.js';
import { createGenState, generateAhead } from './generator.js';

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
    player: createPlayer(vehicle),
    obstacles: [],
    /* Generation gets its own PRNG stream, decorrelated from the
       reserved main stream by a fixed mix constant. */
    gen: createGenState(seedToState((seed ^ 0x5bd1e995) >>> 0))
  };
}

export function currentSpeedPxPerSec(world) {
  return TUNING.speed.basePxPerSec * world.speedMultiplier;
}

export function distanceMeters(world) {
  return world.distancePx / TUNING.speed.pxPerMeter;
}

/*
  intents drained by the caller since the previous logic frame, in
  arrival order. Three kinds:
    { type: 'lane', dir: -1 | 1 }   relative move (keys, swipes, thirds)
    { type: 'tapLane', lane: n }    positional tap on a lane
    { type: 'boost' }               no op until build step 6
*/
export function step(world, intents) {
  world.frame += 1;
  /* After death the world freezes; only the frame counter advances.
     The app layer decides what to show and when to restart. */
  if (world.status !== 'running') return world;
  for (let i = 0; i < intents.length; i += 1) {
    applyIntent(world, intents[i]);
  }
  advancePlayer(world);
  world.distancePx += currentSpeedPxPerSec(world) / TUNING.logic.hz;
  spawnAhead(world);
  pruneBehind(world);
  checkCollision(world);
  return world;
}

function spawnAhead(world) {
  const rows = generateAhead(world.gen, {
    speedPxPerSec: currentSpeedPxPerSec(world),
    laneTweenMs: world.laneTweenMs,
    toDistPx: world.distancePx + TUNING.obstacles.horizonPx
  });
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    for (let lane = 0; lane < TUNING.road.laneCount; lane += 1) {
      if (row.lanes[lane]) {
        world.obstacles.push({
          kind: 'stalled',
          lane,
          distPx: row.distPx,
          variant: row.variants[lane]
        });
      }
    }
  }
}

function pruneBehind(world) {
  const cutoff = world.distancePx - TUNING.obstacles.despawnBehindPx;
  while (world.obstacles.length > 0 && world.obstacles[0].distPx < cutoff) {
    world.obstacles.shift();
  }
}

/*
  Collision uses the interpolated lane position, so a car mid tween is
  hit where it visually is, not where it logically departed from or is
  headed to. Distances along the road are compared directly: an
  obstacle's distPx equals world.distancePx exactly when it draws level
  with the player.
*/
function checkCollision(world) {
  const p = world.player;
  const o = TUNING.obstacles;
  const px = laneCenterXPx(playerLaneFloat(p));
  const halfW = (p.hitbox.wPx + o.stalledHitbox.wPx) / 2 - o.hitboxShrinkPx;
  const halfH = (p.hitbox.hPx + o.stalledHitbox.hPx) / 2 - o.hitboxShrinkPx;
  for (let i = 0; i < world.obstacles.length; i += 1) {
    const ob = world.obstacles[i];
    const dy = ob.distPx - world.distancePx;
    if (dy > halfH) break; /* obstacles are ordered by distPx */
    if (dy < -halfH) continue;
    if (Math.abs(px - laneCenterXPx(ob.lane)) < halfW) {
      world.status = 'dead';
      return;
    }
  }
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
       lane itself means boost (a no op until build step 6). */
    const committed = p.tween ? p.tween.to : p.lane;
    const diff = intent.lane - committed;
    if (diff !== 0) {
      const dir = diff > 0 ? 1 : -1;
      if (!p.tween) {
        startTween(world, dir);
      } else if (p.queuedDir === 0) {
        p.queuedDir = dir;
      }
    }
  } else if (intent.type === 'boost') {
    /* Boost is wired up in build step 6. Ignored for now so the input
       path exists end to end. */
  }
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
