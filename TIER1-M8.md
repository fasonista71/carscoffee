# Tier 1, closed

All thirteen Tier 1 defects from REMEDIATION-BACKLOG.md, fixed before M8
shipped. Version stays 0.2.0 and the build tag stays M8, because the stability
build was never uploaded.

Two further changes from Jason's own device testing are folded in at the
bottom: menu press states with confirmation sounds, and stronger pickup
presentation.

Bundle: `_dist/build-M8-20260919-042210/cars-and-coffee-web-M8.zip`,
309KB, md5 `401cfad8b2d4284754198d7a59d84917`.

`node --test test/*.test.js` is 27 of 27, up from 21. The five browser scripts
in `tools/browser/` all pass in Chromium, and `smoke.mjs` also passes in WebKit.

## What changed

**1.1 The missing `+` glyph.** `font.js` had no `+`, and `drawText` skips a
glyph it does not have, so `+COFFEE` and `+LIFE` rendered with a leading blank
while `textWidth` still counted the character and pushed centred text 2px off
the pickup. Added `+`, and `/` while there, which closes the dead `N/A` branch
that would have rendered `N A`.

**1.2 The coffee lesson could be spent unseen.** The flag was written when the
simulation emitted `coffee_seen`, which fires with the cup about three pixels
inside the renderer's draw cut off, with the render distance interpolated and
the event distance not. `drawCoffeeTip` now returns whether it drew, and
`main.js` retires the lesson after 1200ms of it actually being on screen. The
callout also latches onto one cup for the whole window instead of re-picking
the nearest each frame, which is what limited it to about 1.2s of its 3.2s
budget and made it flicker between cups.

**1.3 and 1.12 The sound hint.** Now gated on an empty board and on sound
actually being on, evaluated at use rather than at boot. The board check is the
one that matters for this release: a returning player arrives with a full board
and no `cc.soundtip.v1`, so the hint defaulted on and the leaderboard painted
straight over it, leaving an invisible tap target across three board rows. The
sound check stops a player who muted the game themselves being sent to look at
a hardware switch.

**1.4 The boost prompt and nitro.** `updateBoostHint` checked fuel only, so it
went silent in exactly the case a banked nitro exists for, while `tryBoost` and
`view.boostReady` both said the boost was available. Three answers to one
question, now one.

**1.5 `fuel_low` on a rubble hit.** `drainFuel` owned the rising edge but was
not the only thing subtracting fuel, so rubble taking the player from 30 to 18
crossed the threshold in silence and the warning then stayed off for the rest
of the run.

**1.6 Restart.** It wore the same plate and the same label colour as the two
toggles and sat 6px below Sound, which with the hit pad left one logical pixel
between a reversible toggle and an irreversible run ender. It now has a
`destructiveGapPx` of 18 and the hazard colours.

**1.7 The menu overlap band.** The hit pad is 6 on each side against a 7px gap,
so every adjacent pair of rows overlapped by 5px and `hitTestMenu` returned the
first match in layout order, meaning the upper row always won. Shrinking the
pad would have cost the 44pt touch target, so the overlap is now resolved by
which row's centre is nearer. Verified: a tap at y 216 used to cycle the car
and now toggles Sound.

**1.8 The low coffee warning.** Red on the green shoulder under the HUD band
measured 1.49:1 on five pixel type, so the most urgent state in the run was the
least readable thing on screen, and it was legible right up until the moment it
mattered. Row two's labels now sit on dark chips in the same pixel rounded
language as the rest of the HUD, and the warning is amber rather than red: red
on any dark ground is about 3.3:1. On the chip the amber is 8.10:1 and the
resting white is 12.63:1. The red stays on the bar fill, where it still works.
The Boost label got the matching chip so the row reads as one designed row.

**1.9 The overtaker chevron.** 1.60:1 on undimmed tarmac, in the last 7% of the
canvas under the player's thumb, and painted before the traffic layer so a car
in the same lane covered it. Now amber with a dark keyline (3.92:1 as a
graphic, 8.10:1 at the glyph edge), lifted to y 291 and 298, and drawn after
the traffic pass. The 3Hz blink stays, because that is what makes it read as a
warning.

**1.10 The game over headline.** The world keeps scrolling behind that screen,
so the line saying why you died was drawn on a background that changed every
frame: 2.87:1 over road, 1.67:1 over the shoulder, 1.14:1 when a pale car
passed under it. A translucent band like the board's is not enough here, it
only reaches 2.34:1 over a white car, so the result block now sits on an opaque
plate.

