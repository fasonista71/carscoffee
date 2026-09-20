/*
  Can a pilot that is only trying not to crash also stay fuelled?

  The oracle plans survival and knows nothing about coffee, so what it
  drinks is whatever happens to be in the lane it picked for other
  reasons. That makes it a fair, if pessimistic, read on the fuel
  economy: a real player aims for cups.

  Reports how far that pilot gets before the tank runs dry, across
  many seeds, which is the number to compare before and after any
  change to how the road is laid out.

    node tools/measure-fuel.mjs [seeds] [frames]
*/
import { createWorld, step } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';
import { oracleIntents } from '../test/support/oracle.js';

const SEEDS = Number(process.argv[2] || 40);
const FRAMES = Number(process.argv[3] || 10000);

const lived = [];
const died = [];
for (let i = 0; i < SEEDS; i += 1) {
  const w = createWorld({ seed: 0xc0ffee + i * 101, vehicle: VEHICLES.coupe, environment: ENVIRONMENTS.city });
  let f = 0;
  for (; f < FRAMES; f += 1) {
    step(w, oracleIntents(w));
    /* Hearts only. The tank is the thing being measured. */
    w.hearts = TUNING.lives.max;
    if (w.status !== 'running') break;
  }
  if (w.status === 'running') lived.push(f);
  else died.push({ f, at: Math.round(w.distancePx / TUNING.speed.pxPerMeter), why: w.deathCause });
}

const q = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length * p)] : null);
console.log(JSON.stringify({
  seeds: SEEDS,
  frames: FRAMES,
  survived: `${lived.length}/${SEEDS}`,
  diedOfFuel: died.filter((d) => d.why === 'fuel').length,
  diedOther: died.filter((d) => d.why !== 'fuel').length,
  deathMetres: { p10: q(died.map((d) => d.at), 0.1), p50: q(died.map((d) => d.at), 0.5), p90: q(died.map((d) => d.at), 0.9) }
}, null, 2));
