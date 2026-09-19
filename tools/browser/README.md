# Browser harness

Deliberately under `tools/`, not `test/`: `node --test` picks up every
`.mjs` inside a `test` directory, and these want a built bundle and a
running server, so it would sit there launching browsers forever.

The node tests in `test/` cover the simulation. Nothing covered the
seams where every real defect in the M8 preflight actually sat:
storage, touch, the boot path and the audio handshake. These four
scripts drive the **built bundle** in a real browser and cover them.

## Running

```
bash tools/build-itch.sh                 # produces _dist/build-M8-*/cars-and-coffee-web
# point BUNDLE at that cars-and-coffee-web directory
BUNDLE=_dist/build-M8-.../cars-and-coffee-web PORT=8099 node tools/browser/serve.mjs &
node tools/browser/smoke.mjs chromium
node tools/browser/smoke.mjs webkit
node tools/browser/guards.mjs
node tools/browser/touch2.mjs
node tools/browser/tier1.mjs
node tools/browser/menu.mjs
node tools/browser/controls.mjs
node tools/browser/boot.mjs              # starts its own servers on 8110-8114
```

Needs `npm i playwright`. This container had chromium 1194 and webkit
2359 preinstalled under `/opt/pw-browsers`, and the scripts point
chromium's `executablePath` at that build because the installed
playwright wanted a newer revision. On a machine with a normal
`npx playwright install`, delete the `executablePath` line.

## What each one covers

| script | covers |
|---|---|
| `smoke.mjs` | boots, paints, versioned source dir, Start works, a resting second finger does not kill taps or pause the run (blocker 2), no console errors, devOverlay absent (blocker 4) |
| `boot.mjs` | the atlas 500s, the sheet 500s, a module 500s, a request that never replies. All four must show a message and a retry rather than a black screen (blocker 5) |
| `guards.mjs` | a throwing AudioContext must not kill input (blocker 6); high score migration across five storage states (blocker 1) |
| `touch2.mjs` | a cancelled gesture must not poison the next tap (blocker 3); three fingers no longer opens anything; a forced 250Hz frame rate plays clean (item 9) |
| `controls.mjs` | the control scheme against genre convention: the HUD pause button pauses while a tap at the same x on the road still steers, a swipe down is reserved rather than pausing, a swipe up still boosts, a deliberate two finger hold is still the backup, and Enter, Space and R can work the menus. Real touch through CDP |
| `menu.mjs` | the menu press states and the confirmation sounds: holding a button presses it, the press makes a sound on the way down, dragging off releases it without activating, and a toggle is audible. Watches canvas pixels for the press and the Web Audio graph for the sound, because neither leaves a DOM trace. Five of its eight assertions fail against the build before press states |
| `tier1.mjs` | the Tier 1 fixes that only exist on the live page: the sound hint's board and mute gating (1.3, 1.12), the initials modal's iOS changes and pre-fill (1.11, 1.13), the menu overlap band resolving to the nearer row (1.7), and the coffee lesson still retiring (1.2). Nine of its thirteen assertions fail against the pre-Tier-1 build, so it is real cover rather than a description |

## What it cannot cover

- Real ProMotion timing. The 250Hz run proves nothing breaks, not that
  the shake and callout durations feel right at 120Hz. That needs the
  phone.
- A real finger on iOS Safari. Playwright's WebKit has no trusted
  touch drag, so the passive listener behaviour under a real finger is
  still only covered by hand.
