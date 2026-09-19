/*
  The one thing this product always does, and the one thing nothing
  tested.

  On 19 September the live build lost its audio in Safari. No code
  regression: an in place itch update had written new bytes to urls a
  returning browser already held, so the page ran a mix of cached and
  fresh modules until the cache was cleared. Every other script in this
  directory loads one bundle into a fresh browser, which is the case
  that never happens to a returning player.

  So: serve build A, play a run, swap the served directory to build B
  underneath the same browser profile, come back, and ask whether the
  page is running build B or a souvenir of build A.

  Two cases, because the two halves of a bundle fail differently. One
  build changes only a source file, one changes only an asset. The
  content hashed directory should make both safe; SCHEME=legacy rebuilds
  the same two cases against the pre hash layout this repo shipped until
  de940ff, where they are not, and that run is expected to fail. That
  contrast is the only evidence that this file tests anything.

  Caching: the server here sends no-cache for index.html and a year for
  everything else, which is what a static host does and what makes the
  entry page the one url that has to stay put. If itch's own headers are
  weaker than that, the September failure is rarer than this, not
  impossible; the property being asserted does not depend on the number.

  Run:
    node tools/browser/upgrade.mjs             # the shipped scheme, must pass
    SCHEME=legacy node tools/browser/upgrade.mjs   # the control, must fail
*/
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, execSync } from 'node:child_process';
import { chromium } from 'playwright';
import { chromiumOpts } from './launch.mjs';
import { running } from './probe.mjs';

const SCHEME = process.env.SCHEME === 'legacy' ? 'legacy' : 'hash';
/* The commit before the content hash landed, so the control is the
   layout that actually shipped rather than a reconstruction of it. */
const LEGACY_REF = process.env.LEGACY_REF || 'de940ff~1';
const PORT = Number(process.env.PORT || 8451);
const REPO = path.resolve(new URL('../..', import.meta.url).pathname);

const out = [];
const log = (ok, n, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  :: ' + x : ''}`);

/* --- fixtures: three bundles off one tree --- */

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-upgrade-'));

function tree(name, mutate) {
  const dest = path.join(work, name);
  fs.mkdirSync(dest, { recursive: true });
  if (SCHEME === 'legacy') {
    execSync(`git archive ${LEGACY_REF} | tar -x -C ${JSON.stringify(dest)}`, { cwd: REPO });
  } else {
    for (const item of ['src', 'assets', 'index.html', 'package.json']) {
      fs.cpSync(path.join(REPO, item), path.join(dest, item), { recursive: true });
    }
    fs.mkdirSync(path.join(dest, 'tools'), { recursive: true });
    fs.copyFileSync(path.join(REPO, 'tools/build-itch.sh'), path.join(dest, 'tools/build-itch.sh'));
  }
  mutate(dest);
  execFileSync('bash', ['tools/build-itch.sh'], { cwd: dest, stdio: 'pipe' });
  const built = fs.readdirSync(path.join(dest, '_dist')).filter((d) => d.startsWith('build-'));
  if (built.length !== 1) throw new Error('expected one build directory, got ' + built.join(','));
  return path.join(dest, '_dist', built[0], 'cars-and-coffee-web');
}

/*
  The marker is an export rather than a changed tuning value, so the
  fixture cannot alter how the game plays while it is being measured.
  The page reads it back through a dynamic import of the same url the
  module graph used, which is exactly the url a cache would answer.
*/
function markSource(tag) {
  return (dest) => {
    fs.appendFileSync(path.join(dest, 'src/game/tuning.js'),
      `\n/* Build marker, written by tools/browser/upgrade.mjs. */\nexport const UPGRADE_MARKER = '${tag}';\n`);
  };
}

/* A tEXt chunk in front of IEND: a valid png that still decodes, and a
   file whose bytes are not the ones the previous build shipped. */
function markAsset(tag) {
  return (dest) => {
    const file = path.join(dest, 'assets/coffee.png');
    const png = fs.readFileSync(file);
    if (png.subarray(png.length - 8, png.length - 4).toString('latin1') !== 'IEND') {
      throw new Error('coffee.png does not end in IEND');
    }
    const body = Buffer.concat([Buffer.from('Comment\0build ' + tag, 'latin1')]);
    const chunk = Buffer.alloc(body.length + 12);
    chunk.writeUInt32BE(body.length, 0);
    chunk.write('tEXt', 4, 'latin1');
    body.copy(chunk, 8);
    chunk.writeUInt32BE(zlib.crc32(chunk.subarray(4, 8 + body.length)) >>> 0, 8 + body.length);
    fs.writeFileSync(file, Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)]));
  };
}

const both = (...fns) => (dest) => fns.forEach((f) => f(dest));

console.log('building fixtures under ' + work + ' (' + SCHEME + ' scheme)');
const BUILD_A = tree('a', markSource('A'));
const BUILD_B = tree('b', markSource('B'));
const BUILD_C = tree('c', both(markSource('A'), markAsset('C')));

/* --- the host --- */

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
  '.atlas': 'text/plain', '.txt': 'text/plain', '.json': 'application/json' };
let live = BUILD_A;
let served = [];
const srv = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/game/')) { res.writeHead(404); res.end('nope'); return; }
  const rel = url.slice('/game/'.length) || 'index.html';
  const file = path.join(live, rel);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nope'); return; }
    served.push(url);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      /* The entry page is the one url that has to stay put, so it is
         the one url that may not be answered out of a cache. */
      'cache-control': rel === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
    });
    res.end(buf);
  });
});
await new Promise((res) => srv.listen(PORT, res));
const BASE = 'http://127.0.0.1:' + PORT;

