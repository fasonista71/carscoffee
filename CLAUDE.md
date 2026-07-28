# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Cars & Coffee: an 8 bit style top down endless driver. The browser
prototype in this repo is the SOURCE OF TRUTH for game feel and
simulation logic. The next phase is a native iOS port (SwiftUI shell,
SpriteKit renderer, a pure GameCore Swift package translated from
src/game). ROADMAP.md is the plan of record; README.md holds the full
milestone log and tuning guide.

## Hard rules, in priority order

1. NO em dashes or en dashes anywhere: not in code, comments, docs,
   commit messages, or replies. Use commas, colons, or parentheses.
   Check before every commit with bash unicode escapes, which expand
   at runtime so the forbidden characters never appear in any file,
   this one included (a grep -P \x{} pattern silently fails under a
   non UTF-8 locale, which once masked the check entirely):
   `grep -rn $'\u2014\\|\u2013' src/ test/ *.md`
   No output means clean. CLAUDE.md itself must also come up clean.
2. `src/game/` stays PURE and deterministic. No window, document,
   navigator, canvas, Math.random, Date, performance,
   requestAnimationFrame, localStorage, or Audio. The purity test
   scans source TEXT including comments, so those words cannot appear
   in game/ comments either (write around them). All randomness flows
   through the seeded PRNG in rng.js with state passed explicitly.
3. Every gameplay number lives in `src/game/tuning.js`. No magic
   numbers anywhere else. Values chosen by feel are marked GUESS.
   Colors live in the palette section; render only constants live in
   the render section.
4. The fairness oracle is the gate. Never weaken a test to make a
   change pass. If the oracle finds a doom, the GAME is wrong (or,
   rarely, the oracle's model of the game is stale). Every trap it
   has found became a permanent generation rule.
5. Jason tests by feel on his iPhone. Ship small, verifiable
   increments; he gives feedback in plain language and expects
   honest tradeoff notes, flagged guesses, and no invented APIs.

## Commands

- Run all tests: `npm test` (this is bare `node --test`; pointing it
  at a directory does not work)
- One file: `node --test test/fairness.test.js`
- Serve for a phone or browser: `python3 serve.py 8080` (serves with
  caching disabled; ALWAYS use this, a stale phone cache once mixed
  old and new modules and burned an hour)
- BUILD_TAG in tuning.js shows bottom right of the title screen.
  Bump it when shipping so staleness is visible at a glance.

## Layout

- `src/game/` pure simulation: world.js (step order, spawning,
  collisions, overtakers, yields, breakdowns), generator.js (row
  specs from the PRNG), tuning.js (every number), rng.js
  (mulberry32), entities.js (player tween, lane math)
- `src/render/` canvas 2d pixel renderer: 180x320 logical buffer
  blitted at integer scale with smoothing off, 3x5 bitmap font,
  procedural sprites plus the TMD Studios car sheet (attribution in
  assets/CARS_CREDITS.txt, link required: tmdstudios.wordpress.com)
- `src/app/` bootstrap, state machine, menus, event dispatch to
  audio, haptics, particles, shake
- `src/audio/` event registry plus synthesized placeholders; real
  files drop into the MANIFEST map, nothing else changes
- `src/input/` touch (viewport wide listeners, per finger tracking,
  tap resolves to the lane under the finger) and keyboard
- `test/` determinism (10k frames hash identical), purity guard,
  fairness oracle, fuel, hazards, taps, distribution
- `_to_delete/` is gitignored trash from remote sessions; ignore it,
  or empty it locally whenever

## The simulation, in brief

Fixed 60Hz accumulator with interpolated rendering. The world steps
by intents; app code never reaches into game state. All world to app
communication is `world.events`, an array of strings drained once
per step for sounds, haptics, particles, and shake.

Fairness is BY CONSTRUCTION, then verified:

- Rows are spaced at least a fair minimum: worst case two lane
  crossing plus reaction time at current speed, plus body extents
  (inflated by the per car stagger span).
- The traffic clamp slows rear rows before any pair's floor is
  violated, so moving rows never bunch into a wall.
- Clusters (tight spacing) may only continue when the previous row's
  OPEN LANES all stay open: open sets grow, never shrink, inside a
  cluster. Narrowing takes a full fair gap first.
- Aggro rows target the player's committed lane per tier; targeted
  patterns obey all the same floors.
- Breakdowns (single stopped car, hazard flashers) run on a jittered
  distance cadence, roughly every 500m, never inside a pack, never
  two abreast. Everything else that rolls stalled crawls instead.
- One pass event at a time: a lone speeder or one pursuit pair
  (emergency vehicle always CHASING, never leading or solo). Cars in
  the pass lane merge out of the way when fair, otherwise the pass
  does not spawn; rows spawned during a pass are rebuilt off the
  pass lane. Two guards from oracle finds: concurrent overtakers
  must share a lane, and a forced double row never opens only an
  approaching overtaker's lane.
- Slicks claim gaps large enough for their forced slide recovery and
  refuse to slide the player into traffic or an overtaker's path.

The oracle (test/fairness.test.js) drives the REAL simulation for
100 seeds across 30000 frames each, through all six tiers. It
predicts meet events by replaying the clamp forward, then runs a
time stepped DP over lane slots: a cautious pass that also avoids
static hazards, a cautious pass without them, then an exact doom
check at reduced tween scale. If it reports a doom, reproduce with a
small script that reruns the seed and prints rows, overtakers, and
the DP grid around the failing frame; find which generation rule is
missing; add the rule; rerun everything.

## Debugging conventions

- Repro scripts: import world.js and tuning.js directly in a .mjs
  file, zero out fuel drains, step the world with the oracle's
  planner, log around the failure frame. Never guess from the
  assertion message alone.
- Measure, do not eyeball: density, cadence, and frequency claims
  come from headless ghost runs (force hearts and status back each
  frame, count events). Overlap and fairness claims come from
  invariant checkers over multiple seeds.
- Visual checks: screenshots via Playwright chromium
  (`executablePath: '/opt/pw-browsers/chromium'` in the cloud
  sandbox; plain Playwright locally). To screenshot rare states,
  temporarily crank the relevant tuning value, capture, then restore
  the file and verify with grep that it is restored.

## Current feature dials worth knowing

- Tiers every 2000m: speed, density, cluster pressure, aggro share
  (0.22 to 0.62), and overtaker chance (0 to 0.6) all scale; scenery
  theme changes per tier (mountain, desert, snow, beach, city).
- Three hearts; road hearts appear only after two are spent.
- Boost: 2000ms at 1.65x. The multiplier must stay BELOW the
  slowest overtaker multiplier (1.7) or the pass guard's closing
  speed math degenerates; the guard bounds boost as distance, two
  full bursts.
- Boost prompt: meter pulses and a BOOST! callout flashes while a
  speeder bears down and a boost is banked.
- Emergency fleet is stand in art: blue truck as SWAT van, red
  flatbed as fire truck, blue car as police, wig wag lights placed
  per sprite on the vehicle's own cab or roof (never on the flatbed
  cargo). Swap EMERGENCY_VARIANT_IDS in world.js when real art
  arrives.

## iOS port phase (when it starts)

Follow ROADMAP.md. Port order: engineering hardening first (config
snapshot per run, explicit state machine, frame stamped inputs,
RenderSnapshot, golden tests, replays), then GameCore in Swift with
the same tests, then SpriteKit rendering. The backlog includes smart
traffic awareness (continuous headway braking for every vehicle,
with the oracle taught to replay it) and the design decisions that
are Jason's call: coffee orders, destination runs, car culture
progression, Sunday Run daily seeds.
