/*
  Nitro, the headline mechanic of this release, which shipped with no
  tests at all. The spend branch in world.js was on the uncovered list,
  and fuel.test.js's "boost is gated by minimum fuel" is the test that
  should own nitro's override of that gate and never mentions it.

  What is worth holding:
  - a bottle banks a charge and does NOT fire one. It used to fire on
    pickup, and that broke the fairness invariant outright, because
    every gap on this road is sized against the speed the player will
    be doing and the model only holds while boosting is a choice;
  - charges cap, so holding a stack of them cannot make the road
    stop mattering;
  - a boost spends a banked charge before it spends coffee;
  - and it works below the fuel floor, which tuning.js says is the
    entire reason the pickup exists.

  The bench tests run on an empty road, done to their own worlds by
  quietStep rather than by reshaping the shared TUNING.
*/

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, isBoosting } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';
import { quietStep, ghostStep } from './support/ghost.js';

describe('nitro', () => {
  const mkWorld = () => createWorld({
    seed: 11, vehicle: VEHICLES.coupe, environment: ENVIRONMENTS.city
  });

  const dropNitro = (w, lane = 1) => {
    w.pickups.push({ kind: 'nitro', lane, distPx: w.distancePx + 10, speedPxPerSec: 0 });
  };

  test('a bottle banks a charge rather than firing one', () => {
    const w = mkWorld();
    dropNitro(w);
    quietStep(w, []);
    assert.equal(w.pickups.length, 0, 'the bottle should have been collected');
    assert.equal(w.nitroCharges, 1);
    assert.ok(!isBoosting(w), 'picking one up must not accelerate the player');
    assert.ok(w.events.includes('nitro_pickup'));
  });

  test('charges bank up to the cap and no further', () => {
    const w = mkWorld();
    for (let i = 0; i < TUNING.nitro.maxCharges + 2; i += 1) {
      dropNitro(w);
      quietStep(w, []);
    }
    assert.equal(w.nitroCharges, TUNING.nitro.maxCharges);
  });

  test('a boost spends a banked charge before it spends coffee', () => {
    const w = mkWorld();
    dropNitro(w);
    quietStep(w, []);
    quietStep(w, [{ type: 'boost' }]);
    assert.ok(isBoosting(w));
    assert.equal(w.nitroCharges, 0, 'the charge should have been spent');

    /*
      "Burns no coffee" measured against a run that did not boost at
      all, rather than against a frozen number: the tank still drains
      the ordinary passive amount while a nitro boost is running, and
      what has to be zero is the extra.
    */
    const control = mkWorld();
    quietStep(control, []);
    quietStep(control, []);
    const boostFrames = Math.round((TUNING.boost.durationMs / 1000) * TUNING.logic.hz);
    for (let i = 0; i < boostFrames; i += 1) {
      quietStep(w, []);
      quietStep(control, []);
    }
    assert.ok(!isBoosting(w), 'a nitro boost lasts a full boost and no longer');
    assert.equal(w.fuel, control.fuel, 'a nitro boost burns no coffee of its own');
  });

  test('and it fires below the fuel floor, which is the point of it', () => {
    const w = mkWorld();
    dropNitro(w);
    quietStep(w, []);
    w.fuel = TUNING.boost.minFuel - 1;
    quietStep(w, [{ type: 'boost' }]);
    assert.ok(isBoosting(w), 'a banked nitro must work when coffee cannot pay');
    assert.equal(w.nitroCharges, 0);

    /* Same world, same floor, no charge left: now it is refused. */
    const boostFrames = Math.round((TUNING.boost.durationMs / 1000) * TUNING.logic.hz);
    for (let i = 0; i < boostFrames; i += 1) quietStep(w, []);
    w.fuel = TUNING.boost.minFuel - 1;
    quietStep(w, [{ type: 'boost' }]);
    assert.ok(!isBoosting(w), 'with no charge the floor still holds');
  });

  test('a press during a nitro boost neither extends it nor spends another', () => {
    const w = mkWorld();
    dropNitro(w);
    quietStep(w, []);
    dropNitro(w);
    quietStep(w, []);
    assert.equal(w.nitroCharges, 2);
    quietStep(w, [{ type: 'boost' }]);
    const left = w.boostFramesLeft;
    quietStep(w, [{ type: 'boost' }]);
    assert.equal(w.nitroCharges, 1, 'the second press must not spend the second charge');
    assert.equal(w.boostFramesLeft, left - 1, 'nor extend the boost already running');
  });

});

/*
  And the other half of a pickup nobody has tested: that the road
  actually puts one down. A bottle that silently stops spawning is the
  same bug distribution.test.js was written to catch for slicks, and it
  would look exactly like a mechanic nobody uses.
*/
describe('nitro on the road', () => {
  /*
    Measured while writing this: seven bottles across ten seeds of 150
    seconds each, so a player meets one about every two and a half
    minutes. The guard is set at three because it is a guard against a
    bottle that stopped spawning, not a statement about the rate, which
    is Jason's dial.
  */
  test('bottles appear on a real run, and never more than the cap can hold', () => {
    let seen = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      const w = createWorld({ seed, vehicle: VEHICLES.coupe, environment: ENVIRONMENTS.city });
      const counted = new Set();
      for (let f = 0; f < 9000; f += 1) {
        ghostStep(w);
        for (const item of w.pickups) {
          if (item.kind !== 'nitro') continue;
          const key = Math.round(item.distPx) + ':' + item.lane;
          if (!counted.has(key)) counted.add(key);
        }
        assert.ok(w.nitroCharges <= TUNING.nitro.maxCharges,
          'banked ' + w.nitroCharges + ' charges, cap is ' + TUNING.nitro.maxCharges);
      }
      seen += counted.size;
    }
    assert.ok(seen >= 3, 'nitro bottles barely spawn across ten seeds: ' + seen);
  });
});
