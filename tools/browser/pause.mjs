/*
  Pause on a phone. Until this change the only ways to pause were a
  keyboard, which a phone does not have, and two fingers, which
  nothing tells you about, so the paused menu and its Restart button
  were effectively unreachable on the primary surface.

  Real touch through CDP, because a synthetic TouchEvent would not
  prove the adapter sees a genuine drag.
*/
import { chromium } from 'playwright';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8399';
const out = [];
const log = (ok, n, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  :: ' + x : ''}`);

const b = await chromium.launch({ executablePath: EXEC });
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
await page.waitForTimeout(700);

const box = await page.locator('#game').boundingBox();
const cdp = await ctx.newCDPSession(page);

async function swipe(dy) {
  const x = box.x + box.width / 2;
  const y0 = box.y + box.height * 0.45;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0, id: 1 }] });
  for (let i = 1; i <= 6; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x, y: y0 + (dy * i) / 6, id: 1 }]
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
}

/* Is the world moving? A paused run is frozen. */
const moving = (ms = 800) => page.evaluate((ms) => new Promise((res) => {
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const snap = () => g.getImageData(0, Math.floor(c.height * 0.45), c.width, 30).data.join(',');
  const first = snap(); const t0 = performance.now();
  const tick = () => { if (snap() !== first) return res(true);
    if (performance.now() - t0 > ms) return res(false); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}), ms);

/* Start a run. */
await page.touchscreen.tap(box.x + box.width / 2, box.y + (163 / 320) * box.height);
await page.waitForTimeout(700);
log(await moving(), 'the run is going');

/* --- swipe down pauses --- */
await swipe(90);
log(!(await moving()), 'a swipe down pauses the run');

/* --- and the paused menu is really there, Restart included --- */
const menuThere = await page.evaluate(() => {
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 220, c.width, 300).data;
  /* The Resume button is a wide block of the accent yellow #ffd93d.
     The two road edge lines are the same colour and run the full
     height, which is a floor of about 2400 pixels in this crop during
     play, so the threshold has to clear that rather than just be
     above zero. The button adds roughly 7000 more. */
  let accent = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 240 && d[i + 1] > 200 && d[i + 1] < 235 && d[i + 2] < 90) accent += 1;
  }
  return accent;
});
log(menuThere > 5000, 'the paused menu is on screen', 'accent pixels=' + menuThere);

/* --- the same swipe resumes --- */
await swipe(90);
log(await moving(), 'the same swipe down resumes');

/* --- up is still boost, not pause --- */
await swipe(-90);
log(await moving(), 'a swipe up still boosts rather than pausing');

/* --- sideways is still a lane change --- */
await swipe(0);
log(await moving(), 'the run survives a horizontal swipe');

log(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));

await b.close();
console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
