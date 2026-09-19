/*
  Borrowing TUNING back.

  Three test files reach into the shared TUNING singleton at module
  scope to set up their conditions: fairness mutes fuel, fuel pushes
  traffic out of reach and truncates the tier list in place, and
  distribution mutes fuel too. Each one says in a comment that it runs
  in its own process and cannot leak, which is true only of the node
  test runner's current default. Run the same suite with
  --experimental-test-isolation=none and the mutations cross files, and
  the direction that failure goes is the bad one: the safety critical
  file is the one doing the muting, and what it mutes is what another
  file then measures.

  So the mutation gets a scope. Take a snapshot, apply the change,
  restore afterwards, and put the values back into the objects that are
  already there rather than replacing them, because every module holds
  a reference to this one object.

  Not a *.test.js file, so the runner does not pick it up as a suite.
*/

import { before, after } from 'node:test';
import { TUNING } from '../../src/game/tuning.js';

export function snapshotTuning() {
  return structuredClone(TUNING);
}

export function restoreTuning(snapshot) {
  restoreInto(TUNING, snapshot);
}

function restoreInto(target, snapshot) {
  for (const key of Object.keys(target)) {
    if (!(key in snapshot)) delete target[key];
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (Array.isArray(value)) {
      if (!Array.isArray(target[key])) {
        target[key] = structuredClone(value);
        continue;
      }
      target[key].length = 0;
      for (const item of value) target[key].push(structuredClone(item));
    } else if (value && typeof value === 'object') {
      if (!target[key] || typeof target[key] !== 'object') target[key] = structuredClone(value);
      else restoreInto(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

/*
  The shape every file that needs this uses: wrap the suite in a
  describe, apply the setup in before, hand the values back in after.

    describe('fuel', () => {
      useTuning((t) => { t.obstacles.firstSpawnDistPx = 1e9; });
      test(...)
    });

  Called inside the describe callback, so the hooks land on that suite
  rather than on the root, which is the whole point: a root hook under
  --experimental-test-isolation=none is shared with every other file in
  the process.
*/
export function useTuning(apply) {
  let snapshot = null;
  before(() => {
    snapshot = snapshotTuning();
    apply(TUNING);
  });
  after(() => {
    restoreTuning(snapshot);
    snapshot = null;
  });
}
