/*
  Does the road feed a driver?

  Coffee is the only fuel and it is laid out by the same generator
  that lays out the traffic, so any change to how rows are spaced
  changes how much fuel a run finds. Nothing measured that until a
  traffic change quietly moved it, which the determinism test caught
  by accident and for the wrong reason: it was driving one seed with a
  pilot that cannot see coffee, and that pilot survives on about a
  third of seeds, so the test had been passing on luck.

  This asks the question properly. The same fuel blind pilot drives
  many seeds, and the run is scored on how far it gets. It is a
  pessimistic read, because a real player aims for cups and this one
  only ever turns to avoid a crash, which is exactly what makes it a
  floor: if a pilot that never once goes out of its way for coffee can
  reach this far, a player can.

  The thresholds are set well under what the road currently gives
  (measured 14 seeds in 30 surviving the full run, median death at
  2557m) so ordinary tuning does not trip them, and a change that
  halves the coffee does.
*/
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';
import { oracleIntents } from './support/oracle.js';

const SEEDS = 30;
const FRAMES = 10000;

function drive(seed) {
  const world = createWorld({ seed, vehicle: VEHICLES.coupe, environment: ENVIRONMENTS.city });
  let frames = 0;
  for (; frames < FRAMES; frames += 1) {
    step(world, oracleIntents(world));
    /* Hearts only. Crashing is the fairness gate's question; this one
       is about the tank. */
    world.hearts = TUNING.lives.max;
    if (world.status !== 'running') break;
  }
  return {
    survived: world.status === 'running',
    metres: Math.round(world.distancePx / TUNING.speed.pxPerMeter),
    cause: world.deathCause
  };
}

describe('fuel economy', () => {
  const runs = [];
  for (let i = 0; i < SEEDS; i += 1) runs.push(drive(0xc0ffee + i * 101));

  test('a pilot that never goes looking for coffee still gets a long way on it', () => {
    const reached = runs.map((r) => r.metres).sort((a, b) => a - b);
    const median = reached[Math.floor(reached.length / 2)];
    assert.ok(median >= 1500,
      `median run ended at ${median}m: ${JSON.stringify(reached)}`);
  });

  test('and some seeds it never runs dry at all', () => {
    const survived = runs.filter((r) => r.survived).length;
    assert.ok(survived >= 4,
      `only ${survived} of ${SEEDS} seeds lasted ${FRAMES} frames without the tank emptying`);
  });

  test('when it does end, it is the tank and not a crash', () => {
    /* The oracle does not crash. A collision death here means the
       fairness gate has a hole this suite happened to walk into. */
    const crashed = runs.filter((r) => !r.survived && r.cause !== 'fuel');
    assert.equal(crashed.length, 0, JSON.stringify(crashed));
  });
});
