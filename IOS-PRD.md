# Cars & Coffee on iOS: product requirements

Status: draft for review, 20 September 2026. Nothing here is started.

This is the product document. Two others already exist and this one
does not repeat them:

- `Cars_and_Coffee_Claude_Code_iOS_Prompt.md` is Jason's build brief
  for the first native package. It says how to build it.
- `ROADMAP.md` holds the wider plan and the review reconciliation.

This says what we are building, why, what it costs, what it risks, and
how we will know the native version plays the same game.

---

## The decision in one paragraph

Cars & Coffee moves to a native iOS app with a pure Swift simulation
ported from the browser build, a SpriteKit scene inside a SwiftUI
shell, real haptics, and Game Center leaderboards. The browser build
stays alive as the place game feel is decided. Version one is the
same game, natively, plus the social board and six additions that do
not touch the road: a callout when you pass a friend's best, a second
board for the longest clean stretch, a daily goal, cars that have to
be unlocked, a results card built to be shared, and an App Clip so a
challenge link plays without installing anything. It is free to
download, carries no ads, and sells one unlock at $1.99 to keep
driving past the fourth scene.

## What is settled

| | |
|---|---|
| Version one | Parity with the browser build, plus Game Center |
| The browser build | Stays, as the tuning sandbox |
| Money | Free to download, one unlock at $1.99 to keep driving. No ads, no subscription |
| Beyond parity | The rival line, a haptic vocabulary, a daily goal, car unlocks, a results card built to be shared |
| The third number | Longest clean stretch, on its own board. Anything you touch resets it |
| Friend challenges | An App Clip and a link. Separate roads, compare scores |

There is no shared road anywhere in this plan, and one measured fact
is the reason. The road reacts to the driver: `applyAggro` in
`world.js` reflects targeted rows off the lane the player is committed
to, and the cluster reroll loop in `spawn` then draws a different
number of random values depending on what that did, so two players on
one seed desync almost at once. Measured: the same seed driven by a
cautious pilot and by one that keeps changing lanes produces roads
that diverge between 75m and 310m in, on every seed tried. A shared
seed does not give two people the same road, with or without
deterministic arithmetic.

Everything social in this plan is built on comparing numbers, never on
comparing roads.

---

## Why native, honestly

Four reasons were given. They are not equal.

**Haptics. The strongest, and it is not close.** iOS Safari has never
implemented `navigator.vibrate`, which is why the browser build hides
its Rumble row on iPhone entirely. Every iPhone player today gets no
haptics at all. The game already emits nineteen named events
(`crash`, `coffee_pickup`, `boost_start`, `tier_up`, `slick_slide`,
`stumble` and the rest) and the haptics layer is already a seam behind
those names. Core Haptics turns a feature that is currently absent on
the target device into one of the best things about the game. This
alone would justify the port.

**Game Center. Real, and impossible any other way.** The board is
local and always has been. Nothing about the browser build can change
that without a server of our own.

**Smoother operation. Real but smaller than it sounds, and partly
already fixed.** The choppiness reported on device was not frame rate:
it was the world advancing in whole logical pixels, so the road moved
12 device pixels one frame and 18 the next. That was fixed on 19
September and measured at 16 and 17. The render costs about a
millisecond a frame. So there is no performance problem left for
native to solve. What native still buys is real but narrower: 120Hz on
ProMotion, frame pacing the browser compositor cannot guarantee, and
an audio session that does not get suspended by Safari.

**Graphics acceleration. The weakest reason.** The game draws a
180x320 buffer with a couple of dozen sprites on it. It is not
anywhere near GPU bound and Metal will not make it faster in any way a
player could notice. What it buys is headroom: particle work, shader
effects, screen transitions and lighting that are not currently worth
attempting. That is a reason to go native eventually, not a reason to
go native now.

**Two reasons that were not listed and should have been.**

The board is stored in `localStorage` inside an itch.io iframe, which
is a third party storage context. Safari's tracking prevention evicts
script written storage in those contexts, so a player's top five can
simply disappear. This needs verifying against current Safari
behaviour before it goes in a pitch, but if it holds it is a data loss
bug that only a native app fixes.

And distribution. A browser game on itch is found by people who were
already on itch. The App Store is a different order of reach, and
Jason has shipped there before, so the account and the pipeline exist.

