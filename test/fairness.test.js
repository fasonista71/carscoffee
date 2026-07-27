/*
  The solvability gate from brief section 4: run the generator across
  100 seeds at six speeds (the current base speed through the range
  future tiers will reach) and assert with a forward search over the
  lane grid that a survivable path exists in every case.

  The search model: the player changes at most one lane per tween
  duration, needs reactionBufferMs before acting on a row, and must
  occupy an open lane at the moment each row passes. This matches the
  conservative assumptions the generator spaces rows with; if either
  side drifts, this test is what catches it.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenState, generateAhead } from '../src/game/generator.js';
import { seedToState } from '../src/game/rng.js';
import { TUNING } from '../src/game/tuning.js';

const SPEEDS_PX_PER_SEC = [150, 190, 230, 280, 340, 400];
const SEED_COUNT = 100;
const TRACK_LENGTH_PX = 30000;

function findUnsurvivablePoint(rows, speed, laneTweenMs) {
  const tweenPx = speed * (laneTweenMs / 1000);
  const reactionPx = speed * (TUNING.obstacles.reactionBufferMs / 1000);
  let reachable = new Set([1]); /* runs start in the center lane */
  let prevDist = 0;
  for (const row of rows) {
    const gap = row.distPx - prevDist;
    const moves = Math.max(0, Math.floor((gap - reactionPx) / tweenPx));
    const next = new Set();
    for (const from of reachable) {
      for (let to = 0; to < TUNING.road.laneCount; to += 1) {
        if (!row.lanes[to] && Math.abs(to - from) <= moves) next.add(to);
      }
    }
    if (next.size === 0) return row.distPx;
    reachable = next;
    prevDist = row.distPx;
  }
  return null;
}

test('generator produces a survivable path for every seed at every speed', () => {
  for (const speed of SPEEDS_PX_PER_SEC) {
    for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
      const gen = createGenState(seedToState(seed));
      const rows = generateAhead(gen, {
        speedPxPerSec: speed,
        laneTweenMs: TUNING.movement.laneTweenMs,
        toDistPx: TRACK_LENGTH_PX
      });
      assert.ok(rows.length > 40, `track too sparse: seed ${seed} speed ${speed}`);
      for (const row of rows) {
        assert.ok(row.lanes.some((blocked) => !blocked),
          `a row blocks every lane: seed ${seed} speed ${speed} at ${row.distPx}`);
      }
      const failAt = findUnsurvivablePoint(rows, speed, TUNING.movement.laneTweenMs);
      assert.equal(failAt, null,
        `no survivable path: seed ${seed} speed ${speed} at ${failAt}`);
    }
  }
});
