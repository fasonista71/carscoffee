/*
  Seeded PRNG built on the well known mulberry32 step function.
  Implemented as pure functions: state is a plain uint32 passed in and
  returned, never hidden in a closure, so it serializes with the rest
  of the world state and the determinism hash covers it.
*/

export function seedToState(seed) {
  const s = seed >>> 0;
  return s === 0 ? 0x9e3779b9 : s;
}

export function nextU32(state) {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [(t ^ (t >>> 14)) >>> 0, a >>> 0];
}

export function nextFloat01(state) {
  const [u, s] = nextU32(state);
  return [u / 4294967296, s];
}

export function nextIntBetween(state, min, maxExclusive) {
  const [f, s] = nextFloat01(state);
  return [min + Math.floor(f * (maxExclusive - min)), s];
}
