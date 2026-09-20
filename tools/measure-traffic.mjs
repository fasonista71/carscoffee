/*
  What the road actually looks like, counted rather than eyeballed.

  Drives the real world with the fairness oracle's own cautious pilot
  for a long run across many seeds, and reports the shape of the
  traffic: how many cars a stretch of road holds, how long the queues
  get, how far apart the gaps are, how fast the rows move, and how
  often something comes past.

  Run before and after any traffic tuning change. A claim about the
  road that is not in this output is a guess.

    node tools/measure-traffic.mjs [seeds] [metres]
*/
import { createWorld, step } from '../src/game/world.js';
import { TUNING, VEHICLES, ENVIRONMENTS } from '../src/game/tuning.js';
import { oracleMove } from '../test/support/oracle.js';

const SEEDS = Number(process.argv[2] || 40);
const METRES = Number(process.argv[3] || 6000);
const PX = TUNING.speed.pxPerMeter;

const vehicle = VEHICLES.coupe;
const environment = ENVIRONMENTS.city;

function run(seed) {
  const w = createWorld({ seed, vehicle, environment });
  const seen = new Map();          /* row identity to what we learned */
  let tightRun = 0;
  const runs = [];
  const tightGaps = [];
  const looseGaps = [];
  const doubles = [];
  let prevDist = null;
  const speeds = [];
  let passes = 0;
  let breakdowns = 0;
  let cars = 0;
  let lastCount = 0;
  /* What the player can actually see: the buffer is 320 logical tall
     with the car at 240, so the road on screen runs from about 70
     behind to 250 ahead. This is the number that answers "the road
     looks empty", which cars per kilometre does not: faster traffic
     recedes, so the same spatial density arrives less often. */
  const onScreen = [];
  const pickups = new Set();
  let cups = 0;
  let nitros = 0;
  let hearts = 0;
  let minFuel = TUNING.fuel.max;

  const target = METRES * PX;
  let frames = 0;
  while (w.distancePx < target && frames < 400000) {
    /* Keep the pilot alive; this measures the road, not the driver. */
    minFuel = Math.min(minFuel, w.fuel);
    w.hearts = TUNING.lives.max;
    if (!process.env.STARVE) w.fuel = TUNING.fuel.max;
    const move = oracleMove(w);
    step(w, move === 0 || move === 'doomed' ? [] : [{ type: 'lane', dir: move }]);
    frames += 1;

    for (const row of w.rows) {
      if (seen.has(row)) continue;
      seen.set(row, true);
      let n = 0;
      for (const l of row.lanes) if (l) n += 1;
      cars += n;
      if (row.breakdown) breakdowns += 1;
      speeds.push(row.speedPxPerSec / (TUNING.speed.basePxPerSec));
      if (row.tight) {
        tightRun += 1;
      } else {
        if (tightRun > 0) runs.push(tightRun + 1);
        else runs.push(1);
        tightRun = 0;
      }
      doubles.push(n);
      if (prevDist !== null) {
        (row.tight ? tightGaps : looseGaps).push(row.distPx - prevDist);
      }
      prevDist = row.distPx;
    }
    for (const p of w.pickups) {
      if (pickups.has(p)) continue;
      pickups.add(p);
      if (p.kind === 'coffee') cups += 1;
      else if (p.kind === 'nitro') nitros += 1;
      else hearts += 1;
    }
    if (frames % 6 === 0) {
      let n = 0;
      for (const row of w.rows) {
        const rel = row.distPx - w.distancePx;
        if (rel < -70 || rel > 250) continue;
        for (const l of row.lanes) if (l) n += 1;
      }
      for (const ov of w.overtakers) {
        const rel = ov.distPx - w.distancePx;
        if (rel >= -70 && rel <= 250) n += 1;
      }
      onScreen.push(n);
    }
    if (w.overtakers.length > lastCount) passes += w.overtakers.length - lastCount;
    lastCount = w.overtakers.length;
  }
  if (tightRun > 0) runs.push(tightRun + 1);
  return { cars, runs, tightGaps, looseGaps, doubles, speeds, passes, breakdowns, onScreen,
    cups, nitros, hearts, minFuel, rows: seen.size, km: w.distancePx / PX / 1000 };
}

const all = { cars: 0, runs: [], tightGaps: [], looseGaps: [], doubles: [], speeds: [], passes: 0, breakdowns: 0, onScreen: [], cups: 0, nitros: 0, rows: 0, minFuel: 1e9, km: 0 };
for (let i = 0; i < SEEDS; i += 1) {
  const r = run(1000 + i * 7);
  all.cars += r.cars;
  all.runs.push(...r.runs);
  all.tightGaps.push(...r.tightGaps);
  all.looseGaps.push(...r.looseGaps);
  all.doubles.push(...r.doubles);
  all.onScreen.push(...r.onScreen);
  all.cups += r.cups;
  all.nitros += r.nitros;
  all.rows += r.rows;
  all.minFuel = Math.min(all.minFuel, r.minFuel);
  all.speeds.push(...r.speeds);
  all.passes += r.passes;
  all.breakdowns += r.breakdowns;
  all.km += r.km;
}

const q = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const hist = (a) => {
  const h = {};
  for (const v of a) h[v] = (h[v] || 0) + 1;
  const total = a.length;
  return Object.keys(h).sort((x, y) => Number(x) - Number(y))
    .map((k) => `${k}:${(h[k] / total * 100).toFixed(0)}%`).join(' ');
};

console.log(JSON.stringify({
  seeds: SEEDS,
  km: all.km.toFixed(1),
  carsPerKm: (all.cars / all.km).toFixed(0),
  queueLength: {
    histogram: hist(all.runs),
    longest: Math.max(...all.runs),
    mean: (all.runs.reduce((a, b) => a + b, 0) / all.runs.length).toFixed(2)
  },
  speedFracOfPlayer: {
    p10: q(all.speeds, 0.1).toFixed(2),
    p50: q(all.speeds, 0.5).toFixed(2),
    p90: q(all.speeds, 0.9).toFixed(2),
    stopped: (all.speeds.filter((v) => v < 0.02).length / all.speeds.length * 100).toFixed(0) + '%'
  },
  gapPx: {
    tight: { n: all.tightGaps.length, p50: q(all.tightGaps, 0.5).toFixed(0) },
    loose: {
      n: all.looseGaps.length,
      p10: q(all.looseGaps, 0.1).toFixed(0),
      p50: q(all.looseGaps, 0.5).toFixed(0),
      p90: q(all.looseGaps, 0.9).toFixed(0)
    }
  },
  carsOnScreen: {
    mean: (all.onScreen.reduce((a, b) => a + b, 0) / all.onScreen.length).toFixed(2),
    p10: q(all.onScreen, 0.1),
    p90: q(all.onScreen, 0.9),
    emptyRoad: (all.onScreen.filter((v) => v === 0).length / all.onScreen.length * 100).toFixed(0) + '%'
  },
  carsPerRow: hist(all.doubles),
  rowsPerKm: (all.rows / all.km).toFixed(1),
  cupsPerKm: (all.cups / all.km).toFixed(1),
  cupsPerRow: (all.cups / all.rows).toFixed(2),
  lowestFuel: all.minFuel.toFixed(0),
  passesPerKm: (all.passes / all.km).toFixed(1),
  breakdownsPerKm: (all.breakdowns / all.km).toFixed(1)
}, null, 2));
