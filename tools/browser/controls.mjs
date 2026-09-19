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
import { running, still, waitForMode, ensureRunning, freshRun } from './probe.mjs';
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
