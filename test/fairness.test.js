/*
  The solvability gate from brief section 4, upgraded for moving
  traffic: an oracle player drives the REAL simulation. Each planning
  pass predicts upcoming meet windows by simulating the rows forward
  with the same traffic clamp rule the world uses (constant speed
  extrapolation is wrong: it predicts bunching the clamp prevents),
  then searches the lane grid for a surviving path, one lane change
  per tween, body extents included. The oracle only executes moves
  needed before the first upcoming window; later moves are re planned
  when their time comes.

  The assertion is twofold: the planner must never see zero
  surviving lanes on the exact budget, and the oracle must never die
  in the real simulation. 100 seeds at six speed multipliers, spanning
  the current base speed through what future tiers will reach.

  Each test file runs in its own process under the node test runner,
  so muting fuel here cannot leak into other files. The oracle tests
  dodging, not fuel management.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, currentSpeedPxPerSec, fairMinGapForPairPx } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';

TUNING.fuel.passiveDrainPerSec = 0;

const SPEED_MULTIPLIERS = [1, 1.27, 1.53, 1.87, 2.27, 2.67];
const SEED_COUNT = 100;
const FRAMES = 6000; /* 100 seconds of driving per run */
const LOOKAHEAD_SEC = 3.5;
const PREDICT_DT = 1 / 30;

/*
  Predicts meet windows for the rows ahead by replaying the world's
  own traffic rules forward in time: rows advance at their speeds and
  the rear to front clamp keeps them from closing inside the fair gap,
  exactly as world.advanceTraffic does.
*/
function predictWindows(world, vP) {
  const o = TUNING.obstacles;
  const pH = world.player.hitbox.hPx;
  const rows = world.rows.map((r) => ({
    dist: r.distPx, v: r.speedPxPerSec, lanes: r.lanes,
    halfH: (pH + r.maxHPx) / 2 - o.hitboxShrinkPx
  }));
  const windows = rows.map(() => null);
  let playerD = world.distancePx;
  for (let t = 0; t < LOOKAHEAD_SEC; t += PREDICT_DT) {
    playerD += vP * PREDICT_DT;
    for (let i = 0; i < rows.length; i += 1) rows[i].dist += rows[i].v * PREDICT_DT;
    for (let i = rows.length - 2; i >= 0; i -= 1) {
      const minGap = fairMinGapForPairPx(world, world.rows[i].maxHPx, world.rows[i + 1].maxHPx)
        + TUNING.traffic.clampMarginPx;
      if (rows[i + 1].dist - rows[i].dist < minGap && rows[i].v > rows[i + 1].v) {
        rows[i].v = rows[i + 1].v;
      }
    }
    for (let i = 0; i < rows.length; i += 1) {
      const dy = rows[i].dist - playerD;
      if (dy >= -rows[i].halfH && dy <= rows[i].halfH) {
        if (!windows[i]) windows[i] = { tStart: t, tEnd: t + PREDICT_DT, lanes: rows[i].lanes };
        else windows[i].tEnd = t + PREDICT_DT;
      }
    }
  }
  return windows.filter(Boolean).sort((a, b) => a.tStart - b.tStart);
}

/*
  Returns -1, 0, or 1 (an immediate lane move), or 'doomed' when no
  surviving path exists. marginSec shrinks per event budgets so the
  cautious pass commits to moves early instead of procrastinating the
  fairness slack away; doom is only asserted on the exact budget.
*/
function planFirstMove(world, marginSec) {
  const p = world.player;
  const committed = p.tween ? p.tween.to : p.lane;
  const vP = currentSpeedPxPerSec(world);
  const tweenSec = world.laneTweenMs / 1000;

  const events = predictWindows(world, vP);
  let prevEnd = p.tween ? (p.tween.totalFrames - p.tween.frame) / TUNING.logic.hz : 0;
  let states = new Map([[committed, 0]]);
  for (let e = 0; e < events.length; e += 1) {
    const ev = events[e];
    const moves = Math.max(0, Math.floor((ev.tStart - prevEnd - marginSec) / tweenSec));
    const next = new Map();
    for (const [lane, first] of states) {
      for (let to = 0; to < TUNING.road.laneCount; to += 1) {
        if (ev.lanes[to]) continue;
        if (Math.abs(to - lane) > moves) continue;
        /* Only a move needed before the FIRST upcoming window is
           immediate; later moves are issued by replanning when their
           time comes. Executing them early drives into the near row. */
        const firstMove = first !== 0 ? first : (e === 0 ? Math.sign(to - lane) : 0);
        if (!next.has(to) || (next.get(to) !== 0 && firstMove === 0)) {
          next.set(to, firstMove);
        }
      }
    }
    if (next.size === 0) return 'doomed';
    states = next;
    prevEnd = Math.max(prevEnd, ev.tEnd);
  }
  let fallback = null;
  for (const firstMove of states.values()) {
    if (firstMove === 0) return 0;
    if (fallback === null) fallback = firstMove;
  }
  return fallback === null ? 0 : fallback;
}

/* Quick gate: skip the full predictive plan while the nearest row is
   comfortably far. Anything beyond the gate is even farther. */
function nearestRowSec(world, vP) {
  const pH = world.player.hitbox.hPx;
  for (let i = 0; i < world.rows.length; i += 1) {
    const row = world.rows[i];
    const closing = vP - row.speedPxPerSec;
    if (closing <= 0) continue;
    const halfH = (pH + row.maxHPx) / 2;
    const dy = row.distPx - world.distancePx;
    if (dy < -halfH) continue;
    return Math.max(0, (dy - halfH) / closing);
  }
  return Infinity;
}

test('an oracle player survives the real simulation for every seed at every speed', () => {
  for (const mult of SPEED_MULTIPLIERS) {
    for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
      const world = createWorld({
        seed,
        vehicle: VEHICLES.sports,
        environment: ENVIRONMENTS.city
      });
      world.speedMultiplier = mult;
      for (let f = 0; f < FRAMES; f += 1) {
        const intents = [];
        if (!world.player.tween) {
          const vP = currentSpeedPxPerSec(world);
          if (nearestRowSec(world, vP) < 1.5) {
            const cautiousMargin = (TUNING.obstacles.reactionBufferMs / 1000) * 0.8;
            let move = planFirstMove(world, cautiousMargin);
            if (move === 'doomed') move = planFirstMove(world, 0);
            assert.notEqual(move, 'doomed',
              `oracle doomed: seed ${seed} mult ${mult} frame ${f} at ${Math.round(world.distancePx)}px`);
            if (move !== 0) intents.push({ type: 'lane', dir: move });
          }
        }
        step(world, intents);
        assert.equal(world.status, 'running',
          `oracle died (${world.deathCause}): seed ${seed} mult ${mult} frame ${f} at ${Math.round(world.distancePx)}px`);
      }
    }
  }
});
