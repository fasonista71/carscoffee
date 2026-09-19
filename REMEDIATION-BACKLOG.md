# Remediation backlog, post M8

Everything the three preflight agents found that the M8 stability pass did not
close. The M8 pass took nine items, all of them "can this crash, hang, lose
data, or stop someone playing". These are the rest.

The three reports overlap heavily, so this is deduplicated and re-sorted by
urgency rather than by each agent's own rubric. Where two agents found the same
thing I kept the better evidence and cite both.

**Nothing below blocks the M8 deploy.** Tier 1 is what I would take next.

---

## Status

**Tier 1 is closed.** All thirteen were fixed in M8 before it shipped. See
TIER1-M8.md for what changed and how each one was verified. The detail is kept
below for the record, each item marked DONE.

**Tier 2 is most of the way closed too**, which the item text below does not
say, because the fixes landed across several sessions without anyone coming
back to this file. Re-read against the code on 19 September:

| Item | State |
|---|---|
| 2.1 teaching the controls | Mostly done. How to play is six illustrated rows, and the first run calls out the steer, the boost and the coffee. Nothing teaches tap your own lane to boost. |
| 2.2 no route back to the title | **Open.** Pause offers Resume and Restart. There is still no way to the title, so a car or a sound setting cannot be changed without finishing the run. |
| 2.3 the empty board | Done. Five numbered slots with placeholders. |
| 2.4 title spacing | Done. The board hangs off the last menu row instead of a constant y. |
| 2.5 the hidden car preview | Done. Cycling a car puts it on a plate, and the chosen car parks on the title screen. |
| 2.6 the 44pt claim | Done. `hitPadFor` sizes the pad in CSS pixels, so the target holds at any scale. |
| 2.7 the tier banner's colours | **Open, ASK.** |
| 2.8 the initials modal as a second design system | **Open**, and superseded by D5 in `DESIGN-BACKLOG.md`: drawing the picker in the canvas removes the modal rather than restyling it. |
| 2.9 invisible to assistive technology | Done as far as it honestly can be. Role, label and fallback text. No attempt at announcing the road, and the label says so. |
| 2.10 no reduced motion path | **Open, ASK.** The one item here with real accessibility weight. |
| 2.11 the unreadable build tag | Done. Plated, in the text colour. |
| 2.12 the dead N/A branch | Done. Branch removed. |
| 2.13 `textWidth('')` | Done. Returns 0. |

So Tier 2 is three items, two of which are Jason's call: a route back to the
title, the tier banner, and reduced motion.

Tiers 3 and 4 have also moved: the determinism test runs its full 10,000
frames (3.1), nitro has its own suite (3.3), and `tools/browser/upgrade.mjs`
exists. The rest of those two tiers has not been re-checked item by item, so
treat their text below as the last known state rather than as current.

Two further changes landed from Jason's own device testing and are written up
at the end of TIER1-M8.md: menu press states with confirmation sounds, and
stronger pickup presentation. Swipe down to pause closed half of 2.2 and was
then reverted in the controls review, since a pause button covers it.

---

## Tier 1, real defects a player meets

Functional bugs, not polish. Ordered by cost to fix against how often they are hit.

### DONE 1.1 `+COFFEE` and `+LIFE` render with the first character missing
`src/render/font.js:8-49` · `src/render/renderer.js:535-541` · one glyph

The font defines `A-Z`, `0-9`, `&`, `.`, `!` and space. There is no `+`.
`drawText` silently skips a glyph it does not have, so the game's two main
positive-feedback callouts read ` LIFE` and ` COFFEE`. Worse, `textWidth` still
counts the missing character, so centred text sits 2px left of the pickup.

Add `+` as `[0b000, 0b010, 0b111, 0b010, 0b000]`, or drop the `+` from the
strings. `/` is the only other missing character (see 2.11).

### DONE 1.2 The one teaching moment in the game can be spent without ever being drawn
`src/app/main.js:269-273` · `src/render/renderer.js:857-887` · `src/game/world.js:348-357`

Two defects in the same feature.

