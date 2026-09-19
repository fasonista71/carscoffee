/*
  The atlas contract.

  assets/cars.atlas is a generated artefact: it comes out of a packer,
  and a repack with different padding or a different sheet renumbers
  every frame in it. Nothing anywhere checked that the numbers the
  simulation collides with are still the numbers the renderer draws, so
  a repack could have put every hitbox quietly out of step with its art
  and the only symptom would have been cars clipping each other by two
  pixels.

  Four claims, all cheap:
  - every frame the renderer asks for exists, with real geometry;
  - nothing else is in the sheet, so a frame nobody draws is noticed
    rather than shipped;
  - every TRAFFIC_VARIANTS hitbox is exactly the size of the art it is
    drawn from;
  - the player's frame names agree in the three places they are
    written down, which is the drift that would silently stop world.js
    from keeping the player's bodywork off other cars.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALIASES, neededFrames, parseAtlas, pageName } from '../src/render/atlas.js';
import { TRAFFIC_VARIANTS, PLAYER_SPRITES, VEHICLES } from '../src/game/tuning.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const text = readFileSync(join(root, 'assets', 'cars.atlas'), 'utf8');
const frames = parseAtlas(text);

test('every frame the renderer slices out of the atlas is in it', () => {
  for (const name of neededFrames()) {
    const f = frames[name];
    assert.ok(f, 'atlas has no frame named ' + name);
    for (const key of ['x', 'y', 'w', 'h']) {
      assert.equal(typeof f[key], 'number', name + ' has no ' + key);
    }
    assert.ok(f.w > 0 && f.h > 0, name + ' has an empty frame');
  }
});

test('and nothing is in the atlas that the renderer never asks for', () => {
  const needed = neededFrames();
  /* The first line names the page image and parses as a fieldless
     frame; it is the header, not art. */
  const extra = Object.keys(frames).filter((n) => n !== pageName(text) && !needed.has(n));
  assert.deepEqual(extra, [], 'frames nobody draws: ' + extra.join(', '));
});

test('every traffic hitbox is the size of the art it is drawn from', () => {
  const wrong = TRAFFIC_VARIANTS
    .map((v) => ({ v, f: frames[v.sprite] }))
    .filter(({ v, f }) => f && (f.w !== v.wPx || f.h !== v.hPx))
    .map(({ v, f }) => `${v.sprite} is ${v.wPx}x${v.hPx} but its frame is ${f.w}x${f.h}`);
  assert.deepEqual(wrong, []);
});

/*
  The player's frames are written down three times: ALIASES maps the
  game's keys to atlas names, PLAYER_SPRITES is the list world.js uses
  to keep an overtaker out of the player's bodywork, and each vehicle
  names its key. A comment in tuning.js asks for them to be kept in
  step, and a comment is not a constraint: if PLAYER_SPRITES drifts,
  the guard in world.js goes on running and stops guarding.
*/
test('the player frames agree in all three places they are written', () => {
  assert.deepEqual([...PLAYER_SPRITES].sort(), Object.values(ALIASES).sort(),
    'PLAYER_SPRITES and ALIASES name different frames');
  for (const [name, vehicle] of Object.entries(VEHICLES)) {
    assert.ok(ALIASES[vehicle.spriteKey],
      `vehicle ${name} wears ${vehicle.spriteKey}, which ALIASES does not map`);
  }
  for (const frame of PLAYER_SPRITES) {
    assert.ok(!TRAFFIC_VARIANTS.some((v) => v.sprite === frame),
      frame + ' is both a player car and ordinary traffic');
  }
});
