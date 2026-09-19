/*
  Tier 1 fixes that only exist on the live page, so the node tests
  cannot reach them: the sound hint's gating, and initials entry.

  The initials checks used to read the DOM panel: its user-select, its
  anchoring, its buttons, the value in its field. There is no panel
  any more. The picker is three characters drawn in the canvas with a
  chevron above and below each one, which is what closed 1.11 for
  good rather than patching around a text field, so these are
  behavioural now: a qualifying run shows the wheel, the wheel moves,
  and what it says is what lands on the board.
*/
import { chromium } from 'playwright';
import { chromiumOpts } from './launch.mjs';
import { ensureRunning } from './probe.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8399';
const out = [];
const log = (ok, n, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  :: ' + x : ''}`);

const b = await chromium.launch(chromiumOpts());

async function boot(seed) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
  if (seed) await ctx.addInitScript(seed);
  const page = await ctx.newPage();
  await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

/*
  The hint used to sit at a constant logical y and this used to tap it
  there. It now hangs off the bottom of the board band, which moves
  with the menu above it, so the tap finds it instead: its first line
  is the lowest amber text on the screen, below the board's own
  heading. A number here would only be right until the next layout
  change, which is exactly the change this is meant to survive.
*/
async function tapHint(page) {
  const box = await page.locator('#game').boundingBox();
  const ly = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const unit = c.height / 320;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lowest = -1;
    for (let y = c.height - 1; y >= Math.floor(240 * unit); y -= 1) {
      for (let x = 0; x < c.width; x += 1) {
        const i = (y * c.width + x) * 4;
        /* Either warm accent: the hint's heading is the amber the
           game warns in, and the menu's values are the yellow. Both
           are r>245 b<90, and pinning this to one of them is what
           broke when the heading changed colour. */
        if (d[i] > 245 && d[i + 1] > 170 && d[i + 1] < 235 && d[i + 2] < 90) { lowest = y; break; }
      }
      if (lowest >= 0) break;
    }
    return lowest < 0 ? null : lowest / unit;
  });
  if (ly === null) return 'no hint on screen';
  await page.touchscreen.tap(box.x + box.width / 2, box.y + (ly / 320) * box.height);
  await page.waitForTimeout(250);
  return page.evaluate(() => localStorage.getItem('cc.soundtip.v1'));
}

/*
  Wait for the initials screen.

  Looking for "some accent coloured pixels" does not work: the road's
  own edge lines are the same yellow and run the full height of every
  screen, so that test passes during a live run and the taps that
  follow go into the road instead. The Save button is 108 logical
  pixels of solid accent on one row, which nothing else in the game
  is, so the length of the run is the signal rather than its colour.
*/
async function waitForWheel(page, ms = 60000) {
  try {
    await page.waitForFunction(() => {
      const c = document.getElementById('game');
      const g = c.getContext('2d');
      const ux = c.width / 180;
      const uy = c.height / 320;
      const d = g.getImageData(0, Math.floor(215 * uy), c.width, 1).data;
      let run = 0;
      for (let lx = 0; lx < 180; lx += 1) {
        const i = Math.floor((lx + 0.5) * ux) * 4;
        if (d[i] > 245 && d[i + 1] > 200 && d[i + 2] < 90) run += 1;
      }
      return run > 60;
    }, null, { timeout: ms });
    /* Every menu screen ignores input for a beat after it opens, so a
       frantic last tap cannot press a button the player never saw.
       The wheel is behind the same gate, and a test that taps on the
       frame the screen appears is testing the gate. */
    await page.waitForTimeout(700);
    return true;
  } catch (e) {
    return false;
  }
}

/* --- control: on a fresh install the hint is live and dismissable --- */
{
  const { ctx, page } = await boot();
  const v = await tapHint(page);
  log(v === '0', 'on a fresh install the hint is shown and a tap dismisses it', 'soundtip=' + v);
  await ctx.close();
}

/* --- 1.3 a returning player has a board, so the hint must be gone --- */
{
  const { ctx, page } = await boot(() => {
    try {
      localStorage.setItem('cc.board.v1', JSON.stringify(
        [{ name: 'JPF', meters: 6310 }, { name: 'ABC', meters: 4102 }]));
    } catch (e) { /* ignore */ }
  });
  const v = await tapHint(page);
  log(v === null,
    'with a board on disk the hint is suppressed and leaves no invisible tap target',
    'soundtip=' + v);
  await ctx.close();
}

/* --- 1.12 a player who muted the game is not sent to the ring switch --- */
{
  const { ctx, page } = await boot(() => {
    try { localStorage.setItem('cc.sound.v1', '0'); } catch (e) { /* ignore */ }
  });
  const v = await tapHint(page);
  log(v === null, 'with sound turned off by the player the hint is suppressed', 'soundtip=' + v);
  await ctx.close();
}