The `cc.coffeetip.v1` flag is written when the simulation emits `coffee_seen`,
but the callout is only drawn if `cupY` is between 50 and 280
(`renderer.js:872`). The event fires at `cupY` of about 53, three pixels inside
that cut off, and the render distance is interpolated while the event distance
is not. Any frame ordering or a tab backgrounded at that instant burns the flag
with nothing shown. The only tutorial in the product is then gone for that
browser forever.

Separately, its real life is about a third of its budget. `coffeeShowMs` is
3200, but `drawCoffeeTip` re-targets the nearest cup ahead every frame, and that
cup reaches the player in about 1.2s. Then the callout jumps to the next cup,
which is usually outside the draw window, so it vanishes.

Move the flag write into the renderer's success path, and latch the callout onto
one cup for the whole window instead of re-picking each frame.

### DONE 1.3 Every returning player's title screen has the sound hint buried under the board
`src/app/main.js:146-153` · `src/render/renderer.js:1070-1072, 1091-1095, 1137-1152` · one line

`drawTitle` draws the menu first, putting `NO SOUND. CHECK THE SIDE SWITCH` at
y=284 and `TAP HERE TO HIDE` at y=292, then draws the board band from y=270
covering `13 + rows*7`. With one board row the first line is erased; with two or
more both are. The hint's padded hit box survives underneath, so there is an
invisible tap target across three leaderboard rows that dismisses something the
player cannot see.

