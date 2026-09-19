# Design backlog

Wants, not defects. `REMEDIATION-BACKLOG.md` is the inventory of things that
are wrong; this is the list of things Jason wants that are not wrong yet.
Nothing here blocks a ship.

Each item records what was asked, what the code does today (with the file that
does it, so the next session does not re-derive it), what it touches, and what
is still undecided. Where I am not certain of something I have said so rather
than filing a guess as a fact.

Filed 19 September 2026 from Jason's device testing notes.

---

## D1 Tapping a lane takes you all the way to that lane · SHIPPED, with one piece left

> Tapping a lane automatically swipes you to that lane one or two places. If
> it is two places, it makes a little bit of a screech sound and shows your
> tire tracks as well.

**Today.** `resolveTap` in `src/app/main.js:456` turns a touch into
`{ type: 'tapLane', lane }`, and `applyIntent` in `src/game/world.js:263`
moves **one lane** toward the tapped lane, queueing at most one further move.
So tapping the far lane from lane 0 today takes two taps.

**The change.** A single tap commits the whole distance. One lane behaves as
now; two lanes is a longer move that earns the screech and the rubber.

**What it touches.**

- `src/game/world.js` `applyIntent` and `startTween`: a tween that spans two
  lanes rather than one. `laneTweenMs` (`tuning.js:34`, currently 170) needs a
  second value for the two lane case, because reusing 170 makes the wide move
  the same duration as the narrow one and the car will read as teleporting.
  New numbers go in `tuning.js`, per house rule 3.
- A new world event for the two lane case so the app layer can play the
  screech. The screech voice already exists: `src/audio/audio.js:155` is the
  boost screech, so this is a registry entry and a trigger, not new synthesis.
- Tire tracks already exist. `drawPlayer` lays skid marks and
  `TUNING.render.skid` (`tuning.js:448`) holds their shape. The two lane move
  should lay them the way boost does. See also D2.

**Fairness.** The fair gap is already sized for a worst case **two** lane
crossing plus reaction time (`src/game/world.js:135` and `:665`), so a car
that can cross two lanes in one move is faster than the budget assumes and
should not be able to make an existing gap unfair. I believe that is right but
have not proven it, and it is the kind of claim this project has been wrong
about before. The oracle drives the simulation with
`{ type: 'lane', dir: move }` only (`test/fairness.test.js:44`), so it would
not exercise the new move at all: it would become conservative rather than
wrong. **Before shipping this, teach the oracle the new intent and rerun the
100 seeds.** Do not take my reasoning above as the check.

**Undecided.** Whether the queued input slot still holds a second tap during a
two lane tween, and whether a three lane road can even produce a two lane tap
from every start (it can: lane 0 to lane 2).

**Built on 19 September**, commit `e8dd87f`. A tap commits the whole crossing.
The sweep is `laneSweepMult` 1.75 of the vehicle's own lane tween, so 298ms at
the default, it costs nothing, and it emits `lane_sweep` for the screech, the
rumble and the rubber, which now bridges sideways so the marks draw the arc.
Five tests in `test/tap.test.js` and an end to end check in
`tools/browser/controls.mjs` that fails against the build before it.

**Still open, and the reason this item is not closed: the oracle does not know
about the sweep.** It drives the simulation with `{ type: 'lane', dir }` only
(`test/fairness.test.js:44`), so 100 seeds of proof cover a car that cannot do
this. The argument for why fairness is unaffected is in the commit message and
is sound as far as it goes: the move set grew, the fair gap formula is
untouched, and the sweep is inside the two tween budget the gap already pays
for. But an argument is not the oracle, and this project's rule is that the
oracle is the gate. Teach its planner the two lane move, rerun the seeds, and
then close this.

The two other things to revisit once it is on device: whether 1.75 is the
right weight, and whether a sweep should be refused while a slick has steering
locked (it is today, through the same lock as every other input).

---

## D2 The boost tire tracks should be more prominent