---

## What version one is

The browser game, natively:

- three lanes, three lives, coffee as the only fuel, boost, nitro
- traffic that crawls or moves with the flow, queues capped at three
- rubble, oil slicks, breakdowns, speeders, pursuits, the pulled over
  pair
- ten tiers every 1,000m across nine named places, then the places
  cycle in a per run order while every difficulty number stays frozen
  at the last rung
- three cars
- the top five board, now backed by Game Center as well as locally

Plus what native buys:

- Core Haptics for all nineteen events
- real audio through AVAudioEngine rather than synthesized Web Audio
- 120Hz rendering with the simulation still fixed at 60Hz
- Game Center leaderboards and authentication
- one unlock, bought once, and no ads anywhere

Plus six additions that earn their place because none of them touches
the road:

- **The rival line.** Friends' bests are read at run start and a
  callout fires the moment you cross one.
- **The third number.** Longest clean stretch, its own board.
- **A daily goal.** The same goal for everyone, checked locally.
- **Car unlocks.** The three cars stop being unlocked from the start.
- **A results card built to be shared.**
- **An App Clip, and challenge links.**

This is worth stating plainly, because two other sections of this
document say the port is not the moment to rebalance and that is still
true. Not one of the six changes the road, the tuning, or how distance
is scored. They add a second board, a reason to come back, somewhere to
get to, and something to send a friend. The simulation is untouched.

**Explicitly not in version one:** coffee orders and recipes,
destination runs, car culture progression, near miss scoring,
achievements, cloud save, iPad layout, any second platform.

---

## The thing that shapes the whole project

The browser build stays as the tuning sandbox. That is the right
call, because deciding how the road feels takes minutes there and an
Xcode cycle here, and because the fairness oracle and every measuring
tool already live there.

It also means **there will be two implementations of the same
simulation, permanently**, and every tuning change has to cross
between them. That is the single largest ongoing cost of this project
and it will not announce itself. It shows up six months in as a
version of the game on a phone that no longer matches the one in the
browser, with nobody able to say when they diverged.

Three things keep them honest, and all three are cheap if built at the
start and expensive if bolted on later.

**One set of numbers, not two.** `src/game/tuning.js` is 1,084 lines
and is the only place a gameplay number is allowed to live. It becomes
the source for a generated JSON file that both implementations read at
build time. Swift never gets its own copy of a number. A tuning change
is a change to one file in the browser repo and a regenerated asset in
the app.

**A golden corpus, not a promise of parity.** The browser build
generates fixtures: a seed, a configuration version, a scripted input
history, and state hashes at fixed checkpoints. Swift replays the same
fixtures and must produce the same hashes. This is the parity gate and
it either passes or it does not. Note the honest limit: this proves
the two agree on the machines the fixtures were made and replayed on,
not that floating point agrees everywhere. With nothing in the product
depending on two devices generating the same road, that is enough.

**The oracle, ported faithfully.** `test/fairness.test.js` drives the
real simulation with a planning pilot across 100 seeds and 30,000
frames each and fails with a seed and a position when the road becomes
undodgeable. It is the most valuable thing in the repo. The Swift port
runs the same seeds and must find the same answer. If the JS oracle
passes and the Swift one fails, the port is wrong, and we will know
which frame.

---

## The work

Sizes are honest guesses, marked as such, and assume Jason working
with Claude Code at the pace of the last few weeks.

### Phase 0: prepare the browser build. GUESS: 1 to 2 weeks

Everything in this phase happens in JavaScript, because it is cheap
there and because it is what makes the port checkable. These are
already adopted in `ROADMAP.md` as items 1 through 6.

- Resolve tuning into an immutable `RunConfiguration` at run start,
  carried by the world, stored with the seed.
- Make the app phases an explicit state machine with associated data.
- Stamp input intents with the logic frame they belong to.
- One immutable render snapshot per frame instead of ad hoc field
  copying.
- Golden fixtures: seed plus scripted inputs equals exact state,
  committed as files.
- Export `tuning.js` to JSON as a build step.

**Done when** the browser build produces fixtures a second
implementation could be tested against, and still passes its 64 tests.

### Phase 1: GameCore in Swift, no app. GUESS: 2 to 3 weeks

