/*
  Blocker 1 (high score migration) and blocker 6 (audio context) proved
  against the shipped bundle rather than the source.
*/
import { chromium } from 'playwright';
import { chromiumOpts } from './launch.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const out = [];
const log = (ok, n, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  :: ' + x : ''}`);

const b = await chromium.launch(chromiumOpts());

/* --- 6. AudioContext constructor throws --- */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
  await ctx.addInitScript(() => {
    const boom = function () { throw new Error('simulated: no audio contexts left'); };
    Object.defineProperty(window, 'AudioContext', { value: boom, configurable: true });
    Object.defineProperty(window, 'webkitAudioContext', { value: boom, configurable: true });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const box = await page.locator('#game').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + (163 / 320) * box.height);
  await page.waitForTimeout(900);
  const moving = await page.evaluate(() => new Promise((res) => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const snap = () => g.getImageData(0, Math.floor(c.height * 0.4), c.width, 40).data.join(',');
    const first = snap(); const t0 = performance.now();
    const tick = () => { if (snap() !== first) return res(true);
      if (performance.now() - t0 > 900) return res(false); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  log(moving, 'a throwing AudioContext still lets the game start and run');
  log(errs.length === 0, 'and throws nothing out of the input handler', errs.slice(0, 3).join(' | '));
  await ctx.close();
}

/* --- 1. legacy high score keys are migrated --- */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
  /* Seed the storage the live build wrote, then load this build. */
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('cc.high.sports.city.v1', '6310');
      localStorage.setItem('cc.high.lambo.city.v1', '4102');
    } catch (e) { /* ignore */ }
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
  const after = await page.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k.indexOf('cc.high.') === 0 || k.indexOf('cc.migrated') === 0) o[k] = localStorage.getItem(k);
    }
    return o;
  });
  const got = ['coupe', 'fourbyfour', 'classic'].map((id) => Number(after['cc.high.' + id + '.city.v1'] || 0));
  log(got.every((v) => v === 6310), 'the best legacy score carries to all three new car ids', JSON.stringify(after));
  log(after['cc.high.sports.city.v1'] === '6310', 'the old keys are left in place, so it is reversible');
  log(after['cc.migrated.v2'] === '1', 'the migration flag is set');

  /* And it must not run twice over a score set since. */
  await page.evaluate(() => localStorage.setItem('cc.high.coupe.city.v1', '99'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
  const second = await page.evaluate(() => localStorage.getItem('cc.high.coupe.city.v1'));
  log(second === '99', 'a second boot does not re-apply the migration', 'coupe=' + second);
  await ctx.close();
}

/* --- a current player's per car bests are not inflated --- */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('cc.high.coupe.city.v1', '5000');
      localStorage.setItem('cc.high.fourbyfour.city.v1', '1000');
      localStorage.setItem('cc.high.classic.city.v1', '200');
    } catch (e) { /* ignore */ }
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
  const v = await page.evaluate(() => ({
    coupe: localStorage.getItem('cc.high.coupe.city.v1'),
    fourbyfour: localStorage.getItem('cc.high.fourbyfour.city.v1'),
    classic: localStorage.getItem('cc.high.classic.city.v1')
  }));
  log(v.coupe === '5000' && v.fourbyfour === '1000' && v.classic === '200',
    'current ids are left exactly as they were', JSON.stringify(v));
  await ctx.close();
}

/* --- a legacy score does not overwrite a higher current one --- */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('cc.high.sports.city.v1', '3000');
      localStorage.setItem('cc.high.coupe.city.v1', '9000');
    } catch (e) { /* ignore */ }
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
  const v = await page.evaluate(() => ({
    coupe: localStorage.getItem('cc.high.coupe.city.v1'),
    classic: localStorage.getItem('cc.high.classic.city.v1')
  }));
  log(v.coupe === '9000' && v.classic === '3000',
    'a legacy score fills the gaps and never lowers a better one', JSON.stringify(v));
  await ctx.close();
}

/* --- a fresh browser is not given someone else's score --- */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
  const fresh = await page.evaluate(() => ({
    coupe: localStorage.getItem('cc.high.coupe.city.v1'),
    flag: localStorage.getItem('cc.migrated.v2')
  }));
  log(fresh.coupe === null && fresh.flag === '1',
    'a first time player gets no invented high score', JSON.stringify(fresh));
  await ctx.close();
}

await b.close();
console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
