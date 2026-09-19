/*
  Blocker 5 regression cover. Each case boots the real bundle against a
  server told to break one thing, and asserts the player is told, and
  offered a way back, instead of looking at a black rectangle.
*/
import { chromium } from 'playwright';
import { chromiumOpts } from './launch.mjs';
import { spawn } from 'node:child_process';


function server(port, env) {
  return new Promise((res) => {
    const p = spawn('node', [new URL('./serve.mjs', import.meta.url).pathname],
      { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', () => res(p));
  });
}

/* The bundle puts src and assets under one content hashed directory,
   so the harness has to read the name out of the built page rather
   than assume it. */
import fs from 'node:fs';
import path from 'node:path';
const BUNDLE = process.env.BUNDLE || 'cars-and-coffee-web';
const VERDIR = (fs.readFileSync(path.join(BUNDLE, 'index.html'), 'utf8')
  .match(/\.\/(v[0-9a-f]{10})\/src\/app\/main\.js/) || [])[1];
if (!VERDIR) { console.error('could not find the versioned directory in index.html'); process.exit(2); }

const CASES = [
  { name: 'atlas 500s',            port: 8110, env: { FAIL_PATHS: '/game/' + VERDIR + '/assets/cars.atlas' } },
  { name: 'sprite sheet 500s',     port: 8111, env: { FAIL_PATHS: '/game/' + VERDIR + '/assets/cars.png' } },
  { name: 'a module 500s',         port: 8112, env: { FAIL_PATHS: '/game/' + VERDIR + '/src/game/world.js' } },
  { name: 'the atlas never replies', port: 8113, env: { STALL_PATHS: '/game/' + VERDIR + '/assets/cars.atlas' } }
];

const out = [];
for (const c of CASES) {
  const srv = await server(c.port, c.env);
  const b = await chromium.launch(chromiumOpts());
  const page = await (await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true })).newPage();
  page.on('pageerror', () => {});
  await page.goto('http://127.0.0.1:' + c.port + '/game/index.html', { waitUntil: 'load' })
    .catch(() => {});
  /* 15s stall timeout plus headroom for the one case that needs it. */
  const budget = c.env.STALL_PATHS ? 20000 : 8000;
  let state = null;
  try {
    await page.waitForFunction(() => {
      const b = document.getElementById('boot');
      const r = document.getElementById('boot-retry');
      return b && !b.hidden && r && !r.hidden;
    }, null, { timeout: budget });
    state = await page.evaluate(() => ({
      msg: document.getElementById('boot-msg').textContent,
      retry: !document.getElementById('boot-retry').hidden
    }));
  } catch (e) {
    state = await page.evaluate(() => ({
      msg: document.getElementById('boot-msg') ? document.getElementById('boot-msg').textContent : '(no card)',
      hidden: document.getElementById('boot') ? document.getElementById('boot').hidden : null,
      retry: false
    }));
  }
  const ok = state.retry === true && /could not|still loading/i.test(state.msg || '');
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${c.name} shows a message and a retry  :: ${JSON.stringify(state)}`);
  await b.close();
  srv.kill();
}

/* And the control: nothing broken, the card must get out of the way. */
{
  const srv = await server(8114, {});
  const b = await chromium.launch(chromiumOpts());
  const page = await (await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true })).newPage();
  await page.goto('http://127.0.0.1:8114/game/index.html', { waitUntil: 'load' });
  let hidden = false;
  try {
    await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
    hidden = true;
  } catch (e) { /* stays */ }
  out.push(`${hidden ? 'PASS' : 'FAIL'}  a healthy load hides the card`);
  await b.close();
  srv.kill();
}

console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
