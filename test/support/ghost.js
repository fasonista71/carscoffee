/*
  Two ways to run the simulation for a test, without reshaping the
  world for everybody else.

  Five test files used to set up their conditions by writing into the
  shared TUNING at module scope: traffic pushed out of reach, the tier
  list truncated in place, the fuel drain muted. Each said in a comment
  that it had its own process and could not leak, which is true only of
  the test runner's current default. Run the suite in one process and
  those writes cross files, and the direction it goes is the bad one:
  the files that mute the drain are the ones deciding whether the road
  is survivable, and what they mute is what another file then measures.

  Both helpers here do the same work per world instead.

  Not a *.test.js file, so the runner does not pick it up as a suite.
*/

import { step } from '../../src/game/world.js';
import { TUNING } from '../../src/game/tuning.js';

/*
  A step on an empty road at tier zero: anything the generator lays
  down during the step is taken away again, and whatever the test put
  there by hand stays, because it was already there when the step
  began. For tests that inject their own rows, hazards or overtakers
  and want nothing else on the road.
*/
export function quietStep(w, intents = []) {
  const byHand = new Set([...w.rows, ...w.hazards, ...w.pickups, ...w.overtakers]);
  step(w, intents);
  prune(w.rows, byHand);
  prune(w.hazards, byHand);
  prune(w.pickups, byHand);
  prune(w.overtakers, byHand);
  w.tier = 0;
  w.speedTierMult = TUNING.tiers[0].speed;
}

/*
  A step on the real road with an immortal driver: deaths are reverted
  and the tank is kept full, so a sampling run covers the whole
  distance rather than stopping at the first row nobody dodged.
*/
export function ghostStep(w, intents = []) {
  step(w, intents);
  if (w.status !== 'running') {
    w.status = 'running';
    w.deathCause = null;
    w.hearts = TUNING.lives.start;
  }
  w.fuel = TUNING.fuel.max;
}

function prune(list, keep) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (!keep.has(list[i])) list.splice(i, 1);
  }
}
