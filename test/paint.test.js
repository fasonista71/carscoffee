/*
  The repaint.

  It runs on every boot, on art nobody can check by eye once it has
  shipped, so the properties worth holding down are the ones that make
  a recolour a recolour rather than a wash: only the paint moves, the
  shading survives it, and the target colour is what the car reads as.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { paintMask, hueMask, repaint, rgbToHsv } from '../src/render/paint.js';
import { REPAINTS, PLAYER_REPAINTS, TRAFFIC_VARIANTS } from '../src/game/tuning.js';

/* Four pixels: two of paint at different brightness, one of glass,
   one transparent. */
function fixture(paintA, paintB) {
  const a = new Uint8ClampedArray([
    ...paintA, 255,
    ...paintA.map((c) => Math.round(c * 0.5)), 255,
    40, 44, 60, 255,
    0, 0, 0, 0
  ]);
  const b = new Uint8ClampedArray([
    ...paintB, 255,
    ...paintB.map((c) => Math.round(c * 0.5)), 255,
    40, 44, 60, 255,
    0, 0, 0, 0
  ]);
  return [a, b];
}

test('the mask is exactly where two variants of one body disagree', () => {
  const [a, b] = fixture([230, 230, 230], [60, 90, 220]);
  const mask = paintMask(a, b);
  assert.deepEqual(Array.from(mask), [1, 1, 0, 0], 'paint yes, glass no, transparent no');
});

test('a transparent pixel is never paint, whatever is under it', () => {
  const a = new Uint8ClampedArray([200, 0, 0, 0]);
  const b = new Uint8ClampedArray([0, 200, 0, 0]);
  assert.deepEqual(Array.from(paintMask(a, b)), [0]);
});

test('repaint leaves everything that is not paint alone', () => {
  const [a, b] = fixture([230, 230, 230], [60, 90, 220]);
  const mask = paintMask(a, b);
  const out = repaint(a, mask, '#D01820');
  assert.deepEqual(Array.from(out.slice(8, 16)), Array.from(a.slice(8, 16)),
    'the glass and the transparent pixel are untouched');
});

test('the shading survives: a lit panel stays lighter than a shadowed one', () => {
  const [a, b] = fixture([230, 230, 230], [60, 90, 220]);
  const mask = paintMask(a, b);
  const out = repaint(a, mask, '#176661');
  const lit = rgbToHsv(out[0] / 255, out[1] / 255, out[2] / 255)[2];
  const shade = rgbToHsv(out[4] / 255, out[5] / 255, out[6] / 255)[2];
  assert.ok(lit > shade, 'the highlight is still brighter than the shadow');
});

test('the car reads as the colour it was given', () => {
  const [a, b] = fixture([230, 230, 230], [60, 90, 220]);
  const mask = paintMask(a, b);
  for (const hex of ['#D01820', '#F3C300', '#245AA5', '#3F6048']) {
    const out = repaint(a, mask, hex);
    const want = rgbToHsv(
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    )[0];
    const got = rgbToHsv(out[0] / 255, out[1] / 255, out[2] / 255)[0];
    const d = Math.abs(got - want);
    assert.ok(Math.min(d, 1 - d) < 0.02, hex + ' keeps its hue, got ' + got.toFixed(3));
  }
});

test('an empty mask is a no op rather than a divide by zero', () => {
  const a = new Uint8ClampedArray([230, 230, 230, 255]);
  const out = repaint(a, new Uint8Array([0]), '#D01820');
  assert.deepEqual(Array.from(out), Array.from(a));
});

test('the hue mask finds a distinct paint and leaves dark trim alone', () => {
  /* olive paint, black trim, grey glass */
  const src = new Uint8ClampedArray([
    120, 130, 70, 255,
    110, 120, 64, 255,
    12, 12, 14, 255,
    60, 66, 80, 255
  ]);
  assert.deepEqual(Array.from(hueMask(src)), [1, 1, 0, 0]);
});

/*
  The table is the thing most likely to drift: a sprite renamed in the
  atlas, or a job pointing at a frame that no longer exists, would
  leave a car in the artist's colours with nothing saying so.
*/
test('every repaint job names a sprite the traffic actually uses', () => {
  const used = new Set(TRAFFIC_VARIANTS.map((v) => v.sprite));
  for (const job of REPAINTS) {
    assert.ok(used.has(job.from), job.from + ' is drawn somewhere');
    assert.ok(used.has(job.mask), job.mask + ' is drawn somewhere');
    for (const [name] of job.jobs) {
      assert.ok(used.has(name), name + ' is a sprite the traffic draws');
    }
  }
});

test('no body is repainted from a frame of a different body', () => {
  const model = new Map(TRAFFIC_VARIANTS.map((v) => [v.sprite, v.model]));
  for (const job of REPAINTS) {
    const m = model.get(job.from);
    assert.equal(model.get(job.mask), m, job.mask + ' is the same body as ' + job.from);
    for (const [name] of job.jobs) {
      assert.equal(model.get(name), m, name + ' is the same body as ' + job.from);
    }
  }
});

test('the player repaint names a player sprite', () => {
  for (const job of PLAYER_REPAINTS) {
    for (const [name] of job.jobs) {
      assert.equal(name, job.from, 'a player car is repainted onto itself');
    }
  }
});
