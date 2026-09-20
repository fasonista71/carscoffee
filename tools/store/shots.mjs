/*
  The six itch screenshots, filmed from the game rather than mocked up.

  Everything here runs against tools/trailer/stage, the capture copy of
  the build with the read only world hook appended, so the shots are
  the shipping renderer at its native 180x320 and nothing is staged or
  drawn by hand.

  Two problems this solves that a person with a phone cannot.

  The first is reach. The coast is at 6000 metres and the autopilot
  dies well before that, so for a screenshot run the driver is kept
  alive: fuel and hearts are topped up every step. The road, the
  traffic and the scenery are all still the real generator; only the
  pilot is immortal, and no screenshot is of a HUD state a player
  could not also have.

  The second is choosing the frame. A landmark is one stretch of a 544
  pixel strip, so it is on screen for part of the loop and gone for
  the rest. Rather than duplicating the renderer's arithmetic here,
  each shot films a spread of candidate frames and scores them on
  their own pixels: the chalet shot picks the frame with the most lit
  window and timber, the coast shot the most sea. The scorer is
  looking at the same picture a person would.

  Usage, with tools/trailer/stage served:
    node tools/store/shots.mjs
*/
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8484';
const EXEC = process.env.PW_EXEC || undefined;
const OUT = process.env.OUT || 'out';
const SCALE = 3;                    /* 180x320 becomes 540x960 */

/*
  Scorers. Each is a snippet of source run inside the page against the
  canvas, because shipping a quarter of a million pixels out per
  candidate frame is slower than the filming. Each returns how much of
  what the shot is about is in that frame. They are deliberately
  crude: the shots differ by whole colours.

  Inside one, `at(x, y)` reads a logical pixel and `count(test, x0,
  x1)` counts the logical pixels in a column band that pass a test.
*/
const SCORE_PRELUDE = `
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const unit = c.width / 180;
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const at = (x, y) => {
    const i = (Math.floor((y + 0.5) * unit) * c.width + Math.floor((x + 0.5) * unit)) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  const count = (test, x0, x1, y0, y1) => {
    let n = 0;
    for (let y = y0 === undefined ? 0 : y0; y < (y1 === undefined ? 320 : y1); y += 1) {
      for (let x = x0; x < x1; x += 1) { const p = at(x, y); if (test(p[0], p[1], p[2])) n += 1; }
    }
    return n;
  };
`;

/* The chalet is the only warm light in a snow verge, and the only
   timber. Both, so a stray amber pixel cannot win the shot. */
/*
  The chalet is found by arithmetic rather than by colour. Snowy
  trunks and wet rock are warm enough often enough that a colour test
  kept picking a frame with the roof half off the bottom of the
  screen, and the building is in a known place: strip rows CHALET_TOP
  to CHALET_BOT of a SCENERY_STRIP_H tall verge that scrolls with the
  world. If the chalet moves in the art, these two numbers move with
  it; tools/scenery/README.md says so.
*/
const SCENERY_STRIP_H = 544;
const CHALET_TOP = 284;
const CHALET_BOT = 346;
const HUD_BOTTOM = 34;

const CHALET = `
  const off = Math.floor(window.__cc.world().distancePx) % ${SCENERY_STRIP_H};
  /* The copy of the strip one loop back is the one on screen. */
  const top = off - ${SCENERY_STRIP_H - CHALET_TOP};
  const bot = off - ${SCENERY_STRIP_H - CHALET_BOT};
  if (top < ${HUD_BOTTOM} || bot > 310) return -1;
  return 1000 - Math.abs((top + bot) / 2 - 150);
`;
/* The barn is the only large red mass off the road, and it is in both
   farmland verges. Rows near the top and the bottom of the screen
   score nothing, so the winning frame is one with the whole building
   in it rather than a roof sliding off the edge. */
const BARN = `
  const red = (r, g, b) => r > 100 && r < 200 && g > 40 && g < 105 && b < 85 && r - g > 55;
  const l = count(red, 0, 30, 60, 260);
  const r2 = count(red, 150, 180, 60, 260);
  /* One barn, well inside the frame, rather than two half ones. */
  return Math.max(l, r2) - Math.min(l, r2) * 0.5;
`;
/* Sea, either verge. */
const SEA = `
  const t = (r, g, b) => b > 110 && b > r + 35 && g > r;
  return count(t, 0, 30) + count(t, 150, 180);
`;
/* Red and blue together only happen under a wig wag. */
/* The pixels cannot tell a wig wag from a red car next to a blue one,
   so this one asks the world where the emergency vehicle is and scores
   the frame on how well placed it is, clear of the HUD and clear of
   the bottom edge. */
