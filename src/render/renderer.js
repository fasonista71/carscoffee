/*
  Canvas 2D renderer. Reads a view of world state and draws it. Never
  mutates game state.

  All drawing happens on a fixed 180x320 offscreen buffer, which is
  then blitted to the visible canvas at an integer device pixel scale
  with image smoothing disabled. The upscale is done here rather than
  trusting CSS image-rendering, because Safari support for pixelated
  canvas upscaling has gaps. The CSS property stays on as a backstop.
*/

import { TUNING } from '../game/tuning.js';
import { getSprite } from './sprites.js';
import { drawText } from './font.js';

export function createRenderer(canvas) {
  const W = TUNING.render.logicalW;
  const H = TUNING.render.logicalH;

  const buffer = document.createElement('canvas');
  buffer.width = W;
  buffer.height = H;
  const bctx = buffer.getContext('2d');
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const fit = Math.min((rect.width * dpr) / W, (rect.height * dpr) / H);
    /* Integer device pixel scale wherever the viewport allows. */
    const scale = Math.max(1, Math.floor(fit));
    canvas.width = W * scale;
    canvas.height = H * scale;
    canvas.style.width = (W * scale) / dpr + 'px';
    canvas.style.height = (H * scale) / dpr + 'px';
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  function laneCenterX(laneFloat) {
    return TUNING.road.roadLeftPx + TUNING.road.laneWidthPx * (laneFloat + 0.5);
  }

  function drawRoad(distancePx, pal) {
    bctx.fillStyle = pal.offroad;
    bctx.fillRect(0, 0, W, H);

    const roadW = TUNING.road.laneWidthPx * TUNING.road.laneCount;
    const left = TUNING.road.roadLeftPx;
    bctx.fillStyle = pal.road;
    bctx.fillRect(left, 0, roadW, H);

    bctx.fillStyle = pal.edgeLine;
    bctx.fillRect(left, 0, TUNING.render.edgeLineWidthPx, H);
    bctx.fillRect(left + roadW - TUNING.render.edgeLineWidthPx, 0, TUNING.render.edgeLineWidthPx, H);

    /* Dashes scroll toward the bottom of the screen as the car moves
       forward. Offset comes from world distance, so scroll speed and
       dash speed can never drift apart. */
    const period = TUNING.render.dashLengthPx + TUNING.render.dashGapPx;
    const offset = distancePx % period;
    bctx.fillStyle = pal.dash;
    for (let i = 1; i < TUNING.road.laneCount; i += 1) {
      const x = left + TUNING.road.laneWidthPx * i - Math.floor(TUNING.render.dashWidthPx / 2);
      for (let y = -period; y < H + period; y += period) {
        bctx.fillRect(x, Math.round(y + offset), TUNING.render.dashWidthPx, TUNING.render.dashLengthPx);
      }
    }
  }

  function drawPlayer(laneFloat) {
    const spr = getSprite('player_car');
    const x = Math.round(laneCenterX(laneFloat) - spr.width / 2);
    const y = Math.round(TUNING.render.playerYPx - spr.height / 2);
    bctx.drawImage(spr, x, y);
  }

  function drawTitle(pal) {
    bctx.fillStyle = pal.dim;
    bctx.fillRect(0, 0, W, H);
    drawText(bctx, 'CARS & COFFEE', W / 2, 96, pal.edgeLine, { scale: 2, align: 'center' });
    drawText(bctx, 'Tap or press a key', W / 2, 170, pal.text, { scale: 1, align: 'center' });
    drawText(bctx, 'to start', W / 2, 180, pal.text, { scale: 1, align: 'center' });
  }

  function drawPaused(pal) {
    bctx.fillStyle = pal.dim;
    bctx.fillRect(0, 0, W, H);
    drawText(bctx, 'Paused', W / 2, 140, pal.text, { scale: 2, align: 'center' });
    drawText(bctx, 'Tap or press a key', W / 2, 170, pal.text, { scale: 1, align: 'center' });
    drawText(bctx, 'to resume', W / 2, 180, pal.text, { scale: 1, align: 'center' });
  }

  /*
    view: { mode, distancePx, laneFloat }
    distancePx and laneFloat are already interpolated by the caller.
  */
  function drawFrame(view) {
    const pal = TUNING.palette.city;
    drawRoad(view.distancePx, pal);
    drawPlayer(view.laneFloat);
    if (view.mode === 'title') drawTitle(pal);
    if (view.mode === 'paused') drawPaused(pal);
    ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
  }

  return { drawFrame, resize };
}
