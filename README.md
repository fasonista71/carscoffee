# Cars & Coffee

An 8 bit style top down endless driver. Browser prototype, built as a
vertical slice: one vehicle, one environment, the complete core loop.

The plan of record, including the reconciled external architecture
review and the native iOS port path, lives in ROADMAP.md.

## Current status: milestone 6. The build order is complete.

All twelve build order steps are done. Latest additions:

- Traffic yields to a pass: exactly one pass event runs at a time (a
  lone speeder or one pursuit pair), and cars in the speeder's lane
  pull out of the way instead of blocking the spawn. A lone car in
  open road merges into the middle lane and becomes the player's
  next problem; packed rows, clusters, and cars too close to the
  player slide onto the shoulder instead, which only ever opens
  lanes and so can never create an unfair pattern. Breakdowns cannot
  move and still block a pass. Passes prefer the edge where cars
  will have to pull over, so the yield is the spectacle. Measured:
  nearly every pass moves traffic, and pass frequency rose about 40
  percent because blocked lanes no longer veto spawns.
- Pursuits: about a third of passes (emergencyChance) bring the law
  along. The emergency vehicle only ever chases, riding chaseGapPx
  behind the speeder in the same lane with wig wag roof lights going,
  red and blue trading sides with a white strobe between, one long
  two car pass announced by a siren chirp and rumble. The three unit
  fleet is stand in art until real assets arrive: blue truck as SWAT
  van, red truck as fire truck, blue car as police
  (EMERGENCY_VARIANT_IDS in world.js).
- Clusters can no longer narrow mid stream: inside a cluster the set
  of open lanes may grow but never shrink, because tight spacing
  leaves no room to cross. A narrowing pattern now takes a full fair
  gap first. This closed a latent trap the oracle found (seed 71):
  middle blocked rows luring the player wide, then tight double rows
  walling that side off with no time to escape.
- Organic packs: each car slides up to staggerMaxPx forward or back
  of its row line, and bumper gaps inside clusters vary over a wider
  span (tightGapJitterSpan), so traffic staggers like the real thing
  instead of marching in ranks. Fairness holds because every row's
  stored extent is inflated by the full stagger span while collisions
  use the exact per car positions.
- Breakdowns are a scheduled surprise now, like the overtakers:
  roughly every 500 meters (jittered, breakdownEveryMeters and
  breakdownJitterFrac) a single car stops dead with blinking amber
  hazard flashers, never two side by side and never inside a pack. A
  double row that draws the breakdown sheds down to one car first.
  Everything else that rolls stalled crawls at the tier's slowest
  fraction instead of stopping, though traffic still jams up to a
  standstill behind a breakdown thanks to the clamp.
- Overtakers arrive about half again as often per tier
  (overtakerChance now 0.33 to 0.6 past 2000 meters).
- Aggro traffic: a rising share of full gap rows per tier (22 to 62
  percent, TUNING.tiers[].aggro) target the player directly. A single
  block lands on your committed lane; a forced double row opens the
  lane farthest from you. Spacing and corridor rules are untouched,
  so every targeted pattern is still provably escapable; it just
  refuses to be dodged by standing still.
- Overtakers are per tier now (TUNING.tiers[].overtakerChance, 0 to
  40 percent per second check), with jittered spawn distance, so
  passes get frequent and unpredictable late. Two new fairness rules
  came out of the oracle: concurrent overtakers must share a lane
  (opposite edge passes plus one middle blocked row would wall all
  three lanes), and a forced double row never opens only a lane an
  approaching overtaker owns.
- The boost prompt: while a sports car is bearing down from behind
  and a boost is banked, the Boost meter pulses, a BOOST! callout
  flashes over your car, and the rising edge gets a chirp and a
  rumble. Scooting forward is the escape Jason asked to make obvious.
- Hearts are no longer replenishable until you have spent at least
  two (TUNING.lives.minSpentForPickup); the road offers no refill
  before that.