const PURSUIT = `
  const w = window.__cc.world();
  const py = window.__cc.TUNING.render.playerYPx;
  const onScreen = (o) => { const y = py - (o.distPx - w.distancePx); return y > 20 && y < 300 ? y : null; };
  let law = -1;
  let runner = false;
  for (const o of w.overtakers) {
    const y = onScreen(o);
    if (y === null) continue;
    if (o.emergency) law = Math.max(law, 1000 - Math.abs(y - 215));
    else runner = true;
  }
  /* A chase is two cars. One police car alone on an empty road is a
     police car, not a pursuit, so a frame without the speeder it is
     chasing does not count as this shot at all. */
  if (law < 0 || !runner) return -1;
  return law;
`;
/* The opposite of busy: clean road with nothing on it, for the plates
   the cover and the banner are built on. The badge goes over the top
   of these, so a car under it is a car nobody can see. */
const EMPTY = `
  const seen = new Set();
  for (let y = 40; y < 300; y += 1) {
    for (let x = 32; x < 148; x += 1) { const p = at(x, y); seen.add(p[0] + ',' + p[1] + ',' + p[2]); }
  }
  /* Always positive, because a score of zero or less is how a shot
     says it found nothing, and an empty road has found something. */
  return Math.round(100000 / (1 + seen.size));
`;

/* Anything at all going on: traffic, hazards, pickups. */
const BUSY = `
  const seen = new Set();
  for (let y = 40; y < 320; y += 2) {
    for (let x = 30; x < 150; x += 2) { const p = at(x, y); seen.add((p[0] >> 3) + ',' + (p[1] >> 3) + ',' + (p[2] >> 3)); }
  }
  return seen.size;
`;

const SHOTS = [
  {
    id: '1-title', meters: 0, seeds: [20260917],
    /* The title screen, with the road running behind it. */
    screen: 'title', candidates: 90, every: 3, score: BUSY
  },
  {
    id: '2-farmland', meters: 1150, seeds: [20260917, 5150, 4321],
    candidates: 200, every: 4, score: BARN
  },
  {
    id: '3-snow', meters: 4150, seeds: [20260917, 5150, 4321],
    candidates: 240, every: 4, score: CHALET
  },
  {
    id: '4-coast', meters: 6150, seeds: [20260917, 5150, 4321],
    candidates: 240, every: 4, score: SEA
  },
  {
    /* The pixels cannot tell a wig wag from a red car beside a blue
       one, so this shot asks the world for an emergency overtaker and
       then scores the frames while one is on screen. */
    id: '5-pursuit', meters: 300, seeds: [20260917, 11, 2024, 909090, 4242, 777, 13131],
    until: 'w.overtakers.some(o => o.emergency && o.distPx - w.distancePx > -420)',
    candidates: 220, every: 2, score: PURSUIT
  },
  {
    id: '6-initials', seeds: [20260917], screen: 'initials', fresh: true
  },
  /*
    Not screenshots: the backing plates the cover and the banner are
    composed on. Empty road in two places, so the badge sits on
    scenery rather than on somebody's bumper.
  */
  {
    id: 'plate-mountain', file: 'plate-mountain.png', meters: 420,
    seeds: [20260917, 5150, 4321], candidates: 160, every: 3, score: EMPTY
  },
  {
    id: 'plate-farmland', file: 'plate-farmland.png', meters: 1300,
    seeds: [20260917, 5150, 4321], candidates: 160, every: 3, score: EMPTY
  }
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXEC });

async function openRun(seed, fresh) {
  const ctx = await browser.newContext({
    viewport: { width: 200, height: 360 }, deviceScaleFactor: SCALE
  });
  const page = await ctx.newPage();
  await page.addInitScript({ path: path.resolve('tools/trailer/harness.js') });
  await page.addInitScript(`window.__seedWanted = ${seed}; window.__fresh = ${fresh ? 'true' : 'false'};`);
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem('cc.soundtip.v1', '0');
      /* The first run's teaching callouts are honest, and they are not
         what a store page is for. */
      localStorage.setItem('cc.steertip.v1', '1');
      localStorage.setItem('cc.coffeetip.v1', '1');
      localStorage.setItem('cc.boosttip.v1', '1');
      /* A board and a personal best, in the format the game itself
         writes, so the HUD's best reads like a real player's rather
         than a zero. The wheel shot wants the opposite: a clean
         install, so the run it films actually qualifies. */
      if (window.__fresh) return;
      localStorage.setItem('cc.board.v1', JSON.stringify([
        { name: 'JPF', meters: 14820, vehicle: 'coupe' },
        { name: 'COC', meters: 12640, vehicle: 'fourbyfour' },
        { name: 'MAX', meters: 11375, vehicle: 'coupe' },
        { name: 'RBD', meters: 10180, vehicle: 'classic' },
        { name: 'ABC', meters: 9240, vehicle: 'coupe' }
      ]));
      localStorage.setItem('cc.high.coupe.city.v1', '14820');
    } catch (e) { /* private mode */ }
  });
  await page.goto(BASE + '/index.html');
  /* Not just "the hook exists": the loop has to be parked on a frame
     callback, or the first steps fall into the gap while the atlas is
     still loading and the run starts a different number of frames in
     on every take. */
  await page.waitForFunction(() => window.__cc && window.__step
    && window.__cap.cb !== null
    && document.getElementById('boot').hidden);
  await page.evaluate(() => { window.__seed = window.__seedWanted; window.__step(40); });
  return { ctx, page };
}

