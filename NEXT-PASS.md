# Next pass: brief for a Claude Code session

## What is live

| | |
|---|---|
| Uploaded to itch | 19 September 2026, evening |
| Bundle | `cars-and-coffee-web-M9.zip`, from `_dist/build-M9-20260919-204644/` |
| Versioned directory | `vcc4e5f2a32` |
| Commit | `2776527` |

The M8 build it replaced is kept at `_dist/build-M8-20260919-061227/`
(`v2c27f6f0f1`, commit `05ccede`) as the rollback, and can be deleted once M9
has a day behind it.

`bash tools/build-itch.sh` from a clean tree reproduces that directory name
exactly, which is how you check the repo and the live build still agree.

## What is built and not yet uploaded

| | |
|---|---|
| Built | 20 September 2026 from commit `f76c48b` |
| Bundle | `cars-and-coffee-web-M9.zip` in `_dist/build-M9-20260920-003344/` |
| Versioned directory | `v7d05c0e1e4` |

What sits between the live build and this one:

- The initials wheel's controls swapped, so the lower chevron advances the
  character and a thumb is no longer across what it is changing. The chevrons
  then came back in toward the letter, and the columns widened to the plate
  split three ways so the targets grew rather than the gap.
- The cars are repainted, the nine traffic bodies in Porsche colours and the
  4x4 in Coniston Green, as a recolour at load rather than new art.
- The roadside is Jason's art instead of fifteen drawing functions: both
  verges of each place, scrolling down the way the road does, each strip
  looping on itself so the repeat has no seam and nothing is mirrored. The sea
  is its own strip and the one exception, so a coast can be east, west, both,
  or neither. The right hand snow verge now has a chalet, the barn reskinned,
  where a fir used to be.
- Pausing hides the run HUD rather than washing it out. The two corner buttons
  were visible, half faded and dead, because taps in paused mode go to the
  menu. The distance and the best moved onto the paused screen at full
  strength.
- The taxi's roof sign blinks on a beat you can read rather than flickering,
  and the recovery truck runs the police wig wag in orange.
- Sub pixel scroll. The world used to move in whole logical pixels, which at
  the first tier is 2.75 a step and came out as 8, 12, 12, 8. The world now
  draws on the whole pixel it has reached and the blit carries the fraction,
  rounded to a device pixel. Measured at a phone's pixel ratio with
  `tools/browser/perf.mjs`: 12 and 18 device pixels a frame before, 16 and 17
  after. This is the choppiness, and it was never the frame rate: the render
  costs about a millisecond.
- The boot card draws itself in the game's own font, with a cone, a drum, a
  tyre and a barrier coming up the road where the spinner goes.

So the first thing to check on device is whether the lower control advancing
reads right; it is a judgement call and it flips in one line. Second is
whether the scroll is smooth enough now.

One thing in the live build is not finished and should not be forgotten behind
a green harness: the fairness oracle does not know about the two lane tap. See
D1 in `DESIGN-BACKLOG.md`.

Until Jason uploads it, the table above this one is what a player gets. Move
the row up when he does, and do not add a third table.

The zip's own md5 is not a useful identity. Two builds of the same tree produce
the same versioned directory name and different zip checksums, because the
archive carries timestamps. Compare the directory name.

The content hash has now been exercised for real: M8 was the transition off
the old fixed `src-M8/` scheme, and the M9 upload on top of it is the first
update where a returning browser had to pair a cached page with a changed
directory. It did. `tools/browser/upgrade.mjs` covers the same ground
headlessly.

Everything still open on Cars & Coffee, in the order it should be taken.
Read this whole file before starting. Read `CLAUDE.md` first if you have not.

The detail for most items is in `REMEDIATION-BACKLOG.md`, numbered by tier.
This file is the plan and the working agreement; that file is the inventory.
Do not restate it here, work from it.

`DESIGN-BACKLOG.md` is the third file and a different kind of list: the things
Jason wants that are not defects. Nothing in it is scheduled here. Read it
before starting anything large in the renderer or the generator, because two
of its items (the two lane tap and the pulled over pursuit) change the
fairness geometry and one (arcade initials entry) deletes work you might
otherwise be about to do on the initials modal.

---

## Working agreement

**House rules that are not negotiable.**

- **No em dashes or en dashes anywhere**: code, comments, commit messages, or
  replies. Use commas, periods, parentheses, "and", "or". Check before every
  commit: `grep -rPn '\xe2\x80\x94|\xe2\x80\x93' src test tools *.md` must
  return nothing.
- `src/game/` stays pure. No browser globals. `test/purity.test.js` is the
  gate and it is real.
- Every gameplay number lives in `src/game/tuning.js`. Render only constants
  live in the render section of it.
- The bundle is built by `bash tools/build-itch.sh` and by nothing else. Never
  hand assemble a zip.

**Commands.**

```
node --test test/*.test.js          # 61 tests, all must pass
bash tools/build-itch.sh            # writes _dist/build-M8-<stamp>/
```

Browser harness, which needs a built bundle and a served copy of it:

```
npm i playwright && npx playwright install
BUNDLE=<path to the built cars-and-coffee-web> PORT=8399 node tools/browser/serve.mjs &
BASE=http://127.0.0.1:8399 node tools/browser/smoke.mjs chromium
BASE=http://127.0.0.1:8399 node tools/browser/smoke.mjs webkit
BASE=http://127.0.0.1:8399 node tools/browser/guards.mjs
BASE=http://127.0.0.1:8399 node tools/browser/touch2.mjs
BASE=http://127.0.0.1:8399 node tools/browser/tier1.mjs
BASE=http://127.0.0.1:8399 node tools/browser/menu.mjs
BASE=http://127.0.0.1:8399 node tools/browser/controls.mjs
BUNDLE=<same path> node tools/browser/boot.mjs
BASE=http://127.0.0.1:8399 node tools/browser/embed.mjs
BASE=http://127.0.0.1:8399 node tools/browser/perf.mjs
```