- The fairness oracle got smarter with the game: its cautious pass
  now steers around rubble and slicks like a competent player. Seed
  23 taught this: the old oracle drove blind into rubble with a
  sports car closing in the same lane, and the slowdown compressed
  its escape window.
- Scenery themes per tier: mountain roads to start, then desert,
  snow, beach, and cityscape as the tiers climb, each with its own
  ground color and roadside props on both parallax bands. The theme
  switches under the tier banner. Colors live in
  TUNING.sceneryThemes; drawing styles in the renderer.
- HUD rearranged: hearts sit centered on the top row between the
  distance and best plates; the gauge row is the coffee meter on the
  left two thirds and a labeled Boost meter on the right third.
- The oil slick grew to 34x16 with thicker, brighter chevrons and a
  sheen streak, with the hitbox to match.

Earlier in milestone 6:

- Phone menu taps fixed three ways: buttons meet the 44 point touch
  minimum with padded hit areas, a slightly sloppy press now presses
  buttons instead of being discarded as a failed swipe, and serve.py
  serves with caching disabled so a phone can never mix old and new
  modules. The build tag (bottom right of the title) makes staleness
  visible at a glance.
- Three hearts instead of one stumble: each lethal contact spends a
  heart with the spin and invulnerability treatment, the last heart
  ends the run, and hearts appear on the road as rare pickups.
- HUD row two, flush left: coffee gauge, boost pill, then the three
  hearts.
- Parallax roadside (step 11): far buildings drift slower than the
  near trees. Screen shake on crash, stumble, and rubble; a particle
  puff on pickups; speed lines while boosting.
- The full dev tuning overlay (step 12): boost duration and gating,
  both fuel drains, refill, rubble cost, cup rate, tension ratio,
  hazard rate, and per tier thresholds, speeds, and gap spans, all
  live, scrollable panel.
- The fairness oracle upgraded to time stepped lane reachability, and
  overtaker spawn guards hardened again: edge lanes only (crossing
  corridors always transits the middle lane), and all timing reasons
  over the player's possible speed range rather than a transient
  slowed instant.

From milestone 5:

- Starting or restarting a run is ONLY the primary menu button, with
  a short cooldown after a menu opens, so a frantic last tap can
  never launch a run by accident. Keys and swipes do nothing in
  menus.
- Menus on title, pause, and game over: car swap (Sports car and
  Lambo unlocked, each with its own persisted high score), sound
  on/off, rumble on/off. Pause via Escape, P, a two finger tap, or
  backgrounding; three finger tap still opens the dev overlay.
- Sound (build step 10): synthesized Web Audio placeholders for every
  registry event, a quiet chip bass loop, a persisted mute, and the
  iOS unlock riding the Start button gesture. Dropping in real sound
  files is editing the MANIFEST map in src/audio/audio.js.
- Haptics behind an interface: navigator.vibrate patterns for crash,
  stumble, rubble, slick, boost, tier up, overtake. iPhones ignore
  vibrate in Safari today; the seam is where native haptics land.
- Overtakers: past 2000 meters, sports cars occasionally blast past
  from behind, telegraphed by flashing chevrons at the bottom of
  their lane. Spawn guards keep them fair: clear runway, never into
  a lane the corridor pins you to, into your own lane only on open
  road, and slicks refuse to slide you into their path.
- The Cars & Coffee badge on the title screen, and a two row HUD
  with double size digits and a boost pill.

From milestone 4:

- Six difficulty tiers at distance milestones (every 2000 meters). Each raises scroll speed, traffic density, cluster
  pressure, double row frequency, and the spread of traffic speeds,
  and scales passive fuel drain. Transitions ramp over about two
  seconds and announce themselves with a flash and a Tier banner.