**1.11 and 1.13 The initials modal.** The input now sets `user-select: text`,
overriding what it inherited from `<body>`, which is the long standing WebKit
cause of a field that will not take a caret. The card is top anchored,
scrollable, and tracks `visualViewport`, so the iOS keyboard cannot bury Save.
There is a Skip control and a scrim tap, where before there was exactly one
exit. And the field opens pre-filled with `AAA` rather than having `cleanName`
substitute it silently after the fact.

## Verification

Six new node tests in `test/tier1.test.js` cover the two simulation fixes.
Checked honestly: reverting 1.4 and 1.5 in the source makes exactly two of them
fail, so they test the fix rather than describe it.

`tools/browser/tier1.mjs` covers the nine things that only exist on the live
page. Nine of its thirteen assertions fail against the pre-Tier-1 bundle.

The three visual changes were captured before and after from both bundles
through a harness that drives the renderer directly with a fixed synthetic
view, so the two pictures differ only by the code.

## Honest gaps

- **The coffee tip's failure case is not directly tested.** The browser test
  proves the lesson still retires on a normal run, which guards the opposite
  regression, a tip that nags forever. Proving it is not burned when it was
  never drawn would need a way to suppress rendering while the simulation keeps
  running, and stubbing rAF stops both.
- **The 120Hz and real-finger gaps from the stability pass still stand.** A
  forced 250Hz frame rate plays clean, and Playwright's WebKit has no trusted
  touch drag.
- **The initials modal's keyboard behaviour is verified structurally**, by the
  computed styles and the visualViewport wiring, not by a real iOS keyboard.
  That needs the phone.


---

# From device testing

Two things Jason found playing the build on desktop and mobile. Neither was in
the audit, because neither is a defect: they are the absence of feedback.

## Menu buttons had no press state and no sound

A button that gives nothing back on a phone is a button you are not sure you
hit, so you hit it again. There was no press state anywhere, and no menu sound
at all: the entire audio vocabulary was gameplay events.

**Input.** The adapters only ever reported a finger lifting. `touch.js` and
`pointer.js` now emit `pressAt` when it lands and `pressEnd` when the gesture
is abandoned, whether by dragging past the swipe threshold or by an OS cancel.
Gameplay ignores both: nothing may act on a press, only on a release, so a
player can put a finger on Start, think better of it, slide off and let go with
nothing having happened. The button still says it heard them.

**The look.** A pressed row sinks one pixel and loses its top highlight, which
is the whole vocabulary a pixel button needs: the plate stops catching the
light and sits lower in its own socket. The primary button also moves its dark
shadow row from the bottom to the top, so the face reads as recessed rather
than raised. Option rows and Restart darken their interior.

**The sound.** Four new voices, all quieter than any gameplay event, because
they fire on every stray press and must never win against a coffee blip or a
siren. `ui_press` is the finger landing, a dull low tick with no pitch
interest. `ui_confirm` is a rising pair for a button that actually fires. The
two toggles are the same two notes in opposite order, so on and off are told
apart by direction rather than by timbre, which is the cue that survives a
phone speaker. Each has a matching light haptic pattern, so Android gets the
same beat.

One ordering detail worth knowing: turning sound off plays its cue **before**
setting the mute flag. The blip is already scheduled on the audio context by
then, so it is heard and only the next one is silenced. Turning sound on
unmutes first, or the sound that says sound is back would never play.

## Nitro and heart did not carry at speed

The coffee cup reads because it is wide and warm against grey tarmac. Nitro is
eleven pixels across and heart is a small shape, so even sharing the same bob
they were easy to miss. Three things fix it, and none touches the art:

- **A contact shadow**, anchored to the road rather than to the sprite, so it
  stays put while the pickup bobs above it. That is what makes the bob read as
  floating rather than as the whole object sliding around.
- **A one pixel drop shadow**, down and right, stamped from a cached solid dark
  silhouette of the sprite. An outline on all four sides was tried first and
  fattened the shapes, and the art already carries its own outline. Offset
  copies of the sprite itself would smear colour, hence the silhouette.
- **A stronger accent ring**: eight positions instead of four, two pixels
  instead of one on the axes, and the diagonals pulsing out of phase so the
  ring shimmers rather than breathing as a single unit. Coffee now has one too,
  in a warm amber, so the three read as one family rather than two decorated
  pickups next to a plain one.

## Verification

`tools/browser/menu.mjs`, eight assertions. Five of them fail against the build
before this change, and the three that pass either way are deliberate guards:
the run still starts, a press thought better of still does nothing, and the
Sound row still toggles. The press state is checked by cropping to the button's
own opaque face, because the world scrolls behind the title screen and a whole
canvas diff would pass for the wrong reason. The sounds are checked by wrapping
`createOscillator`, since audio leaves no DOM trace.

The pickup change is visual only and was reviewed from before and after
captures rather than asserted.
