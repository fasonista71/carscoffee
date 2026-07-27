/*
  Simulation state and the fixed timestep step function. Deterministic:
  same seed plus same intent sequence gives an identical world, byte
  for byte. No browser globals, no wall clock, no ambient randomness.

  step() is called at exactly TUNING.logic.hz by the app loop, and by
  the headless tests directly.
*/

import { TUNING } from './tuning.js';
import { seedToState } from './rng.js';
import { createPlayer } from './entities.js';

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
    player: createPlayer(vehicle)
  };
}

export function currentSpeedPxPerSec(world) {
  return TUNING.speed.basePxPerSec * world.speedMultiplier;
}

export function distanceMeters(world) {
  return world.distancePx / TUNING.speed.pxPerMeter;
}

/*
  intents: an array of { type: 'lane', dir: -1 | 1 } or { type: 'boost' }
  drained by the caller since the previous logic frame, in arrival order.
*/
export function step(world, intents) {
  world.frame += 1;
  for (let i = 0; i < intents.length; i += 1) {
    applyIntent(world, intents[i]);
  }
  advancePlayer(world);
  world.distancePx += currentSpeedPxPerSec(world) / TUNING.logic.hz;
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
