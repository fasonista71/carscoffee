/*
  Regression guards for track composition, run against the real
  simulation with a ghost car (deaths reverted so sampling continues):
  - The center lane must be blocked comparably often to the edges, so
    camping the middle cannot pay. This locks in the lane weighting.
  - Slicks and rubble must both actually occur. This locks in the
    slick gap claiming fix; slicks silently never spawning is exactly
    the bug this catches.
  - Every coffee cup sits still. One movement treatment, by request.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';

TUNING.fuel.passiveDrainPerSec = 0;
TUNING.hazards.rubble.fuelCost = 0;

test('center lane blocks, hazard presence, and static cups across seeds', () => {
  const laneBlocks = [0, 0, 0];
  let slicks = 0;
  let rubbles = 0;
  for (let seed = 1; seed <= 10; seed += 1) {
    const w = createWorld({ seed, vehicle: VEHICLES.coupe, environment: ENVIRONMENTS.city });
    let countedTo = 0;
    const seenHazards = new Set();
    for (let f = 0; f < 9000; f += 1) {
      step(w, []);
      if (w.status !== 'running') {
        w.status = 'running';
        w.deathCause = null;
      }
      for (const row of w.rows) {
        if (row.distPx > countedTo) {
          for (let l = 0; l < 3; l += 1) {
            if (row.lanes[l]) laneBlocks[l] += 1;
          }
        }
      }
      if (w.rows.length > 0) {
        countedTo = Math.max(countedTo, w.rows[w.rows.length - 1].distPx);
      }
      for (const hz of w.hazards) {
        const key = Math.round(hz.distPx) + ':' + hz.lane;
        if (!seenHazards.has(key)) {
          seenHazards.add(key);
          if (hz.type === 'slick') slicks += 1;
          else rubbles += 1;
        }
      }
      for (const cup of w.pickups) {
        assert.equal(cup.speedPxPerSec, 0, 'every cup must sit still');
      }
    }
  }
  const edgeMax = Math.max(laneBlocks[0], laneBlocks[2]);
  assert.ok(laneBlocks[1] >= edgeMax * 0.75,
    `center lane too calm: blocks per lane ${laneBlocks.join(', ')}`);
  assert.ok(slicks >= 5, `slicks barely spawn: ${slicks}`);
  assert.ok(rubbles >= 5, `rubble barely spawns: ${rubbles}`);
});
