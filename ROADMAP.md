# Cars & Coffee roadmap

The plan of record, incorporating the external architecture and
product review received after milestone 1. The review's simulation
verdict matches this project's founding constraint: the deterministic
game core is the part to preserve, and everything platform-facing is
replaceable around it.

Important context: the review was written against milestone 1 code.
The prototype is now at milestone 5 (build order steps 1 through 10
complete), and several of the review's critiques were fixed in the
intervening milestones. The reconciliation below records what is
already done, what is adopted into upcoming work, what awaits a design
decision, and what belongs to the native port phase.

## Where the prototype stands (milestone 5)

Complete: fixed timestep deterministic core, fair generator with
clusters and per pair gaps, tiers every 2000m, fuel and coffee and
boost, slicks and rubble with runtime guards, stumble, overtakers,
score and persisted per vehicle high scores, menus with button only
start, car swap, synthesized audio with iOS unlock and a file
manifest seam, haptics interface, tap to lane input, real car art,
badge, two row HUD. Twenty headless tests including an oracle that
drives the real simulation through all tiers across 100 seeds.

Remaining from the original build order: parallax and juice
(step 11), consolidated dev tuning overlay (step 12).

## Review reconciliation

### Already done by milestone 5 (review was stale here)

- Lane targeted taps instead of screen thirds. Implemented in the
  first feedback round; thirds survive only as an A/B toggle.
- Per identifier touch tracking. Implemented; the single `start`
  variable the review quotes is long gone.
- Asset preload before gameplay. loadSprites() resolves the atlas,
  cup, and badge before the loop starts; sprites are sliced at load,
  not on first use.
- Solvability testing beyond identical hashes. The fairness gate is
  an oracle player driving the real simulation (clusters, hazards,
  overtakers, tier transitions) across 100 seeds, failing with seed
  and position. Golden state tests remain worth adding (below).
- Vehicles as config with real tradeoffs. Two unlocked cars exist;
  the review's richer car personality ideas are a design decision
  below.
- Haptic vocabulary per mechanic. Implemented at the web tier
  (vibrate patterns per event); Core Haptics textures belong to the
  native phase.

### Adopted: engineering items for the next prototype milestones

In priority order, interleaved with build order steps 11 and 12:

1. Config snapshot per run. Resolve tuning once at run creation into
   an immutable config carried by the world; store it with the seed.
   Kills the laneTweenMs three sources of truth problem the review
   correctly flags, and is the precondition for replays. The live
   overlay keeps mutating TUNING, but a run pins its own copy.
2. Explicit state machine with associated data. loading, title,
   playing(run), paused(run), results(result). Prevents invalid
   combinations; maps one to one onto the reviewer's Swift enum.
3. Frame stamped input queue. Stamp intents at capture with the
   logic frame they belong to instead of draining whatever
   accumulated. Required for honest replays and input latency work.
4. Lifecycle teardown. Every attach returns a detach and a
   controller owns them. Low cost, done alongside the state machine.
5. RenderSnapshot. One immutable snapshot object with prev and curr
   transforms per renderable, replacing ad hoc field copying.
   Discrete events (pickups, collisions, lane identity) never
   interpolate.
6. Golden state and behavior tests. seed X plus scripted inputs Y
   must equal exact state Z, committed as fixtures; plus tween
   completion frames, opposite queued inputs, edge rejection, pause
   and resume, gesture classification boundaries, serialization
   round trip.
7. Replay recording, then daily seeds. Record (seed, config, framed
   inputs); playback must reproduce the run bit for bit. The Sunday
   Run daily seed rides on this.
8. Fixed point simulation spike. The review is right that float
   determinism is per engine only. Before daily seeds count for
   anything competitive across devices, evaluate integer subpixels
   for distance and speed and basis points for fuel. This is the
   riskiest refactor on the list; it gets a spike and a decision,
   not a silent rewrite.

### Design decisions (Jason's call, prototype can trial them)

- Coffee orders and recipes. Espresso, cortado, americano, cold
  brew, decaf, mystery, plus recipe sequences. Worth noting this
  amends the brief's "coffee is the only fuel, nothing else" spine
  into a richer system; the brief's fuel tension should survive the
  change. Cheap to trial in the prototype since pickups are already
  typed data.
- Destination runs. Legs toward a cars and coffee meetup with an
  arrival moment, parking among other cars, a collectible. The
  review's "one memorable arrival moment" is the right first slice.
- Car culture progression. Cars with personality tradeoffs (vintage
  agile fragile, turbo delayed boost, tourer rubble stable, rally
  slick resistant, EV drafting regen, air cooled near miss bonus).
  The config driven vehicle system supports all of these today;
  each is a config entry plus art plus at most one small mechanic.
- Sunday Run. Same seed and placements for every player for 24
  hours. Deterministic core makes this nearly free technically
  (after replay and fixed point work); it is the standout social
  feature and the reason items 7 and 8 above rank high.
- Visual shell direction. Pixel gameplay inside a contemporary,
  editorial product shell (cream, black, coffee brown, hero red;
  oversized type; restrained grain) rather than wall to wall retro.
  Guides the native UI phase and any web menu polish.

### Native port phase (after the browser prototype's feel is locked)

The review recommends, and this plan adopts, the native Swift path
over a Capacitor wrap, resolving the question the brief left open at
build order step 3:

- SwiftUI for shell screens (title, garage, cafe selection, results,
  settings), SpriteKit via SpriteView for the drive scene, rendering
  through Metal.
- GameCore as a pure Swift package: World, Player, TrafficGenerator,
  CollisionSystem, CoffeeSystem, SeededRandom, Replay. Ported nearly
  one to one from src/game/, which contains no platform globals by
  construction and by test.
- Gameplay logic never lives in SKScene.update; the scene feeds time
  and input into GameCore and renders the snapshot.
- PlatformServices: GameCenterService (daily seed leaderboard,
  weekly distance, friends bests, challenges), HapticsService on
  Core Haptics with the event vocabulary already defined,
  AudioService consuming the same event registry, SaveStore.
- Swift Testing ports of the determinism, fairness oracle, golden
  state, and replay compatibility suites. The oracle test is the
  crown jewel to port faithfully.

Reference links supplied with the review: SpriteKit
(https://developer.apple.com/documentation/spritekit), Core Haptics
(https://developer.apple.com/documentation/corehaptics), Game Center
leaderboards
(https://developer.apple.com/documentation/gamekit/encourage-progress-and-competition-with-leaderboards),
Swift Testing (https://developer.apple.com/documentation/testing).

## Priority order (merged)

1. Finish prototype polish: parallax and juice (step 11), full dev
   overlay (step 12).
2. Config snapshot, state machine, framed inputs, teardown,
   RenderSnapshot, golden tests (adopted items 1 through 6).
3. Replay recording; fixed point spike and decision; then daily
   seeds (items 7 and 8).
4. Trial one signature design slice in the prototype: coffee orders
   or the arrival moment, whichever Jason picks first.
5. Port GameCore to Swift; SpriteKit scene inside SwiftUI shell.
6. Native haptics, audio, Game Center; Sunday Run.
7. Cars, cafes, and collectible progression content.
