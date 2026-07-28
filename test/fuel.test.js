/*
  Fuel spine behavior, headless. Traffic is pushed out of reach in
  this file (own process, no leakage) so fuel physics can be measured
  without crashes interfering.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, isBoosting, currentSpeedPxPerSec } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';

TUNING.obstacles.firstSpawnDistPx = 1e9;
/* Pin the run to tier zero so drain and speed stay constant; tier
   escalation is covered by the fairness suite. */
TUNING.tiers.splice(1);

function mkWorld() {
  return createWorld({ seed: 7, vehicle: VEHICLES.sports, environment: ENVIRONMENTS.city });
}

test('ignoring coffee ends the run by fuel in roughly 45 seconds', () => {
  const w = mkWorld();
  let frames = 0;
  while (w.status === 'running' && frames < 4000) {
    step(w, []);
    frames += 1;
  }
  assert.equal(w.status, 'dead');
  assert.equal(w.deathCause, 'fuel');
  const expected = (TUNING.fuel.max / TUNING.fuel.passiveDrainPerSec) * TUNING.logic.hz;
  assert.ok(Math.abs(frames - expected) < 5,
    `died at frame ${frames}, expected about ${Math.round(expected)}`);
});

test('boost raises speed for its duration and drains extra fuel', () => {
  const w = mkWorld();
  const base = currentSpeedPxPerSec(w);
  step(w, [{ type: 'boost' }]);
  assert.ok(isBoosting(w));
  assert.ok(currentSpeedPxPerSec(w) > base);
  const boostFrames = Math.round((TUNING.boost.durationMs / 1000) * TUNING.logic.hz);
  for (let i = 0; i < boostFrames; i += 1) step(w, []);
  assert.ok(!isBoosting(w), 'boost should have ended');
  assert.ok(currentSpeedPxPerSec(w) === base);
  const expectedBurn = (TUNING.fuel.passiveDrainPerSec + TUNING.fuel.boostDrainPerSec)
    * (TUNING.boost.durationMs / 1000);
  const drop = TUNING.fuel.max - w.fuel;
  assert.ok(Math.abs(drop - expectedBurn) < 1.5,
    `fuel dropped ${drop.toFixed(2)}, expected about ${expectedBurn.toFixed(2)}`);
});

test('boost is gated by minimum fuel', () => {
  const w = mkWorld();
  w.fuel = TUNING.boost.minFuel - 1;
  step(w, [{ type: 'boost' }]);
  assert.ok(!isBoosting(w));
});

test('boost presses during an active boost neither extend nor restart it', () => {
  const w = mkWorld();
  step(w, [{ type: 'boost' }]);
  step(w, [{ type: 'boost' }]);
  const boostFrames = Math.round((TUNING.boost.durationMs / 1000) * TUNING.logic.hz);
  /* timers tick at the top of the step, so after two steps exactly
     one decrement has happened since the boost was set */
  assert.equal(w.boostFramesLeft, boostFrames - 1);
});

test('a coffee cup refills a chunk, capped at the maximum', () => {
  const w = mkWorld();
  w.fuel = 50;
  w.pickups.push({ lane: 1, distPx: w.distancePx + 10, speedPxPerSec: 0 });
  step(w, []);
  assert.equal(w.pickups.length, 0, 'cup should be collected');
  assert.ok(w.fuel > 50 + TUNING.fuel.coffeeRefill - 1 && w.fuel <= 50 + TUNING.fuel.coffeeRefill);

  const w2 = mkWorld();
  w2.fuel = 95;
  w2.pickups.push({ lane: 1, distPx: w2.distancePx + 10, speedPxPerSec: 0 });
  step(w2, []);
  assert.equal(w2.fuel, TUNING.fuel.max);
});

test('a tap on the car\'s own lane triggers boost', () => {
  const w = mkWorld();
  step(w, [{ type: 'tapLane', lane: 1 }]);
  assert.ok(isBoosting(w));
});
