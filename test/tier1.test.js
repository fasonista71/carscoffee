/*
  Regression cover for the Tier 1 simulation fixes. Traffic is pushed
  out of reach and tiers pinned (own process, no leakage); hazards and
  overtakers are injected by hand.

  Both of these were found by the preflight audit and both are the
  same shape: a second place that changes the same state as the
  canonical one, without doing what the canonical one does.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';

TUNING.obstacles.firstSpawnDistPx = 1e9;
TUNING.tiers.splice(1);
TUNING.fuel.passiveDrainPerSec = 0;

function mkWorld() {
  return createWorld({ seed: 11, vehicle: VEHICLES.coupe, environment: ENVIRONMENTS.city });
}

/* Park an overtaker in the hint window behind the player. */
function armOvertaker(w) {
  w.overtakers.push({
    lane: w.player.lane,
    distPx: w.distancePx - 120,
    speedPxPerSec: 400,
    variant: 0,
    emergency: false
  });
}

test('the boost prompt fires on a banked nitro below the fuel floor', () => {
  const w = mkWorld();
  w.fuel = TUNING.boost.minFuel - 1;
  w.nitroCharges = 1;
  armOvertaker(w);
  step(w, []);
  assert.equal(w.boostHint, true,
    'a banked nitro is usable below the floor, so the prompt must fire');
  assert.ok(w.events.includes('boost_hint'), 'and the rising edge is announced');
});

test('the boost prompt stays silent below the floor with no nitro', () => {
  const w = mkWorld();
  w.fuel = TUNING.boost.minFuel - 1;
  w.nitroCharges = 0;
  armOvertaker(w);
  step(w, []);
  assert.equal(w.boostHint, false, 'nothing to spend, so nothing to promise');
});

test('the boost prompt still fires on fuel alone', () => {
  const w = mkWorld();
  w.fuel = TUNING.fuel.max;
  w.nitroCharges = 0;
  armOvertaker(w);
  step(w, []);
  assert.equal(w.boostHint, true);
});

test('a rubble hit that crosses the low fuel line fires fuel_low', () => {
  const w = mkWorld();
  const cost = TUNING.hazards.rubble.fuelCost;
  /* Land just above the threshold, so the hit is what crosses it. */
  w.fuel = TUNING.fuel.lowThreshold + cost - 1;
  w.hazards.push({ type: 'rubble', lane: w.player.lane, distPx: w.distancePx + 30 });
  let sawLow = false;
  let sawHit = false;
  for (let f = 0; f < 12; f += 1) {
    step(w, []);
    if (w.events.includes('rubble_hit')) sawHit = true;
    if (w.events.includes('fuel_low')) sawLow = true;
  }
  assert.ok(sawHit, 'the rubble was hit');
  assert.ok(w.fuel <= TUNING.fuel.lowThreshold, 'and it crossed the threshold');
  assert.ok(sawLow, 'crossing the threshold must warn, whatever subtracted the fuel');
});

test('a rubble hit that does not cross the low fuel line stays quiet', () => {
  const w = mkWorld();
  w.fuel = TUNING.fuel.max;
  w.hazards.push({ type: 'rubble', lane: w.player.lane, distPx: w.distancePx + 30 });
  let sawLow = false;
  for (let f = 0; f < 12; f += 1) {
    step(w, []);
    if (w.events.includes('fuel_low')) sawLow = true;
  }
  assert.ok(w.fuel > TUNING.fuel.lowThreshold, 'still well above the line');
  assert.equal(sawLow, false, 'no warning when nothing was crossed');
});

test('a rubble hit that empties the tank ends the run rather than warning', () => {
  const w = mkWorld();
  w.fuel = 1;
  w.hazards.push({ type: 'rubble', lane: w.player.lane, distPx: w.distancePx + 30 });
  for (let f = 0; f < 12 && w.status === 'running'; f += 1) step(w, []);
  assert.equal(w.status, 'dead');
  assert.equal(w.deathCause, 'fuel');
});
