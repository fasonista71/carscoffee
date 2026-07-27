/*
  Headless determinism test. Imports only src/game, runs 10000
  simulated frames from a fixed seed with a scripted input sequence,
  and asserts an identical final state hash across two runs. If this
  cannot run in Node, the game/render separation is not real.

  Scope note: this proves determinism within one engine on one machine,
  which is what the architecture requires. It does not prove identical
  floating point results across different engines.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';

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
  intents in a single frame.
*/
function scriptedIntents(frame) {
  const intents = [];
  if (frame % 89 === 0) intents.push({ type: 'lane', dir: 1 });
  if (frame % 97 === 0) intents.push({ type: 'lane', dir: -1 });
  if (frame % 131 === 0) intents.push({ type: 'lane', dir: 1 });
  if (frame % 53 === 0) intents.push({ type: 'boost' });
  if (frame % 21 === 0) intents.push({ type: 'lane', dir: frame % 2 === 0 ? 1 : -1 });
  return intents;
}

function runSimulation() {
  const world = createWorld({
    seed: 0xc0ffee,
    vehicle: VEHICLES.sports,
    environment: ENVIRONMENTS.city
  });
  for (let f = 0; f < 10000; f += 1) {
    step(world, scriptedIntents(f));
  }
  return world;
}

test('10000 scripted frames hash identically across two runs', () => {
  const a = fnv1a(JSON.stringify(runSimulation()));
  const b = fnv1a(JSON.stringify(runSimulation()));
  assert.equal(a, b);
});

test('simulation stays inside the lane grid and advances', () => {
  const w = runSimulation();
  assert.equal(w.frame, 10000);
  assert.ok(w.player.lane >= 0 && w.player.lane < TUNING.road.laneCount);
  assert.ok(w.distancePx > 0);
  assert.equal(w.status, 'running');
});
