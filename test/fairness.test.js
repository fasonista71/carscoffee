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
import { createWorld, step, currentSpeedPxPerSec } from '../src/game/world.js';
import { TUNING, TRAFFIC_VARIANTS, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';

TUNING.fuel.passiveDrainPerSec = 0;
TUNING.hazards.rubble.fuelCost = 0; /* the oracle tests dodging, not fuel */

const SEED_COUNT = 100;
/* Tiers arrive every 2000 meters now, so proving every tier means a
   long haul: about 500 seconds of escalating driving per run. Every
   run climbs through all six tiers, so each tier's regime is covered
   by all 100 seeds, including the transitions between them. */
const FRAMES = 30000;
const LOOKAHEAD_SEC = 3.5;
const PREDICT_DT = 1 / 30;

/*
  Predicts meet windows for the rows ahead by replaying the world's
  own traffic rules forward in time: rows advance at their speeds and
  the rear to front clamp keeps them from closing inside the fair gap,
  exactly as world.advanceTraffic does.
*/
function predictWindows(world, vP, includeHazards) {
  const o = TUNING.obstacles;
  const pH = world.player.hitbox.hPx;
  const rows = world.rows.map((r) => ({
    dist: r.distPx, v: r.speedPxPerSec, lanes: r.lanes,
    minGapPrevPx: r.minGapPrevPx,
    halfH: (pH + r.maxHPx) / 2 - o.hitboxShrinkPx
  }));
  const windows = rows.map(() => null);
  let playerD = world.distancePx;
  for (let t = 0; t < LOOKAHEAD_SEC; t += PREDICT_DT) {
    playerD += vP * PREDICT_DT;
    for (let i = 0; i < rows.length; i += 1) rows[i].dist += rows[i].v * PREDICT_DT;
    for (let i = rows.length - 2; i >= 0; i -= 1) {
      const minGap = rows[i + 1].minGapPrevPx + TUNING.traffic.clampMarginPx;
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
  const result = windows.filter(Boolean);
  /* Overtakers approach from behind at constant speed; model their
     pass over the player as an event in their lane. */
  for (const ov of world.overtakers) {
    const rel = ov.speedPxPerSec - vP;
    if (rel <= 0) continue;
    const vv = TRAFFIC_VARIANTS[ov.variant];
    const halfH = (pH + vv.hPx) / 2 - o.hitboxShrinkPx;
    const dy = ov.distPx - world.distancePx;
    const tCenter = -dy / rel;
    if (tCenter > LOOKAHEAD_SEC) continue;
    /* skip overtakers that have effectively passed already */
    if (tCenter + halfH / rel <= 0.05) continue;
    const lanes = new Array(TUNING.road.laneCount).fill(false);
    lanes[ov.lane] = true;
    result.push({
      tStart: Math.max(0, tCenter - halfH / rel),
      tEnd: tCenter + halfH / rel,
      lanes
    });
  }
  /* A competent player also steers around static hazards. The
     cautious pass treats them as blocked; the exact doom pass does
     not, because rubble is a soft penalty and may sit in the only
     survivable lane by design. Seed 23 taught this: the oracle drove
     blind into rubble with a sports car closing in the same lane, and
     the slowdown compressed an escape window the plan relied on. */
  if (includeHazards) {
    for (const hz of world.hazards) {
      const hH = TUNING.hazards[hz.type].hitbox.hPx;
      const halfH = (pH + hH) / 2;
      const dy = hz.distPx - world.distancePx;
      const tCenter = dy / vP;
      if (tCenter - halfH / vP > LOOKAHEAD_SEC) continue;
      if (tCenter + halfH / vP <= 0.05) continue;
      const lanes = new Array(TUNING.road.laneCount).fill(false);
      lanes[hz.lane] = true;
      result.push({
        tStart: Math.max(0, tCenter - halfH / vP),
        tEnd: tCenter + halfH / vP,
        lanes
      });
    }
  }
  return result.sort((a, b) => a.tStart - b.tStart);
}

/*
  Returns -1, 0, or 1 (an immediate lane move), or 'doomed' when no
  surviving path exists.

  Time stepped reachability: time is quantized into tween length
  slots, each slot knows which lanes are blocked (from the predicted
  windows, inflated by marginSec on the cautious pass), and the DP
  walks lane transitions slot by slot. Unlike an event sequential
  search, this correctly allows changing lanes WHILE a long window is
  active in some other lane, which is exactly how you sidestep an
  overtaker. tweenScale below 1 models that a lane change clears a
  collision partway through the tween; used only by the final doom
  check, never by the cautious pass.
*/
function planFirstMove(world, marginSec, tweenScale = 1, includeHazards = false) {
  const p = world.player;
  const laneCount = TUNING.road.laneCount;
  const committed = p.tween ? p.tween.to : p.lane;
  const vP = currentSpeedPxPerSec(world);
  const slotSec = (world.laneTweenMs / 1000) * tweenScale;
  const slots = Math.max(2, Math.ceil(LOOKAHEAD_SEC / slotSec));

  const events = predictWindows(world, vP, includeHazards);
  const blocked = [];
  for (let s = 0; s < slots; s += 1) blocked.push(new Array(laneCount).fill(false));
  for (const ev of events) {
    const s0 = Math.max(0, Math.floor((ev.tStart - marginSec) / slotSec));
    const s1 = Math.min(slots - 1, Math.floor((ev.tEnd + marginSec) / slotSec));
    for (let s = s0; s <= s1; s += 1) {
      for (let l = 0; l < laneCount; l += 1) {
        if (ev.lanes[l]) blocked[s][l] = true;
      }
    }
  }

  /* Slots still consumed by the current tween: no new move may start. */
  const busySlots = p.tween
    ? Math.ceil(((p.tween.totalFrames - p.tween.frame) / TUNING.logic.hz) / slotSec)
    : 0;

  let cur = new Map([[committed, 0]]);
  for (let s = 1; s < slots; s += 1) {
    const next = new Map();
    for (const [lane, first] of cur) {
      for (let d = -1; d <= 1; d += 1) {
        const to = lane + d;
        if (to < 0 || to >= laneCount) continue;
        if (d !== 0 && s <= busySlots) continue;
        if (blocked[s][to]) continue;
        /* entering a new lane straddles it across the boundary, so it
           must also be safe in the slot the move starts in */
        if (d !== 0 && blocked[s - 1][to]) continue;
        const firstMove = first !== 0 ? first : (d !== 0 && s === busySlots + 1 ? d : 0);
        if (!next.has(to) || (next.get(to) !== 0 && firstMove === 0)) {
          next.set(to, firstMove);
        }
      }
    }
    if (next.size === 0) return 'doomed';
    cur = next;
  }
  let fallback = null;
  for (const firstMove of cur.values()) {
    if (firstMove === 0) return 0;
    if (fallback === null) fallback = firstMove;
  }
  return fallback === null ? 0 : fallback;
}

/* Quick gate: skip the full predictive plan while nothing is close,
   rows ahead or overtakers behind. */
function nearestThreatSec(world, vP) {
  const pH = world.player.hitbox.hPx;
  let nearest = Infinity;
  for (let i = 0; i < world.rows.length; i += 1) {
    const row = world.rows[i];
    const closing = vP - row.speedPxPerSec;
    if (closing <= 0) continue;
    const halfH = (pH + row.maxHPx) / 2;
    const dy = row.distPx - world.distancePx;
    if (dy < -halfH) continue;
    nearest = Math.max(0, (dy - halfH) / closing);
    break;
  }
  for (const ov of world.overtakers) {
    const rel = ov.speedPxPerSec - vP;
    if (rel <= 0) continue;
    const dy = ov.distPx - world.distancePx;
    const t = Math.max(0, (-dy - 60) / rel);
    if (t < nearest) nearest = t;
  }
  return nearest;
}

test('an oracle player survives the real simulation through every tier for every seed', () => {
  for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
    const world = createWorld({
      seed,
      vehicle: VEHICLES.sports,
      environment: ENVIRONMENTS.city
    });
    let topTier = 0;
    for (let f = 0; f < FRAMES; f += 1) {
      const intents = [];
      if (!world.player.tween) {
        const vP = currentSpeedPxPerSec(world);
        if (nearestThreatSec(world, vP) < 1.5) {
          const cautiousMargin = (TUNING.obstacles.reactionBufferMs / 1000) * 0.8;
          let move = planFirstMove(world, cautiousMargin, 1, true);
          if (move === 'doomed') move = planFirstMove(world, cautiousMargin);
          if (move === 'doomed') move = planFirstMove(world, 0, 0.75);
          assert.notEqual(move, 'doomed',
            `oracle doomed: seed ${seed} tier ${world.tier} frame ${f} at ${Math.round(world.distancePx)}px`);
          if (move !== 0) intents.push({ type: 'lane', dir: move });
        }
      }
      step(world, intents);
      topTier = Math.max(topTier, world.tier);
      assert.equal(world.status, 'running',
        `oracle died (${world.deathCause}): seed ${seed} tier ${world.tier} frame ${f} at ${Math.round(world.distancePx)}px`);
    }
    assert.equal(topTier, TUNING.tiers.length - 1,
      `run never reached the top tier: seed ${seed}`);
  }
});