The mitigation `drawBoard` documents ("skipped when the board is empty, which is
what keeps it clear of the hint on a fresh install") is exactly what an update
breaks. `cc.soundtip.v1` is new in this build, so every returning touch player
arrives with a populated board and a defaulted hint. That is most of the
audience for an update.

`let soundTipOn = IS_TOUCH && soundOn && board is empty && loadSetting(...)`.

### DONE 1.4 The boost prompt goes silent in exactly the case nitro exists for
`src/game/world.js:1262` vs `:288-293` and `src/app/main.js:314` · one line

Three places answer "can the player boost?" and one of them is wrong.
`tryBoost` spends a nitro before checking fuel, correct. `view.boostReady` is
`fuel >= minFuel || nitroCharges > 0`, correct. `updateBoostHint` checks fuel
only, so a player with a banked nitro and 9 fuel gets no prompt, no sound and no
haptic while a speeder bears down.

`tuning.js:283-293` states the nitro's whole purpose is being usable below the
fuel floor, so this is the one moment the prompt is for.

`if ((world.fuel < TUNING.boost.minFuel && world.nitroCharges === 0) || isBoosting(world)) return;`

### DONE 1.5 A rubble hit that crosses the low-fuel line suppresses the warning for the rest of the run
`src/game/world.js:764-778` vs `:901`

Only `drainFuel` emits `fuel_low`, and only on the rising edge. `checkHazards`
subtracts `rubble.fuelCost` (12) without that edge check, so rubble taking a
player from 30 to 18 never fires the warning. It stays silent until a coffee
lifts them back over 25 and they cross again.

### DONE 1.6 Restart sits one pixel from Sound and looks identical to a toggle
`src/render/renderer.js:1064-1065, 1106-1108` · `src/app/main.js:168-169`

On the paused menu the Restart row uses the same plate, the same 140x22
footprint and the same label colour as the Sound and Rumble toggles, and
`startRun()` runs immediately with no confirmation. On iOS, where the Rumble row
is hidden, `sound` pads to y=212 and `restart` pads from y=213. One logical
pixel, about two CSS pixels, separates a reversible toggle from an irreversible
run-ender.

Give it a different plate or label colour and move it down. The paused menu
bottoms out at y=241 on iOS, so there is room.

### DONE 1.7 Adjacent menu rows overlap by 5px and ambiguous taps always resolve upward
`src/render/renderer.js:1079-1084` · `src/game/tuning.js:398-399`

`hitPadPx` is 6 on all four sides and `option.gapPx` is 7, so every pair of
adjacent rows overlaps by `12 - 7 = 5` logical pixels. `hitTestMenu` returns the
first match in layout order, so the upper row always wins. A tap aimed at Sound
cycles the car; one aimed at Rumble toggles Sound. At scale 3 that is about 15
device pixels of misattributed taps between every pair.

Raise `gapPx` to 13 (the title menu has 51px of slack before the board) or clamp
the pad to `Math.min(hitPadPx, gapPx / 2)`.

### DONE 1.8 The low-coffee warning is the least readable text in the game
`src/render/renderer.js:898-921`

The words `Coffee` and `Low` alternate in `#e43b44` at scale 1, five logical
pixels tall, drawn at x=2. The road starts at x=30, so the label sits entirely
over the bright green shoulder under the 55% HUD band. Computed: **1.51:1**.

The non-warning state on the same background is 5.76:1 and fine, so the label is
readable right up until the moment it matters and then disappears. The bar fill
is 2.74:1, also under the 3:1 threshold for a meaningful graphic.

Row two is the one HUD element that does not use `drawPlate`, which
`renderer.js:838` calls "the chunky capsule language every HUD element shares".

### DONE 1.9 The overtaker chevron is the least visible thing on the road
`src/render/renderer.js:665-681`

Two 7x3 chevrons in `#e43b44` on undimmed road: **1.60:1**. They blink at about
3Hz so they are absent half the time, they are drawn before `drawTraffic` so a
car in the same lane paints over them, and they sit at logical y 298 to 315,
the last 7% of the canvas, under the player's thumb on a one-handed grip.

This is the game's only advance warning of a threat coming from behind.
`pal.hazardLight` is 7.1:1 on the road, `pal.dash` is 6.1:1.

### DONE 1.10 The game-over headline has no backing plate over a live background
`src/render/renderer.js:1172-1177`

The world keeps scrolling behind the game-over screen under a 0.6 dim, and
`Crashed` / `Out of coffee` is drawn on it with nothing behind. Contrast against
road is 2.89:1, against the green shoulder 1.73:1, against a pale car about
1.08:1, and it **changes frame to frame** as traffic passes under the text.

`renderer.js:1140-1142`, immediately above, explains why the board gets a shaded
band rather than trusting the dim layer. The lesson was applied to the
leaderboard and not to the headline, which matters more. Against the existing
band the same red reaches 4.06:1.

Cheapest partial fix: `renderer.js:557-560` already does a 1px offset shadow
before the fill for pickup callouts and `BOOST!`. Applying that same two-pass
draw to the headline would mitigate most of this on its own.

### DONE 1.11 The initials modal has three iOS failure modes and no way out
`src/app/initials.js:17-29, 51-72, 100, 106` · `index.html:22-26`

On the primary surface, in the one screen nobody has hand-tested on a device.

1. The input inherits `-webkit-user-select: none` from `<body>` and its inline
   style never overrides it. On WebKit this is the long-standing cause of inputs
   that will not take a caret.
2. The card is centred on the layout viewport, which iOS does not shrink for the
   keyboard. On an iPhone SE class viewport the card spans roughly y 166 to 386
   and the keyboard covers below about y 300, putting the Save button under it.
   `position: fixed` and `overflow: hidden` mean there is nothing to scroll.
3. There is no cancel, no skip and no backdrop dismiss. One exit control, and
   the run is already scored and persisted before the panel opens, so
   committing nothing is safe.

Add `user-select: text` to the input, anchor the card with
`align-items: flex-start; padding-top: 12vh` or track `visualViewport`, and add
a scrim dismiss.

### DONE 1.12 The silent-switch hint blames the hardware when the player muted the game
`src/app/main.js:146-147`

The hint is gated on `IS_TOUCH` and the stored flag and never consults
`soundOn`. A player who set Sound: OFF on the row directly above still reads
`NO SOUND. CHECK THE SIDE SWITCH`. The HUD gets this right
(`renderer.js:1021-1024` draws a mute glyph only when sound is off), so the two
surfaces disagree about the same state. Same one-line fix as 1.3.

### DONE 1.13 Committing an empty initials field silently writes AAA
`src/app/leaderboard.js:16-19` · `src/app/initials.js:112-118`

`(up.slice(0, 3) || 'AAA').padEnd(3, 'A')`, with no validation and no feedback.
One letter becomes `XAA`. Given 1.11's keyboard occlusion, tapping Save without
typing is plausible. Pre-fill `AAA` so the default is visible and editable, or
disable Save until the field is non-empty.

---

## Tier 2, states nobody designed

Not bugs. Gaps where a state exists and no one decided what it looks like.

**2.1 Nothing ever tells the player how to steer.** Every string the game can
show was extracted, and not one mentions swiping, tapping or lanes. There is no
instructions screen, no first-run legend, no control hint. Left and right will
be found by flailing on a three-lane runner; swipe-up-to-boost is genuinely
undiscoverable, and the `BOOST!` prompt appears over the car without saying what
to do about it. A one-time legend in the same callout language already built for
the coffee tip, under `cc.controls.v1`. Every character needed is in the font.

**2.2 No route back to the title.** `menuLayout` has no Menu or Home item in
any mode, so once Start is tapped the title screen is unreachable without a
reload.

*The pause half of this is DONE, and properly.* There is a pause button in the
top right of the HUD, which is where a phone game puts it, with a deliberate
two finger hold as the backup. The swipe down that briefly did the job was
removed: the genre reads down as duck or brake, and on an iPhone a downward
swipe near the top edge belongs to Notification Centre.

*Also DONE, from the same controls review:* the keyboard can now work the
menus. Enter and Space press the primary button and R restarts, where before
a desktop player could not start, restart or resume a run without a mouse.
Full arrow key navigation of the option rows is still missing, so a keyboard
player cannot change car or toggle sound; that is small and left open.

**2.3 The board has no empty state.** `drawBoard` returns immediately when
empty, so on a fresh install the bottom 90 logical pixels, 28% of the title
screen, are blank dimmed road with no hint that a board exists.

**2.4 Title spacing is platform-dependent and neither value was chosen.** Hiding
the Rumble row leaves a 29px void above the board on iOS; on Android the row's
outline butts flush against the board panel with 0px. Anchor the board relative
to the last row rather than to a constant y.

**2.5 The car you are selecting is about 90% hidden.** The title screen renders
the live vehicle centred at y=252, so it spans roughly y 227 to 277. The Sound
row occupies 218 to 240, Rumble 247 to 269, and the board band starts at 270.
About five pixels of car are visible. The only real feedback for cycling is an
11-character name in a 3x5 font.

**2.6 The 44pt touch target claim holds only above a 360x640 CSS stage.** Because
`scale` is floored to an integer, dropping below that threshold drops the whole
UI by a step at once: 44px on an iPhone 15 Pro, 33px on an SE 3, 29px in a
320x480 itch iframe on a dpr-3 phone. The padded hit box rescues the effective
target, but that padding is the same line that causes 1.7.

**2.7 The tier banner draws its lightest text on top of a white flash.** The
wash starts at its 0.45 maximum on the first frame, and `Tier N` in `#ffd93d`
computes to 1.79:1 over road and 1.07:1 over the shoulder at peak. Contrast
recovers as the flash fades, so the reward lands after the moment it was
celebrating. Draw the text before the wash, or in `pal.outline`, which is 8.9:1
against the peak composite.

**2.8 The initials modal is a second design system.** 13px anti-aliased
`ui-monospace` with CSS borders, against a 3x5 bitmap font everywhere else, and
**six palette hexes re-typed as literals** rather than imported from `tuning.js`,
so a palette change will not reach this file. The card is narrower than the
canvas it covers, and it appears instantly over a game-over screen the player
has not read yet. Its helper text is `#5a5a6e` at 10px on `#262b44`: **2.06:1**.
The input border is the same 2.06:1, below the 3:1 for a component boundary.

**2.9 The game is invisible to assistive technology.** `canvas.tabIndex = 0`
makes it a focus stop with no `aria-label`, no `role` and no fallback content,
so a screen reader lands on an unnamed element and is told nothing. The initials
panel is a modal with no `role="dialog"`, no `aria-modal` and no focus trap.
Full parity is not realistic for a canvas arcade game; a name on the canvas and
a role on the modal are two lines.

**2.10 No reduced-motion path.** No `prefers-reduced-motion` anywhere. The
product flashes at 3.85Hz (`BOOST!` and the pill ring), 3.57Hz (emergency roof
lights, saturated red and blue, multiple vehicles possible), a full-screen 45%
white wash per tier, and up to 4px of screen shake. Each flashing region is
small enough for the "small safe area" exemption, but all exceed 3Hz and there
is no user control. A Motion row sits naturally beside Sound and Rumble.

**2.11 The build tag is drawn at 1.08:1.** Deliberately recessive, but a build
tag nobody can read cannot do the one job it has, which is letting a player tell
you which version they are on. With no telemetry that is the only version signal
that exists. `pal.building` is about 3.3:1 on the dimmed shoulder.

**2.12 Dead `N/A` branch that would render as `N A`.** `renderer.js:1121` falls
back to `'N/A'` when haptics are unsupported, but `menuLayout` omits the row
entirely in that case, so it is unreachable. If it were reached, `/` has no
glyph. Delete the branch or add the glyph.

**2.13 `textWidth('')` returns `-1 * scale`.** Harmless today, but
`renderer.js:1115` does `(view.vehicleName || '')`, so a missing name would
right-align from `x + 1`.

---

## Tier 3, test quality

This tier is why every M8 defect went unnoticed. It changes nothing a player
sees and everything about whether the next regression is caught.

**3.1 The determinism test dies at frame 466 of an advertised 10,000.** The test
is named "10000 scripted frames hash identically" and its comment says the same.
Measured: the scripted pilot crashes at frame 466, 216m, tier 0, and `step()`
early-returns for the remaining 9,534 calls. So determinism is proven for 4.7%
of the frames the name claims, all of it tier 0.

The hash never sees a tier transition, the `speedTierMult` ramp, any overtaker
at all, any pursuit or solo-call event, any yield manoeuvre, any nitro or heart
pickup, or the pass-scheduling RNG stream. **Every system this release rebuilt
is outside the hash.** Node's coverage confirms `world.js:1148-1150`, the "pass
into the player's own lane" branch, is never executed by any test.

Minimum fix: add `assert.equal(w.status, 'running')` so it fails loudly the day
the pilot stops reaching the frame count. Better: reuse the fairness oracle as
the pilot and hash its world.

**3.2 The "99.49% coverage" number is worse than useless.** The report contains
nothing outside `src/game/` and `test/`, because no test imports anything else.
`src/app/`, `src/input/`, `src/audio/` and `src/render/` are absent entirely:
3,190 of 5,483 source lines, **58% of `src/`**. Report coverage over `src/`, not
over what the tests happen to import.

The `tools/browser/` harness added in M8 covers the input adapters, the boot
path and storage, so part of this hole is now closed. Rendering and audio are
still untouched.

**3.3 Nitro has zero tests.** The headline new mechanic of the release.
`world.js:293-298`, the nitro-spend branch, is on the uncovered list.
`fuel.test.js:114` ("boost is gated by minimum fuel") is the test that should
own nitro's override of that gate and does not mention it. Test bank, spend,
cap, and the fuel-floor override.

**3.4 Three test files mutate the shared `TUNING` singleton at module scope.**
`fairness.test.js:27-28`, `fuel.test.js:12-15` (which does
`TUNING.tiers.splice(1)`, truncating a shared array in place), and
`distribution.test.js:105-106`. Each file's comment asserts "own process, no
leakage", which is true only of `node --test`'s current default. Under
`--experimental-test-isolation=none` the suite gives 2 failures, and the failure
direction is the dangerous one: the safety-critical file is the one doing the
mutating, and it weakens the config another file then measures.

**3.5 The fairness oracle has never validated the shipped fuel config.** Because
`fairness.test.js` zeroes `passiveDrainPerSec` and `rubble.fuelCost`, it proves
the road is always dodgeable and says nothing about whether a run can be doomed
by fuel. That is a defensible scope choice and the file says so, but
`app-context.md` calls it "the safety-critical test" without the caveat and
`product-context.md` states invariant 1 unqualified. The gate is narrower than
the claim.

**3.6 The oracle's assertion is weaker than its result.** `fairness.test.js:237`
asserts only `world.status === 'running'`, and `lethalHit` only kills on the
last heart, so the test would pass with up to two unavoidable collisions per
seed. Measured, the real number is zero across all 100 seeds, so
`assert.equal(world.hearts, TUNING.lives.start)` passes today, free, and catches
any future regression that starts costing the oracle a heart.

**3.7 The atlas contract has no test.** All 53 `TRAFFIC_VARIANTS` hitboxes match
their atlas frame sizes today, but the atlas is a generated artefact. One repack
with different padding and the collision boxes disagree with the drawn art, with
no error anywhere. About 25 lines: parse `assets/cars.atlas`, assert every
variant size matches its frame, assert the `needed` set equals the frame set.
This is the highest-value test to add, and it also catches 4.2.

**3.8 No regression guard on traffic variety.** The 10.3% to 0.09% duplicate
rate is a headline measurement of this release with nothing stopping it
silently returning to 10.3%.

**3.9 `purity.test.js` has gaps.** It catches `window`, `document`, `navigator`,
`performance`, `Date`, `Math.random`, `requestAnimationFrame`, `localStorage`,
`canvas` and `Audio`. It does not catch `globalThis`, `process`, `crypto`,
`fetch`, `setTimeout`, `queueMicrotask`, `Intl`, `eval` or dynamic `import()`.
None appear in `src/game/` today, verified, so the boundary holds. But the test
is the stated gate and `globalThis.crypto` would sail through it. Five-word diff.

**3.10 No `window.onerror` and no `unhandledrejection` anywhere.** With no
telemetry of any kind, an uncaught error mid-run is invisible. The M8 boot card
covers load failures only. At minimum an `onerror` that paints to the canvas.

---

## Tier 4, drift hazards

No player impact today. Each is a value written in two places and kept in step
by a comment, which is how the next bug gets built.

**4.1 `TRAFFIC_CIVILIAN_COUNT = 47` is a hardcoded index** into a 53-entry
`TRAFFIC_VARIANTS`, consumed at `generator.js:90`. Indices 47 to 52 are the
emergency fleet. Insert or remove one civilian and ordinary traffic starts
dealing police cars, or a civilian is silently excluded. Derive it:
`TRAFFIC_VARIANTS.findIndex(v => EMERGENCY_MODELS.has(v.model))`.

**4.2 The player's atlas frame names are written three times.** `ALIASES` in
`sprites.js:25-29`, `PLAYER_SPRITES` in `tuning.js:596`, and
`VEHICLES[].spriteKey`. `tuning.js:512-518` says "keep in step with ALIASES", and
a comment is not a constraint. `PLAYER_SPRITES` feeds the guard at
`world.js:981` that stops an overtaker wearing the player's bodywork; if it
drifts, that guard silently stops guarding.

**4.3 Two different answers to "how fast is boost".**
`VEHICLES.*.boostMultiplier` is 1.6 for all three cars and is read by nothing;
`TUNING.boost.speedMultiplier` is 1.65 and is the live value. They have already
diverged, and a maintainer editing the obvious one changes nothing. Also dead:
`fuelBurnMultiplier`, `maxQueuedInputs` (the queue is hardcoded as
`if (p.queuedDir === 0)`), the `ENVIRONMENTS` music, parallax and palette keys,
the three locked environments, and `itemPalm` in `NEAR_ITEMS` which no theme
uses.

**4.4 `VEHICLES.*.laneTweenMs` is a snapshot captured at import time**, which
breaks `tuning.js:7-9`'s own rule that modules should read values at the moment
of use. It is then immediately overwritten by `main.js:112`, so it is dead
either way.

**4.5 `src/audio/registry.js` is a dead fourth copy of the event vocabulary and
has already drifted.** Nothing imports it, its own header says so, and it ships
in the zip regardless. It is missing `coffee_seen` and contains `music_loop`,
which is never emitted. Of the four places event names live, the dead one is the
only one that is wrong. 610 bytes of shipped confusion.

**4.6 Twelve gameplay constants live in `world.js`**, against CLAUDE.md rule 3.
Four of them (`:863`, `:870`, `:1054`, `:1271`) are inputs to the fairness
geometry, so part of the safety-critical invariant is tuned in a file the
tuning guide says it is not in. When someone next tunes overtaker fairness they
will edit `tuning.js` and nothing will change. Hoist those four; the placement
fractions can stay if CLAUDE.md is amended to match.

**4.7 Overtaker vetting reaches 400px behind the player; chase cars spawn up to
590px behind.** `clearLanePx` is 400, max speeder spawn is 500, max chase spawn
is 590. A 190px band is unvetted, so a row in it can have an overtaker spawned
on top of it. Invisible today because only about 68px of road behind the player
is on screen. The invariant
`clearLanePx >= spawnBehindPx * (1 + jitter/2) + chaseGapPx` is required and is
already violated by 190px, with nothing stating it. Raise `spawnBehindPx` for
pacing and the bug becomes visible with no warning.

**4.8 `startYield` mutates a row's lanes without updating `row.corridorMask`.**
The squeeze guard at `world.js:1133` then reads a stale pre-merge set. Safe
today only by timing: yields last 600ms, `maybeSpawnOvertaker` refuses to run
while an overtaker is alive, and a pass lasts at least 6.8s at tier 0. That
ordering is nowhere enforced or named.

**4.9 `spawn()` never writes rerolled specs back to `world.pendingSpec`.** Up to
`clusterRerolls` rerolls go into a local, so if the horizon check returns they
are all discarded and re-rolled next frame. Deterministic, so not a correctness
bug, but the cache the variable exists to provide is defeated whenever
clustering is in play and the generator stream advances about 4x faster than
needed.

**4.10 `attachTouch` silently falls back to `window` if `#stage` is missing.**
The module's own header explains at length that listeners on `window` are
passive by default on iOS and that this makes drags vanish entirely. If the
element ever goes missing the adapter degrades into exactly that failure mode
without a word. It should throw.

**4.11 `scale = Math.max(1, Math.floor(fit))` clips the canvas below a 320px
logical height.** When the embed viewport is shorter than `320 / dpr` CSS px the
320px canvas overflows a flex-centred parent inside `overflow: hidden`, cutting
off the HUD and START with no scrollbar. Needs under 160 CSS px at dpr 2 on a
phone, so unlikely there, but reachable if the itch embed height is set too
small or in a short desktop window.

**4.12 Blocked or quota-exceeded writes fail invisibly, and a corrupt board is
replaced and then overwritten.** `sanitize()` is the best-defended code in the
repo and correctly returns an empty board rather than throwing, but the original
bytes are then destroyed by the next submit. A one-time "scores are not saving"
notice would cover both.

**4.13 Latent race at the documented network seam.** `initials.js` sets
`open = false` before awaiting `onCommit`, re-enabling menu taps while
`board.submit()` is in flight. Benign with `localStore`, which resolves next
microtask. With the network store the interface was designed for, a "Go again"
tap could let the late `.then` highlight a board row during the next run.

**4.14 `startMusic()` leaves a 200ms `setInterval` running while muted.**
`scheduleMusic` returns immediately from `!ready()` on every tick. Trivial, but
it is a timer doing nothing five times a second for a whole run.

**4.15 Stale documentation in the files meant to be authoritative.**
`fairness.test.js:14, 31-34` says six tiers; there are ten. `README.md:386` says
the traffic pool is 48 frames; it is 53. `README.md:141-142` documents the old
two-car lineup. `CLAUDE.md:68` says touch uses "viewport wide listeners", and
the entire point of `touch.js` is that it deliberately does not. CLAUDE.md is
the document the next agent reads first. `tuning.js:493-496` still refers to
excluding "the porsche (it is the player)", which is not a frame that exists,
and "the taxi family (cut by request)", while `taxi` and `rideshare` are both
live variants.

---

## Deliberately not filed

**The nitro fairness question.** The oracle picked up 108 nitros across 100
seeds and spent none, because `plannedSpeedPxPerSec` deliberately excludes
boost, on the stated grounds that boosting is "the player's call, not an unfair
road". That line is defensible. But nitro is new, it is free, and it works below
the fuel floor that previously rationed boosting, and `tuning.js:282-285` says
outright that the fairness model "only holds while boosting is a choice". Nobody
has measured what fraction of the road becomes unfair when a player with two
banked charges spams them into a cluster. Not a defect anyone can demonstrate,
and an unmeasured risk on this release's headline mechanic.

**Nitro is always spent before fuel, and the boost gesture is a tap on your own
lane**, which is also the steering gesture. Flagged by two agents as a design
trap rather than a bug. Your call, not theirs.
