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
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8399';
const out = [];
const log = (ok, n, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  :: ' + x : ''}`);

const b = await chromium.launch({ executablePath: EXEC });

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
const moving = (page, ms = 800) => page.evaluate((ms) => new Promise((res) => {
  const c = document.getElementById('game'); const g = c.getContext('2d');
  const s = () => g.getImageData(0, Math.floor(c.height * 0.45), c.width, 30).data.join(',');
  const f = s(); const t0 = performance.now();
  const t = () => { if (s() !== f) return res(true);
    if (performance.now() - t0 > ms) return res(false); requestAnimationFrame(t); };
  requestAnimationFrame(t);
}), ms);
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
  log(await moving(page), 'Enter starts a run from the title screen');
  await ctx.close();
}
{
  const { ctx, page } = await boot();
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  log(await moving(page), 'Space starts a run too');
  await ctx.close();
}

const { page, box, cdp } = await boot();
await page.keyboard.press('Enter');
await page.waitForTimeout(600);

/* --- the pause button --- */
const pause = at(box, 171, 11);
await page.touchscreen.tap(pause.x, pause.y);
await page.waitForTimeout(400);
log(!(await moving(page)), 'tapping the HUD pause button pauses');

await page.touchscreen.tap(box.x + box.width / 2, box.y + (129 / 320) * box.height);
await page.waitForTimeout(500);
log(await moving(page), 'Resume works');

/*
  The conflict that made the button's hit box bounded in y as well as
  x: a tap resolves to a lane by its x alone, so a tap at the same x
  but down on the road must still steer rather than pause.
*/
const road = at(box, 171, 200);
await page.touchscreen.tap(road.x, road.y);
await page.waitForTimeout(400);
log(await moving(page), 'a tap at the same x but on the road still steers');

/* --- down is reserved again --- */
await swipe(page, cdp, box, 90);
log(await moving(page), 'a swipe down no longer pauses, it is reserved');
await swipe(page, cdp, box, -90);
log(await moving(page), 'a swipe up still boosts');

/* --- two fingers is still the backup --- */
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
await page.waitForTimeout(400);
log(!(await moving(page)), 'a deliberate two finger hold still pauses as the backup');

/* --- R restarts from the paused screen --- */
await page.keyboard.press('KeyR');
await page.waitForTimeout(600);
log(await moving(page), 'R restarts from the paused screen');

await b.close();
console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