- Oil slicks: not lethal, but they throw the car into the lane their
  chevrons point at and kill steering for 0.8 seconds. A slick claims
  a gap big enough for its recovery guarantee at spawn, and because
  moving traffic can rearrange itself around a static puddle, two
  runtime guards close the loop: traffic that drives over a slick
  smears it away, and a slick never fires unless its target lane is
  clear for the whole lock distance. A slide is never an unavoidable
  death sentence; it is a setup you mismanage. Half the slicks put a
  cup just past the puddle in its own lane, the brief's classic: the
  safe line and the fueled line differ.
- Rubble: not lethal. Costs a chunk of fuel, cuts speed briefly
  (which costs score), and ends an active boost.
- Stumble: the first lethal contact spins the car, drops speed, and
  grants 1.2 seconds of blinking invulnerability instead of ending
  the run. The heart by the fuel gauge shows whether it is spent.
- Score and HUD per the brief: a shaded band across the top holding
  the distance plate, the fuel gauge with cup icon and stumble heart,
  and the best plate, all in one cartoon capsule style. High score
  persists. Game over shows the result, your best, and celebrates a
  new one.

From milestone 3:

Build order steps 1 through 6 are done, plus items pulled forward by
agreement: the dev tuning overlay (movement and fuel slices) and the
headless determinism test. New in milestone 3:

- The fuel spine: a 0 to 100 meter, passive drain, coffee as the only
  refill, boost as a fixed 1.2 second burst gated by minimum fuel,
  and a distinct out of fuel death
- Coffee cups with real art (16x20, transparent, gentle shiver),
  placed per brief section 5: at least 70 percent in tension beside
  or in the forced path of traffic, free cups only ever in a lane
  that is open in the row they precede
- Variable traffic speeds: rows are stalled or move at a fraction of
  the player's speed, and a traffic clamp slows rear rows before they
  could bunch into an unfair wall
- HUD fuel gauge: a centered cartoon capsule with the coffee cup as
  its icon, segment ticks, highlight and shadow bands, red fill with
  a shivering cup when low, and a bright ring while boosting
- The fairness gate upgraded to an oracle that drives the real
  simulation with clamp aware prediction, 100 seeds at six speeds

From milestone 2:

- Stalled car obstacles with real sprite art, one hit death, and a
  game over screen with one tap instant restart
- A track generator with the fairness invariant built in by
  construction: no row ever blocks all lanes, and row spacing always
  allows a worst case two lane crossing plus reaction time at the
  current speed and tween duration
- The generator solvability gate: a forward search over the lane grid
  proves a survivable path for 100 seeds at six speeds, including the
  speeds future difficulty tiers will reach

From milestone 1:

- Fixed 60Hz timestep with accumulator, clamp on resume, interpolated rendering
- Scrolling three lane road on a 180x320 logical screen, integer pixel upscale
- Lane changes with a 120ms tween and exactly one queued input
- Keyboard input: arrows and A/D for lanes, up, W, or space for boost (boost is a no op until step 6)
- Touch input: swipe and tap zones, both active
- Title, playing, and paused states; auto pause on tab switch or window blur
- Dev overlay with live movement sliders
- Headless determinism test and a game purity guard test

Not built yet, by design: parallax and juice (step 11) and the full
dev overlay (step 12). The car option in the menus covers vehicle
selection; a fuller select screen can grow from it when more
vehicles unlock.

## How to run

From the project folder:

    python3 serve.py

This serves on port 8080 with caching disabled, which matters on
phones: a cached module from an older build can silently mix with new
ones. Any static server works in a pinch (python3 -m http.server
8080, npx serve), but serve.py is the recommended one. The title
screen shows the build tag bottom right; if it does not match the
README's milestone, the phone is looking at a stale cache.

Then open http://localhost:8080 in a browser. A plain double click on
index.html will not work in Chrome: module scripts are blocked on the
file protocol by CORS. This is a Chrome behavior, not a bug here.

## Testing on an iPhone

1. Make sure the phone and this computer are on the same Wi-Fi network.
2. Start the server as above.
3. Find this computer's LAN address, for example with
   `ipconfig getifaddr en0` on macOS.
