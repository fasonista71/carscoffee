/*
  Headless determinism test. Imports only src/game, runs a fixed seed
  twice, and asserts an identical final state hash.

  What it used to run was a scripted input sequence over 10000 frames.
  The pilot crashed at frame 466, at 216 meters, in tier 0, and step()
  early returned for the other 9534 calls, so determinism was proven
  for 4.7% of the frames the name claimed and none of the systems this
  release rebuilt: no tier transition, no speedTierMult ramp, no
  overtaker, no pursuit, no yield, no pickup, no pass scheduling. The
  hash was of a wreck.

  So the long run is driven by the oracle out of support/oracle.js, the
  same driver the fairness gate uses, and it is asserted to be alive at
  the end. The scripted sequence stays as its own shorter test, because
  bursts of intents in one frame and edge of road rejections are input
  handling the oracle never produces. It is just no longer described as
  something it is not.

  Scope note: this proves determinism within one engine on one machine,
  which is what the architecture requires. It does not prove identical
  floating point results across different engines.
*/

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';
import { oracleIntents } from './support/oracle.js';

const FRAMES = 10000;
const SEED = 0xc0ffee;

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/*
  Scripted inputs: dense enough to keep tweens, the one slot queue, and
  edge of road rejections all exercised, including bursts of several
  intents in a single frame. Nobody is dodging, so the car crashes; that
  is what the short test is for.
*/
function scriptedIntents(frame) {
  const intents = [];
  if (frame % 89 === 0) intents.push({ type: 'lane', dir: 1 });
  if (frame % 97 === 0) intents.push({ type: 'lane', dir: -1 });
  if (frame % 131 === 0) intents.push({ type: 'lane', dir: 1 });
  if (frame % 53 === 0) intents.push({ type: 'boost' });
  if (frame % 21 === 0) intents.push({ type: 'lane', dir: frame % 2 === 0 ? 1 : -1 });
  if (frame % 61 === 0) intents.push({ type: 'tapLane', lane: Math.floor(frame / 61) % 3 });
  return intents;
}

function drive(pilot, frames) {
  const world = createWorld({ seed: SEED, vehicle: VEHICLES.coupe, environment: ENVIRONMENTS.city });
  const events = {};
  let topTier = 0;
  let diedAt = null;
  for (let f = 0; f < frames; f += 1) {
    step(world, pilot(world, f));
    topTier = Math.max(topTier, world.tier);
    for (const e of world.events) events[e] = (events[e] || 0) + 1;
    if (diedAt === null && world.status !== 'running') diedAt = f;
  }
  return { world, events, topTier, diedAt };
}

const oraclePilot = (world) => oracleIntents(world);
const scriptedPilot = (world, f) => scriptedIntents(f);

describe('determinism', () => {
  test('ten thousand frames of a live run hash identically across two runs', () => {
    const a = drive(oraclePilot, FRAMES);
    const b = drive(oraclePilot, FRAMES);
    assert.equal(fnv1a(JSON.stringify(a.world)), fnv1a(JSON.stringify(b.world)));

    /*
      The guard the old test did not have. Without this, the day the
      pilot starts dying early the hash quietly shrinks back to covering
      the first few seconds of tier 0 and the test still passes.
    */
    assert.equal(a.world.frame, FRAMES);
    assert.equal(a.world.status, 'running',
      `the pilot died (${a.world.deathCause}) at frame ${a.diedAt}, so the hash covers a wreck`);
  });

  /*
    And what that run contains, since the point of hashing a live run is
    the systems it reaches. These counts are exact for this seed, so a
    threshold of one is a floor, not a measurement: it catches a system
    that has stopped happening at all.
  */
  test('the hashed run reaches the systems the hash is supposed to cover', () => {
    const { world, events, topTier } = drive(oraclePilot, FRAMES);
    assert.ok(topTier >= 2, `never got past tier ${topTier}`);
    assert.ok(world.speedTierMult > TUNING.tiers[0].speed, 'the speed ramp never moved');
    for (const name of ['tier_up', 'lane_change', 'overtake', 'coffee_pickup']) {
      assert.ok((events[name] || 0) > 0, `the run never emitted ${name}: ${JSON.stringify(events)}`);
    }
  });

  test('scripted inputs, bursts and all, crash at the same frame every time', () => {
    const a = drive(scriptedPilot, 1000);
    const b = drive(scriptedPilot, 1000);
    assert.equal(fnv1a(JSON.stringify(a.world)), fnv1a(JSON.stringify(b.world)));
    assert.equal(a.diedAt, b.diedAt);
    assert.ok(a.diedAt !== null,
      'the scripted pilot is supposed to be the one that does not dodge');
  });

  test('the simulation stays inside the lane grid and advances', () => {
    const { world } = drive(oraclePilot, FRAMES);
    assert.equal(world.frame, FRAMES);
    assert.ok(world.player.lane >= 0 && world.player.lane < TUNING.road.laneCount);
    assert.ok(world.distancePx > 0);
  });
});
