/*
  The road past the last authored tier.

  The tier ladder stops at ten. The tier NUMBER does not: it keeps
  counting at the same cadence so the scenery can keep changing and a
  long run has a rung to have reached. Two things have to stay true
  for that to be safe. Difficulty must stay frozen at the last rung,
  and the scene the road is painted in must not be able to reach the
  simulation at all.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, tierConfig } from '../src/game/world.js';
import { sceneOrderForSeed, sceneKeyForTier } from '../src/game/scenes.js';
import { TUNING, VEHICLES, ENVIRONMENTS, SCENERY_STRIPS } from '../src/game/tuning.js';

const LAST = TUNING.tiers.length - 1;
const CYCLE = TUNING.sceneryCycle;

function world(seed) {
  return createWorld({ seed, vehicle: VEHICLES.coupe, environment: ENVIRONMENTS.city });
}

test('every scene in the cycle has a palette and a pair of strips', () => {
  for (const key of CYCLE) {
    assert.ok(TUNING.sceneryThemes[key], key + ' has no palette entry');
    assert.ok(TUNING.sceneryThemes[key].label, key + ' has no place name');
    assert.ok(SCENERY_STRIPS.includes(key + '_left'), key + ' has no left strip');
    assert.ok(SCENERY_STRIPS.includes(key + '_right'), key + ' has no right strip');
  }
});

test('every authored tier draws a scene that is in the cycle', () => {
  for (const t of TUNING.tiers) {
    assert.ok(CYCLE.includes(t.theme), t.theme + ' is drawn but never cycles');
  }
});

test('inside the ladder a tier names its own scene', () => {
  const order = sceneOrderForSeed(1234);
  for (let t = 0; t <= LAST; t += 1) {
    assert.equal(sceneKeyForTier(t, order), TUNING.tiers[t].theme);
  }
});

test('past the ladder the run tours every scene, then repeats', () => {
  const order = sceneOrderForSeed(1234);
  const lap = [];
  for (let i = 0; i < CYCLE.length; i += 1) lap.push(sceneKeyForTier(LAST + 1 + i, order));
  assert.deepEqual([...lap].sort(), [...CYCLE].sort(), 'a lap is not the full set of scenes');
  for (let i = 0; i < CYCLE.length; i += 1) {
    assert.equal(sceneKeyForTier(LAST + 1 + CYCLE.length + i, order), lap[i],
      'the second lap does not repeat the first');
  }
});

test('the tour never opens with the scene the player is already in', () => {
  const lastAuthored = TUNING.tiers[LAST].theme;
  for (let seed = 1; seed < 500; seed += 1) {
    const order = sceneOrderForSeed(seed);
    assert.equal(new Set(order).size, CYCLE.length, 'seed ' + seed + ' dropped a scene');
    assert.notEqual(sceneKeyForTier(LAST + 1, order), lastAuthored,
      'seed ' + seed + ' repeats ' + lastAuthored + ' across the wrap');
  }
});

test('the order is the seed, and different seeds tour differently', () => {
  assert.deepEqual(sceneOrderForSeed(4242), sceneOrderForSeed(4242));
  const seen = new Set();
  for (let seed = 1; seed < 200; seed += 1) seen.add(sceneOrderForSeed(seed).join(','));
  assert.ok(seen.size > 100, 'only ' + seen.size + ' distinct tours in 200 seeds');
});

test('difficulty stays frozen at the last rung however high the tier goes', () => {
  const rung = TUNING.tiers[LAST];
  for (const tier of [LAST, LAST + 1, LAST + 7, LAST + 100]) {
    assert.equal(tierConfig({ tier }), rung, 'tier ' + tier + ' is not the last rung');
  }
});

test('the tier keeps counting past the ladder, one rung per step', () => {
  const px = TUNING.speed.pxPerMeter;
  const at = TUNING.tiers[LAST].atMeters;
  for (const [meters, want] of [[at, LAST], [at + 1000, LAST + 1], [at + 3500, LAST + 3]]) {
    const w = world(77);
    w.distancePx = meters * px;
    step(w, []);
    assert.equal(w.tier, want, meters + 'm should be tier ' + want);
  }
});

/*
  The guard that matters. The scene order is drawn from a stream of
  its own, so which scenery a run is painted in must not be able to
  move a single car. Same seed, deliberately different tours, and the
  road has to come out identical row for row.
*/
test('the scenery a run tours cannot move the traffic', () => {
  function road(seed, order) {
    const w = world(seed);
    if (order) w.sceneOrder = order;
    const seen = new Set();
    const out = [];
    for (let f = 0; f < 3000; f += 1) {
      w.hearts = TUNING.lives.max;
      w.fuel = TUNING.fuel.max;
      step(w, []);
      for (const row of w.rows) {
        if (seen.has(row)) continue;
        seen.add(row);
        out.push(Math.round(row.distPx) + ':' + row.lanes.map((l) => (l ? 1 : 0)).join('')
          + ':' + row.variants.join(',') + ':' + Math.round(row.speedPxPerSec));
      }
    }
    return out.join('|');
  }
  for (const seed of [11, 4242, 90210]) {
    const a = road(seed, sceneOrderForSeed(seed));
    const b = road(seed, [...CYCLE].reverse());
    assert.ok(a.length > 0, 'seed ' + seed + ' laid no road');
    assert.equal(a, b, 'seed ' + seed + ' laid a different road for a different tour');
  }
});
