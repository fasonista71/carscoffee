/*
  The solvability gate from brief section 4, upgraded for moving
  traffic. The oracle itself lives in support/oracle.js, because
  determinism.test.js needs the same driver; this file is where it is
  the gate.

  The assertion is twofold: the planner must never see zero
  surviving lanes on the exact budget, and the oracle must never be
  hit at all in the real simulation, not merely survive: hearts have to
  come home untouched. 100 seeds, each climbing through every tier in
  TUNING.tiers, so the speed regimes are covered by all of them.

  The oracle tests dodging, not fuel management, so its tank is topped
  up every frame rather than the drain being turned off for everyone.
*/

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';
import { oracleMove } from './support/oracle.js';

describe('fairness', () => {
  const SEED_COUNT = 100;
  /* Tiers arrive every 2000 meters now, so proving every tier means a
     long haul: about 500 seconds of escalating driving per run. Every
     run climbs through all of TUNING.tiers, so each tier's regime is
     covered by all 100 seeds, including the transitions between them. */
  const FRAMES = 30000;
  test('an oracle player survives the real simulation through every tier for every seed', () => {
    for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
      const world = createWorld({
        seed,
        vehicle: VEHICLES.coupe,
        environment: ENVIRONMENTS.city
      });
      let topTier = 0;
      for (let f = 0; f < FRAMES; f += 1) {
        const move = oracleMove(world);
        /* The gate: the planner must never see zero surviving lanes on
           the exact budget. */
        assert.notEqual(move, 'doomed',
          `oracle doomed: seed ${seed} tier ${world.tier} frame ${f} at ${Math.round(world.distancePx)}px`);
        const intents = move === 0 ? [] : [{ type: 'lane', dir: move }];
        step(world, intents);
        /*
          The oracle tests dodging, not fuel, so its tank is topped up
          every frame. This used to be a mute of the drain written into
          the shared TUNING at module scope: the one file that decides
          whether the road is survivable, quietly reshaping the config
          another file then measured.
        */
        world.fuel = TUNING.fuel.max;
        topTier = Math.max(topTier, world.tier);
        /*
          Hearts, not just a pulse. lethalHit only ends a run on the last
          one, so asserting "still running" would have let the oracle take
          two unavoidable hits per seed and still call the road fair.
          Measured across all 100 seeds the real number is zero, so this
          costs nothing today and catches the first regression that starts
          spending the oracle's hearts. One branch rather than two asserts
          because this runs three million times.
        */
        if (world.status !== 'running' || world.hearts !== TUNING.lives.start) {
          assert.fail(`oracle hit (${world.status}, ${world.deathCause}, ${world.hearts} hearts): `
            + `seed ${seed} tier ${world.tier} frame ${f} at ${Math.round(world.distancePx)}px`);
        }
      }
      assert.equal(topTier, TUNING.tiers.length - 1,
        `run never reached the top tier: seed ${seed}`);
    }
  });
});