4. On the iPhone, open Safari and visit `http://THAT-ADDRESS:8080`.

What to judge at this checkpoint: lane change feel (tween duration and
the one slot input queue), swipe versus tap preference, scroll speed,
and whether the frame rate holds steady. The dev overlay lets you tune
all of these live: toggle it with a three finger tap on the screen, or
backtick on a keyboard.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Lane left | Left arrow or A | Swipe left, or tap left third |
| Lane right | Right arrow or D | Swipe right, or tap right third |
| Boost | Up arrow, W, or space | Swipe up, or tap your own lane |
| Pause | Escape or P | Two finger tap |
| Dev overlay | Backtick | Three finger tap |
| Start / restart | Menu button only | Menu button only |

Touch is read across the whole screen, letterbox included, and each
finger is tracked independently, so a tap that starts before the
previous finger lifts still counts.

Swipe is the primary input. Taps are the secondary path and default
to lane targeting: a tap means "go to the lane under my finger". The
car moves one lane toward it, a tap on the car's own lane is boost,
and taps in the letterbox or offroad pull toward the nearest lane.
The original screen thirds scheme from the brief is still implemented
and can be A/B tested live via the Tap mode select in the dev overlay
(TUNING.input.tapMode).

## Tests

    npm test

Runs two suites in Node (18 or newer), no dependencies:

- `test/determinism.test.js` imports only `src/game/`, runs 10000
  simulated frames from a fixed seed with a scripted input sequence,
  twice, and asserts identical FNV-1a hashes of the final world state.
- `test/fairness.test.js` is the solvability gate from brief section
  4, upgraded for moving traffic: an oracle player drives the real
  simulation for 100 seconds per run, predicting meet windows with
  the same traffic clamp rule the world uses and lane searching for a
  surviving path. 100 seeds at six speeds, including the speeds
  future tiers will reach. Any unfair situation fails the test with
  its seed, speed, and road position.
- `test/fuel.test.js` covers the fuel spine: drain timing, boost
  duration, gating and no restacking, and coffee refills.
- `test/hazards.test.js` covers slick slides and steering lockout,
  rubble costs, stumble forgiveness and its one use limit, and
  invulnerability ignoring hazards.
- `test/distribution.test.js` guards track composition: the center
  lane stays contested, slicks and rubble actually occur, and every
  cup sits still.
- `test/tap.test.js` covers positional tap semantics.
- `test/purity.test.js` scans every file in `src/game/` for forbidden
  identifiers (window, document, navigator, performance, Date,
  Math.random, requestAnimationFrame, localStorage, canvas, Audio).

## Tuning guide

Everything lives in `src/game/tuning.js`. Current parameters and what
they do to feel:

