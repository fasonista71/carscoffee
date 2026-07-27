# Cars & Coffee

An 8 bit style top down endless driver. Browser prototype, built as a
vertical slice: one vehicle, one environment, the complete core loop.

## Current status: milestone 1 of the build order

This delivery is build order steps 1 and 2, plus two items pulled
forward by agreement: a movement slice of the dev tuning overlay, and
the headless determinism test. Included and working:

- Fixed 60Hz timestep with accumulator, clamp on resume, interpolated rendering
- Scrolling three lane road on a 180x320 logical screen, integer pixel upscale
- Lane changes with a 120ms tween and exactly one queued input
- Keyboard input: arrows and A/D for lanes, up, W, or space for boost (boost is a no op until step 6)
- Touch input: swipe and tap zones, both active
- Title, playing, and paused states; auto pause on tab switch or window blur
- Dev overlay with live movement sliders
- Headless determinism test and a game purity guard test

Not built yet, by design: obstacles, fuel, coffee, boost effect,
stumble, tiers, scoring, audio, parallax. Those wait on the movement
feel checkpoint (build order step 3).

## How to run

Any static file server works. From the project folder:

    python3 -m http.server 8080

or

    npx serve

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
| Boost (no op until step 6) | Up arrow, W, or space | Swipe up, or tap center third |
| Dev overlay | Backtick | Three finger tap |

## Tests

    npm test

Runs two suites in Node (18 or newer), no dependencies:

- `test/determinism.test.js` imports only `src/game/`, runs 10000
  simulated frames from a fixed seed with a scripted input sequence,
  twice, and asserts identical FNV-1a hashes of the final world state.
- `test/purity.test.js` scans every file in `src/game/` for forbidden
  identifiers (window, document, navigator, performance, Date,
  Math.random, requestAnimationFrame, localStorage, canvas, Audio).

The generator solvability test arrives with the generator in step 5.

## Tuning guide

Everything lives in `src/game/tuning.js`. Current parameters and what
they do to feel:

| Parameter | Default | Effect |
| --- | --- | --- |
| logic.hz | 60 | Simulation rate. Leave alone; everything is derived from it. |
| logic.maxFrameDeltaMs | 100 | Largest frame gap the loop will simulate. Bigger means more catch up after a stall, smaller means time visibly slows instead. |
| movement.laneTweenMs | 120 | Lane change duration. Lower is snappier but harsher; higher is smoother but mushier and lengthens the window where a queued input waits. |
| movement.maxQueuedInputs | 1 | Brief requirement. Raising it would let inputs pile up and fire late. |
| speed.basePxPerSec | 150 | World scroll speed. The single biggest feel dial right now. |
| speed.pxPerMeter | 8 | Display conversion only, for the distance readout. |
| input.swipeThresholdPx | 24 | Finger travel before a touch commits to being a swipe. Lower fires sooner but misreads sloppy taps; higher feels laggy. |
| input.tapMaxMs | 250 | Longest press that still counts as a tap. Lower rejects hesitant taps; higher lets slow presses fire on release. |
| render.playerYPx | 252 | Player position on screen. Higher on screen gives more reaction time visually. |
| render.dash*, render.edgeLine* | | Road paint dimensions. Cosmetic. |

The dev overlay exposes lane tween, scroll speed, swipe threshold, and
tap max live. Overlay changes are not persisted: note numbers you like
and put them in tuning.js.

## Project structure

    src/game/     pure simulation, no browser globals, runs in Node
    src/render/   Canvas 2D drawing, reads state, never mutates
    src/input/    keyboard and touch adapters, normalized to intents
    src/audio/    seam only for now; placeholders arrive in step 10
    src/app/      bootstrap, loop, state machine, dev overlay
    test/         headless tests

## Swapping in real art later

All placeholder sprites are procedural pixel maps in
`src/render/sprites.js`, behind a registry keyed by name
(`player_car` now; obstacle and pickup keys arrive with those
features). The swap is: replace the map builders with PNG spritesheet
loading and slicing under the same keys. Nothing outside `render/`
changes. Text uses a 3x5 bitmap font in `src/render/font.js` for the
same reason: no fillText antialiasing, and swappable in one place.

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
