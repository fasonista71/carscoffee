import { chromium, webkit } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const which = process.argv[2] || 'chromium';
const engine = which === 'webkit' ? webkit : chromium;

const out = [];
const log = (ok, name, extra = '') => {
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  :: ' + extra : ''}`);
};

/* The container has chromium 1194 on disk and playwright 1.63, which
   wants 1243. The CDP surface used here is stable across that gap, so
   point at the binary that is actually present. WebKit 2359 matches
   1.63 exactly and needs nothing. */
const launchOpts = which === 'webkit'
  ? {}
  : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
const browser = await engine.launch(launchOpts);
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const l = m.location() || {};
  /* The harness has no favicon; itch serves its own. Not the game. */
  if ((l.url || '').endsWith('/favicon.ico')) return;
  errors.push('console: ' + m.text() + ' @ ' + (l.url || '?') + ':' + (l.lineNumber || 0));
});
const notFound = [];
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) notFound.push(r.status() + ' ' + r.url());
});
/* Every url the game fetches, so the cache safety property can be
   checked rather than assumed. */
const fetched = [];
page.on('request', (r) => fetched.push(new URL(r.url()).pathname));

await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });

// 1. boot card goes away
let bootHidden = false;
try {
  await page.waitForFunction(() => {
    const b = document.getElementById('boot');
    return b && b.hidden;
  }, null, { timeout: 15000 });
  bootHidden = true;
} catch (e) { /* stays */ }
log(bootHidden, 'boot card clears after load');

// 2. build tag present in source
const tag = await page.evaluate(() => document.querySelector('script[type=module]').getAttribute('src'));
log(/^\.\/v[0-9a-f]{10}\/src\/app\/main\.js$/.test(tag),
  'entry script points at a content versioned directory', tag);

// 3. canvas is actually painted (not a black rectangle)
const painted = await page.evaluate(() => {
  const c = document.getElementById('game');
  if (!c || !c.width) return { ok: false, why: 'no canvas' };
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] + ',' + d[i+1] + ',' + d[i+2]);
  return { ok: seen.size > 4, colors: seen.size, w: c.width, h: c.height };
});
log(painted.ok, 'title screen renders more than one colour', JSON.stringify(painted));

// helpers
const LOGICAL_W = 180, LOGICAL_H = 320;
async function logicalToPage(lx, ly) {
  const box = await page.locator('#game').boundingBox();
  return { x: box.x + (lx / LOGICAL_W) * box.width, y: box.y + (ly / LOGICAL_H) * box.height };
}
/* Sample the canvas repeatedly; the world is scrolling if any two
   samples differ. A single before/after pair can straddle a frame
   that happens to be identical, which made this flaky. */
async function isMoving(ms = 900) {
  return page.evaluate((ms) => new Promise((res) => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const snap = () => g.getImageData(0, Math.floor(c.height * 0.4), c.width, 40).data.join(',');
    const first = snap();
    const t0 = performance.now();
    const tick = () => {
      if (snap() !== first) return res(true);
      if (performance.now() - t0 > ms) return res(false);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), ms);
}

// 5. a real tap on START starts the run
//    Start button: logical x centred, y 150, height 26.
const startAt = await logicalToPage(LOGICAL_W / 2, 150 + 13);
/* The menu has a 350ms cooldown after it is entered, deliberately, so
   a stray tap during load cannot start a run. Respect it. */
await page.waitForTimeout(600);
await page.touchscreen.tap(startAt.x, startAt.y);
await page.waitForTimeout(700);
const running = await isMoving();
log(running, 'a tap on Start begins the run and the world scrolls');

// 6. two fingers down together does not kill lane changes (blocker 2)
//    Drive with a resting second finger and check the car still moves.
const laneMoved = await (async () => {
  const box = await page.locator('#game').boundingBox();
  const cdp = which === 'chromium' ? await ctx.newCDPSession(page) : null;
  if (!cdp) return null; // WebKit has no trusted touch drag in Playwright
  const rest = { x: box.x + 8, y: box.y + box.height - 8, id: 1 };
  const play = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5, id: 2 };
  const shot = async () => page.evaluate(() => {
    const c = document.getElementById('game');
    return c.getContext('2d').getImageData(0, Math.floor(c.height * 0.72), c.width, 24).data.join(',');
  });
  // resting thumb lands and stays
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [{ x: rest.x, y: rest.y, id: rest.id }] });
  await page.waitForTimeout(120);
  const before = await shot();
  // second finger taps the left lane while the first is still down
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart',
    touchPoints: [{ x: rest.x, y: rest.y, id: rest.id }, { x: box.x + box.width * 0.15, y: play.y, id: play.id }] });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd',
    touchPoints: [{ x: rest.x, y: rest.y, id: rest.id }] });
  await page.waitForTimeout(500);
  const after = await shot();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return before !== after;
})();
if (laneMoved !== null) log(laneMoved, 'a tap with a second finger resting still reaches the game');

// 7. and that gesture must NOT have paused the run
await page.waitForTimeout(250);
log(await isMoving(), 'a resting second finger does not pause the run');

// 8. no uncaught errors anywhere in that session
log(errors.length === 0, 'no page errors or console errors', errors.slice(0, 4).join(' | '));
log(notFound.length === 0, 'every request the game made returned 200', JSON.stringify(notFound));

/*
  The one that matters for an in place update on itch. Thirteen builds
  shipped as src-M8/ and a browser paired cached modules with fresh
  ones, which cost Safari its audio. Nothing but the entry page may
  live at a url a previous build also used.
*/
const stable = fetched.filter((p) => !/\/v[0-9a-f]{10}\//.test(p)
  && !/\/index\.html$/.test(p) && !/favicon/.test(p) && p !== '/game/');
log(stable.length === 0,
  'only the entry page sits at a url a previous build could have cached',
  stable.length ? stable.join(' ') : String(fetched.length) + ' requests, all versioned');

/* Last, because it is a deliberate 404 and would otherwise show up in
   the two checks above. */
const devStatus = await page.evaluate(async () => {
  const src = document.querySelector('script[type=module]').getAttribute('src');
  const dir = src.replace(/\/app\/main\.js$/, '');
  const r = await fetch(dir + '/app/devOverlay.js');
  return r.status;
});
log(devStatus === 404, 'devOverlay.js is absent from the bundle', 'status ' + devStatus);

await browser.close();
console.log('--- ' + which + ' ---');
console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
