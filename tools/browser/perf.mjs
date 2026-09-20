/*
  Frame times during a live run.

  Choppiness is not something a screenshot can show, so this measures
  it: every frame's gap from the one before, for a run left driving on
  its own, reported as the quantiles plus the worst handful. Absolute
  numbers depend on the machine, and a headless container is slower
  than a phone at some things and faster at others, so the number to
  watch is the spread. A steady 60 with a p99 near the median is
  smooth. A p99 several frames long is a stutter, whatever the median
  says, because that is the part a player feels.

  It also measures the thing that actually made the game feel choppy,
  which was never the frame rate: how far the world moves each frame,
  in device pixels, recovered by finding the vertical shift that best
  lines one frame's verge up with the next. The world advances 2.75
  logical pixels a step at the first tier, so drawn on whole logical
  pixels at a scale of four that came out as 8, 12, 12, 8, a swing of
  half the speed from one frame to the next. It should be one number.

  BASE points at a running tools/browser/serve.mjs.
*/
import { chromium } from 'playwright';
import { chromiumOpts } from './launch.mjs';
import { ensureRunning } from './probe.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const SECONDS = Number(process.env.SECONDS || 8);

const browser = await chromium.launch(chromiumOpts());
/* A phone, at a phone's pixel ratio: the buffer is upscaled six times
   there, which is what makes a whole logical pixel of scroll jitter
   something you can see. At the container's own ratio of one the same
   jitter is two device pixels and reads as nothing. */
const ctx = await browser.newContext({
  viewport: { width: 390, height: 780 }, hasTouch: true, deviceScaleFactor: 3
});
const page = await ctx.newPage();
/* Time the work inside each animation frame as well as the gap
   between them. A container's rAF is vsync locked and will report a
   flat 60 whatever the game does, so the gap alone proves nothing;
   the work is the part that travels to a phone. */
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__ccWork = [];
  window.requestAnimationFrame = (cb) => raf((t) => {
    const a = performance.now();
    cb(t);
    window.__ccWork.push(performance.now() - a);
  });
});
await page.goto(BASE + '/game/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => { const b = document.getElementById('boot'); return b && b.hidden; }, null, { timeout: 20000 });
await page.waitForTimeout(700);
await ensureRunning(page);

/* The world eases up to speed over the first second of a run, so let
   it get there before measuring how steadily it moves. */
await page.waitForTimeout(1600);

/*
  Forty frames of one column through the left verge, then the shift
  that best matches each frame to the one before it. Scenery has
  plenty of vertical detail, so the match is unambiguous.
*/
const cols = await page.evaluate(() => new Promise((res) => {
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const out = [];
  let n = 0;
  const grab = () => {
    const d = g.getImageData(Math.floor(c.width * 0.11), 0, 1, c.height).data;
    const col = [];
    for (let y = 0; y < c.height; y += 1) col.push(d[y * 4] + d[y * 4 + 1] * 2 + d[y * 4 + 2] * 3);
    out.push(col);
    if (n++ < 40) requestAnimationFrame(grab); else res(out);
  };
  requestAnimationFrame(grab);
}));

const steps = [];
for (let i = 1; i < cols.length; i += 1) {
  const a = cols[i - 1];
  const b = cols[i];
  let best = 0;
  let bestErr = Infinity;
  for (let sh = 0; sh <= 32; sh += 1) {
    let err = 0;
    for (let y = 300; y < Math.min(900, a.length); y += 1) {
      const d = b[y] - a[y - sh];
      err += d * d;
    }
    if (err < bestErr) { bestErr = err; best = sh; }
  }
  steps.push(best);
}
const hist = {};
for (const v of steps) hist[v] = (hist[v] || 0) + 1;

await ensureRunning(page);

const stats = await page.evaluate((secs) => new Promise((res) => {
  const gaps = [];
  let last = performance.now();
  const t0 = last;
  const tick = (now) => {
    gaps.push(now - last);
    last = now;
    if (now - t0 < secs * 1000) requestAnimationFrame(tick);
    else res(gaps);
  };
  requestAnimationFrame(tick);
}), SECONDS);

const work = (await page.evaluate(() => window.__ccWork.slice(-600))).sort((a, b) => a - b);
const wq = (p) => work[Math.min(work.length - 1, Math.floor(work.length * p))];
const g = stats.slice(2).sort((a, b) => a - b);
const q = (p) => g[Math.min(g.length - 1, Math.floor(g.length * p))];
const worst = stats.slice(2).sort((a, b) => b - a).slice(0, 6).map((v) => v.toFixed(1));
console.log(JSON.stringify({
  frames: g.length,
  fps: (1000 / (g.reduce((a, b) => a + b, 0) / g.length)).toFixed(1),
  p50: q(0.5).toFixed(2),
  p90: q(0.9).toFixed(2),
  p99: q(0.99).toFixed(2),
  over20ms: g.filter((v) => v > 20).length,
  over33ms: g.filter((v) => v > 33).length,
  worst,
  work: {
    frames: work.length,
    p50: wq(0.5).toFixed(2),
    p90: wq(0.9).toFixed(2),
    p99: wq(0.99).toFixed(2),
    max: work[work.length - 1].toFixed(2)
  },
  /* One bucket is a steady scroll. Two buckets four apart is the
     world moving in whole logical pixels, which is the choppiness. */
  scrollDevicePx: hist
}, null, 2));

await browser.close();