/*
  Start the run from the keyboard, inside one evaluate, not with a
  mouse click. A real click is delivered by the browser whenever it
  gets to it, so the run began a different number of frames into the
  synthetic clock on every take, and the replay that is supposed to
  return to the chosen frame landed somewhere else. Enter is dispatched
  between two known steps, so the seed, the clock and the world all
  line up take after take.
*/
async function start(page) {
  await page.evaluate(() => {
    window.__step(30);          /* the menu ignores input for 350ms */
    window.__key('Enter');
    window.__step(6);
  });
}

/* Drive, and keep the pilot alive, for one step. */
const STEP = `(n) => { for (let i = 0; i < n; i += 1) {
  window.__drive(); window.__step(1);
  const w = window.__cc.world();
  if (w) { w.fuel = window.__cc.TUNING.fuel.max; w.hearts = window.__cc.TUNING.lives.max; }
} }`;

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

for (const shot of SHOTS) {
  if (ONLY && !ONLY.some((o) => shot.id.includes(o))) continue;
  let done = false;
  for (const seed of shot.seeds) {
    const { ctx, page } = await openRun(seed, shot.fresh);

    if (shot.screen === 'title') {
      await page.evaluate(STEP.replace('window.__drive();', ''), 260);
    } else {
      await start(page);
      if (shot.meters || shot.until) {
        const reached = await page.evaluate(`(() => {
          const step = ${STEP};
          for (let i = 0; i < 40000; i += 1) {
            step(1);
            if (window.__cc.mode() !== 'playing') return false;
            const w = window.__cc.world();
            if (w.distancePx / 8 < ${shot.meters || 0}) continue;
            if (${shot.until ? shot.until : 'true'}) return true;
          }
          return false;
        })()`);
        if (!reached) {
          console.log(shot.id, 'seed', seed, 'never got there');
          await ctx.close();
          continue;
        }
      }
    }

    if (shot.screen === 'initials') {
      /* Stop topping the pilot up and let the run end on its own, then
         spell something on the wheel so the shot is not three As. */
      const ended = await page.evaluate(`(() => {
        for (let i = 0; i < 40000; i += 1) {
          window.__drive(); window.__step(1);
          if (window.__cc.mode() === 'initials') return true;
          if (window.__cc.mode() === 'gameOver') return false;
        }
        return false;
      })()`);
      if (!ended) { console.log(shot.id, 'seed', seed, 'no wheel'); await ctx.close(); continue; }
      /* J P F, by the same key presses a player would make. The menu
         swallows input for 350ms after the screen opens, so let that
         pass first or the first few presses go nowhere. */
      await page.evaluate(() => window.__step(30));
      await page.evaluate(() => {
        const up = (n) => { for (let i = 0; i < n; i += 1) { window.__key('ArrowUp'); window.__step(1); } };
        const right = () => { window.__key('ArrowRight'); window.__step(1); };
        up(9);    /* A to J */
        right();
        up(15);   /* A to P */
        right();
        up(5);    /* A to F */
        window.__step(30);
      });
      await page.locator('#game').screenshot({ path: `${OUT}/${shot.file || 'screenshot-' + shot.id + '.png'}` });
      console.log(shot.id, 'captured');
      done = true;
      await ctx.close();
      break;
    }

    /*
      Film a spread and keep the best frame as it goes.

      The first version of this swept, remembered which frame won, and
      then replayed the run to reach it again. It did not reach it:
      the game starts when its art has loaded, so a fixed number of
      steps from page load put the world in a different place each
      take, and every shot was of the frame next door. Keeping the
      picture at the moment it wins removes the question. The sweep
      still runs in one round trip; only a new best pays for a
      toDataURL.
    */
    const step = shot.screen === 'title' ? STEP.replace('window.__drive();', '') : STEP;
    const best = await page.evaluate(`(() => {
      const step = ${step};
      const score = () => { ${SCORE_PRELUDE} ${shot.score} };
      const canvas = document.getElementById('game');
      let bestScore = -1;
      let bestAt = -1;
      let png = null;
      for (let i = 0; i < ${shot.candidates}; i += 1) {
        step(${shot.every});
        const s = score();
        if (s > bestScore) { bestScore = s; bestAt = i; png = canvas.toDataURL('image/png'); }
      }
      return { bestScore, bestAt, png };
    })()`);
    if (best.bestScore <= 0 || !best.png) {
      console.log(shot.id, 'seed', seed, 'nothing to see');
      await ctx.close();
      continue;
    }
    const bestScore = best.bestScore;
    const bestAt = best.bestAt;
    fs.writeFileSync(`${OUT}/${shot.file || 'screenshot-' + shot.id + '.png'}`,
      Buffer.from(best.png.split(',')[1], 'base64'));
    await ctx.close();
    console.log(shot.id, 'captured, seed', seed, 'score', bestScore, 'frame', bestAt);
    done = true;
    break;
  }
  if (!done) console.log(shot.id, 'NOT CAPTURED');
}

await browser.close();
