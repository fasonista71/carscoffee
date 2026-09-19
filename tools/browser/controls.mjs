/*
  The control scheme against genre convention. Pause is a button in
  the HUD, down is reserved, and the keyboard can work the menus.

  All three were newbie mistakes found by reviewing the scheme against
  what other runners do, not by a crash:
  - swipe down meant pause, where the whole genre reads down as duck
    or brake, and where an iPhone reads a downward swipe near the top
    edge as Notification Centre;
  - there was no pause button at all, which is why a gesture was being
    invented for it;
  - the keyboard could not start, restart or resume a run, so a
    desktop player had to reach for the mouse.
*/
import { chromium } from 'playwright';
import { chromiumOpts } from './launch.mjs';
import { running, still, waitForMode, ensureRunning, freshRun, mode } from './probe.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8399';
const out = [];
const log = (ok, n, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  :: ' + x : ''}`);

const b = await chromium.launch(chromiumOpts());

async function boot() {
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
  await page.waitForTimeout(700);
  const box = await page.locator('#game').boundingBox();
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, box, cdp };
}
async function swipe(page, cdp, box, dy) {
  const x = box.x + box.width / 2; const y0 = box.y + box.height * 0.45;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0, id: 1 }] });
  for (let i = 1; i <= 6; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (dy * i) / 6, id: 1 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
}
/* logical (180x320) to page coordinates */
const at = (box, lx, ly) => ({ x: box.x + (lx / 180) * box.width, y: box.y + (ly / 320) * box.height });

/* --- the keyboard can start a run, which it could not before --- */
{
  const { ctx, page } = await boot();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  log(await running(page), 'Enter starts a run from the title screen');
  await ctx.close();
}
{
  const { ctx, page } = await boot();
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  log(await running(page), 'Space starts a run too');
  await ctx.close();
}

/*
  The gesture checks below share one page and one run, and the pilot
  does not steer, so the run used to die partway through about one time
  in six. The world keeps scrolling behind the game over screen, so a
  dead run read as a live one and the two finger hold looked like it had
  stopped pausing. ensureRunning puts a live run back on screen before
  each gesture, and the pause checks now read the paused screen itself
  rather than inferring it from a stalled picture.
*/
/* --- the keyboard can work the option rows, not just the button --- */
{
  const { ctx, page } = await boot();
  const before = await page.evaluate(() => ({
    car: localStorage.getItem('cc.vehicle.v1'), sound: localStorage.getItem('cc.sound.v1')
  }));
  /* The first press shows the cursor on the button it was already
     going to press; the second moves to Car. Right then works the row
     it is on, the way a tap on it would. */
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const afterCar = await page.evaluate(() => localStorage.getItem('cc.vehicle.v1'));
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  const afterSound = await page.evaluate(() => localStorage.getItem('cc.sound.v1'));
  log(afterCar !== null && afterCar !== before.car, 'arrow keys reach the car row and change it',
    JSON.stringify({ before: before.car, after: afterCar }));
  log(afterSound === '0', 'and reach the sound row and turn it off',
    JSON.stringify({ before: before.sound, after: afterSound }));
  /* And the selection is visible, or a keyboard player is guessing
     which row Enter is about to press. */
  const ring = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const unit = c.height / 320;
    /* A thin strip just outside the Sound row's plate, which is where
       the cursor's outline is and where none of the row's own amber
       value text can reach. */
    const d = g.getImageData(Math.floor(16 * unit), Math.floor(214 * unit), Math.ceil(4 * unit), Math.ceil(28 * unit)).data;
    let amber = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 245 && d[i + 1] > 200 && d[i + 1] < 235 && d[i + 2] < 90) amber += 1;
    }
    return amber;
  });
  log(ring > 10, 'and the row the keyboard is on is visibly marked', 'amber pixels ' + ring);
  await ctx.close();
}

