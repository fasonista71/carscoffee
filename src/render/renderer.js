/*
  Canvas 2D renderer. Reads a view of world state and draws it. Never
  mutates game state.

  All drawing happens on a fixed 180x320 offscreen buffer, which is
  then blitted to the visible canvas at an integer device pixel scale
  with image smoothing disabled. The upscale is done here rather than
  trusting CSS image-rendering, because Safari support for pixelated
  canvas upscaling has gaps. The CSS property stays on as a backstop.
*/

import { TUNING, BUILD_TAG } from '../game/tuning.js';
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

  /* Full logical coordinates, for menu hit testing. */
  function screenToLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H
    };
  }

  /* Deterministic small hash for scenery variation. */
  function hash32(n) {
    let h = (n | 0) + 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
    h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
    return (h ^ (h >>> 15)) >>> 0;
  }

  /*
    Brief section 6: parallax layers. In a top down view that means
    roadside bands scrolling at different rates: the far band drifts
    slower than the road, the near band rides with it. Each tier has
    its own theme: mountain roads, desert, snow, beach, cityscape.
  */
  function themeFor(tier) {
    const t = TUNING.tiers[Math.min(tier || 0, TUNING.tiers.length - 1)];
    return { key: t.theme, c: TUNING.sceneryThemes[t.theme] };
  }

  function bandItems(x0, bandW, factor, salt, distancePx, itemFn) {
    const period = TUNING.render.scenery.periodPx;
    const scroll = distancePx * factor;
    const offset = scroll % period;
    const base = Math.floor(scroll / period);
    for (let k = -1; k <= Math.ceil(H / period) + 1; k += 1) {
      const y = Math.round(k * period + (period - offset));
      itemFn(x0, bandW, y, hash32(base + k + salt * 7919));
    }
  }

  function itemPeak(c) {
    return (x0, bw, y, h) => {
      const ph = 22 + (h % 16);
      const cx = x0 + Math.floor(bw / 2);
      for (let r = 0; r < ph; r += 1) {
        const half = Math.max(1, Math.round((r / ph) * (bw - 2) / 2));
        bctx.fillStyle = (h & 2) ? c.far : c.farDark;
        bctx.fillRect(cx - half, y + r, half * 2, 1);
        if (r < 5) {
          bctx.fillStyle = c.farAccent;
          bctx.fillRect(cx - Math.max(1, half - 1), y + r, Math.max(1, half), 1);
        }
      }
    };
  }

  function itemMesa(c) {
    return (x0, bw, y, h) => {
      const mh = 16 + (h % 14);
      const mw = bw - 3;
      bctx.fillStyle = c.farDark;
      bctx.fillRect(x0 + 1, y, mw, mh);
      bctx.fillStyle = c.far;
      bctx.fillRect(x0 + 1, y, mw, 4);
      bctx.fillStyle = c.farAccent;
      bctx.fillRect(x0 + 1, y, mw, 1);
    };
  }

  function itemBuilding(c) {
    return (x0, bw, y, h) => {
      const bh = 26 + (h % 22);
      const bwid = bw - 3;
      bctx.fillStyle = TUNING.palette.city.outline;
      bctx.fillRect(x0, y, bwid + 1, bh + 1);
      bctx.fillStyle = (h & 4) ? c.far : c.farDark;
      bctx.fillRect(x0 + 1, y + 1, bwid - 1, bh - 1);
      bctx.fillStyle = c.farAccent;
      bctx.fillRect(x0 + 3 + (h % 4), y + 5, 2, 2);
      bctx.fillRect(x0 + 3 + ((h >> 3) % 4), y + 13, 2, 2);
    };
  }

  function itemPine(c) {
    return (x0, bw, y, h) => {
      const ph = 11 + (h % 4);
      const cx = x0 + 2 + ((h >> 5) % Math.max(1, bw - 10)) + 4;
      for (let r = 0; r < ph; r += 1) {
        const half = Math.max(1, Math.round((r / ph) * 4));
        bctx.fillStyle = (r % 3 === 0) ? c.nearDark : c.near;
        bctx.fillRect(cx - half, y + r, half * 2, 1);
      }
      bctx.fillStyle = c.trunk;
      bctx.fillRect(cx - 1, y + ph, 2, 2);
    };
  }

  function itemCactus(c) {
    return (x0, bw, y, h) => {
      const cx = x0 + 3 + ((h >> 5) % Math.max(1, bw - 8));
      const ch = 10 + (h % 5);
      bctx.fillStyle = c.near;
      bctx.fillRect(cx, y, 3, ch);
      bctx.fillRect(cx - 3, y + 3, 3, 2);
      bctx.fillRect(cx - 3, y + 1, 2, 4);
      bctx.fillRect(cx + 3, y + 5, 3, 2);
      bctx.fillRect(cx + 4, y + 2, 2, 5);
      bctx.fillStyle = c.nearDark;
      bctx.fillRect(cx + 1, y, 1, ch);
    };
  }

  function itemPalm(c) {
    return (x0, bw, y, h) => {
      const cx = x0 + 4 + ((h >> 5) % Math.max(1, bw - 9));
      bctx.fillStyle = c.trunk;
      for (let r = 0; r < 9; r += 1) {
        bctx.fillRect(cx + Math.round(r / 4), y + 5 + r, 2, 1);
      }
      bctx.fillStyle = c.near;
      bctx.fillRect(cx - 4, y + 3, 4, 2);
      bctx.fillRect(cx + 2, y + 3, 4, 2);
      bctx.fillRect(cx - 3, y + 1, 3, 2);
      bctx.fillRect(cx + 1, y + 1, 3, 2);
      bctx.fillStyle = c.nearDark;
      bctx.fillRect(cx - 1, y + 2, 3, 2);
    };
  }

  function itemTreeBlob(c) {
    return (x0, bw, y, h) => {
      const r = 4 + (h % 3);
      const cx = x0 + 3 + ((h >> 5) % Math.max(1, bw - 2 * r - 4)) + r;
      const cy = y + r;
      bctx.fillStyle = c.nearDark;
      bctx.fillRect(cx - r, cy - r + 1, 2 * r, 2 * r - 2);
      bctx.fillRect(cx - r + 1, cy - r, 2 * r - 2, 2 * r);
      bctx.fillStyle = c.near;
      bctx.fillRect(cx - r + 1, cy - r + 2, 2 * r - 2, 2 * r - 4);
      bctx.fillRect(cx - r + 2, cy - r + 1, 2 * r - 4, 2 * r - 2);
    };
  }

  function drawScenery(distancePx, tier) {
    const { key, c } = themeFor(tier);
    const sc = TUNING.render.scenery;
    if (key === 'beach') {
      /* the far band is open water with drifting foam */
      bctx.fillStyle = c.far;
      bctx.fillRect(0, 0, 15, H);
      bctx.fillRect(W - 15, 0, 15, H);
      bctx.fillStyle = c.farDark;
      bctx.fillRect(13, 0, 2, H);
      bctx.fillRect(W - 15, 0, 2, H);
      const foam = (x0, bw, y, h) => {
        bctx.fillStyle = c.farAccent;
        bctx.fillRect(x0 + 2 + (h % 7), y, 4, 1);
        bctx.fillRect(x0 + 1 + ((h >> 4) % 7), y + 22, 5, 1);
      };
      bandItems(0, 15, sc.farFactor, 1, distancePx, foam);
      bandItems(W - 15, 15, sc.farFactor, 2, distancePx, foam);
    } else {
      const farItem = key === 'desert' ? itemMesa(c)
        : (key === 'city' ? itemBuilding(c) : itemPeak(c));
      bandItems(0, 15, sc.farFactor, 1, distancePx, farItem);
      bandItems(W - 15, 15, sc.farFactor, 2, distancePx, farItem);
    }
    const nearItem = key === 'desert' ? itemCactus(c)
      : (key === 'beach' ? itemPalm(c)
        : (key === 'city' ? itemTreeBlob(c) : itemPine(c)));
    bandItems(16, 13, 1, 3, distancePx, nearItem);
    bandItems(W - 29, 13, 1, 4, distancePx, nearItem);
  }

  /* Pickup puffs and similar one shot particles. Render only. */
  let particles = [];

  function addPuff(x, y, color) {
    for (let i = 0; i < 8; i += 1) {
      particles.push({
        x, y, color,
        vx: (Math.random() * 2 - 1) * 1.3,
        vy: (Math.random() * 2 - 1) * 1.3 - 0.4,
        life: 14 + Math.floor(Math.random() * 8)
      });
    }
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      bctx.globalAlpha = Math.min(1, p.life / 12);
      bctx.fillStyle = p.color;
      bctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }
    bctx.globalAlpha = 1;
  }

  function drawSpeedLines(view, pal) {
    if (!view.boosting) return;
    bctx.globalAlpha = 0.4;
    bctx.fillStyle = pal.dash;
    const xs = [44, 76, 104, 136];
    for (let i = 0; i < xs.length; i += 1) {
      const y = ((view.distancePx * 1.6 + i * 83) % (H + 40)) - 20;
      bctx.fillRect(xs[i], Math.round(y), 1, 22);
    }
    bctx.globalAlpha = 1;
  }

  function drawRoad(distancePx, pal, tier) {
    bctx.fillStyle = themeFor(tier).c.offroad;
    bctx.fillRect(0, 0, W, H);
    drawScenery(distancePx, tier);

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
    const spr = getSprite(view.playerSpriteKey || 'player_car');
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

  /*
    Overtakers, plus their telegraph: while one is still approaching
    from behind, flashing chevrons at the bottom of its lane warn
    which lane is about to be hot.
  */
  function drawOvertakers(view, pal) {
    const t = performance.now() / 1000;
    for (let i = 0; i < view.overtakers.length; i += 1) {
      const ov = view.overtakers[i];
      const dy = ov.distPx - view.distancePx;
      const screenY = TUNING.render.playerYPx - dy;
      if (screenY > H + 40 && Math.floor(t * 6) % 2 === 0) {
        /* still below the screen: warning chevrons */
        const cx = Math.round(laneCenterXPx(ov.lane));
        bctx.fillStyle = pal.carBody;
        for (let c = 0; c < 2; c += 1) {
          const baseY = H - 8 - c * 7;
          for (let k = -3; k <= 3; k += 1) {
            bctx.fillRect(cx + k, baseY + Math.abs(k) - 3, 1, 3);
          }
        }
        continue;
      }
      if (screenY < -70 || screenY > H + 70) continue;
      const spr = getTrafficSprite(ov.variant);
      const x = Math.round(laneCenterXPx(ov.lane) - spr.width / 2);
      bctx.drawImage(spr, x, Math.round(screenY - spr.height / 2));
    }
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
    const cupSpr = getSprite('pickup_coffee');
    const heartSpr = getSprite('ui_heart_full');
    const t = performance.now() / 1000;
    const hz = TUNING.render.coffeeJiggleHz;
    for (let i = 0; i < view.pickups.length; i += 1) {
      const item = view.pickups[i];
      const screenY = TUNING.render.playerYPx - (item.distPx - view.distancePx);
      if (screenY < -32 || screenY > H + 32) continue;
      if (item.kind === 'heart') {
        /* drawn at 2x so a life reads bigger than a coffee */
        const w = heartSpr.width * 2;
        const h = heartSpr.height * 2;
        const x = Math.round(laneCenterXPx(item.lane) - w / 2);
        bctx.drawImage(heartSpr, x, Math.round(screenY - h / 2), w, h);
        continue;
      }
      const phase = t * hz * Math.PI * 2 + item.lane * 1.7 + item.distPx * 0.01;
      const jx = Math.round(Math.sin(phase));
      const jy = Math.round(Math.sin(phase * 0.63 + 1.3) * 0.6);
      const x = Math.round(laneCenterXPx(item.lane) - cupSpr.width / 2) + jx;
      bctx.drawImage(cupSpr, x, Math.round(screenY - cupSpr.height / 2) + jy);
    }
  }

  /*
    Cartoon fuel gauge, centered at the top: the coffee cup as the
    icon, a chunky capsule bar with pixel rounded corners, a highlight
    band up top and a shadow band below for depth, and segment ticks.
    Low fuel turns the fill red and the cup shivers. Boost wraps the
    capsule in a bright ring.
  */
  /* The chunky capsule language every HUD element shares. */
  function drawPlate(x, y, w, h, pal) {
    bctx.fillStyle = pal.outline;
    bctx.fillRect(x + 1, y - 1, w - 2, h + 2);
    bctx.fillRect(x - 1, y + 1, w + 2, h - 2);
    bctx.fillRect(x, y, w, h);
    bctx.fillStyle = pal.road;
    bctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  }

  function drawHudBand(pal) {
    const bandH = TUNING.render.hudBandHPx;
    bctx.fillStyle = pal.hudBand;
    bctx.fillRect(0, 0, W, bandH);
    bctx.fillStyle = pal.outline;
    bctx.fillRect(0, bandH, W, 1);
  }

  /* Row two, flush left: coffee gauge, then boost pill, then hearts. */
  function drawFuelBar(view, pal) {
    const fb = TUNING.render.fuelBar;
    const cup = getSprite('pickup_coffee');
    const x0 = 2;
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

    /* labeled boost meter on the right third of the row */
    const bp = TUNING.render.boostPill;
    const labelX = barX + fb.wPx + 8;
    drawText(bctx, 'Boost', labelX, barY + 1, pal.text, { scale: 1, align: 'left' });
    const bpX = labelX + 22;
    const bpY = Math.round(barY + fb.hPx / 2 - bp.hPx / 2);
    drawPlate(bpX, bpY, bp.wPx, bp.hPx, pal);
    if (view.boosting) {
      bctx.fillStyle = pal.dash;
      bctx.fillRect(bpX + 1, bpY + 1, Math.round((bp.wPx - 2) * view.boostFrac), bp.hPx - 2);
    } else if (view.boostReady) {
      bctx.fillStyle = pal.edgeLine;
      bctx.fillRect(bpX + 1, bpY + 1, bp.wPx - 2, bp.hPx - 2);
      bctx.fillStyle = pal.carDark;
      bctx.fillRect(bpX + 1, bpY + bp.hPx - 2, bp.wPx - 2, 1);
    }
  }

  /* Brief HUD: score, high score, fuel meter, stumble indicator, all
     in the same cartoon capsule style on the shaded band. Row one is
     the double size digits. */
  function drawScore(view, pal) {
    const p = TUNING.render.hudPlate;
    drawPlate(p.marginPx, p.yPx, p.wPx, p.hPx, pal);
    drawText(bctx, view.meters + 'M', p.marginPx + p.wPx / 2, p.yPx + 4, pal.text,
      { scale: 2, align: 'center' });
    const hiX = W - p.marginPx - p.wPx;
    drawPlate(hiX, p.yPx, p.wPx, p.hPx, pal);
    drawText(bctx, String(view.high), hiX + p.wPx / 2, p.yPx + 4, pal.edgeLine,
      { scale: 2, align: 'center' });
    /* the three hearts sit between the two plates */
    const heartSpr = getSprite('ui_heart_full');
    const heartsW = TUNING.lives.max * (heartSpr.width + 2) - 2;
    let hx = Math.round(W / 2 - heartsW / 2);
    const hy = p.yPx + Math.round(p.hPx / 2 - heartSpr.height / 2);
    for (let i = 0; i < TUNING.lives.max; i += 1) {
      const spr = getSprite(i < view.hearts ? 'ui_heart_full' : 'ui_heart_empty');
      bctx.drawImage(spr, hx, hy);
      hx += spr.width + 2;
    }
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

  /*
    Menus. One primary button plus option rows, laid out from tuning
    and hit tested in logical coordinates by the app. Starting a run
    is ONLY ever the primary button; stray taps and keys do nothing.
  */
  function menuLayout(mode) {
    const m = TUNING.render.menu;
    const items = [];
    let y = mode === 'title' ? 150 : (mode === 'paused' ? 116 : 170);
    const primaryLabel = mode === 'title' ? 'Start' : (mode === 'paused' ? 'Resume' : 'Go again');
    items.push({ id: 'primary', label: primaryLabel, x: Math.round((W - m.primary.wPx) / 2), y, w: m.primary.wPx, h: m.primary.hPx });
    y += m.primary.hPx + m.option.gapPx + 6;
    for (const id of ['car', 'sound', 'haptics']) {
      items.push({ id, x: Math.round((W - m.option.wPx) / 2), y, w: m.option.wPx, h: m.option.hPx });
      y += m.option.hPx + m.option.gapPx;
    }
    if (mode === 'paused') {
      items.push({ id: 'restart', label: 'Restart', x: Math.round((W - m.option.wPx) / 2), y: y + 6, w: m.option.wPx, h: m.option.hPx });
    }
    return items;
  }

  function hitTestMenu(mode, lx, ly) {
    if (mode !== 'title' && mode !== 'paused' && mode !== 'gameOver') return null;
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) return null;
    const pad = TUNING.render.menu.hitPadPx;
    for (const item of menuLayout(mode)) {
      if (lx >= item.x - pad && lx <= item.x + item.w + pad
          && ly >= item.y - pad && ly <= item.y + item.h + pad) {
        return item.id;
      }
    }
    return null;
  }

  function drawMenu(view, pal, mode) {
    for (const item of menuLayout(mode)) {
      if (item.id === 'primary') {
        bctx.fillStyle = pal.outline;
        bctx.fillRect(item.x + 1, item.y - 1, item.w - 2, item.h + 2);
        bctx.fillRect(item.x - 1, item.y + 1, item.w + 2, item.h - 2);
        bctx.fillRect(item.x, item.y, item.w, item.h);
        bctx.fillStyle = pal.edgeLine;
        bctx.fillRect(item.x + 1, item.y + 1, item.w - 2, item.h - 2);
        bctx.fillStyle = pal.carDark;
        bctx.fillRect(item.x + 1, item.y + item.h - 2, item.w - 2, 1);
        drawText(bctx, item.label, item.x + item.w / 2, item.y + Math.round(item.h / 2) - 5, pal.outline, { scale: 2, align: 'center' });
      } else if (item.id === 'restart') {
        drawPlate(item.x, item.y, item.w, item.h, pal);
        drawText(bctx, item.label, item.x + item.w / 2, item.y + Math.round(item.h / 2) - 2, pal.text, { scale: 1, align: 'center' });
      } else {
        drawPlate(item.x, item.y, item.w, item.h, pal);
        let label;
        let value;
        if (item.id === 'car') {
          label = 'Car';
          value = (view.vehicleName || '').toUpperCase();
        } else if (item.id === 'sound') {
          label = 'Sound';
          value = view.soundOn ? 'ON' : 'OFF';
        } else {
          label = 'Rumble';
          value = view.hapticsSupported ? (view.hapticsOn ? 'ON' : 'OFF') : 'N/A';
        }
        const ty = item.y + Math.round(item.h / 2) - 2;
        drawText(bctx, label, item.x + 7, ty, pal.text, { scale: 1, align: 'left' });
        drawText(bctx, value, item.x + item.w - 7, ty, pal.edgeLine, { scale: 1, align: 'right' });
      }
    }
  }

  function drawTitle(view, pal) {
    bctx.fillStyle = pal.dim;
    bctx.fillRect(0, 0, W, H);
    const badge = getSprite('ui_badge');
    bctx.drawImage(badge, Math.round((W - badge.width) / 2), 16);
    drawMenu(view, pal, 'title');
    drawText(bctx, BUILD_TAG, W - 3, H - 8, pal.road, { scale: 1, align: 'right' });
  }

  function drawGameOver(pal, view) {
    bctx.fillStyle = pal.dim;
    bctx.fillRect(0, 0, W, H);
    const cause = view.deathCause === 'fuel' ? 'Out of fuel' : 'Crashed';
    drawText(bctx, cause, W / 2, 88, pal.carBody, { scale: 2, align: 'center' });
    drawText(bctx, view.meters + ' m', W / 2, 116, pal.text, { scale: 2, align: 'center' });
    if (view.newBest) {
      drawText(bctx, 'New best!', W / 2, 140, pal.edgeLine, { scale: 1, align: 'center' });
    } else {
      drawText(bctx, 'Best ' + view.high + ' m', W / 2, 140, pal.text, { scale: 1, align: 'center' });
    }
    drawMenu(view, pal, 'gameOver');
  }

  function drawPaused(view, pal) {
    bctx.fillStyle = pal.dim;
    bctx.fillRect(0, 0, W, H);
    drawText(bctx, 'Paused', W / 2, 88, pal.text, { scale: 2, align: 'center' });
    drawMenu(view, pal, 'paused');
  }

  /*
    view: { mode, distancePx, laneFloat }
    distancePx and laneFloat are already interpolated by the caller.
  */
  function drawFrame(view) {
    const pal = TUNING.palette.city;
    const sx = view.shakeX | 0;
    const sy = view.shakeY | 0;
    bctx.save();
    bctx.translate(sx, sy);
    drawRoad(view.distancePx, pal, view.tier);
    drawSpeedLines(view, pal);
    drawHazards(view);
    drawPickups(view);
    drawOvertakers(view, pal);
    drawTraffic(view);
    drawPlayer(view);
    drawParticles();
    bctx.restore();
    if (view.mode === 'playing' || view.mode === 'paused' || view.mode === 'gameOver') {
      drawHudBand(pal);
      drawFuelBar(view, pal);
      drawScore(view, pal);
      drawTierBanner(view, pal);
    }
    if (view.mode === 'title') drawTitle(view, pal);
    if (view.mode === 'paused') drawPaused(view, pal);
    if (view.mode === 'gameOver') drawGameOver(pal, view);
    ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
  }

  return { drawFrame, resize, screenToLogicalX, screenToLogical, hitTestMenu, addPuff };
}
