/*
  Oil slick, rubble, and stumble behavior, headless. Traffic spawning
  is pushed out of reach and tiers pinned (own process, no leakage);
  rows and hazards are injected by hand where needed.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, isBoosting, currentSpeedPxPerSec } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';

TUNING.obstacles.firstSpawnDistPx = 1e9;
TUNING.tiers.splice(1);
TUNING.fuel.passiveDrainPerSec = 0;

function mkWorld() {
  return createWorld({ seed: 7, vehicle: VEHICLES.sports, environment: ENVIRONMENTS.city });
}

function mkRow(world, aheadPx, lanes) {
  return {
    distPx: world.distancePx + aheadPx,
    speedPxPerSec: 0,
    lanes,
    variants: lanes.map((b) => (b ? 0 : -1)),
    maxHPx: 70,
    minGapPrevPx: 0
  };
}

test('a slick slides the car to its telegraphed lane and locks steering', () => {
  const w = mkWorld();
  w.hazards.push({ type: 'slick', lane: 1, dir: 1, distPx: w.distancePx + 40 });
  for (let f = 0; f < 25; f += 1) step(w, []);
  assert.ok(w.slideLockFrames > 0, 'slide lock should be active');
  /* steering input during the lock does nothing */
  for (let f = 0; f < 25; f += 1) step(w, [{ type: 'lane', dir: -1 }]);
  assert.equal(w.player.lane, 2, 'forced into the telegraphed lane despite input');
  /* after the lock expires, steering works again */
  while (w.slideLockFrames > 0) step(w, []);
  step(w, [{ type: 'lane', dir: -1 }]);
  for (let f = 0; f < 12; f += 1) step(w, []);
  assert.equal(w.player.lane, 1, 'steering restored after the lock');
});

test('rubble costs fuel, slows the car, ends boost, and is consumed', () => {
  const w = mkWorld();
  step(w, [{ type: 'boost' }]);
  assert.ok(isBoosting(w));
  const boosted = currentSpeedPxPerSec(w);
  w.hazards.push({ type: 'rubble', lane: 1, distPx: w.distancePx + 30 });
  for (let f = 0; f < 12; f += 1) step(w, []);
  assert.equal(w.hazards.length, 0, 'rubble is consumed on hit');
  assert.ok(!isBoosting(w), 'rubble ends an active boost');
  assert.ok(w.slowFrames > 0, 'speed loss is active');
  assert.ok(currentSpeedPxPerSec(w) < boosted, 'speed is reduced');
  /* boost drain applies only until rubble kills the boost, so fuel
     lands between "cost only" and "cost plus a full 12 frames of
     boost drain" */
  const hi = TUNING.fuel.max - TUNING.hazards.rubble.fuelCost;
  const lo = hi - TUNING.fuel.boostDrainPerSec * (12 / TUNING.logic.hz);
  assert.ok(w.fuel <= hi && w.fuel >= lo, `fuel ${w.fuel} outside [${lo}, ${hi}]`);
  while (w.slowFrames > 0) step(w, []);
  assert.equal(currentSpeedPxPerSec(w), TUNING.speed.basePxPerSec, 'speed recovers');
});

test('the first lethal contact is a stumble, the second ends the run', () => {
  const w = mkWorld();
  w.rows.push(mkRow(w, 40, [false, true, false]));
  for (let f = 0; f < 20; f += 1) step(w, []);
  assert.equal(w.status, 'running', 'first contact is forgiven');
  assert.equal(w.stumbleAvailable, false, 'stumble is spent');
  assert.ok(w.invulnFrames > 0, 'invulnerability granted');
  /* ride out invulnerability, then hit again */
  while (w.invulnFrames > 0) step(w, []);
  w.rows.push(mkRow(w, 40, [false, true, false]));
  for (let f = 0; f < 40 && w.status === 'running'; f += 1) step(w, []);
  assert.equal(w.status, 'dead');
  assert.equal(w.deathCause, 'crash');
});

test('hazards do nothing during stumble invulnerability', () => {
  const w = mkWorld();
  w.rows.push(mkRow(w, 40, [false, true, false]));
  for (let f = 0; f < 20; f += 1) step(w, []);
  assert.ok(w.invulnFrames > 0);
  w.hazards.push({ type: 'slick', lane: 1, dir: 1, distPx: w.distancePx + 20 });
  for (let f = 0; f < 15; f += 1) step(w, []);
  assert.equal(w.slideLockFrames, 0, 'no slide during invulnerability');
  assert.equal(w.player.lane, 1, 'car stays in its lane');
});