/* --- the teaching, which the product did not have at all --- */
{
  const { ctx, page } = await boot();
  const box = await page.locator('#game').boundingBox();
  const at2 = (lx, ly) => ({ x: box.x + (lx / 180) * box.width, y: box.y + (ly / 320) * box.height });

  /* The way in is the corner button, where a run keeps its pause
     control, because a menu row would have cost the board its space
     on the shorter layout. */
  const help = at2(171, 11);
  await page.touchscreen.tap(help.x, help.y);
  await page.waitForTimeout(400);
  const start = at2(90, 163);
  await page.touchscreen.tap(start.x, start.y);
  await page.waitForTimeout(600);
  log(await mode(page) !== 'playing',
    'the help button opens a screen that Start is no longer on');

  const back = at2(90, 183);
  await page.touchscreen.tap(back.x, back.y);
  await page.waitForTimeout(500);
  await page.touchscreen.tap(start.x, start.y);
  log(await running(page), 'and Back returns to a title screen that still starts a run');
  await ctx.close();
}

{
  const { ctx, page } = await boot();
  /*
    Watching the flag alone would pass against a build that never draws
    the lesson, because steering writes the flag either way. So this
    looks for the callout itself: amber type on the road above the car,
    where nothing else in a running game puts any.
  */
  const calloutPixels = () => page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const unit = c.height / 320;
    /* Centre columns only: the road's own edge lines are the same
       amber, and they run the whole height of the screen. */
    const y0 = Math.floor(200 * unit);
    const x0 = Math.floor(50 * unit);
    const d = g.getImageData(x0, y0, Math.ceil(80 * unit), Math.ceil(30 * unit)).data;
    let amber = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 245 && d[i + 1] > 200 && d[i + 1] < 235 && d[i + 2] < 90) amber += 1;
    }
    return amber;
  });
  const before = await page.evaluate(() => localStorage.getItem('cc.steertip.v1'));
  await page.keyboard.press('Enter');
  await running(page);
  const shown = await calloutPixels();
  /* Steering is learned by steering: the lesson retires the moment the
     player does it, read or not. */
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  const afterFlag = await page.evaluate(() => localStorage.getItem('cc.steertip.v1'));
  const gone = await calloutPixels();
  log(before === null && shown > 20 && afterFlag === '1' && gone === 0,
    'the first run says how to steer, and stops saying it the moment you do',
    JSON.stringify({ before, shown, afterFlag, gone }));
  await ctx.close();
}

const { page, box, cdp } = await boot();
await page.keyboard.press('Enter');
await page.waitForTimeout(600);

/* --- the pause button --- */
await ensureRunning(page);
const pause = at(box, 171, 11);
await page.touchscreen.tap(pause.x, pause.y);
log(await waitForMode(page, 'paused') && await still(page), 'tapping the HUD pause button pauses');

await page.touchscreen.tap(box.x + box.width / 2, box.y + (129 / 320) * box.height);
log(await running(page), 'Resume works');

/*
  The conflict that made the button's hit box bounded in y as well as
  x: a tap resolves to a lane by its x alone, so a tap at the same x
  but down on the road must still steer rather than pause.
*/
await ensureRunning(page);
const road = at(box, 171, 200);
await page.touchscreen.tap(road.x, road.y);
await page.waitForTimeout(400);
log(await running(page), 'a tap at the same x but on the road still steers');

/* --- down is reserved again --- */
await freshRun(page);
await swipe(page, cdp, box, 90);
log(await running(page), 'a swipe down no longer pauses, it is reserved');
await ensureRunning(page);
await swipe(page, cdp, box, -90);
log(await running(page), 'a swipe up still boosts');

/* --- two fingers is still the backup --- */
await freshRun(page);
const p1 = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5, id: 1 };
const p2 = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.5, id: 2 };
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1, p2] });
/* Held past tapMaxMs on purpose. A quick two finger tap is two thumbs
   playing, and the adapter deliberately leaves that alone; the pause
   is a deliberate hold. */
await page.waitForTimeout(700);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p1] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
log(await waitForMode(page, 'paused') && await still(page),
  'a deliberate two finger hold still pauses as the backup');

/* --- R restarts from the paused screen --- */
await page.keyboard.press('KeyR');
log(await running(page), 'R restarts from the paused screen');

await b.close();
console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