A pure Swift package with no UI at all. `src/game/` is 2,955 lines, of
which 1,084 are the tuning table, so roughly 1,870 lines of logic to
port: world stepping, the generator, collisions, the traffic clamp,
overtakers and pursuits, hazards, fuel, tiers.

No SwiftUI, no SpriteKit, no UIKit, no Foundation beyond value types,
no ambient randomness, no clock. The rule that made the browser core
portable is that it never touched a platform global, enforced by a
test that greps the source text. Swift gets the same rule and the same
test.

**Done when** the golden fixtures replay bit for bit and the ported
oracle passes the same 100 seeds. Not when it compiles.

### Phase 2: the app. GUESS: 2 to 3 weeks

SwiftUI shell for title, garage, results and settings. SpriteKit
through `SpriteView` for the drive scene. The scene feeds time and
input into GameCore and draws the snapshot it gets back. It decides
nothing.

The pixel art transfers directly: `assets/` is 416KB and the atlas
already has a text manifest. The 3x5 bitmap font is 44 glyphs of bit
rows and ports as data.

**Done when** Jason can play it on his phone and cannot tell which
build he is holding, except that it is smoother.

### Phase 3: native services. GUESS: 1 to 2 weeks

Core Haptics patterns for the nineteen events. Audio through the same
event registry, with real recorded sound replacing the synthesized
placeholders where it exists. Save through a protocol, not
`UserDefaults` scattered through the app.

**Done when** every event has a haptic and a sound, and the game is
still playable with both switched off.

### Phase 4: Game Center. GUESS: 1 week

See the section below.

### Phase 5: the unlock. GUESS: under a week

One non consumable through StoreKit 2, a restore path, and the card at
the end of the free road. See the section below. This used to be the
phase most likely to overrun, when it had an ad SDK in it.

### Phase 6b: the App Clip and challenge links. GUESS: 1 to 2 weeks

A second target sharing GameCore and the renderer, a link format, and
the results card that offers the link. See the challenge section.
Placed after the store phase deliberately: an App Clip has its own
review surface and its own way to fail, and none of it is worth
touching until the app it advertises is approved.

### Phase 6: store. GUESS: 1 week plus review

Screenshots (the capture tool in `tools/store/` already films the
browser build and can be pointed at a simulator recording instead),
description, privacy nutrition labels, age rating, App Store Connect,
TestFlight, review.

Where the six additions land: the clean stretch counter in phase 1
with the rest of GameCore, car unlocks and the results card in phase
2, the rival line and the daily goal in phase 4, the App Clip and
challenge links in phase 6b.

**Total GUESS: 9 to 15 weeks of evenings.** Treat that as a shape, not
a date.

---

## Game Center

**What goes on a board.** Furthest distance, all time, one board. Plus
one per car if the per vehicle bests are worth keeping public, which
is a design question rather than a technical one.

**What happens to the initials wheel.** Game Center supplies a display
name, so three letters entered on a wheel become redundant for the
global board. The wheel is also one of the nicest things in the game
and it is what makes the local board feel like an arcade cabinet. The
recommendation is to keep both: the wheel still names your own top
five on the device, Game Center carries the name Apple already has.
This needs Jason's call.

**Authentication is not optional to handle.** A player can decline,
be signed out, be a child account with Game Center restricted, or be
offline. Every one of those has to leave the game fully playable with
the local board intact. Game Center is an addition to the board, never
a replacement for it.

**Offline scores queue.** A run finished on a plane submits when the
phone reconnects. This is a small amount of work and its absence is
very visible.

**The rival line.** The single best use of Game Center in a distance
game, and the reason to prefer it over a board of Jason's own. Read
the friends' bests once at run start, hold them in memory, and flash a
callout the moment the player crosses one: "passed Randy, 3,412m". It
turns a leaderboard from a list checked once into something felt while
driving, it costs a read and a comparison, and it risks nothing.

**The daily goal.** The same goal for everyone, every day: 2,500m, or
40 cups, or a 900m clean stretch. Derived from the date so every
device computes the same one with no server, checked locally, and
carrying no score. It gives the game a reason to be opened tomorrow
without needing two devices to agree on anything.

**No shared seed means no anti cheat problem worth solving.** Distance
boards on an endless runner get manipulated. Without a shared road
there is nothing to verify a score against anyway, so the honest
position is to accept it, and to not build a competitive economy on
top of a board that cannot be trusted.