**Today.** `TUNING.render.skid` is
`{ trackPx: 7, wPx: 2, lenPx: 2, fadeMs: 800, maxAlpha: 0.85 }` and the colour
is `pal.skidMark` `#33334a`, deliberately darker than the road `#5a5a6e` and
lighter than the outline. Marks are laid in `drawPlayer` and drawn in the
block starting `src/render/renderer.js:647`.

**The change.** Read as rubber from arm's length on a phone. Every dial is
already in tuning, so this is a tuning pass plus a look, not new code: longer
`lenPx`, a slower `fadeMs`, more contrast in `skidMark`, possibly a wider
`wPx`.

**Watch.** The marks sit on the road under the car, so pushing contrast too
far starts competing with the lane dashes for attention. Screenshot before and
after at 1x, not zoomed.

---

## D3 Overhaul of the scenery

> Overhaul of all of the scenery settings, updated graphics from GPT.

**Today.** Nine themes in `TUNING.sceneryThemes` (`tuning.js:508`), one per
tier, each a colour set plus a `farItem` and `nearItem` name. The drawing
itself is procedural in the renderer; the theme supplies colours and density
only, as the comment above the block says.

**The blocker.** This waits on Jason's art. What arrives decides the shape of
the work: recoloured procedural scenery is a tuning change, while real sprites
mean new atlas frames and a new drawing path, and `test/atlas.test.js` asserts
the sheet holds nothing the game does not draw, so new frames must join the
needed set in `src/render/atlas.js` in the same change.

**Ask Jason** what form the art will arrive in before planning this.

---

## D4 The leaderboard should be online and social

**Today.** `src/app/leaderboard.js` was built for this. Its own header says
the store is an interface rather than inline localStorage calls, `load` and
`save` both return promises, and `entries()` stays synchronous so drawing a
frame never waits on IO. Swapping `localStore` for a network store is the
intended path and nothing outside that file should need to change.

**What is actually unbuilt** is everything around the seam: a backend, an
identity for a player who has never signed in anywhere, abuse handling on a
three letter name field, and what the board shows while a fetch is in flight
or has failed. The seam is a morning; the product is not.

**Note for the port.** `ROADMAP.md` already plans Game Center leaderboards for
the native build (daily seed, weekly distance, friends bests). A web backend
built now and Game Center later is two systems. Worth deciding which one this
is before building either.

**ASK.** Scope, and whether this waits for the native port.

---

## D5 Arcade initials entry, inline with the end screen · DONE

> Use a more traditional scrolling up scrolling down like old video games for
> the three letter initials. Also that screen should appear in line to the end
> screen, not overlapping it.

**Today.** The initials entry is an HTML overlay, `#initials-entry`, built in
`src/app/main.js` and styled in `index.html`. It is a DOM modal over the
canvas, which is why it looks like a different product.

**This closes two open backlog items outright**, which makes it better value
than it looks:

- `REMEDIATION-BACKLOG.md` 1.11, the iOS keyboard failure modes, which were
  patched in M8 but only because there is a keyboard at all. A three letter
  picker has no text field, so the keyboard never appears and the whole class
  of failure goes away.
- Tier 2 item 2.8, "the initials modal is a second design system", for the
  same reason: drawn in the canvas at the same 3x5 font, it stops being a
  second design system.

**What it touches.** A new canvas drawn state in the renderer, up and down
chevrons per column (the chevron drawing helper added for the How To Play
screen is reusable), the existing `cleanName` and `BOARD_SIZE` from
`leaderboard.js` unchanged, and deletion of the `#initials-entry` DOM and its
CSS. `tools/browser/tier1.mjs` asserts against that DOM in four places and
will need rewriting against the canvas, and the harness can only see the
canvas through pixels, so those assertions get weaker. Say so rather than
pretending otherwise.

**Built on 19 September.** Tap targets on the chevrons, and the arrow keys on
a desktop: up and down turn the wheel, left and right change column, Enter
saves. A vertical swipe per column was left out, because the touch adapter's
swipe intent does not carry an x coordinate and the chevrons already cover the
gesture; worth revisiting if it feels stiff on device.

