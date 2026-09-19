# Stability pass, M8

Version 0.1.0 to 0.2.0, BUILD_TAG M7 to M8.
Bundle: `_dist/build-M8-20260919-030800/cars-and-coffee-web-M8.zip`, 302KB, md5 `6d806d08c7d5c5f7026156c922b0e65a`.

Nine items from the preflight report, all closed. Nothing in the
simulation was touched. `node --test test/*.test.js` is 21 of 21.

## Blockers

**1. Returning players' high scores.** The live build files scores under
`cc.high.sports.city.v1` and `cc.high.lambo.city.v1`; this build reads
`coupe` / `fourbyfour` / `classic`. Verified against the shipped zip,
not inferred from source. `migrateLegacyHighScores()` in `main.js`
scans storage for keys under an id this build no longer has, takes the
best, and seeds it into any current id that has no score yet. It never
lowers a score, never touches a current player's per car bests, leaves
the old keys in place so it is reversible, and runs once behind
`cc.migrated.v2`.

**2. A second finger killed the controls.** `active.clear()` on the
second contact was discarding every in flight tap. Removed. The
two finger pause now fires only when two fingers were down together
and neither of them played a gesture, so two thumb play and a resting
palm both work.

**3. A cancelled gesture poisoned the next tap.** `onTouchCancel` now
resets the gesture state, so a notification or an incoming call no
longer leaves a later single tap emitting a pause.

**4. The dev overlay shipped and three fingers opened it.** The three
finger gesture is gone entirely. `devOverlay.js` is now a dynamic
import behind `?dev`, and the packaging step leaves the file out, so
its absence is the off switch.

**5. Any asset failure was a permanent black screen.** `index.html`
now carries a boot card, painted before a single module is fetched,
with a 15 second stall timeout and a retry button. It is a classic
script, not a module, because a module graph that fails to parse runs
nothing at all. `main.js` reports success or failure into it.

**6. A throwing AudioContext killed all input forever.** `unlock()` was
the first unguarded statement of the intent handler. The context
construction now cannot throw, the failure is remembered so every
voice no ops, and `play`, `startMusic`, `scheduleMusic` and
`updateSiren` are each wrapped. A silent game, never a dead one.

## Cheap insurance

**7. Cache busting.** `tools/build-itch.sh` ships the source as
`src-M8/` and points the one script tag at it, so an in place itch
update cannot mix old and new modules. It also builds into a fresh
directory every time, names the zip after the tag so the previous one
survives as a rollback, and generates the shipped `index.html` from
the repo root one by a single substitution, so the two can no longer
drift.

**8. `boostFreeFrames` leaked.** Cleared on both boost cancel paths, so
a paid boost taken right after a hit costs what it says it costs.

**9. Three render timers ran on frame count.** The crash shake,
particle lifetimes and the fuel gauge flash are now stepped by wall
clock in the same 60Hz units they were tuned in, clamped so a tab
returning from the background does not flush them all at once. On a
120Hz phone they were running at double speed.

**Attribution.** The header of `src/render/sprites.js` still credited
the car art to TMD Studios' "Road To Rage" pack. Corrected.

## Verification

`tools/browser/` is a new Playwright harness that drives the built
bundle in Chromium and WebKit. It covers the seams the node tests
never reached, which is where all nine of these defects sat. See its
README. Everything passes:

- boots, paints, Start works, no console errors, all requests 200
- a tap with a second finger resting still reaches the game, and does
  not pause it
- a cancelled three finger gesture leaves the next tap clean
- no dev overlay, no sliders, `devOverlay.js` 404s
- the atlas 500s, the sheet 500s, a module 500s, a request that never
  replies: all four show a message and a retry
- a throwing AudioContext still lets the game start and run
- the migration across five storage states

## What this does not cover

- **Real 120Hz timing.** A forced 250Hz frame rate plays clean, which
  proves nothing breaks. It does not prove the shake and callout
  durations feel right on a ProMotion iPhone. That needs the phone.
- **A real finger on iOS Safari.** Playwright's WebKit has no trusted
  touch drag, so the passive listener behaviour under a real finger is
  still only covered by hand.
- **Git.** Nothing in this repository has ever been committed, and a
  stale `.git/index.lock` is blocking git operations. That is still
  the largest operational exposure here and no code change addresses
  it.