---

## The three numbers

Distance alone is one axis, and a leaderboard with one axis is a
leaderboard people check once. Three numbers, and they have to be in
real tension or they are the same number in three hats.

**Distance.** How long you lasted. Unchanged, still the headline.

**Coffee cups.** How much you were willing to detour for. The cup is
often not on the safe line, which is what makes it a choice.

**Longest clean stretch.** How far you went without touching
anything, in metres, inside a single run. This is the one that is a
second skill rather than a second view of the first: a 12km run with
four knocks loses to a flawless 6km. Its own board.

**What breaks a clean stretch.** Anything you touch. The world
already emits exactly four events for it: `stumble` (hit a car and
spent a heart), `crash` (hit a car with none left), `rubble_hit`
(clipped rubble, costs fuel) and `slick_slide` (hit a slick, forced
slide). All four reset the counter. This is the version that is
hardest to argue with and easiest to put on a results card.

**The trap this avoids.** The obvious reading, counting obstacles
avoided, rises with every metre driven, so it would have been distance
wearing a hat, which is exactly the objection that ruled out goals
tied to the named places. Any stat that only counts upward while the
wheels turn is not a second axis.

**Where it lives.** GameCore, alongside distance and cups, which means
it ports once and the browser build gets it for free. It does not feed
the score.

---

## Challenging a friend, and the App Clip

The whole payload is 416KB, so the game fits inside an App Clip with
room to spare. That means a link someone taps plays the real game with
no install, and offers the full app at the end. For a game nobody has
heard of, that is the difference between a link being shared and a
link being ignored.

**The challenge is the reason to send the link.** You finish a run,
the results card offers a link, your friend taps it, sees "Jason got
4,210m, beat it", plays, and their end screen hands them a link back.

**It needs no server.** The challenge is carried entirely in the link:
score, name, and nothing else. No accounts, no storage, no backend.

**Separate roads, compare scores.** Both players drive their own
randomly generated road and the higher number wins, which is what
almost every endless runner does. The alternative, an identical road
for both, is not available from a shared seed (see the measurement
under What is settled) and would need a mode where the aggro target
lane comes from the seed rather than the driver. That remains a later
option.

**Scores in a link are forgeable.** Between friends this does not
matter. It matters a great deal if a challenge result is ever allowed
to touch the real leaderboard, so it must not be.