It closed 1.11 and 2.8 with it, as predicted: no text field means none of the
three iOS failure modes can recur, and a screen drawn in the game's own font
on the game's own plates is not a second design system.

Still open here: the wheel is A to Z and 0 to 9 with no way to blank a
character, so a two letter name is padded rather than entered, and there is no
haptic on a turn.

---

## D6 Vehicle colours from Land Rover and Porsche PTS

> Utilize Land Rover traditional colors and Porsche PTS colors as the color
> sources used for all of the vehicles that are not already colored.

**Today.** Traffic art comes from the TMD Studios sheet
(`assets/CARS_CREDITS.txt`, attribution link required) and arrives already
coloured; the palette in `tuning.js:520` colours the player and the world.
I have not yet checked which vehicles are uncoloured or recoloured at draw
time, so the first step is that survey, not a palette.

**Caution on naming.** The iOS brief in
`Cars_and_Coffee_Claude_Code_iOS_Prompt.md` requires neutral vehicle
identifiers with no manufacturer trademarks. Using a manufacturer's colours as
a **reference** is fine; naming a tuning key `porsche_gulf_blue` carries a
trademark into the source. File them by the colour, not by the marque.

**The palettes, from Jason, 19 September.** These are the source lists. Names
are here so the intent survives; the tuning keys take the colour, never the
marque, per the caution above.

Land Rover, heritage:

| Name | Hex | Character |
|---|---|---|
| Coniston Green | `#3F6048` | The definitive classic Defender green |
| Arles Blue | `#6694AC` | Muted, slightly grey heritage blue |
| Alpine White | `#E7E4D8` | Warm utilitarian white |
| AA Yellow | `#F2BD18` | Bold Camel Trophy adjacent yellow |
| Portofino Red | `#9E2929` | Traditional solid red |
| Beluga Black | `#151616` | Deep neutral black |
| Willow Green | `#899B75` | Soft agricultural green |
| British Racing Green | `#183E2E` | Dark, sophisticated green |

Porsche, PTS and period colours:

| Name | Hex | Character |
|---|---|---|
| Guards Red | `#D01820` | The quintessential red 911 |
| Grand Prix White | `#F0EFE8` | Warm racing white |
| Black | `#111214` | Classic solid black |
| Polar Silver Metallic | `#B9BEC2` | Signature early 1990s silver |
| Midnight Blue Metallic | `#18283E` | Very dark navy |
| Speed Yellow | `#F3C300` | Iconic bright 993 yellow |
| Maritime Blue | `#245AA5` | Saturated early 1990s blue |
| Riviera Blue | `#169BC4` | Bright turquoise blue |
| Rubystone Red | `#D12F67` | Famous pink magenta 964 colour |
| Arena Red Metallic | `#7D2930` | Deep metallic burgundy, strongly 993 |
| Amazon Green Metallic | `#176661` | Dark blue green |
| Mint Green | `#79C6A3` | Rare but unmistakably 1990s |

**Two things to work out before applying them.** The game is an 8 bit
cityscape with a deliberately small, high contrast palette, and several of
these are subtle, low chroma colours chosen for sheet metal in daylight:
Willow Green and Polar Silver against grey tarmac at 27 pixels wide may read
as the road rather than as a car. Expect to need a contrast pass against
`pal.road` (`#5a5a6e`) and the offroad greens, and expect a few of them to
work only as the rarer cars rather than as common traffic.

The second is which vehicles are even repaintable. `TRAFFIC_VARIANTS` notes
that nothing whose colour is information is ever repainted: no blue taxis, no
green fire trucks. So the candidate set is the ordinary cars, and the first
job is a survey of which sprites are tinted at draw time versus baked into the
sheet. That survey has not been done.

---

## D7 Police chases end in a pulled over car up ahead