const bytes = (dir, url) => {
  const f = path.join(dir, url.slice('/game/'.length));
  return fs.existsSync(f) ? fs.readFileSync(f) : null;
};

/* The Start button, by touch rather than by key: the keyboard could
   not start a run until 05ccede, and the control here is older than
   that. Logical (90, 163) is the middle of the primary button in both
   layouts. */
async function tapStart(page) {
  const box = await page.locator('#game').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + (163 / 320) * box.height);
}

const fnv = (buf) => {
  let h = 2166136261;
  for (let i = 0; i < buf.length; i += 1) h = Math.imul(h ^ buf[i], 16777619);
  return h >>> 0;
};

/* The bundle puts assets somewhere different in each scheme, so find
   the file rather than assume the path. */
function find(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = find(full, name);
      if (hit) return hit;
    } else if (entry.name === name) return full;
  }
  return null;
}

/* --- the cases --- */

const browser = await chromium.launch(chromiumOpts());

async function upgrade({ name, from, to, check }) {
  live = from;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true });

  /* The visit that fills the cache: load it and play, the way a player
     who was here last week left it. */
  served = [];
  const first = await ctx.newPage();
  await first.goto(BASE + '/game/index.html', { waitUntil: 'load' });
  await first.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
  await first.waitForTimeout(700);
  await tapStart(first);
  const played = await running(first);
  await first.waitForTimeout(600);
  await first.close();
  log(played, name + ': the old build plays before the update');

  /* The update. Nothing else changes: same browser, same profile, same
     origin, same cache. */
  const cacheable = [...new Set(served)].filter((u) => !u.endsWith('/index.html'));
  live = to;
  served = [];

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const l = m.location() || {};
    if ((l.url || '').endsWith('/favicon.ico')) return;
    errors.push('console: ' + m.text());
  });
  const bad = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) bad.push(r.status() + ' ' + r.url());
  });

  await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
  let booted = false;
  try {
    await page.waitForFunction(() => document.getElementById('boot').hidden, null, { timeout: 15000 });
    booted = true;
  } catch (e) { /* the card stayed up */ }
  log(booted, name + ': the updated build boots');

  if (booted) {
    await page.waitForTimeout(700);
    await tapStart(page);
    log(await running(page), name + ': and the run still plays');
  } else {
    log(false, name + ': and the run still plays', 'never booted');
  }

  /*
    The mixed build check, done from the server's side rather than the
    browser's: of the urls this browser already held from the old build,
    which ones does the new build answer with different bytes, and did
    the browser go and get them. Anything in that set it did not ask for
    again, it is still running the old copy of.
  */
  const stale = cacheable.filter((u) => {
    const b = bytes(to, u);
    if (!b) return false; /* the new build does not use that url at all */
    return !b.equals(bytes(from, u)) && !served.includes(u);
  });
  log(stale.length === 0, name + ': nothing the update changed came out of the cache',
    stale.length ? stale.join(' ') : cacheable.length + ' cacheable urls from the old build');

  await check({ page, name, to });
  log(errors.length === 0 && bad.length === 0, name + ': no page errors and no failed requests',
    errors.concat(bad).slice(0, 3).join(' | '));
  await ctx.close();
}

/* What the page believes it is running, read the way the game reads it:
   through the module url the entry script names. */
const markerOnPage = (page) => page.evaluate(async () => {
  const src = document.querySelector('script[type=module]').getAttribute('src');
  const mod = await import(src.replace(/app\/main\.js$/, 'game/tuning.js'));
  return mod.UPGRADE_MARKER || 'missing';
});

/* And the art it is holding, resolved the way sprites.js resolves it,
   so this follows the assets wherever the packaging step put them. */
const artOnPage = (page) => page.evaluate(async () => {
  const src = document.querySelector('script[type=module]').getAttribute('src');
  const sprites = new URL(src.replace(/app\/main\.js$/, 'render/sprites.js'), location.href);
  const url = new URL('../../assets/coffee.png', sprites).href;
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let h = 2166136261;
  for (let i = 0; i < buf.length; i += 1) h = Math.imul(h ^ buf[i], 16777619);
  return h >>> 0;
});

const artOnDisk = (dir) => fnv(fs.readFileSync(find(dir, 'coffee.png')));

await upgrade({
  name: 'source only',
  from: BUILD_A,
  to: BUILD_B,
  check: async ({ page, name }) => {
    const marker = await markerOnPage(page);
    log(marker === 'B', name + ': the code on the page is the code this build ships', 'marker ' + marker);
  }
});

await upgrade({
  name: 'asset only',
  from: BUILD_A,
  to: BUILD_C,
  check: async ({ page, name, to }) => {
    const onPage = await artOnPage(page);
    const onDisk = artOnDisk(to);
    log(onPage === onDisk, name + ': the art on the page is the art this build ships',
      onPage + ' vs ' + onDisk);
  }
});

await browser.close();
srv.close();
if (!process.env.KEEP) fs.rmSync(work, { recursive: true, force: true });

console.log('--- upgrade (' + SCHEME + ' scheme) ---');
console.log(out.join('\n'));
const failed = out.some((l) => l.startsWith('FAIL'));
if (SCHEME === 'legacy') {
  console.log(failed
    ? '\nExpected. This is the layout that lost Safari its audio.'
    : '\nNot expected: the pre hash layout passed, so this file is proving nothing.');
}
process.exit(failed ? 1 : 0);
