/*
  Tier 1 fixes that only exist on the live page, so the node tests
  cannot reach them: the sound hint's gating, and the initials modal's
  iOS changes.
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

/* The hint sits at logical y 284, in a 180x320 buffer. */
async function tapHint(page) {
  const box = await page.locator('#game').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + (288 / 320) * box.height);
  await page.waitForTimeout(250);
  return page.evaluate(() => localStorage.getItem('cc.soundtip.v1'));
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

/* --- 1.11 the initials modal --- */
{
  const { ctx, page } = await boot();
  const m = await page.evaluate(() => {
    const panel = document.getElementById('initials-entry');
    if (!panel) return { missing: true };
    const input = panel.querySelector('input');
    const btns = [...panel.querySelectorAll('button')].map((x) => x.textContent);
    const ps = getComputedStyle(panel);
    const is = getComputedStyle(input);
    return {
      align: ps.alignItems,
      overflow: ps.overflowY,
      userSelect: is.userSelect || is.webkitUserSelect,
      buttons: btns,
      ariaLabel: input.getAttribute('aria-label')
    };
  });
  log(m.userSelect === 'text',
    'the initials field overrides the user-select: none it inherits from body',
    'user-select=' + m.userSelect);
  log(m.align === 'flex-start' && m.overflow === 'auto',
    'the card is top anchored and scrollable, so the keyboard cannot bury Save',
    JSON.stringify({ align: m.align, overflow: m.overflow }));
  log(m.buttons.length === 2 && m.buttons.includes('Skip'),
    'there is a way out besides Save', JSON.stringify(m.buttons));

  log(m.ariaLabel !== null, 'the field is labelled', String(m.ariaLabel));
  await ctx.close();
}

/*
  End to end, through a real qualifying run. The board starts empty so
  any distance makes the top five, and an idle player crashes in about
  ten seconds.
*/
{
  const { ctx, page } = await boot();
  const box = await page.locator('#game').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + (163 / 320) * box.height);
  let opened = false;
  try {
    await page.waitForFunction(() => {
      const p = document.getElementById('initials-entry');
      return p && p.style.display === 'flex';
    }, null, { timeout: 60000 });
    opened = true;
  } catch (e) { /* never died */ }
  log(opened, 'a qualifying run opens the initials panel');

  if (opened) {
    const prefill = await page.evaluate(() => document.querySelector('#initials-entry input').value);
    log(prefill === 'AAA',
      'the field opens pre-filled, so the default is visible rather than substituted in silence',
      'value=' + JSON.stringify(prefill));

    /* A tap on the scrim, away from the card, is a way out. */
    await page.mouse.click(8, 8);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      display: document.getElementById('initials-entry').style.display,
      board: localStorage.getItem('cc.board.v1')
    }));
    log(after.display === 'none', 'a tap on the scrim closes it', after.display);
    log(!!after.board && after.board.indexOf('AAA') !== -1,
      'and the score is kept under the initials that were on screen',
      String(after.board).slice(0, 80));
  }
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
