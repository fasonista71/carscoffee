/*
  What screen am I on, and is the run live.

  Every script here used to answer both by diffing a thin strip of
  canvas pixels over a few frames and calling any difference "the world
  is moving". That has two failure modes and the suite had both.

  A strip of plain road can be identical from one frame to the next, so
  a live run reads as frozen: tier1.mjs and the webkit smoke each lost
  an assertion in about one run in three that way. And a run that ended
  while the script was busy elsewhere keeps scrolling behind the game
  over screen, so a dead run reads as live: that is controls.mjs and its
  two finger hold, about one run in six.

  So ask the screen what it is rather than whether it changed. The score
  plate is drawn only while playing or paused, its interior is pal.road,
  and drawPaused lays the dim over the top of it. One pixel inside that
  plate separates all three cases outright: road colour is playing, road
  under the dim is paused, anything else is neither (title, game over,
  or a boot card still up). The expected colours are read from the
  bundle's own tuning.js inside the page, so this cannot drift from the
  palette the renderer actually used.

  The motion probes stay, because "the mode says playing" and "the world
  is advancing" are different claims and the interesting assertions want
  both. They now hash the whole canvas rather than one strip, so the
  score readout alone is enough to register.
*/

const LOGICAL_W = 180;

/*
  Row 5 of the logical buffer, counted rather than sampled.

  This used to read three fixed points inside the score plate, which
  broke the moment the plate moved to make room for the help button:
  two of the three landed on the help plate and the gap beside it, and
  every assertion that asked whether a run was live started saying no.

  Counting is indifferent to where the plates are. Every HUD plate
  fills its interior with pal.road, and row 5 is inside all of them
  and below none of their text. While playing there are over a hundred
  such pixels on that row across four plates; the title screen draws
  only the help button, which is sixteen. Nothing else in between.
*/
const PROBE_ROW = 5;
const PROBE_MIN = 40;

async function readMode(page) {
  return page.evaluate(async ({ row, min }) => {
    if (!window.__ccProbePal) {
      const src = document.querySelector('script[type=module]').getAttribute('src');
      const mod = await import(src.replace(/app\/main\.js$/, 'game/tuning.js'));
      const pal = mod.TUNING.palette.city;
      const rgb = (s) => {
        const m = String(s).match(/^#([0-9a-f]{6})$/i);
        if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
        const p = String(s).match(/rgba?\(([^)]+)\)/);
        const n = p[1].split(',').map((v) => parseFloat(v));
        return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
      };
      const road = rgb(pal.road);
      const dim = rgb(pal.dim);
      const a = dim[3];
      window.__ccProbePal = {
        playing: road,
        paused: road.map((c, i) => Math.round(c * (1 - a) + dim[i] * a))
      };
    }
    const want = window.__ccProbePal;
    const c = document.getElementById('game');
    if (!c || !c.width) return 'other';
    const g = c.getContext('2d');
    const unit = c.width / 180;
    const near = (got, exp) => Math.abs(got[0] - exp[0]) <= 2
      && Math.abs(got[1] - exp[1]) <= 2 && Math.abs(got[2] - exp[2]) <= 2;
    const d = g.getImageData(0, Math.floor((row + 0.5) * unit), c.width, 1).data;
    let playing = 0;
    let paused = 0;
    /* One sample per logical pixel, not per device pixel, so the
       counts mean the same thing at any integer scale. */
    for (let lx = 0; lx < 180; lx += 1) {
      const i = Math.floor((lx + 0.5) * unit) * 4;
      const px = [d[i], d[i + 1], d[i + 2]];
      if (near(px, want.playing)) playing += 1;
      else if (near(px, want.paused)) paused += 1;
    }
    if (playing >= min) return 'playing';
    if (paused >= min) return 'paused';
    return 'other';
  }, { row: PROBE_ROW, min: PROBE_MIN });
}

/* One reading is a single frame, and a tier banner's white wash can
   land on any single frame, so a mode is only a mode once it has held
   still for two of them. */
export async function mode(page) {
  const first = await readMode(page);
  const second = await readMode(page);
  return first === second ? first : 'other';
}

export async function waitForMode(page, want, ms = 5000) {
  const t0 = Date.now();
  for (;;) {
    if (await mode(page) === want) return true;
    if (Date.now() - t0 > ms) return false;
    await page.waitForTimeout(60);
  }
}

/* A strided hash of the entire canvas, sampled every frame. Anything
   that redraws, including the distance readout, counts. */
function changedWithin(msArg) {
  return new Promise((res) => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const hash = () => {
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4 * 31) h = (h * 31 + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) | 0;
      return h;
    };
    const first = hash();
    const t0 = performance.now();
    const tick = () => {
      if (hash() !== first) return res(true);
      if (performance.now() - t0 > msArg) return res(false);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function moving(page, ms = 900) {
  return page.evaluate(changedWithin, ms);
}

export async function still(page, ms = 600) {
  return !(await moving(page, ms));
}

/* The run is live and advancing, which is what most of these scripts
   mean when they check that something did not break the game. */
export async function running(page, ms = 2000) {
  if (!(await waitForMode(page, 'playing', ms))) return false;
  return moving(page);
}

/*
  Put the page back into a live run whatever it is showing, so a script
  testing a gesture is not also testing whether the pilot survived long
  enough to make it. Enter works the primary button in all three menu
  modes, including Save on the initials screen that a qualifying run
  shows before the game over screen.
*/
export async function ensureRunning(page) {
  for (let i = 0; i < 5; i += 1) {
    if (await mode(page) === 'playing') return true;
    /* Enter works the primary button in every menu mode, including
       Save on the initials screen, which a qualifying run puts up
       before the game over screen. It used to take a click on a DOM
       panel; that panel is gone and the screen is drawn in the canvas
       now, so there is nothing to find and nothing to click. */
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
  }
  return await mode(page) === 'playing';
}

/*
  A run that has only just started. A gesture check held for most of a
  second is otherwise also a bet on how long a car nobody is steering
  lasts, and that bet was losing about one run in three. Escape pauses,
  R starts a new one, and the paused menu ignores input for a beat after
  it opens, so the key gets repeated until the mode says it took.
*/
export async function freshRun(page) {
  if (!(await ensureRunning(page))) return false;
  await page.keyboard.press('Escape');
  if (!(await waitForMode(page, 'paused', 3000))) return false;
  for (let i = 0; i < 4; i += 1) {
    await page.waitForTimeout(400);
    await page.keyboard.press('KeyR');
    if (await waitForMode(page, 'playing', 1500)) return true;
  }
  return false;
}

export { LOGICAL_W };