| Parameter | Default | Effect |
| --- | --- | --- |
| logic.hz | 60 | Simulation rate. Leave alone; everything is derived from it. |
| logic.maxFrameDeltaMs | 100 | Largest frame gap the loop will simulate. Bigger means more catch up after a stall, smaller means time visibly slows instead. |
| movement.laneTweenMs | 170 | Lane change duration, paired with smoothstep easing for an organic shift. Lower is snappier but harsher; higher is smoother but mushier and lengthens the window where a queued input waits. |
| movement.maxQueuedInputs | 1 | Brief requirement. Raising it would let inputs pile up and fire late. |
| speed.basePxPerSec | 150 | World scroll speed. The single biggest feel dial right now. |
| speed.pxPerMeter | 8 | Display conversion only, for the distance readout. |
| input.tapMode | 'lane' | 'lane' targets the lane under the finger; 'thirds' is the original left/center/right scheme. Both live, switchable in the overlay. |
| input.swipeThresholdPx | 24 | Finger travel before a touch commits to being a swipe. Lower fires sooner but misreads sloppy taps; higher feels laggy. |
| input.tapMaxMs | 500 | Longest press that still counts as a tap on release. Generous on purpose: rejecting a real tap costs far more than accepting a slow one. |
| render.playerYPx | 252 | Player position on screen. Higher on screen gives more reaction time visually. |
| obstacles.firstSpawnDistPx | 600 | Clear road before the first obstacle. |
| obstacles.reactionBufferMs | 260 | Human reaction time baked into fair row spacing. Lower makes the track denser and meaner everywhere. |
| obstacles.gapJitterMax | 1.35 | Row gaps run from the fair minimum to this multiple of it. Lower is relentless, higher is breathing room. |
| obstacles.doubleRowChance | 0.42 | How often a row blocks two lanes, forcing a specific open lane. |
| obstacles.stalledHitbox, hitboxShrinkPx | | Collision forgiveness. Raise shrink if deaths feel cheap. |
| traffic.stalledChance | 0.3 | Share of rows that sit still versus move. |
| traffic.speedFracMin/Max | 0.12/0.62 | Moving traffic speed band as a fraction of your base speed. Near stalled traffic rushes at you; fast traffic creeps back and forces long passes. |
| traffic.clampMarginPx | 12 | How early rear traffic slows behind the row ahead. |
| traffic.clusterChance / clusterMaxLen / clusterRerolls | 0.8 / 6 / 2 | The crowding dials. Clusters pack rows bumper to bumper along a guaranteed open corridor; full crossing gaps only appear where the corridor shifts. |
| traffic.tightExtraGapPx | 8 | Breathing room between packed bumpers inside a cluster. |
| fuel.passiveDrainPerSec | 2.2 | The clock on every run. 100/this is your no coffee survival time in seconds. |
| fuel.boostDrainPerSec | 12 | Extra burn while boosting. The price of score rate. |
| fuel.coffeeRefill | 18 | How much a cup matters. |
| boost.durationMs / speedMultiplier / minFuel | 1200 / 1.45 / 10 | The whole boost decision in three numbers. |
| coffee.spawnChancePerRow | 0.22 | Cup frequency. At this setting the fuel math is deliberately tight: collecting most cups roughly breaks even, missing many ends the run. |
| tiers[] | 6 entries | The difficulty curve. Each entry sets speed, gap looseness, double row rate, cluster pressure, stalled share, and the traffic speed band for one tier, entered at its atMeters milestone. |
| tierRampPerFrame | 0.003 | How gradually a tier's speed jump arrives. |
| hazards.spawnChancePerGap | 0.3 | How often a full gap carries a slick or rubble (split by the environment's obstacle weights). |
| hazards.slick.slideLockMs | 800 | How long a slick owns your steering. |
| hazards.rubble.fuelCost / slowMs / slowFactor | 12 / 750 / 0.6 | What rubble takes from you. |
| stumble.invulnMs / spinMs / slowMs | 1200 / 750 / 1000 | The shape of the one free mistake. |
| coffee.tensionRatio | 0.75 | Share of cups placed against hazards rather than free. Keep at or above 0.7 per the brief. |
| render.dash*, render.edgeLine* | | Road paint dimensions. Cosmetic. |

The dev overlay exposes lane tween, scroll speed, swipe threshold, and
tap max live. Overlay changes are not persisted: note numbers you like
and put them in tuning.js.

## Project structure

    assets/       car spritesheet, atlas, and license text
    src/game/     pure simulation, no browser globals, runs in Node
    src/render/   Canvas 2D drawing, reads state, never mutates
    src/input/    keyboard and touch adapters, normalized to intents
    src/audio/    seam only for now; placeholders arrive in step 10
    src/app/      bootstrap, loop, state machine, dev overlay
    test/         headless tests

## Art credits and the swap seam

Car sprites are from the "Road To Rage" vehicle pack by TMD Studios:
https://tmdstudios.wordpress.com (license asks for this link; the
original license text ships in assets/CARS_CREDITS.txt). The sheet
plus its atlas live in assets/ and are sliced at load by
`src/render/sprites.js`.