**Two things to verify rather than assume.** The current App Clip size
limit (the payload fits under any version of it, but the number should
be read from Apple's documentation rather than quoted from memory),
and whether Game Center is usable from inside an App Clip at all. The
second one is unknown as this is written and the challenge design does
not depend on the answer, since the link carries everything.

---

## The price, and what you get for it

**Free to download, one unlock at $1.99, no ads, no subscription.**

The free road runs to the fourth scene. Past that the run ends on a
card offering the rest of the game for one payment, once, forever.

**Why not ads, recorded so it is not relitigated.** A pixel art
endless driver from an unknown developer does not make meaningful
money from ads. The revenue is pennies a day and the price is an ad
SDK, an App Tracking Transparency prompt, a privacy manifest,
SKAdNetwork entries, an age rating that accounts for third party ads,
a review risk, a failure path so a dead ad never blocks a retry, and a
permanent design constraint on a ninety second loop. It was a bad
trade on revenue alone.

**What dropping ads gives back.** The ad SDK was the only third party
code in the project, so the build brief's no dependencies rule stands
as written and needs no amendment. The rewarded continue question
disappears, and with it the only mechanism that could have put
continued runs on a distance board. The phase flagged as most likely
to overrun mostly evaporates.

**Why free with an unlock rather than a price at the door.** Nobody
can try a paid app, and this plan's entire distribution story is a
challenge link that someone taps out of curiosity. A link that opens a
paywall is a link nobody forwards. Free to download means the App Clip
and the challenge funnel work without depending on two things this
document cannot currently confirm: whether an App Clip is permitted
for a paid app, and whether Apple offers a first class free trial for
a one time purchase. Both questions go away entirely under this model.

**The mechanics.** One non consumable through StoreKit 2, with a
restore path that works on a new device, checked at launch before the
free road can end. No consumables, no currency, no timers, nothing
that expires.

**Where the free road stops is the one real judgement.** Four scenes
is roughly 4,000m, which is past the point where most first runs end,
so a new player sees the ladder climb, the scenery change three times
and the traffic get properly difficult before being asked for
anything. Cut it shorter and the game feels like a demo. Cut it longer
and there is nothing left to sell. This number should be revisited
once there is any data at all.

**One interaction to be deliberate about.** If the free road stops at
4,000m then a challenge above 4,000m can only be answered by someone
who has bought the game. That is either the cleanest conversion moment
in the product or an insulting wall, depending entirely on how the
card is worded, and it is worth designing rather than discovering.

---

## Risks, ranked

**1. The two implementations drift.** The likeliest way this project
fails is not that the port does not work. It is that it works, ships,
and then slowly stops being the same game as the sandbox it is tuned
in. The generated tuning JSON and the golden corpus exist to make
drift a failing test rather than a discovery.

**2. The oracle does not port cleanly.** It is the most intricate code
in the repo: a dynamic program over lane slots with a clamp replay and
a reduced tween doom check. If the Swift version disagrees with the JS
version, working out which one is wrong is a real piece of work.
Mitigation: port it early, in phase 1, before there is an app to hide
behind.

**3. Scope creep through the roadmap.** Coffee orders, destination
runs and car personalities are all sitting in `DESIGN-BACKLOG.md` and
all of them are more fun to build than a Game Center authentication
failure path. Version one is parity plus the board. Everything else
waits for a version two that exists because version one shipped.

**4. The free cut is wrong.** Four scenes is a judgement with no data
behind it. Too short and the game reads as a demo and gets reviewed as
one. Too long and nobody ever reaches the ask. It is a one line change
in the build and an expensive one to get wrong at launch, so it wants
a decision made deliberately rather than inherited from this
paragraph.

**5. Feel does not survive the port.** The browser build's feel is the
product, and it is the product because it has been tuned by hand on a
phone over weeks. Sixty fours tests and a golden corpus prove the
simulation matches. They do not prove it feels the same, because
rendering, input timing and haptics all sit outside the core. This is
what phase 2's done criterion is for, and it is a judgement call that
only Jason can make.

**6. Floating point.** Accepted rather than mitigated, because nothing
in the product needs two devices to generate the same road. If that
ever changes, this becomes risk number one.

---

## Open questions

1. **Where exactly the free road stops.** Four scenes is this
   document's guess, not a decision.
2. **The initials wheel: keep it alongside Game Center, or retire it.**
3. **Per car leaderboards or one board.**
4. **Deployment target.** The conservative answer is the current iOS
   minus two, which is what the build brief implies without naming it.
5. **iPhone only, or iPad too.** iPad is cheap if decided now and
   expensive if decided after the shell is built.
6. **Does the app keep the arcade three letter name for anything, or
   does Game Center's display name take over everywhere.**
7. **How the card at the end of the free road is worded**, and what
   it says when the run being answered is a challenge the player
   cannot reach without buying.
8. **What unlocks the second and third car**, distance or lifetime
   cups, and at what number. Nothing in the game counts lifetime cups
   today.
9. **How the daily goal is chosen.** A rotation of three shapes
   (distance, cups, clean stretch) seeded off the date is the obvious
   answer and needs confirming.
10. **Controller support and iCloud sync of the local best.** Both
    were raised and neither was decided. Controller support is small.
    iCloud sync kills the "new phone, lost everything" complaint that
    the itch build already has in a worse form.
11. **Two App Clip facts to look up rather than assume:** the current
    size limit, and whether Game Center works inside a clip.
    (Whether a clip is allowed for a paid app stopped mattering when
    the app became free.)
12. **Whether more scenes get authored.** Nine today, so a 20km run
    tours the same nine twice. Each new one costs two verge strips of
    30x544 and a palette row.

---

## What this does not change

The fairness rules stay exactly as they are: the fair minimum gap,
the traffic clamp, the cluster corridor rule, the pass guards, the
slick recovery guarantee. They are the game.

The tuning numbers stay as they are. The port is not an opportunity
to rebalance.

The art stays as it is. 416KB of pixel art, one atlas, one scenery
sheet, one badge, one 3x5 font.

`CLAUDE.md` rule 4 still holds, in both languages: the fairness oracle
is the gate, and it is never weakened to make a change pass.
