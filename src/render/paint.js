/*
  Repainting a car.

  The sheet carries nine bodies in four colours each, painted by the
  artist and baked in. Jason wants them wearing the Porsche and Land
  Rover colours instead, which means either new art or a recolour, and
  a recolour is the reversible one: nothing is done to the artwork,
  the atlas is untouched, and deleting the table in tuning.js puts the
  original paint back.

  The hard part of a recolour is knowing which pixels are paint. These
  sprites are shaded, not flat: one body carries hundreds of near
  identical shades, and the glass, tyres, trim and shadows sit in the
  same ranges as some of them. Guessing by hue works on a car whose
  paint is a distinct colour and falls apart on a white or a black
  one.

  The art answers the question itself. Two variants of the same body
  differ in exactly the pixels that are paint and nowhere else, so
  diffing them gives an exact mask, for nothing, with no guessing and
  no per car tuning. That is what this module does.

  The recolour then keeps each pixel's brightness relative to the mean
  of the paint and takes hue and saturation from the target, so the
  panel shading, the highlight down the roof and the shadow under the
  arch all survive. Saturation is eased down in the shadows, because a
  fully saturated dark pixel reads as a colour cast rather than as a
  shadow.

  No browser globals here: it takes plain pixel arrays, so the node
  tests can hold it to account without a canvas.
*/

export function rgbToHsv(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

export function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

export function hexToRgb(hex) {
  const s = String(hex).replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16) / 255,
    parseInt(s.slice(2, 4), 16) / 255,
    parseInt(s.slice(4, 6), 16) / 255
  ];
}

/*
  Which pixels are paint: the ones where two variants of the same body
  disagree. Both arrays are RGBA, same length. A pixel either side of
  which is transparent is not paint, so a repack that shifted a frame
  by a row cannot turn the whole sprite into a mask.
*/
export function paintMask(a, b) {
  const n = Math.min(a.length, b.length) / 4;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    if (a[o + 3] < 200 || b[o + 3] < 200) continue;
    if (a[o] !== b[o] || a[o + 1] !== b[o + 1] || a[o + 2] !== b[o + 2]) mask[i] = 1;
  }
  return mask;
}

/*
  The fallback mask, for a body with no second variant to diff.

  It takes the most common hue among the saturated pixels as the paint
  and claims everything near it. That is a guess, and it is only safe
  on a body whose paint is a distinct colour against dark trim: on a
  white or a near black car the paint shares its hue with the glass,
  the lights and the shadows, and the mask takes half the sprite with
  it. Used for exactly one vehicle, checked by eye first.
*/
export function hueMask(src, tol = 0.07, minS = 0.18, minV = 0.1) {
  const n = src.length / 4;
  const mask = new Uint8Array(n);
  const buckets = new Map();
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    if (src[o + 3] < 200) continue;
    const [h, sat, v] = rgbToHsv(src[o] / 255, src[o + 1] / 255, src[o + 2] / 255);
    if (v < minV || sat < minS) continue;
    const key = Math.round(h * 100);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [key, count] of buckets) {
    if (count > bestN) { bestN = count; best = key; }
  }
  if (best === null) return mask;
  const target = best / 100;
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    if (src[o + 3] < 200) continue;
    const [h, sat, v] = rgbToHsv(src[o] / 255, src[o + 1] / 255, src[o + 2] / 255);
    if (sat < minS || v < minV) continue;
    const d = Math.abs(h - target);
    if (Math.min(d, 1 - d) <= tol) mask[i] = 1;
  }
  return mask;
}

/* The mean brightness of the masked pixels, which is what the target
   colour's own brightness is pinned to. */
function meanValue(src, mask) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const o = i * 4;
    sum += Math.max(src[o], src[o + 1], src[o + 2]) / 255;
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}

/*
  Returns a new RGBA array with the masked pixels in the new colour.
  Everything else, glass and tyres and lights and the outline, comes
  through untouched, which is the whole point of having a mask.
*/
export function repaint(src, mask, hex) {
  const out = src.slice();
  const mean = meanValue(src, mask);
  if (mean === 0) return out;
  const [r0, g0, b0] = hexToRgb(hex);
  const [hc, sc, vc] = rgbToHsv(r0, g0, b0);
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const o = i * 4;
    const [, , v] = rgbToHsv(src[o] / 255, src[o + 1] / 255, src[o + 2] / 255);
    const ratio = v / mean;
    const nv = Math.max(0, Math.min(1, vc * ratio));
    /* Shadows lose some saturation rather than all of it: a fully
       saturated dark pixel reads as a colour cast, a desaturated one
       reads as shade. */
    const ns = Math.min(1, sc * (0.55 + 0.45 * Math.min(ratio, 1.4)));
    const [nr, ng, nb] = hsvToRgb(hc, ns, nv);
    out[o] = Math.round(nr * 255);
    out[o + 1] = Math.round(ng * 255);
    out[o + 2] = Math.round(nb * 255);
  }
  return out;
}