/* --- 1.11 initials entry, with no keyboard anywhere near it --- */
{
  const { ctx, page } = await boot();
  const box = await page.locator('#game').boundingBox();
  const at2 = (lx, ly) => ({ x: box.x + (lx / 180) * box.width, y: box.y + (ly / 320) * box.height });

  log(await page.evaluate(() => !document.getElementById('initials-entry')),
    'there is no DOM panel left to raise a keyboard over the game');

  await page.touchscreen.tap(at2(90, 163).x, at2(90, 163).y);
  const opened = await waitForWheel(page);
  log(opened, 'a qualifying run opens the initials wheel');

  if (opened) {
    /* The lower control on the middle column, twice, then Save: it
       is the one that advances, A to B to C, and it is below the
       character so a thumb never covers what it is changing. */
    const next = at2(90, 178);
    await page.touchscreen.tap(next.x, next.y);
    await page.waitForTimeout(150);
    await page.touchscreen.tap(next.x, next.y);
    await page.waitForTimeout(150);
    const save = at2(90, 215);
    await page.touchscreen.tap(save.x, save.y);
    await page.waitForTimeout(500);
    const board = await page.evaluate(() => localStorage.getItem('cc.board.v1'));
    log(!!board && board.indexOf('"ACA"') !== -1,
      'the wheel moves, and what it says is what lands on the board',
      String(board).slice(0, 60));
  }
  await ctx.close();
}

/* --- there is still a way out that is not Save --- */
{
  const { ctx, page } = await boot();
  const box = await page.locator('#game').boundingBox();
  const at2 = (lx, ly) => ({ x: box.x + (lx / 180) * box.width, y: box.y + (ly / 320) * box.height });
  await page.touchscreen.tap(at2(90, 163).x, at2(90, 163).y);
  await waitForWheel(page);
  /* Skip, under Save. The run is already scored, so skipping keeps
     the entry under the letters shown rather than throwing it away. */
  await page.touchscreen.tap(at2(90, 247).x, at2(90, 247).y);
  await page.waitForTimeout(600);
  const board = await page.evaluate(() => localStorage.getItem('cc.board.v1'));
  log(!!board && board.indexOf('AAA') !== -1,
    'Skip is a way out and keeps the run on the board', String(board).slice(0, 60));
  await ctx.close();
}

/*
  1.7 the menu overlap band. hitPadPx is 6 and the gap between rows is
  7, so on the title screen Car pads to y 217 and Sound pads from
  y 212: the band 212..217 is inside both. It used to resolve to Car
  every time because that is first in layout order. y 216 is nearer
  Sound's centre (229) than Car's (200) and must now reach Sound.
*/
{
  const { ctx, page } = await boot();
  const box = await page.locator('#game').boundingBox();
  const before = await page.evaluate(() => ({
    car: localStorage.getItem('cc.vehicle.v1'), sound: localStorage.getItem('cc.sound.v1')
  }));
  await page.touchscreen.tap(box.x + box.width / 2, box.y + (216 / 320) * box.height);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    car: localStorage.getItem('cc.vehicle.v1'), sound: localStorage.getItem('cc.sound.v1')
  }));
  log(after.sound === '0' && after.car === before.car,
    'a tap in the overlap band goes to the nearer row, not to whichever is first',
    JSON.stringify({ before, after }));
  await ctx.close();
}

/*
  1.2 the coffee lesson must still be spendable. The flag now waits on
  reading time rather than on the simulation event, and the risk of
  that change is the opposite failure: a tip that never retires and
  nags on every run.
*/
{
  const { ctx, page } = await boot();
  const box = await page.locator('#game').boundingBox();
  const before = await page.evaluate(() => localStorage.getItem('cc.coffeetip.v1'));
  await page.touchscreen.tap(box.x + box.width / 2, box.y + (163 / 320) * box.height);
  /*
    Nobody is steering, so the pilot crashes into the first row it cannot
    dodge, and if that happens before a cup comes into reading distance
    the flag is never written and this used to fail on the timeout, about
    one run in eight. The claim is that the tip retires once it has been
    read, not that an unattended car survives; so when the run ends, start
    another one and keep waiting.
  */
  let spent = false;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    spent = await page.evaluate(() => localStorage.getItem('cc.coffeetip.v1') === '1');
    if (spent) break;
    await ensureRunning(page);
    await page.waitForTimeout(250);
  }
  log(before === null && spent,
    'the coffee lesson is still retired once it has actually been on screen');
  await ctx.close();
}

await b.close();
console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
