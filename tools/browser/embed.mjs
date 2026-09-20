/*
  The game as itch actually serves it: in an iframe, on a page it does
  not own, with the fullscreen button belonging to that page.

  Every other script here loads the game as the whole document, which
  is the one way nobody plays it. Jason found what that missed on his
  phone: press fullscreen and the sound stops while the game keeps
  running. Entering fullscreen blurs the frame, the blur handler read
  that as the player leaving, and the run paused and the music
  stopped; the pause screen draws the world behind it, so what you see
  is a game that went quiet for no reason. Safari can also park the
  audio context in its own 'interrupted' state on a presentation
  change, which looks alive and makes no sound.

  So this checks the two things that were wrong and the one thing that
  must stay right: focus moving to the parent page does not stop the
  run, fullscreen does not stop it either, and a hidden tab still
  does.

  Run it under webkit as well as chromium. The audio session behaviour
  this is about is Safari's.
*/
import { chromium, webkit } from 'playwright';
import { chromiumOpts } from './launch.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8399';
const which = process.argv[2] || 'chromium';
const out = [];
const log = (ok, n, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  :: ' + x : ''}`);

const engine = which === 'webkit' ? webkit : chromium;
const b = await engine.launch(which === 'webkit' ? {} : chromiumOpts());
const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } });

/* Count every voice the game creates, in whatever frame it lives in.
   Sound is the thing under test and there is no other way to see it
   from out here. */
await ctx.addInitScript(() => {
  const O = window.AudioContext || window.webkitAudioContext;
  if (!O) return;
  window.__voices = 0;
  const osc = O.prototype.createOscillator;
  O.prototype.createOscillator = function (...a) { window.__voices += 1; return osc.apply(this, a); };
  const buf = O.prototype.createBufferSource;
  O.prototype.createBufferSource = function (...a) { window.__voices += 1; return buf.apply(this, a); };
});

const page = await ctx.newPage();
await page.goto(BASE + '/host/itch.html', { waitUntil: 'load' });
const frame = page.frames().find((f) => f.url().includes('/game/'));
await frame.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 20000 });
await page.waitForTimeout(500);

/* The same question probe.mjs asks, asked inside the frame: the HUD
   plates are drawn only in a run, and the pause dim goes over them. */
const mode = () => frame.evaluate(async () => {
  if (!window.__ccPal) {
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
  window.__ccPal = {
    road,
    menu: rgb(pal.edgeLine),
    block: rgb(pal.outline),
    paused: road.map((c, i) => Math.round(c * (1 - a) + dim[i] * a))
  };
  }
  const want = window.__ccPal;
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const unit = c.width / 180;
  const near = (p, q) => Math.abs(p[0] - q[0]) <= 2 && Math.abs(p[1] - q[1]) <= 2 && Math.abs(p[2] - q[2]) <= 2;
  /* The same three rows probe.mjs reads, and for the same reason:
     paused draws no HUD any more, so it is recognised by its own menu
     plate with nothing plated where a result block would be. */
  const count = (y, exp) => {
    const d = g.getImageData(0, Math.floor((y + 0.5) * unit), c.width, 1).data;
    let n = 0;
    for (let lx = 0; lx < 180; lx += 1) {
      const i = Math.floor((lx + 0.5) * unit) * 4;
      if (near([d[i], d[i + 1], d[i + 2]], exp)) n += 1;
    }
    return n;
  };
  if (count(5, want.road) >= 40) return 'playing';
  if (count(128, want.menu) >= 40 && count(50, want.block) < 60) return 'paused';
  return 'other';
});

/* Voices started over a second and a bit. The music scheduler runs
   every 200ms, so a live run is never zero. */
async function voicesPerSecond() {
  const before = await frame.evaluate(() => window.__voices);
  await page.waitForTimeout(1200);
  const after = await frame.evaluate(() => window.__voices);
  return Math.round((after - before) / 1.2);
}

async function clickInGame(fx, fy) {
  const box = await page.locator('#game_drop').boundingBox();
  const r = await frame.evaluate(() => {
    const g = document.getElementById('game').getBoundingClientRect();
    return { x: g.left, y: g.top, w: g.width, h: g.height };
  });
  await page.mouse.click(box.x + r.x + r.w * fx, box.y + r.y + r.h * fy);
  await page.waitForTimeout(350);
}

/* Start a run. The primary button first, and the middle of the road
   as a fallback, which is the boost gesture once a run is live and
   therefore harmless. */
await clickInGame(0.5, 0.51);
if (await mode() !== 'playing') await clickInGame(0.5, 0.5);
const runningSound = await voicesPerSecond();
log(await mode() === 'playing' && runningSound > 0,
  'the game runs and makes sound inside an iframe', 'voices/s=' + runningSound);

/* --- the parent page taking focus is not the player leaving --- */
await page.click('#outside');
await page.waitForTimeout(500);
const afterOutside = await mode();
const soundOutside = await voicesPerSecond();
log(afterOutside === 'playing', 'a click on the page around the game does not pause the run', afterOutside);
log(soundOutside > 0, 'and does not stop the music', 'voices/s=' + soundOutside);

/* --- fullscreen, which is the button Jason pressed --- */
await page.click('#fs');
await page.waitForTimeout(900);
const afterFs = await mode();
const soundFs = await voicesPerSecond();
log(afterFs === 'playing', 'entering fullscreen does not pause the run', afterFs);
log(soundFs > 0, 'and the sound survives it', 'voices/s=' + soundFs);

/*
  The keyboard has to come back on its own. Escape is the pause key,
  so if the frame took its focus back this lands and the mode flips
  from playing to paused. Checked as a change rather than as a state,
  because a build that pauses on its own would otherwise read as a
  pass here for exactly the wrong reason.
*/
const beforeKey = await mode();
/* P, not Escape. Escape belongs to the browser while an element is
   fullscreen, so pressing it tests the browser's exit handler rather
   than whether the game can hear a key. */
await page.keyboard.press('KeyP');
await page.waitForTimeout(700);
const afterKey = await mode();
log(beforeKey === 'playing' && afterKey === 'paused',
  'and the keyboard reaches the game without a tap first',
  beforeKey + ' -> ' + afterKey);
await page.keyboard.press('KeyP');
await page.waitForTimeout(500);
await page.evaluate(() => (document.exitFullscreen ? document.exitFullscreen() : null)).catch(() => {});
await page.waitForTimeout(600);

/*
  But a hidden tab still pauses, which is the behaviour the blur
  handler was there for and which this change has to keep. Visibility
  is the signal, so assert on the frame agreeing that it is hidden
  before reading anything into the mode.
*/
/* Back into a live run before the last check. Enter works the
   primary button in every menu mode, and the frame has focus by now,
   so this is more reliable than aiming a click at a button whose
   position depends on which screen is up. */
for (let i = 0; i < 5 && await mode() !== 'playing'; i += 1) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450);
}
/*
  Opening another tab does not reliably hide this one under
  automation, so the document is made to report hidden and the event
  is fired by hand. That tests our handler rather than the browser's
  bookkeeping, which is the half that changed here.
*/
const before = await mode();
await frame.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(500);
const hidden = await mode();
log(before === 'playing' && hidden === 'paused', 'a hidden tab still pauses the run',
  before + ' -> ' + hidden);

await b.close();
console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