**How to know a fix is real.** Every script in `tools/browser/` was written so
that most of its assertions fail against the build from before the fix they
cover. Keep that standard. When you add an assertion, check it actually fails
without your change. A test that passes either way is worse than no test,
because it buys confidence you have not earned.

**Commits.** Sentence case subject, body that explains why rather than what,
and end every one with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Never commit a tree with failing tests. If a change cannot be made green in
one commit, say so rather than splitting it into a red intermediate.

**When to stop and ask.** Several Tier 2 items are design decisions, not
defects: how the game teaches its controls, what a reduced motion mode turns
off, what the empty board says. Jason is a product designer with 25 years in
the field. Propose, show him, then build. Do not invent his design language
unilaterally. Items marked ASK below are those.

---

## Phase 0: make the harness runnable here

**0.1** Every script in `tools/browser/` hardcodes
`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`. That
path existed in the cloud container this was written in and does not exist on
this machine. Replace it with a lookup that prefers `PW_CHROMIUM` from the
environment and otherwise omits `executablePath` entirely, so a normal
`npx playwright install` works. Nothing else in Phase 0.

Verify: all eight scripts run and pass against a fresh build.

---

## Phase 1: the gap that just cost a release

**1.1 An upgrade test.** On 19 September the live build lost its audio in
Safari. Not a code regression: an in place itch update had rewritten the same
urls, and the browser was pairing cached modules with fresh ones. A cache
clear fixed it.

The harness has 74 assertions and not one of them could have caught it,
because every script loads a fresh browser against a single bundle. This
product only ever ships as an in place update, so the one thing it always does
is the one thing never tested.

Write `tools/browser/upgrade.mjs`. Serve build A on a port, load it, play a
run, then swap the served directory to build B without clearing the browser
profile, reload, and assert the game still boots and plays. Two cases at
minimum: a build where only source changed, and one where only an asset
changed. The content hashed directory introduced in `de940ff` should make both
pass; prove it by also running against a bundle built with the pre-hash
scheme, which should fail.

**1.2 Harness flakiness.** `tier1.mjs` and the WebKit run of `smoke.mjs` each
fail one assertion in roughly one run in three, then pass on a rerun. It is
the "is the world moving" probes catching a frame boundary, not a real
failure. Make them deterministic, by sampling over more frames or by waiting
for a known state rather than a pixel change. A flaky suite is one people stop
reading, which is how the next real failure gets waved through.

---

## Phase 2: Tier 3, test quality

Ten items, all in `REMEDIATION-BACKLOG.md` under Tier 3. Take them before
Tier 2, because Tier 2 is a much larger surface to change and these are what
make changing it safe.

The two that matter most:

- **3.1** The determinism test is named for 10,000 frames and dies at 466, all
  of it tier 0, so every system this release rebuilt sits outside the hash.
- **3.3** Nitro, the headline mechanic, has no tests at all.

**3.6** is free: the fairness oracle's assertion is weaker than its own
result, and `assert.equal(world.hearts, TUNING.lives.start)` passes today.

---

## Phase 3: Tier 2, the undesigned states

Twelve items. The pause half of 2.2 is already done.

**2.1 is the largest single item in the whole backlog and the one with real
commercial weight.** Nothing in the product ever tells a player how to steer.
Swipe up to boost is undiscoverable, tap your own lane to boost more so, and
there is now a pause button to find as well. For a game whose pitch is that
you can start it in one tap, a player who never learns the verbs never gets to
the thing you built. **ASK** before building: the shape of the teaching, not
whether to do it.

**ASK** also on 2.7 (the tier banner's colours), 2.8 (the initials modal's
visual language) and 2.10 (what a reduced motion mode turns off).

The rest are unambiguous: 2.3 the empty board, 2.4 the platform dependent
spacing, 2.5 the hidden car preview, 2.6 the touch target size, 2.9 the
accessibility labels, 2.11 the unreadable build tag, 2.12 and 2.13.

One item is not in the backlog: a keyboard player still cannot change car or
toggle sound, because arrow key navigation of the menu option rows was never
built. Enter, Space and R work. Add the arrows.

---

## Phase 4: Tier 4, drift hazards

Fifteen items. No player impact today, each one a future bug. `4.7` and `4.8`
touch the fairness geometry, so they get the oracle run against them. `4.5` is
a deletion.

---

## What is not true, and what is not covered

Three things to carry, because getting them wrong wastes a day.

**The repo has history.** All three preflight agents reported that nothing had
ever been committed and the preflight report repeated it. There are 20 commits
through 28 July 2026 and 9 more from 19 September. Do not re-derive that
claim.

**Tap your own lane to boost is deliberate.** Two audit agents flagged the
overlap between the steering gesture and the primary action. It beat the
original thirds scheme in Jason's own device testing, and that is the stronger
evidence. Leave it unless he reopens it.

**Three things no automation in this repo can check.** Say so rather than
implying coverage:

- Real 120Hz timing. The render timers are clock driven now and a forced 250Hz
  frame rate plays clean, which proves nothing breaks, not that the durations
  feel right on a ProMotion iPhone.
- A real finger on iOS Safari. Playwright's WebKit has no trusted touch drag,
  so the passive listener behaviour is covered by hand only.
- The iOS keyboard against the initials modal. Verified structurally, through
  computed styles and the visualViewport wiring, not by a real keyboard.