> For the car chases specifically, police chasing cars, have them pulled over
> farther up in the pathway as a road obstacle.

**Today.** A pursuit is a pair: `EMERGENCY_VARIANT_IDS`
(`src/game/world.js:1003`) always chasing, never leading or solo, spawned in
the overtaker system around `:1209`. The pair passes the player and leaves.
Nothing ever comes of it.

**The change.** The pursuit resolves ahead of the player: the runner is pulled
over on the shoulder or in a lane, lights going, as a static obstacle the
player then has to deal with. It is a nice bit of world building, it rewards
looking ahead, and it gives the emergency fleet a reason to exist beyond
noise.

**Where the work is.** Not in the art, in the fairness geometry. A pursuit
that becomes an obstacle is a lane closure that the generator did not plan,
placed by an event rather than by a row spec. Every rule in the "fairness is
by construction" section of `CLAUDE.md` applies to it: the fair gap, the
cluster open set rule, and the guarantee that a spawned obstacle is dodgeable
from wherever the player is. The oracle will find it if it is wrong, which is
the point, but budget for the oracle run, not just the feature.

**Undecided.** Whether the runner is on the shoulder (scenery, no collision,
pure flavour) or in a lane (an obstacle, the interesting version, the one with
all the geometry work). These are very different sizes of job. **ASK.**

---

## D8 Animated working vehicles

> The dump truck has an animated concrete cylinder, just a few frames to show
> it is moving. Same for the taxi, with yellow lights blinking, and the tow
> truck as well.

**Today.** `cement_truck`, `taxi` and `tow_truck` are single static frames in
`assets/cars.atlas`. Nothing in the renderer animates a traffic vehicle; the
only per vehicle animation is the wig wag lights on the emergency fleet, which
are drawn procedurally per sprite rather than being extra frames.

**Two ways to do it, and they are not equal.**

1. **Procedural, like the wig wags.** The taxi's blinking roof light is a
   rectangle that turns on and off, which needs no art at all and could ship
   this week. Same for the tow truck's beacon.
2. **Extra atlas frames.** The cement mixer's rotating drum is real animation
   and wants art. That means new frames in the sheet, which means
   `neededFrames()` in `src/render/atlas.js` and therefore `test/atlas.test.js`
   both grow a notion of a frame sequence, since today the contract is one
   name to one frame and the test asserts the sheet holds nothing extra. That
   is the real cost of this item, and it is a contract change, not a draw call.

**Purity note.** Animation phase must not go in `src/game/`. Drive it off
render time or off world distance passed through the render snapshot, the way
the existing timed render effects work.

**Suggest** taking the procedural half first, since it is nearly free, and
leaving the mixer until the frames exist.

---

## Where these stand

Updated 19 September, after the evening's work.

| Item | State | Waiting on |
|---|---|---|
| D2 boost tracks | Done. Marks bridge the ground covered, so the line is a line. | |
| D8 part one, taxi and tow truck lights | Done, on the right parts of the vehicles. | |
| D5 arcade initials | Done. Wheel in the canvas, no text field, closes 1.11 and 2.8. | |
| D1 two lane tap | Shipped, **not closed**: the fairness oracle still drives one lane moves only, so nothing has actually tested the new one. | an oracle pass |
| D6 vehicle colours | Lists are in hand. Needs the survey of which vehicles are repaintable, then a contrast pass against the road grey. | nothing |
| D7 pulled over runner | Not started. | shoulder or lane, which is a different size of job either way |
| D8 part two, the mixer drum | Not started. Needs frames and an atlas contract that understands a sequence. | art |
| D3 scenery overhaul | Not started. | art |
| D4 online board | Not started. The seam in `leaderboard.js` is a morning; the product is not. | a product decision, and whether it waits for Game Center |

The honest order from here: the oracle pass on D1 first, because it is the one
thing shipped without its gate; then D6, which is small and now unblocked;
then D7 once Jason says shoulder or lane. Everything else waits on art or on a
decision.
