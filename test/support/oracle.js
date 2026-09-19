/*
  The oracle: a player good enough to prove the road is fair.

  It drives the REAL simulation. Each planning pass predicts upcoming
  meet windows by simulating the rows forward with the same traffic
  clamp rule the world uses (constant speed extrapolation is wrong: it
  predicts bunching the clamp prevents), then searches the lane grid
  for a surviving path, one lane change per tween, body extents
  included. Moves needed before the first upcoming window are executed;
  later ones are re planned when their time comes.

  This lived inside fairness.test.js, which is where it is the gate.
  It is out here because determinism.test.js needs a pilot that can
  actually drive: its scripted inputs crashed the car at frame 466 of
  an advertised 10000, so every system this release rebuilt sat outside
  the hash. A driver that survives is the difference between hashing a
  run and hashing a wreck.

  Not a *.test.js file, so the runner does not pick it up as a suite.
*/

import { currentSpeedPxPerSec } from '../../src/game/world.js';
import { TUNING, TRAFFIC_VARIANTS } from '../../src/game/tuning.js';

const LOOKAHEAD_SEC = 3.5;
const PREDICT_DT = 1 / 30;

/*
  Predicts meet windows for the rows ahead by replaying the world's
  own traffic rules forward in time: rows advance at their speeds and
  the rear to front clamp keeps them from closing inside the fair gap,
  exactly as world.advanceTraffic does.
*/
export function predictWindows(world, vP, includeHazards) {
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
export function planFirstMove(world, marginSec, tweenScale = 1, includeHazards = false) {
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
export function nearestThreatSec(world, vP) {
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

/*
  The move the oracle makes this frame: -1, 0, 1, or 'doomed' when no
  surviving path exists on the exact budget. Three passes, cheapest
  first: cautious and hazard aware, then cautious without hazards
  (rubble is a soft penalty and may sit in the only survivable lane by
  design), then exact, at the reduced tween scale that models a lane
  change clearing a collision partway through.

  'doomed' is the fairness gate's business. A caller that only wants a
  pilot can read it as "hold this lane".
*/
export function oracleMove(world) {
  if (world.player.tween) return 0;
  const vP = currentSpeedPxPerSec(world);
  if (nearestThreatSec(world, vP) >= 1.5) return 0;
  const cautiousMargin = (TUNING.obstacles.reactionBufferMs / 1000) * 0.8;
  let move = planFirstMove(world, cautiousMargin, 1, true);
  if (move === 'doomed') move = planFirstMove(world, cautiousMargin);
  if (move === 'doomed') move = planFirstMove(world, 0, 0.75);
  return move;
}

/* The same thing as an intent list, for a caller that just wants to
   drive. */
export function oracleIntents(world) {
  const move = oracleMove(world);
  return (move === 0 || move === 'doomed') ? [] : [{ type: 'lane', dir: move }];
}
