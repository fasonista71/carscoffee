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
import { laneCenterXPx } from '../game/entities.js';
import { getSprite, getTrafficSprite } from './sprites.js';
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

  /* Maps a viewport CSS x coordinate to logical screen x. Values off
     the canvas come back below 0 or above the logical width; callers
     clamp as needed. Used by the app to resolve positional taps. */
  function screenToLogicalX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
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

  /*
    Spin: chunky quarter turn rotations while spinFrames runs, the
    8 bit read of a spinout. Blink: invulnerability alternates player
    visibility every few frames, the classic forgiveness signal.
  */
  function drawPlayer(view) {
    if (view.invulnFrames > 0 && Math.floor(view.invulnFrames / 4) % 2 === 1) return;
    const spr = getSprite('player_car');
    const cx = laneCenterXPx(view.laneFloat);
    const cy = TUNING.render.playerYPx;
    if (view.spinFrames > 0) {
      const quarter = Math.floor(view.spinFrames / 4) % 4;
      bctx.save();
      bctx.translate(Math.round(cx), Math.round(cy));
      bctx.rotate(quarter * (Math.PI / 2));
      bctx.drawImage(spr, Math.round(-spr.width / 2), Math.round(-spr.height / 2));
      bctx.restore();
      return;
    }
    bctx.drawImage(spr, Math.round(cx - spr.width / 2), Math.round(cy - spr.height / 2));
  }

  /* Road features draw under everything that drives over them. */
  function drawHazards(view) {
    for (let i = 0; i < view.hazards.length; i += 1) {
      const h = view.hazards[i];
      const key = h.type === 'rubble' ? 'obstacle_rubble'
        : (h.dir > 0 ? 'obstacle_slick_right' : 'obstacle_slick_left');
      const spr = getSprite(key);
      const screenY = TUNING.render.playerYPx - (h.distPx - view.distancePx);
      if (screenY < -24 || screenY > H + 24) continue;
      const x = Math.round(laneCenterXPx(h.lane) - spr.width / 2);
      bctx.drawImage(spr, x, Math.round(screenY - spr.height / 2));
    }
  }

  /*
    A row's distPx equals the interpolated view distance exactly when
    it draws level with the player, so screen y falls out of the same
    numbers collision uses.
  */
  function drawTraffic(view) {
    for (let i = 0; i < view.rows.length; i += 1) {
      const row = view.rows[i];
      const screenY = TUNING.render.playerYPx - (row.distPx - view.distancePx);
      if (screenY < -64 || screenY > H + 64) continue;
      for (let lane = 0; lane < row.lanes.length; lane += 1) {
        if (!row.lanes[lane]) continue;
        const spr = getTrafficSprite(row.variants[lane]);
        const x = Math.round(laneCenterXPx(lane) - spr.width / 2);
        bctx.drawImage(spr, x, Math.round(screenY - spr.height / 2));
      }
    }
  }

  /*
    Cups shiver by a pixel, phase offset per cup so they never sync.
    Purely visual: collection uses the unjiggled position.
  */
  function drawPickups(view) {
    const spr = getSprite('pickup_coffee');
    const t = performance.now() / 1000;
    const hz = TUNING.render.coffeeJiggleHz;
    for (let i = 0; i < view.pickups.length; i += 1) {
      const cup = view.pickups[i];
      const screenY = TUNING.render.playerYPx - (cup.distPx - view.distancePx);
      if (screenY < -32 || screenY > H + 32) continue;
      const phase = t * hz * Math.PI * 2 + cup.lane * 1.7 + cup.distPx * 0.01;
      const jx = Math.round(Math.sin(phase));
      const jy = Math.round(Math.sin(phase * 0.63 + 1.3) * 0.6);
      const x = Math.round(laneCenterXPx(cup.lane) - spr.width / 2) + jx;
      bctx.drawImage(spr, x, Math.round(screenY - spr.height / 2) + jy);
    }
  }

  /*
    Cartoon fuel gauge, centered at the top: the coffee cup as the
    icon, a chunky capsule bar with pixel rounded corners, a highlight
    band up top and a shadow band below for depth, and segment ticks.
    Low fuel turns the fill red and the cup shivers. Boost wraps the
    capsule in a bright ring.
  */
  function drawFuelBar(view, pal) {
    const fb = TUNING.render.fuelBar;
    const cup = getSprite('pickup_coffee');
    const totalW = cup.width + fb.cupGapPx + fb.wPx;
    const x0 = Math.round((W - totalW) / 2);
    const barX = x0 + cup.width + fb.cupGapPx;
    const barY = fb.yPx;
    const low = view.fuel <= TUNING.fuel.lowThreshold;

    /* cup icon, shivering when low */
    let cupJx = 0;
    if (low) {
      const t = performance.now() / 1000;
      cupJx = Math.round(Math.sin(t * TUNING.render.coffeeJiggleHz * Math.PI * 2));
    }
    const cupY = Math.round(barY + fb.hPx / 2 - cup.height / 2);
    bctx.drawImage(cup, x0 + cupJx, cupY);

    /* capsule outline with pixel rounded corners */
    bctx.fillStyle = pal.outline;
    bctx.fillRect(barX + 1, barY - 2, fb.wPx - 2, fb.hPx + 4);
    bctx.fillRect(barX - 1, barY, fb.wPx + 2, fb.hPx);
    bctx.fillRect(barX, barY - 1, fb.wPx, fb.hPx + 2);

    /* empty interior */
    bctx.fillStyle = pal.road;
    bctx.fillRect(barX + 1, barY, fb.wPx - 2, fb.hPx);

    /* fill with highlight and shadow bands */
    const frac = Math.max(0, Math.min(1, view.fuel / TUNING.fuel.max));
    const fillW = Math.round((fb.wPx - 2) * frac);
    if (fillW > 0) {
      bctx.fillStyle = low ? pal.carBody : pal.edgeLine;
      bctx.fillRect(barX + 1, barY, fillW, fb.hPx);
      bctx.fillStyle = pal.dash;
      bctx.fillRect(barX + 1, barY, fillW, 1);
      bctx.fillStyle = low ? pal.carDark : pal.outline;
      bctx.fillRect(barX + 1, barY + fb.hPx - 1, fillW, 1);
    }

    /* segment ticks every 20 percent */
    bctx.fillStyle = pal.outline;
    for (let i = 1; i < 5; i += 1) {
      const tx = barX + Math.round((fb.wPx - 2) * (i / 5));
      bctx.fillRect(tx, barY, 1, fb.hPx);
    }

    /* boost ring */
    if (view.boosting) {
      bctx.fillStyle = pal.dash;
      bctx.fillRect(barX - 1, barY - 4, fb.wPx + 2, 1);
      bctx.fillRect(barX - 1, barY + fb.hPx + 3, fb.wPx + 2, 1);
      bctx.fillRect(barX - 3, barY - 1, 1, fb.hPx + 2);
      bctx.fillRect(barX + fb.wPx + 2, barY - 1, 1, fb.hPx + 2);
    }

    /* stumble heart at the bar's right end */
    const heart = getSprite(view.stumbleAvailable ? 'ui_heart_full' : 'ui_heart_empty');
    bctx.drawImage(heart, barX + fb.wPx + 5, Math.round(barY + fb.hPx / 2 - heart.height / 2));
  }

  /* Brief HUD: score, high score, fuel meter, stumble indicator. */
  function drawScore(view, pal) {
    drawText(bctx, view.meters + ' m', 3, 3, pal.text, { scale: 1, align: 'left' });
    drawText(bctx, 'hi ' + view.high, W - 3, 3, pal.text, { scale: 1, align: 'right' });
  }

  function drawTierBanner(view, pal) {
    if (view.tierFlashFrames <= 0) return;
    const f = view.tierFlashFrames;
    /* strongest at the moment of the change, fading out */
    const alpha = Math.min(0.45, (f / 90) * 0.45);
    bctx.fillStyle = 'rgba(255, 255, 255, ' + alpha.toFixed(3) + ')';
    bctx.fillRect(0, 0, W, H);
    drawText(bctx, 'Tier ' + (view.tier + 1), W / 2, 120, pal.edgeLine, { scale: 2, align: 'center' });
    drawText(bctx, 'Faster. Denser.', W / 2, 140, pal.text, { scale: 1, align: 'center' });
  }

  function drawTitle(pal) {
    bctx.fillStyle = pal.dim;
    bctx.fillRect(0, 0, W, H);
    drawText(bctx, 'CARS & COFFEE', W / 2, 96, pal.edgeLine, { scale: 2, align: 'center' });
    drawText(bctx, 'Tap or press a key', W / 2, 170, pal.text, { scale: 1, align: 'center' });
    drawText(bctx, 'to start', W / 2, 180, pal.text, { scale: 1, align: 'center' });
  }

  function drawGameOver(pal, view) {
    bctx.fillStyle = pal.dim;
    bctx.fillRect(0, 0, W, H);
    const cause = view.deathCause === 'fuel' ? 'Out of fuel' : 'Crashed';
    drawText(bctx, cause, W / 2, 100, pal.carBody, { scale: 2, align: 'center' });
    drawText(bctx, view.meters + ' m', W / 2, 130, pal.text, { scale: 2, align: 'center' });
    if (view.newBest) {
      drawText(bctx, 'New best!', W / 2, 152, pal.edgeLine, { scale: 1, align: 'center' });
    } else {
      drawText(bctx, 'Best ' + view.high + ' m', W / 2, 152, pal.text, { scale: 1, align: 'center' });
    }
    drawText(bctx, 'Tap or press a key', W / 2, 180, pal.text, { scale: 1, align: 'center' });
    drawText(bctx, 'to restart', W / 2, 190, pal.text, { scale: 1, align: 'center' });
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
    drawHazards(view);
    drawPickups(view);
    drawTraffic(view);
    drawPlayer(view);
    if (view.mode === 'playing' || view.mode === 'paused' || view.mode === 'gameOver') {
      drawFuelBar(view, pal);
      drawScore(view, pal);
      drawTierBanner(view, pal);
    }
    if (view.mode === 'title') drawTitle(pal);
    if (view.mode === 'paused') drawPaused(pal);
    if (view.mode === 'gameOver') drawGameOver(pal, view);
    ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
  }

  return { drawFrame, resize, screenToLogicalX };
}
