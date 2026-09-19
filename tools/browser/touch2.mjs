/*
  Blocker 3 (a cancelled gesture must not poison the next tap) and the
  removal of the three finger dev gesture, against the shipped bundle.
  Plus a run at a forced high animation frame rate, standing in for a
  120Hz phone as far as automation here can.
*/
import { chromium } from 'playwright';
import { chromiumOpts } from './launch.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const out = [];
const log = (ok, n, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  :: ' + x : ''}`);

const b = await chromium.launch(chromiumOpts());

async function startedPage(ctx) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const box = await page.locator('#game').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + (163 / 320) * box.height);
  await page.waitForTimeout(800);
  return { page, box };
}

const moving = (page, ms = 900) => page.evaluate((ms) => new Promise((res) => {
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const snap = () => g.getImageData(0, Math.floor(c.height * 0.4), c.width, 40).data.join(',');
  const first = snap(); const t0 = performance.now();
  const tick = () => { if (snap() !== first) return res(true);
    if (performance.now() - t0 > ms) return res(false); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}), ms);

/* --- 3. three fingers, an OS interrupt, then an ordinary tap --- */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
  const { page, box } = await startedPage(ctx);
  const cdp = await ctx.newCDPSession(page);
  const pt = (x, y, id) => ({ x: box.x + box.width * x, y: box.y + box.height * y, id });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(0.3, 0.6, 1)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [pt(0.3, 0.6, 1), pt(0.5, 0.6, 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [pt(0.3, 0.6, 1), pt(0.5, 0.6, 2), pt(0.7, 0.6, 3)] });
  await page.waitForTimeout(80);
  /* The interruption: a notification, control centre, an incoming call. */
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(250);
  log(await moving(page), 'the run survives a cancelled three finger gesture');

  /* Now one ordinary finger. It must move the car, not pause. */
  await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height * 0.6);
  await page.waitForTimeout(350);
  log(await moving(page), 'the next single tap does not pause the run');

  /* And nothing resembling the old dev overlay is on screen. */
  const overlayish = await page.evaluate(() =>
    document.body.innerText.toLowerCase().indexOf('boostmult') !== -1
    || document.querySelectorAll('input[type=range]').length);
  log(!overlayish, 'no dev overlay anywhere in the document', String(overlayish));
  await ctx.close();
}

/* --- three fingers with no cancel must also not open anything --- */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
  const { page, box } = await startedPage(ctx);
  const cdp = await ctx.newCDPSession(page);
  const pt = (x, id) => ({ x: box.x + box.width * x, y: box.y + box.height * 0.6, id });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(0.3, 1)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(0.3, 1), pt(0.5, 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(0.3, 1), pt(0.5, 2), pt(0.7, 3)] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pt(0.3, 1), pt(0.5, 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pt(0.3, 1)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  const sliders = await page.evaluate(() => document.querySelectorAll('input[type=range]').length);
  log(sliders === 0, 'three fingers no longer opens the tuning overlay', 'sliders=' + sliders);
  await ctx.close();
}

/* --- a forced high animation frame rate --- */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
  await ctx.addInitScript(() => {
    /* Roughly 250 frames a second, well past a 120Hz phone. A frame
       counted timer would visibly misbehave; a clock driven one will
       not. This cannot prove the timings on real ProMotion hardware,
       only that a high rate does not break anything. */
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 4);
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
  const r = await (async () => {
    await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
    await page.waitForTimeout(600);
    const box = await page.locator('#game').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + (163 / 320) * box.height);
    await page.waitForTimeout(3000);
    return page.evaluate(() => {
      const c = document.getElementById('game');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] + ',' + d[i+1] + ',' + d[i+2]);
      return seen.size;
    });
  })();
  log(r > 4 && errs.length === 0, 'a 250Hz frame rate plays clean for three seconds',
    'colours=' + r + (errs.length ? ' errors=' + errs.slice(0, 2).join(' | ') : ''));
  await ctx.close();
}

await b.close();
console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