The swap seam: game logic knows only sprite keys (`player_car`,
`pickup_coffee`) and art variant indices, never files or pixels. The
traffic pool is the TRAFFIC_VARIANTS list in tuning.js: 48 frames,
nearly the whole sheet, each with its true size as its collision box,
so trucks occupy their visual length. Excluded: the taxi family, the
motorcycles, and the junk bed pickups (all cut by request), the
dumptruck (wider than a lane), and the porsche (the player). The generator
avoids repeating any of the last six picks, so neighbors rarely
match. Because hitbox heights vary, fair gaps and the traffic clamp
are computed per pair of rows: truck follows truck at a bigger
distance than mini follows mini.

Crowding comes from clusters: a row may pack bumper to bumper behind
the previous one only when every lane of the current guaranteed open
corridor stays open through it, so a player driving the corridor
never needs a lane change there is no room to make. Full crossing
gaps appear exactly where the corridor shifts. The oracle test
verifies survivability of the whole arrangement, dynamics included.
The
coffee cup is Jason's art, reduced to its native 16x20 pixels with a
transparent background, stored as assets/coffee.png. Its shiver is
render only and never affects collection. Text uses a 3x5 bitmap
font in `src/render/font.js`: no fillText antialiasing, swappable in
one place.

Audio follows the same pattern when it arrives in step 10: a manifest
mapping event names to file paths, nothing more.

## Assumptions, guesses, and verification notes

Verified against current sources during this build:

- Chrome blocks module scripts on the file protocol, which is why a
  static server is required. See the whatwg discussion at
  https://github.com/whatwg/html/issues/8121
- Safari support for CSS `image-rendering: pixelated` on canvas has
  documented gaps (https://github.com/Fyrd/caniuse/issues/2052 and
  https://github.com/Fyrd/caniuse/issues/5628), so the upscale is done
  by blitting a 180x320 buffer with `imageSmoothingEnabled = false`,
  which does not depend on that CSS at all. The CSS remains as a
  backstop only.
- Touch handling uses Touch Events rather than Pointer Events because
  iOS Safari pointer support has a history of quirks
  (https://github.com/Fyrd/caniuse/issues/5973). Not certain the
  quirks are still current; the checkpoint on a real device is the
  real test.

Design choices worth revisiting by feel:

- Every coffee cup sits still on the road (one movement treatment,
  by request). Cups placed beside stalled rows stay in tension for
  good; cups placed beside moving rows watch their row pull away and
  decay into free cups.
- The center lane is deliberately blocked more often than the edges
  (obstacles.laneBlockWeights and doubleOpenWeights), so camping the
  middle cannot pay. Movement is the game. A regression test keeps
  the center at least three quarters as contested as the busiest
  edge.
- The fair row gap includes a body extent term (player length plus
  obstacle length), because gaps are measured center to center but
  maneuvering happens in what is left over. This is why traffic
  density reads as it does; tighten reactionBufferMs before touching
  the extent term.
- A tap on your own lane is the boost gesture in lane tap mode. It
  replaces the brief's center third boost tap; judge it now that
  boost is real.

Guesses, clearly labeled, awaiting the feel checkpoint:

- Every value marked GUESS in tuning.js: tween 120ms, scroll 150 px/s,
  swipe threshold 24px, tap window 250ms, accumulator clamp 100ms.
- The determinism test proves identical results within one JS engine
  on one machine, which is what the architecture requires. It does not
  prove bit identical floats across different engines or devices.
- Suppression of double tap zoom and rubber band scrolling relies on
  `touch-action: none`, `overscroll-behavior: none`, a fixed body, and
  preventDefault in the touch adapter. I have not verified on a real
  iPhone that all of these hold in current iOS Safari; that is part of
  what the checkpoint is for.
- The iOS audio unlock requirement will be verified against current
  documentation when audio is built in step 10, not assumed from
  memory.
