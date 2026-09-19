/*
  Behavioral tests for positional tap resolution inside the
  simulation: a tap goes the whole way to the lane tapped, a tap on
  the committed lane does not move, and mid tween taps share the
  single slot queue.

  The far lane case is the interesting one. A tap two lanes away is
  one move now, not two, and the two claims worth holding down are
  that it is quicker than making the same crossing in two taps and
  that it is still a crossing: the car passes through the middle lane
  and can be hit there.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';
import { quietStep } from './support/ghost.js';

function mkWorld() {
  return createWorld({
    seed: 1,
    vehicle: VEHICLES.coupe,
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

test('tap on a far lane goes the whole way in one move', () => {
  const w = mkWorld();
  step(w, [{ type: 'tapLane', lane: 0 }]);
  runFrames(w, 30); /* now in lane 0 */
  step(w, [{ type: 'tapLane', lane: 2 }]);
  assert.equal(w.player.tween.to, 2, 'committed to the far lane, not the middle');
  assert.ok(w.player.tween.sweep, 'and knows it is a sweep');
  runFrames(w, 30);
  assert.equal(w.player.lane, 2);
});

test('a sweep says so, once, and an ordinary shift does not', () => {
  const w = mkWorld();
  step(w, [{ type: 'tapLane', lane: 2 }]);
  assert.ok(!w.events.includes('lane_sweep'), 'one lane is not a sweep');
  assert.ok(w.events.includes('lane_change'));
  runFrames(w, 30);
  step(w, [{ type: 'tapLane', lane: 0 }]);
  assert.equal(w.events.filter((e) => e === 'lane_sweep').length, 1);
  assert.ok(w.events.includes('lane_change'), 'a sweep is still a lane change');
});

/*
  The sweep has to beat two taps or it is a worse control than the one
  it replaced, and it has to lose to one lane or the road has no
  geometry left. Both ends are asserted rather than the middle, since
  the number itself is a feel GUESS and will move.
*/
test('a sweep is quicker than two taps and slower than one lane', () => {
  const w = mkWorld();
  step(w, [{ type: 'tapLane', lane: 2 }]);
  const one = w.player.tween.totalFrames;
  runFrames(w, 30);
  step(w, [{ type: 'tapLane', lane: 0 }]);
  const sweep = w.player.tween.totalFrames;
  assert.ok(sweep > one, 'a sweep takes longer than a single lane change');
  assert.ok(sweep < one * 2, 'and less than making the same crossing twice');
});

/*
  Crossing two lanes in a single tween must not turn the middle lane
  into empty air: the car is in it, briefly, and a car parked there is
  a crash.

  Being straight about what this is worth. It passes against the old
  one lane per tap code too, because that code also drove into the
  middle lane, so it is not evidence that today's sweep is safe. It is
  a guard for tomorrow: the obvious way to make a sweep feel snappier
  is to shorten or skip the crossing, and the first version of that
  which teleports past an occupied lane fails here.
*/
test('a sweep through an occupied middle lane still crashes', () => {
  const w = createWorld({ seed: 3, vehicle: VEHICLES.coupe, environment: ENVIRONMENTS.city });
  w.player.lane = 0;
  w.rows.push({
    distPx: w.distancePx + 6,
    speedPxPerSec: 0,
    lanes: [false, true, false],
    variants: [-1, 0, -1],
    maxHPx: 70,
    minGapPrevPx: 0
  });
  const hearts = w.hearts;
  quietStep(w, [{ type: 'tapLane', lane: 2 }]);
  for (let f = 0; f < 20; f += 1) quietStep(w, []);
  assert.ok(w.hearts < hearts, 'the car in the middle lane was hit on the way past');
});

test('the sweep duration follows the vehicle rather than a constant', () => {
  const w = mkWorld();
  step(w, [{ type: 'tapLane', lane: 2 }]);
  runFrames(w, 30);
  step(w, [{ type: 'tapLane', lane: 0 }]);
  const want = Math.max(1, Math.round(
    (w.laneTweenMs * TUNING.movement.laneSweepMult / 1000) * TUNING.logic.hz));
  assert.equal(w.player.tween.totalFrames, want);
});

test('mid tween tap toward a further lane is honoured from the destination', () => {
  const w = mkWorld();
  step(w, [{ type: 'tapLane', lane: 0 }]);
  runFrames(w, 30); /* lane 0 */
  step(w, [{ type: 'tapLane', lane: 1 }]);
  runFrames(w, 2); /* mid tween toward 1 */
  step(w, [{ type: 'tapLane', lane: 2 }]);
  runFrames(w, 40);
  assert.equal(w.player.lane, 2);
});

test('only one tap is queued behind a move in flight', () => {
  const w = mkWorld();
  step(w, [{ type: 'tapLane', lane: 0 }]);
  runFrames(w, 2); /* mid tween toward 0 */
  step(w, [{ type: 'tapLane', lane: 2 }]);
  step(w, [{ type: 'tapLane', lane: 1 }]);
  assert.equal(w.player.queuedLane, 2, 'the later tap is discarded, not stacked');
  runFrames(w, 60);
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
