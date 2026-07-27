/*
  Behavioral tests for positional tap resolution inside the
  simulation: one tap moves one lane toward the tapped lane, a tap on
  the committed lane does not move, and mid tween taps share the
  single slot queue.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/game/world.js';
import { VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';

function mkWorld() {
  return createWorld({
    seed: 1,
    vehicle: VEHICLES.sports,
    environment: ENVIRONMENTS.city
  });
}

function runFrames(world, n) {
  for (let i = 0; i < n; i += 1) step(world, []);
}

test('tap on the adjacent lane moves the car there', () => {
  const w = mkWorld(); /* starts in lane 1 */
  step(w, [{ type: 'tapLane', lane: 0 }]);
  runFrames(w, 30);
  assert.equal(w.player.lane, 0);
});

test('tap on the car\'s own lane does not move it', () => {
  const w = mkWorld();
  step(w, [{ type: 'tapLane', lane: 1 }]);
  runFrames(w, 30);
  assert.equal(w.player.lane, 1);
});

test('tap on a far lane moves exactly one lane toward it', () => {
  const w = mkWorld();
  step(w, [{ type: 'tapLane', lane: 0 }]);
  runFrames(w, 30); /* now in lane 0 */
  step(w, [{ type: 'tapLane', lane: 2 }]);
  runFrames(w, 30);
  assert.equal(w.player.lane, 1);
});

test('mid tween tap toward a further lane queues one more step', () => {
  const w = mkWorld();
  step(w, [{ type: 'tapLane', lane: 0 }]);
  runFrames(w, 30); /* lane 0 */
  step(w, [{ type: 'tapLane', lane: 1 }]);
  runFrames(w, 2); /* mid tween toward 1 */
  step(w, [{ type: 'tapLane', lane: 2 }]);
  runFrames(w, 40);
  assert.equal(w.player.lane, 2);
});

test('mid tween tap on the committed lane queues nothing', () => {
  const w = mkWorld();
  step(w, [{ type: 'tapLane', lane: 2 }]);
  runFrames(w, 2); /* mid tween toward 2 */
  step(w, [{ type: 'tapLane', lane: 2 }]);
  runFrames(w, 40);
  assert.equal(w.player.lane, 2);
  assert.equal(w.player.queuedDir, 0);
});
