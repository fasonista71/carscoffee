/*
  Menu press states and confirmation sounds. Both are things a player
  feels rather than things the DOM records, so this watches the canvas
  pixels for the press state and the Web Audio graph for the sounds.
*/
import { chromium } from 'playwright';
import { chromiumOpts } from './launch.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8399';
const out = [];
const log = (ok, n, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  :: ' + x : ''}`);

const b = await chromium.launch(chromiumOpts({ args: ['--autoplay-policy=no-user-gesture-required'] }));
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });

/* Count every oscillator the game starts, so a sound is observable. */
await ctx.addInitScript(() => {
  window.__voices = [];
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const orig = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () {
    const osc = orig.call(this);
    const start = osc.start.bind(osc);
    osc.start = function (t) {
      try { window.__voices.push({ hz: osc.frequency.value, at: performance.now() }); } catch (e) { /* ignore */ }
      return start(t);
    };
    return osc;
  };
});

const page = await ctx.newPage();
await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
await page.waitForTimeout(700);

const box = await page.locator('#game').boundingBox();
const at = (ly) => ({ x: box.x + box.width / 2, y: box.y + (ly / 320) * box.height });
/*
  Title menu: primary 150..176, car 189..211, sound 218..240.
  Paused menu: primary 116..142, car 155..177, sound 184..206.
  The toggle checks below run on the paused menu, so they use its
  geometry, not the title's.
*/
const START = at(163);
const RESUME = at(129);
const SOUND_PAUSED = at(195);

/*
  Crop to the button's own opaque face. A whole canvas screenshot is
  useless here, because the world scrolls behind the title screen and
  any two frames differ for reasons that have nothing to do with the
  press. Logical 36..144 x 150..176 at scale 2 is the Start plate on
  the title menu, and 116..142 on the paused one.
*/
const shot = (ly) => page.screenshot({
  clip: { x: box.x + 72, y: box.y + ly * 2, width: 216, height: 52 }
});
const voices = () => page.evaluate(() => window.__voices.length);

const idle = await shot(150);

/* --- press and hold Start --- */
const before = await voices();
await page.mouse.move(START.x, START.y);
await page.mouse.down();
await page.waitForTimeout(220);
const held = await shot(150);
const afterPress = await voices();
log(!idle.equals(held), 'holding Start visibly presses it');
log(afterPress > before, 'and it makes a sound on the way down', `${before} -> ${afterPress}`);

/* --- let go on the button: it fires --- */
await page.mouse.up();
await page.waitForTimeout(500);
const running = await page.evaluate(() => new Promise((res) => {
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const snap = () => g.getImageData(0, Math.floor(c.height * 0.4), c.width, 40).data.join(',');
  const first = snap(); const t0 = performance.now();
  const tick = () => { if (snap() !== first) return res(true);
    if (performance.now() - t0 > 900) return res(false); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));
log(running, 'and the run starts');

/* --- back to a menu, then press and drag off --- */
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const pausedIdle = await shot(116);
await page.mouse.move(RESUME.x, RESUME.y);
await page.mouse.down();
await page.waitForTimeout(200);
const pausedHeld = await shot(116);
log(!pausedIdle.equals(pausedHeld), 'the paused menu shows the press too');
/* Drag well off the button, then release. */
await page.mouse.move(RESUME.x, RESUME.y + 160, { steps: 8 });
await page.waitForTimeout(200);
const draggedOff = await shot(116);
await page.mouse.up();
await page.waitForTimeout(400);
log(!draggedOff.equals(pausedHeld), 'dragging off the button releases the press state');
const stillPaused = await page.evaluate(() => new Promise((res) => {
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const snap = () => g.getImageData(0, Math.floor(c.height * 0.4), c.width, 40).data.join(',');
  const first = snap(); const t0 = performance.now();
  const tick = () => { if (snap() !== first) return res(false);
    if (performance.now() - t0 > 700) return res(true); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));
log(stillPaused, 'and a press thought better of does not resume the run');

/* --- the toggles --- */
const soundBefore = await page.evaluate(() => localStorage.getItem('cc.sound.v1'));
const vBefore = await voices();
await page.mouse.click(SOUND_PAUSED.x, SOUND_PAUSED.y);
await page.waitForTimeout(400);
const soundAfter = await page.evaluate(() => localStorage.getItem('cc.sound.v1'));
const vAfter = await voices();
log(soundAfter !== soundBefore, 'the Sound row still toggles', `${soundBefore} -> ${soundAfter}`);
log(vAfter > vBefore, 'and turning sound off is itself audible before it goes quiet',
  `${vBefore} -> ${vAfter}`);

await b.close();
console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
