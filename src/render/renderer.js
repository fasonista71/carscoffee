/*
  Canvas 2D renderer. Reads a view of world state and draws it. Never
  mutates game state.

  All drawing happens on a fixed 180x320 offscreen buffer, which is
  then blitted to the visible canvas at an integer device pixel scale
  with image smoothing disabled. The upscale is done here rather than
  trusting CSS image-rendering, because Safari support for pixelated
  canvas upscaling has gaps. The CSS property stays on as a backstop.
*/

import { TUNING, BUILD_TAG, TRAFFIC_VARIANTS, OBSTACLE_SPRITES } from '../game/tuning.js';
import { laneCenterXPx } from '../game/entities.js';
import { getSprite, getTrafficSprite } from './sprites.js';
import { drawText, textWidth } from './font.js';

export function createRenderer(canvas) {
  const W = TUNING.render.logicalW;
  const H = TUNING.render.logicalH;

  const buffer = document.createElement('canvas');
  buffer.width = W;
  buffer.height = H;
  const bctx = buffer.getContext('2d');
  const ctx = canvas.getContext('2d');

  /* CSS pixels per logical pixel, which is what a finger actually
     meets. Kept from the last resize so the hit padding can be sized
     against it. */
  let cssPerLogical = 2;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const fit = Math.min((rect.width * dpr) / W, (rect.height * dpr) / H);
    /* Integer device pixel scale wherever the viewport allows. */
    const scale = Math.max(1, Math.floor(fit));
    cssPerLogical = scale / dpr;
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
    Note for anyone pulling bits out of a hash below: shift it with
    >>> and never >>. hash32 returns unsigned, but the signed shift
    coerces it back to int32 first, so roughly half of all hashes come
    out negative, and JS then hands back a negative modulus. That is
    how the city ended up with three pixel wide windowless buildings
    sitting outside their own band.
  */

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

  /* Scenery scrolls toward the bottom of the screen exactly like the
     road dashes (same sign as drawRoad's offset). It once ran the
     other way, which read as the world driving against you. Item
     identity is keyed to world position (base - k), so each tree or
     peak keeps its shape while it rides down the screen. */
  /*
    One item in every slot at a fixed pitch is wallpaper. The eye finds
    the rhythm within a second and a barn every 56px stops reading as
    countryside. Two dials fix that for every theme without touching a
    single prop: density is the share of slots that carry anything, and
    each item is nudged off its slot line. Both come from the item's own
    hash, so a given stretch of road always looks the same on replay.
  */
  function bandItems(x0, bandW, factor, salt, distancePx, itemFn, density) {
    const period = TUNING.render.scenery.periodPx;
    const scroll = distancePx * factor;
    const offset = scroll % period;
    const base = Math.floor(scroll / period);
    const fill = density === undefined ? 100 : density;
    /* two slots of margin, because jitter can pull an item on screen
       from a slot that would otherwise be past the edge */
    for (let k = -2; k <= Math.ceil(H / period) + 2; k += 1) {
      const h = hash32(base - k + salt * 7919);
      if (h % 100 >= fill) continue;
      const jitter = Math.round((((h >>> 9) % period) - period / 2) * 0.45);
      itemFn(x0, bandW, Math.round(k * period + offset - period + jitter), h);
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

  /*
    Ordinary city blocks: a rectangle, a dark outline and a regular
    grid of windows, with height, width and position off the item hash
    so no two in a row match. Roughly every ninth one is a tower, which
    is taller, narrower and carries an antenna with a red beacon.
  */
  function itemBuilding(c) {
    const ink = TUNING.palette.city.outline;
    const lit = TUNING.palette.city.edgeLine;
    return (x0, bw, y, h) => {
      const tower = (h >>> 19) % 9 === 0;
      const bwid = tower ? 6 + ((h >>> 4) % 3) : 8 + ((h >>> 4) % Math.max(1, bw - 9));
      const bh = tower ? 46 + (h % 16) : 16 + (h % 20);
      const bx = x0 + 1 + ((h >>> 11) % Math.max(1, bw - bwid - 1));

      const pale = (h & 4) !== 0;
      bctx.fillStyle = ink;
      bctx.fillRect(bx - 1, y - 1, bwid + 2, bh + 2);
      bctx.fillStyle = pale ? c.far : c.farDark;
      bctx.fillRect(bx, y, bwid, bh);

      /* windows take whichever value the wall is not, or a pale block
         comes out looking blank at this size */
      const glass = pale ? ink : c.farAccent;
      for (let ry = y + 2; ry <= y + bh - 4; ry += 4) {
        for (let rx = bx + 2; rx <= bx + bwid - 4; rx += 3) {
          const wh = hash32(rx * 31 + ry * 17 + h);
          bctx.fillStyle = (wh % 6 === 0) ? lit : glass;
          bctx.fillRect(rx, ry, 2, 2);
        }
      }

      if (tower) {
        const mx = bx + Math.floor(bwid / 2);
        bctx.fillStyle = ink;
        bctx.fillRect(mx, y - 6, 1, 6);
        bctx.fillStyle = TUNING.palette.city.carBody;
        bctx.fillRect(mx, y - 7, 1, 1);
      }
    };
  }

  function itemPine(c) {
    return (x0, bw, y, h) => {
      const ph = 11 + (h % 4);
      const cx = x0 + 2 + ((h >>> 5) % Math.max(1, bw - 10)) + 4;
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
      const cx = x0 + 3 + ((h >>> 5) % Math.max(1, bw - 8));
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
      const cx = x0 + 4 + ((h >>> 5) % Math.max(1, bw - 9));
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
      const cx = x0 + 3 + ((h >>> 5) % Math.max(1, bw - 2 * r - 4)) + r;
      const cy = y + r;
      bctx.fillStyle = c.nearDark;
      bctx.fillRect(cx - r, cy - r + 1, 2 * r, 2 * r - 2);
      bctx.fillRect(cx - r + 1, cy - r, 2 * r - 2, 2 * r);
      bctx.fillStyle = c.near;
      bctx.fillRect(cx - r + 1, cy - r + 2, 2 * r - 2, 2 * r - 4);
      bctx.fillRect(cx - r + 2, cy - r + 1, 2 * r - 4, 2 * r - 2);
    };
  }

  /*
    Props for the added scenes. Same contract as the originals: take the
    theme, return a draw function, vary the shape off the per item hash
    so a band never looks like a repeating stamp.
  */
  function itemBarn(c) {
    return (x0, bw, y, h) => {
      const kind = h % 3;
      const scale = kind === 2 ? 0.6 : 1;
      const w = Math.max(4, Math.round((bw - 7) * scale));
      const bh = Math.max(5, Math.round((9 + (h % 8)) * scale));
      const bx = x0 + 1 + ((h >>> 7) % Math.max(1, bw - w - 4));
      const by = y + 5;
      bctx.fillStyle = c.far;
      bctx.fillRect(bx, by, w, bh);
      bctx.fillStyle = c.farDark;
      bctx.fillRect(bx - 1, by - 3, w + 2, 3);
      bctx.fillStyle = c.farAccent;
      const door = Math.floor(bh / 3);
      bctx.fillRect(bx + Math.floor(w / 2) - 1, by + door, 2, bh - door);
      if (kind === 0 && bx + w + 4 < x0 + bw) {
        bctx.fillStyle = c.trunk;
        bctx.fillRect(bx + w + 1, by - 2, 3, bh + 2);
        bctx.fillStyle = c.farAccent;
        bctx.fillRect(bx + w + 1, by - 3, 3, 1);
      }
    };
  }
  function itemCow(c) {
    return (x0, bw, y, h) => {
      const one = (cx, cy, flip) => {
        bctx.fillStyle = c.farAccent;
        bctx.fillRect(cx, cy, 7, 4);
        bctx.fillRect(flip ? cx - 2 : cx + 7, cy - 1, 2, 3);
        bctx.fillStyle = c.nearDark;
        bctx.fillRect(cx + 1, cy, 2, 2);
        bctx.fillRect(cx + 4, cy + 1, 2, 2);
        bctx.fillRect(cx + 1, cy + 4, 1, 2);
        bctx.fillRect(cx + 5, cy + 4, 1, 2);
      };
      const cx = x0 + 1 + ((h >>> 5) % Math.max(1, bw - 11));
      one(cx, y + 3 + (h % 9), (h & 8) !== 0);
      /* now and then a second one, grazing a little apart */
      if (h % 5 === 0) one(cx + 1 + (h % 3), y + 17 + (h % 6), (h & 16) !== 0);
    };
  }
  function itemVolcano(c) {
    return (x0, bw, y, h) => {
      const ph = 12 + (h % 23);
      const spread = (bw - 2) * (0.55 + ((h >>> 3) % 6) / 10);
      const cx = x0 + 2 + ((h >>> 6) % Math.max(1, bw - 4));
      for (let r = 0; r < ph; r += 1) {
        const half = Math.max(1, Math.round((r / ph) * spread / 2));
        bctx.fillStyle = (h & 2) ? c.far : c.farDark;
        bctx.fillRect(cx - half, y + r, half * 2, 1);
      }
      bctx.fillStyle = c.farAccent;
      bctx.fillRect(cx - 1, y, 3, 2);
      if (h & 4) bctx.fillRect(cx, y + 2, 1, 2 + (h % 4));
    };
  }
  function itemLavaRock(c) {
    return (x0, bw, y, h) => {
      const rx = x0 + 2 + ((h >>> 4) % Math.max(1, bw - 9));
      const ry = y + 4 + (h % 7);
      const rw = 4 + (h % 3);
      bctx.fillStyle = c.near;
      bctx.fillRect(rx, ry, rw, 3);
      bctx.fillStyle = c.nearDark;
      bctx.fillRect(rx, ry + 3, rw, 1);
      if (h & 4) {
        bctx.fillStyle = c.trunk;
        bctx.fillRect(rx + 1, ry + 1, 1, 1);
      }
    };
  }
  function itemScrub(c) {
    return (x0, bw, y, h) => {
      const sx = x0 + 2 + ((h >>> 3) % Math.max(1, bw - 8));
      const sy = y + 6 + (h % 7);
      bctx.fillStyle = c.near;
      bctx.fillRect(sx, sy, 5, 2);
      bctx.fillRect(sx + 1, sy - 1, 3, 1);
      bctx.fillStyle = c.nearDark;
      bctx.fillRect(sx, sy + 2, 5, 1);
    };
  }

  /*
    Some bands want a mix rather than one prop. These wrappers pick per
    item off the hash and delegate, so the beach gets palms and beach
    furniture and the snow gets a lift tower now and then without a
    second density dial.
  */
  /*
    Seen from above, which is the only view this game has, a parasol is
    a disc in alternating wedges with the pole as one dark pixel in the
    middle. Drawn as a row table so the silhouette stays round at 9px.
  */
  function itemUmbrella(c) {
    const shades = [TUNING.palette.city.carBody, TUNING.palette.city.carWindow, TUNING.palette.city.edgeLine];
    const rows = [3, 7, 9, 9, 9, 9, 9, 7, 3];
    return (x0, bw, y, h) => {
      const cx = x0 + 2 + ((h >>> 5) % Math.max(1, bw - 10));
      const cy = y + 2;
      const canopy = shades[(h >>> 9) % shades.length];
      for (let r = 0; r < rows.length; r += 1) {
        const w = rows[r];
        const rx = cx + Math.floor((9 - w) / 2);
        /* two quadrants coloured, two white, split on the disc centre */
        for (let i = 0; i < w; i += 1) {
          const left = rx + i < cx + 4;
          const top = r < 4;
          bctx.fillStyle = (left === top) ? canopy : c.farAccent;
          bctx.fillRect(rx + i, cy + r, 1, 1);
        }
      }
      bctx.fillStyle = c.trunk;
      bctx.fillRect(cx + 4, cy + 4, 1, 1);
    };
  }

  function itemBeachChair(c) {
    return (x0, bw, y, h) => {
      /* a lounger from above: fabric panel, white slats, raised headrest */
      const draw = (cx, cy, fabric) => {
        bctx.fillStyle = TUNING.palette.city.outline;
        bctx.fillRect(cx, cy, 5, 9);
        bctx.fillStyle = fabric;
        bctx.fillRect(cx, cy + 1, 5, 7);
        bctx.fillStyle = c.farAccent;
        bctx.fillRect(cx + 1, cy + 2, 3, 1);
        bctx.fillRect(cx + 1, cy + 5, 3, 1);
        bctx.fillRect(cx + 1, cy, 3, 1);
      };
      const cx = x0 + 2 + ((h >>> 6) % Math.max(1, bw - 7));
      const cy = y + 2;
      const fabric = (h & 8) ? TUNING.palette.city.carWindow : TUNING.palette.city.carBody;
      draw(cx, cy, fabric);
      if (h % 3 === 0) draw(cx + ((h & 16) ? 1 : -1), cy + 12, fabric);
    };
  }

  function itemBeachFront(c) {
    const palm = itemPalm(c);
    const umbrella = itemUmbrella(c);
    const chair = itemBeachChair(c);
    return (x0, bw, y, h) => {
      const kind = (h >>> 3) % 8;
      if (kind < 3) palm(x0, bw, y, h);
      else if (kind < 6) { umbrella(x0, bw, y, h); chair(x0, bw, y + 11, h); }
      else chair(x0, bw, y, h);
    };
  }

  function itemSkiLift(c) {
    const ink = TUNING.palette.city.outline;
    return (x0, bw, y, h) => {
      /* the line runs with the road, so from above the cable is vertical
         and the tower is the crossbar; chairs ride the cable */
      /* the cable is a property of the band, not of the slot: fixing cx
         to the band centre means two lift slots in a row draw one
         unbroken line instead of two offset stubs */
      const cx = x0 + Math.floor(bw / 2);
      const span = TUNING.render.scenery.periodPx;
      bctx.fillStyle = ink;
      bctx.fillRect(cx, y - span, 1, span * 2);
      /* pylon */
      bctx.fillRect(cx - 4, y + 4, 9, 2);
      bctx.fillRect(cx - 1, y, 3, 6);
      for (let i = 0; i < 3; i += 1) {
        const chy = y - 22 + i * 22 + (h % 7);
        bctx.fillStyle = ink;
        bctx.fillRect(cx - 2, chy, 5, 1);
        bctx.fillStyle = (h >>> i & 1) ? TUNING.palette.city.carBody : TUNING.palette.city.carWindow;
        bctx.fillRect(cx - 2, chy + 1, 5, 3);
      }
    };
  }

  function itemSnowFront(c) {
    const pine = itemPine(c);
    const lift = itemSkiLift(c);
    return (x0, bw, y, h) => {
      if (h % 11 === 0) lift(x0, bw, y, h);
      else pine(x0, bw, y, h);
    };
  }

  function itemHelicopter(c) {
    const ink = TUNING.palette.city.outline;
    return (x0, bw, y, h) => {
      const cx = x0 + 2 + ((h >>> 8) % Math.max(1, bw - 11));
      const cy = y + 6;
      /* rotor alternates between two spans so it reads as spinning */
      const spin = Math.floor(worldNow() / 70) % 2;
      bctx.fillStyle = ink;
      bctx.fillRect(cx + 1, cy, 6, 3);
      bctx.fillRect(cx + 6, cy + 1, 3, 1);
      bctx.fillRect(cx + 8, cy, 1, 3);
      bctx.fillRect(cx + 3, cy - 2, 1, 2);
      bctx.fillRect(cx + 2, cy + 3, 1, 1);
      bctx.fillRect(cx + 5, cy + 3, 1, 1);
      bctx.fillStyle = TUNING.palette.city.carWindow;
      bctx.fillRect(cx + 1, cy + 1, 2, 1);
      bctx.fillStyle = ink;
      if (spin === 0) bctx.fillRect(cx - 1, cy - 2, 9, 1);
      else bctx.fillRect(cx + 2, cy - 2, 3, 1);
      bctx.fillStyle = TUNING.palette.city.carBody;
      bctx.fillRect(cx + 4, cy + 1, 1, 1);
    };
  }

  function itemSnowPeak(c) {
    const peak = itemPeak(c);
    const heli = itemHelicopter(c);
    return (x0, bw, y, h) => {
      peak(x0, bw, y, h);
      /* above the apex, so it flies over the range instead of perching */
      if (h % 9 === 0) heli(x0, bw, y - 12, h);
    };
  }

  /* Themes name their props; adding a scene is a data row plus, at
     most, one new function above. */
  const FAR_ITEMS = { peak: itemPeak, mesa: itemMesa, building: itemBuilding, barn: itemBarn, volcano: itemVolcano, snowpeak: itemSnowPeak };
  const NEAR_ITEMS = { pine: itemPine, cactus: itemCactus, palm: itemPalm, treeblob: itemTreeBlob, cow: itemCow, lavarock: itemLavaRock, scrub: itemScrub, beachfront: itemBeachFront, snowfront: itemSnowFront };

  function drawScenery(distancePx, tier) {
    const { key, c } = themeFor(tier);
    const sc = TUNING.render.scenery;
    if (c.farItem === 'water') {
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
        bctx.fillRect(x0 + 1 + ((h >>> 4) % 7), y + 22, 5, 1);
      };
      bandItems(0, 15, sc.farFactor, 1, distancePx, foam);
      bandItems(W - 15, 15, sc.farFactor, 2, distancePx, foam);
    } else {
      const farItem = (FAR_ITEMS[c.farItem] || itemPeak)(c);
      bandItems(0, 15, sc.farFactor, 1, distancePx, farItem, c.farDensity);
      bandItems(W - 15, 15, sc.farFactor, 2, distancePx, farItem, c.farDensity);
    }
    const nearItem = (NEAR_ITEMS[c.nearItem] || itemPine)(c);
    bandItems(16, 13, 1, 3, distancePx, nearItem, c.nearDensity);
    bandItems(W - 29, 13, 1, 4, distancePx, nearItem, c.nearDensity);
  }

  /*
    Render side timers are written in 60Hz frames because that is how
    they were tuned, but they are stepped by wall clock, not by frame
    count. A 120Hz ProMotion iPhone, which is the primary device, was
    running every one of them at double speed: the crash shake lasted
    117ms instead of 233ms and the pickup callout flashed past before
    it could be read. frameUnits converts the real elapsed time into
    those same 60Hz units, so the tuned numbers keep their meaning at
    any refresh rate. Clamped at 4 so a tab returning from the
    background does not jump every timer to zero at once.
  */
  const REF_HZ = 60;
  let lastFrameMs = 0;

  /*
    The world's own clock.

    Everything that animates on the road ran off performance.now, which
    keeps running while the game is paused, so a paused screen still had
    hazard flashers ticking, cups bobbing and rubber fading out from
    under a car that was not moving. Pause is supposed to be a freeze
    frame.

    This clock advances only while the run is live. Menus and press
    states stay on real time, because those are the interface and the
    interface is not paused. A backgrounded tab can hand back a gap of
    minutes, so a single tick is capped at roughly a frame.
  */
  let worldMs = 0;
  let worldClockLast = null;

  function tickWorldClock(mode) {
    const now = performance.now();
    if (worldClockLast !== null && mode === 'playing') {
      worldMs += Math.min(now - worldClockLast, 100);
    }
    worldClockLast = now;
  }

  function worldNow() {
    return worldMs;
  }

  function frameUnits() {
    const now = performance.now();
    if (lastFrameMs === 0) { lastFrameMs = now; return 1; }
    const dt = now - lastFrameMs;
    lastFrameMs = now;
    return Math.min(4, Math.max(0, dt) * REF_HZ / 1000);
  }

  let units = 1;

  /* Pickup puffs and similar one shot particles. Render only. */
  let particles = [];
  let gaugeFlashFrames = 0;

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

  /* The loud version for pickups: a wide two color burst, a rising
     callout, and (for coffee) a flash on the fuel gauge so the
     reward reads even at speed. */
  function addPickupPop(x, y, kind) {
    const cCoffee = ['#b78152', '#e8d5b0'];
    const cHeart = ['#e43b44', '#ffffff'];
    const cNitro = ['#2a6aff', '#c2e4ff'];
    const colors = kind === 'heart' ? cHeart : (kind === 'nitro' ? cNitro : cCoffee);
    for (let i = 0; i < 16; i += 1) {
      particles.push({
        x, y,
        color: colors[i % 2],
        vx: (Math.random() * 2 - 1) * 2.2,
        vy: (Math.random() * 2 - 1) * 2.2 - 0.8,
        size: i % 3 === 0 ? 3 : 2,
        life: 18 + Math.floor(Math.random() * 10)
      });
    }
    particles.push({
      x, y: y - 6,
      text: kind === 'heart' ? '+LIFE' : (kind === 'nitro' ? 'NITRO!' : '+COFFEE'),
      color: colors[1],
      vx: 0, vy: -0.55,
      life: 46
    });
    if (kind === 'coffee') gaugeFlashFrames = 22;
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * units;
      p.y += p.vy * units;
      p.life -= units;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      bctx.globalAlpha = Math.min(1, p.life / 12);
      if (p.text) {
        drawText(bctx, p.text, Math.round(p.x) + 1, Math.round(p.y) + 1,
          '#1a1a24', { scale: 1, align: 'center' });
        drawText(bctx, p.text, Math.round(p.x), Math.round(p.y),
          p.color, { scale: 1, align: 'center' });
      } else {
        bctx.fillStyle = p.color;
        const s = p.size || 2;
        bctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
      }
    }
    bctx.globalAlpha = 1;
  }

  /* Boost has to feel like boost: dense streaks down the whole road,
     plus the rubber the rear wheels leave (laid in drawPlayer, drawn
     with the road). */
  function drawSpeedLines(view, pal) {
    if (!view.boosting) return;
    bctx.fillStyle = pal.dash;
    const xs = [36, 52, 68, 84, 100, 116, 132, 148];
    for (let i = 0; i < xs.length; i += 1) {
      bctx.globalAlpha = i % 2 === 0 ? 0.5 : 0.3;
      const y = ((view.distancePx * 1.9 + i * 67) % (H + 60)) - 30;
      bctx.fillRect(xs[i], Math.round(y), 1, 34);
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
    Skid marks.

    Boost used to grow flames out of the exhaust, which reads as a
    rocket. This is a car: it lays rubber. Two marks go down under the
    rear wheels every frame the boost is on, at the world distance the
    car was at when they were laid, and they scroll away with the road
    behind it. Darkest at the moment of the launch, because that is
    where the wheelspin is, and gone within fadeMs so the road does not
    fill up with history.
  */
  const skids = [];
  /* Where the last pair went down, so the next pair can bridge the
     ground between them rather than leaving a hole in the line. Null
     means this is the first frame of a burst. */
  let lastRubberPx = null;

  function layRubber(view, cx, rearY) {
    const k = TUNING.render.skid;
    const strength = Math.max(k.minStrength, Math.min(1, view.boostFrac || 0));
    const gap = lastRubberPx === null ? 0 : view.distancePx - lastRubberPx;
    const len = Math.max(k.lenPx, Math.min(k.maxLenPx, Math.ceil(gap) + 1));
    lastRubberPx = view.distancePx;
    for (const side of [-1, 1]) {
      skids.push({
        x: Math.round(cx + side * k.trackPx - k.wPx / 2),
        y: Math.round(rearY),
        len,
        laidAtPx: view.distancePx,
        bornMs: worldNow(),
        strength
      });
    }
  }

  /* A burst that ended must not bridge to the next one, which could be
     half a screen later. */
  function endRubber() {
    lastRubberPx = null;
  }

  function drawSkids(view, pal) {
    if (skids.length === 0) return;
    const k = TUNING.render.skid;
    const now = worldNow();
    bctx.fillStyle = pal.skidMark;
    for (let i = skids.length - 1; i >= 0; i -= 1) {
      const s = skids[i];
      const age = now - s.bornMs;
      const y = s.y + (view.distancePx - s.laidAtPx);
      if (age >= k.fadeMs || y > H) {
        skids.splice(i, 1);
        continue;
      }
      bctx.globalAlpha = k.maxAlpha * s.strength * (1 - age / k.fadeMs);
      /* The bar runs from the wheel back down the screen, because the
         ground it bridges is the ground already passed. */
      bctx.fillRect(s.x, Math.round(y), k.wPx, s.len);
    }
    bctx.globalAlpha = 1;
  }

  /* A run that ended takes its rubber with it. */
  function clearSkids() {
    skids.length = 0;
    lastRubberPx = null;
  }

  /*
    Spin: chunky quarter turn rotations while spinFrames runs, the
    8 bit read of a spinout. Blink: invulnerability alternates player
    visibility every few frames, the classic forgiveness signal.
  */
  /* The bottom of the last row on a menu, which is what the car parks
     under. */
  function menuBottomY(mode, hapticsSupported) {
    let bottom = 0;
    for (const item of menuLayout(mode, false, hapticsSupported)) {
      if (item.id === 'soundtip') continue;
      bottom = Math.max(bottom, item.y + item.h);
    }
    return bottom;
  }

  /*
    Where the car sits on a menu screen: framed, on the road in the
    lower third, below the last row. It used to sit at the driving
    position, which on this screen is behind the option rows and the
    board, so about five pixels of roof were visible.

    It wants to be titleCarBottomPx off the bottom edge and below the
    last row. On the layout with a Rumble row there is not that much
    space, so there it sits as high as the row above allows.
  */
  function menuCarY(view) {
    const spr = getSprite(view.playerSpriteKey || 'player_coupe');
    const half = spr.height / 2;
    const lowest = H - 2 - half;
    const wanted = H - TUNING.render.titleCarBottomPx - half;
    const under = menuBottomY('title', view.hapticsSupported) + 2 + half;
    return Math.min(Math.max(under, wanted), lowest);
  }

  /*
    The car, parked. No plate behind it: it is a car on a road, not an
    item in a case. Drawn from the title screen rather than with the
    world, so it sits on top of the dim layer those screens lay over
    everything and keeps its paint, which is the whole point of it.
  */
  function drawParkedCar(view) {
    const spr = getSprite(view.playerSpriteKey || 'player_coupe');
    const cy = menuCarY(view);
    lastPlayerY = cy;
    bctx.drawImage(spr, Math.round((W - spr.width) / 2), Math.round(cy - spr.height / 2));
  }

  /*
    The drive up. The car waits at the bottom of the title screen and
    takes the driving position when a run starts, rather than being
    somewhere else the frame after Start is pressed. It runs from
    wherever the car was last drawn, so coming back from the paused
    menu, where it never moved, costs nothing.
  */
  let lastPlayerY = TUNING.render.playerYPx;
  let introFromY = null;
  let introStartMs = 0;

  function startRunIntro() {
    introFromY = lastPlayerY;
    introStartMs = worldNow();
  }

  function playerY(view) {
    if (view.mode === 'title' || view.mode === 'howto') return menuCarY(view);
    if (introFromY !== null) {
      const t = (worldNow() - introStartMs) / TUNING.render.runIntroMs;
      if (t >= 1) {
        introFromY = null;
      } else {
        /* ease out, so it arrives rather than stops */
        const e = 1 - (1 - t) * (1 - t);
        return introFromY + (TUNING.render.playerYPx - introFromY) * e;
      }
    }
    return TUNING.render.playerYPx;
  }

  function drawPlayer(view) {
    if (view.invulnFrames > 0 && Math.floor(view.invulnFrames / 4) % 2 === 1) return;
    const spr = getSprite(view.playerSpriteKey || 'player_coupe');
    const cx = laneCenterXPx(view.laneFloat);
    const cy = playerY(view);
    lastPlayerY = cy;
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
    /* Rubber, laid under the rear wheels while the boost is on. The
       marks are drawn with the road rather than here, so traffic and
       the car pass over them rather than under. */
    if (view.boosting) layRubber(view, cx, cy + spr.height / 2 - 4);
    else endRubber();
    /* blinking BOOST! callout when an overtaker is bearing down on
       this lane and a boost is banked, so the escape move is obvious */
    if (view.boostHint && !view.boosting
      && Math.floor(worldNow() / TUNING.render.boostHintBlinkMs) % 2 === 0) {
      const pal = TUNING.palette.city;
      const tx = Math.round(cx);
      const ty = Math.round(cy - spr.height / 2 - 12);
      drawText(bctx, 'BOOST!', tx + 1, ty + 1, pal.outline, { scale: 1, align: 'center' });
      drawText(bctx, 'BOOST!', tx, ty, pal.dash, { scale: 1, align: 'center' });
      /* The prompt used to shout the name of a move without ever
         saying how to make it. The first few times, it says. */
      if (view.boostTip) {
        drawText(bctx, 'SWIPE UP', tx + 1, ty - 7, pal.outline, { scale: 1, align: 'center' });
        drawText(bctx, 'SWIPE UP', tx, ty - 8, pal.text, { scale: 1, align: 'center' });
        boostTipDrawn = true;
      }
    }
  }

  /*
    Overtakers, plus their telegraph: while one is still approaching
    from behind, flashing chevrons at the bottom of its lane warn
    which lane is about to be hot.
  */
  function drawOvertakers(view, pal) {
    const t = worldNow() / 1000;
    for (let i = 0; i < view.overtakers.length; i += 1) {
      const ov = view.overtakers[i];
      const dy = ov.distPx - view.distancePx;
      const screenY = TUNING.render.playerYPx - dy;
      /* The chevrons are drawn by drawOvertakerWarnings, after the
         traffic layer. See the note there. */
      if (screenY > H + 40) continue;
      if (screenY < -70 || screenY > H + 70) continue;
      const spr = getTrafficSprite(ov.variant);
      const x = Math.round(laneCenterXPx(ov.lane) - spr.width / 2);
      const y = Math.round(screenY - spr.height / 2);
      bctx.drawImage(spr, x, y);
      /* Wig wag roof lights on emergency vehicles: red and blue trade
         sides every beat, with a bright white strobe pixel between.
         The bar sits on the vehicle's own roof: per sprite fractions
         put truck lights on the cab, never on carried cargo. */
      if (ov.emergency) {
        const phase = Math.floor(worldNow() / TUNING.render.wigWagMs) % 2;
        const fracs = TUNING.render.wigWagRoofFrac;
        const spriteName = TRAFFIC_VARIANTS[ov.variant].sprite;
        const roofFrac = fracs[spriteName] !== undefined ? fracs[spriteName] : fracs.default;
        const barY = y + Math.round(spr.height * roofFrac);
        const cx = x + Math.round(spr.width / 2);
        bctx.fillStyle = phase === 0 ? pal.wigWagRed : pal.wigWagRedDim;
        bctx.fillRect(cx - 5, barY, 4, 2);
        bctx.fillStyle = phase === 0 ? pal.wigWagBlueDim : pal.wigWagBlue;
        bctx.fillRect(cx + 1, barY, 4, 2);
        bctx.fillStyle = '#ffffff';
        bctx.fillRect(cx - 1, barY + (phase === 0 ? 0 : 1), 2, 1);
      }
    }
  }

  /* Road features draw under everything that drives over them. */
  function drawHazards(view) {
    for (let i = 0; i < view.hazards.length; i += 1) {
      const h = view.hazards[i];
      const key = h.type === 'rubble'
        ? (OBSTACLE_SPRITES[h.art] || OBSTACLE_SPRITES[0])
        : (h.dir > 0 ? 'obs_oil_right' : 'obs_oil_left');
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
  /*
    A working vehicle's own lights. Phase is keyed to the row's world
    distance, the way the breakdown flashers are, so two taxis in the
    same row do not blink in lockstep and a given vehicle's beat does
    not change as it comes up the screen.
  */
  function drawWorkLight(variant, x, y, spr, pal, now, distPx) {
    const spec = TUNING.render.workLights[TRAFFIC_VARIANTS[variant].sprite];
    if (!spec) return;
    const phase = Math.floor(now / spec.ms + (distPx % 5) * 0.37) % 2;
    const ly = y + Math.round(spr.height * spec.roofFrac);
    const cx = x + Math.round(spr.width / 2);
    /*
      Both of these vehicles are yellow, so an amber lamp painted
      straight onto the bodywork is the one thing that cannot read.
      Every lamp gets the outline the rest of the game gives its
      pixels, which is what separates it from the paint underneath and
      makes the off beat as legible as the on one.
    */
    if (spec.kind === 'sign') {
      /* A roof sign: wider than it is tall, which is the shape that
         reads as a sign at six pixels across. */
      bctx.fillStyle = pal.outline;
      bctx.fillRect(cx - 4, ly - 1, 8, 4);
      bctx.fillStyle = phase === 0 ? pal.hazardLight : pal.hazardLightDim;
      bctx.fillRect(cx - 3, ly, 6, 2);
      return;
    }
    /* A beacon sweeping: one side bright, the other banked, trading
       every beat, which is the cheapest honest read of a rotating
       lamp. */
    bctx.fillStyle = pal.outline;
    bctx.fillRect(cx - 5, ly - 1, 10, 4);
    bctx.fillStyle = phase === 0 ? pal.hazardLight : pal.hazardLightDim;
    bctx.fillRect(cx - 4, ly, 3, 2);
    bctx.fillStyle = phase === 0 ? pal.hazardLightDim : pal.hazardLight;
    bctx.fillRect(cx + 1, ly, 3, 2);
  }

  function drawTraffic(view) {
    const pal = TUNING.palette.city;
    const blinkMs = TUNING.render.hazardBlinkMs;
    const now = worldNow();
    for (let i = 0; i < view.rows.length; i += 1) {
      const row = view.rows[i];
      const screenY = TUNING.render.playerYPx - (row.distPx - view.distancePx);
      if (screenY < -64 || screenY > H + 64) continue;
      /* Breakdown cars run their hazard flashers, phase shifted per
         row (keyed to the row's spawn position so it is stable). */
      const flash = row.breakdown
        && Math.floor(now / blinkMs + (row.distPx % 7) * 0.29) % 2 === 0;
      for (let lane = 0; lane < row.lanes.length; lane += 1) {
        if (!row.lanes[lane]) continue;
        /* A yielding car occupies two lanes in the logic while it
           straddles the line; draw it once, sliding, from its origin
           lane. */
        if (row.yield && lane === row.yield.to) continue;
        const spr = getTrafficSprite(row.variants[lane]);
        let cx = laneCenterXPx(lane);
        if (row.yield && lane === row.yield.from) {
          const p = Math.min(1, row.yield.frame / row.yield.total);
          const ease = p * p * (3 - 2 * p);
          cx += (laneCenterXPx(row.yield.to) - laneCenterXPx(row.yield.from)) * ease;
        }
        const x = Math.round(cx - spr.width / 2);
        const off = row.offsets ? row.offsets[lane] : 0;
        const y = Math.round(screenY - off - spr.height / 2);
        bctx.drawImage(spr, x, y);
        if (flash) {
          bctx.fillStyle = pal.hazardLight;
          bctx.fillRect(x + 1, y + spr.height - 3, 2, 2);
          bctx.fillRect(x + spr.width - 3, y + spr.height - 3, 2, 2);
        }
        drawWorkLight(row.variants[lane], x, y, spr, pal, now, row.distPx);
      }
    }
  }

  /*
    Cups shiver by a pixel, phase offset per cup so they never sync.
    Purely visual: collection uses the unjiggled position.
  */
  /*
    Every collectible moves the same way, because the motion IS the
    affordance: the cups jiggle, so a thing that jiggles is a thing to
    drive into, and a thing that sits still is a thing to dodge.
    Hearts and nitro used to only bob, on a shared phase, which read
    as scenery and left the two rarest pickups looking less inviting
    than the common one.

    They also get four sparks that pulse outward, which the cups do
    not. Coffee turns up constantly and has the gauge to explain it;
    a heart or a nitro might be the only one in a run, so it is worth
    a little extra insistence.
  */
  /*
    Every pickup carries an accent now, not just the two new ones. The
    coffee cup reads at speed because it is wide and warm against grey
    tarmac; nitro is eleven pixels across and heart is a small shape,
    so on the road they were easy to miss even though all three
    already shared the same bob.

    Three things do the work, and none of them touches the art:
    a contact shadow, which is what actually lifts a sprite off a flat
    road; a pulsing ring of accent marks, eight positions rather than
    four and two pixels rather than one, so the pulse is visible in
    peripheral vision; and a dark keyline dropped under the sprite,
    which stops a pale pickup dissolving into a pale car behind it.
  */
  const SPARK_ACCENT = { coffee: '#ffd08a', heart: '#ff5d66', nitro: '#5fcde4' };

  /* sprite canvas -> a solid dark stamp of the same shape */
  const silhouettes = new Map();
  function silhouetteFor(spr) {
    let sil = silhouettes.get(spr);
    if (sil) return sil;
    sil = document.createElement('canvas');
    sil.width = spr.width;
    sil.height = spr.height;
    const sctx = sil.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(spr, 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = TUNING.palette.city.outline;
    sctx.fillRect(0, 0, spr.width, spr.height);
    silhouettes.set(spr, sil);
    return sil;
  }

  function drawCollectible(spr, cx, cy, phase, kind) {
    const jx = Math.round(Math.sin(phase));
    const jy = Math.round(Math.sin(phase * 0.63 + 1.3) * 0.6);
    const x = Math.round(cx - spr.width / 2) + jx;
    const y = Math.round(cy - spr.height / 2) + jy;
    const mx = Math.round(x + spr.width / 2);
    const my = Math.round(y + spr.height / 2);
    const hw = Math.round(spr.width / 2);
    const hh = Math.round(spr.height / 2);

    /*
      Contact shadow. Anchored to the road rather than to the sprite,
      so it stays put while the pickup bobs above it, which is what
      makes the bob read as floating instead of as the whole thing
      sliding around.
    */
    const shadowY = Math.round(cy + spr.height / 2) - 1;
    const sw = Math.max(6, spr.width - 2);
    bctx.globalAlpha = 0.28;
    bctx.fillStyle = TUNING.palette.city.tire;
    bctx.fillRect(Math.round(cx - sw / 2) + 1, shadowY, sw - 2, 2);
    bctx.fillRect(Math.round(cx - sw / 2), shadowY + 1, sw, 1);
    bctx.globalAlpha = 1;

    const accent = SPARK_ACCENT[kind];
    if (accent) {
      const pulse = (Math.sin(phase * 0.42) + 1) / 2;
      const r = 3 + Math.round(pulse * 3);
      const d = Math.round(r * 0.7);
      bctx.globalAlpha = 0.35 + 0.55 * (1 - pulse);
      bctx.fillStyle = accent;
      /* four on the axes, two pixels each */
      bctx.fillRect(mx - 1, my - hh - r, 2, 2);
      bctx.fillRect(mx - 1, my + hh + r - 2, 2, 2);
      bctx.fillRect(mx - hw - r, my - 1, 2, 2);
      bctx.fillRect(mx + hw + r - 2, my - 1, 2, 2);
      /* four on the diagonals, one pixel, offset in phase so the ring
         shimmers rather than breathing as a single unit */
      bctx.globalAlpha = 0.25 + 0.5 * pulse;
      bctx.fillRect(mx - hw - d, my - hh - d, 1, 1);
      bctx.fillRect(mx + hw + d - 1, my - hh - d, 1, 1);
      bctx.fillRect(mx - hw - d, my + hh + d - 1, 1, 1);
      bctx.fillRect(mx + hw + d - 1, my + hh + d - 1, 1, 1);
      bctx.globalAlpha = 1;
    }

    /* A one pixel drop shadow, down and right, exact to the
       silhouette. An outline on all four sides fattens the shape and
       the art already has its own; offsetting in one direction reads
       as the pickup sitting above the road instead. Offset copies of
       the sprite itself would smear colour, so this is a solid dark
       stamp of its shape, built once per sprite and cached. */
    bctx.globalAlpha = 0.55;
    bctx.drawImage(silhouetteFor(spr), x + 1, y + 1);
    bctx.globalAlpha = 1;
    bctx.drawImage(spr, x, y);
  }

  function drawPickups(view) {
    const spr = {
      coffee: getSprite('pickup_coffee'),
      heart: getSprite('item_heart'),
      nitro: getSprite('item_nitro')
    };
    const t = worldNow() / 1000;
    const hz = TUNING.render.coffeeJiggleHz;
    for (let i = 0; i < view.pickups.length; i += 1) {
      const item = view.pickups[i];
      const screenY = TUNING.render.playerYPx - (item.distPx - view.distancePx);
      if (screenY < -32 || screenY > H + 32) continue;
      /* distPx in the phase so two pickups on screen are never in
         step with each other */
      const phase = t * hz * Math.PI * 2 + item.lane * 1.7 + item.distPx * 0.01;
      drawCollectible(spr[item.kind] || spr.coffee, laneCenterXPx(item.lane), screenY,
        phase, item.kind);
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
  function drawPlate(x, y, w, h, pal, fill) {
    bctx.fillStyle = pal.outline;
    bctx.fillRect(x + 1, y - 1, w - 2, h + 2);
    bctx.fillRect(x - 1, y + 1, w + 2, h - 2);
    bctx.fillRect(x, y, w, h);
    bctx.fillStyle = fill || pal.road;
    bctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  }

  /*
    The one time coffee lesson. A cup on its own is just a shape, and
    nothing on the screen says why to steer into one; testers read the
    gauge running down and never connected the two. The first time a
    cup comes into reading distance we hang a two line callout off it
    with a short leader back to the cup, so the lesson is attached to
    the object rather than buried in a menu. Shown once per browser,
    never again.
  */
  /*
    Latched onto one cup, not re-picked each frame. The old version
    chose the nearest cup ahead every frame, so the callout followed a
    cup for the ~1.2s it took to reach the player and then jumped to
    the next one, which was usually outside the draw window. The
    lesson got about a third of its 3.2s budget and flickered.

    It also reports back. The flag that spends this lesson forever
    used to be written when the simulation emitted coffee_seen, which
    fires at a cup distance putting cupY about three pixels inside the
    draw cut off, with the render distance interpolated and the event
    distance not. A frame landing the wrong side of that burned the
    only tutorial in the game with nothing shown. Now the renderer
    says whether it actually drew, and main.js spends the flag on
    reading time, not on an event.
  */
  let tipLatchDistPx = null;
  let tipLatchLane = 0;
  /* Set by the draw calls, read back by the app: a lesson is only
     spent once it has actually been on screen, which is what stopped
     the coffee lesson being burned by a frame nobody saw. */
  let boostTipDrawn = false;

  /*
    The first thing a player needs and the one thing the game never
    said. It hangs over the car rather than off an object, because the
    object in this lesson is the car, and it leaves as soon as the
    player steers: a lesson that stays up after it has been learned is
    a nag.
  */
  function drawSteerTip(view, pal) {
    if (!view.steerTip) return false;
    const l1 = 'Tap a lane';
    const l2 = 'to move there';
    const w = Math.max(textWidth(l1, 1), textWidth(l2, 1)) + 10;
    const h = 15;
    const x = Math.round((W - w) / 2);
    /* Hung off where the car actually is, not where it will be: at the
       start of a run it is still driving up from the title screen, and
       a callout waiting for it at the driving position reads as a sign
       rather than as something attached to the car. */
    const y = Math.round(lastPlayerY) - 42;
    drawPlate(x, y, w, h, pal);
    drawText(bctx, l1, W / 2, y + 2, pal.edgeLine, { scale: 1, align: 'center' });
    drawText(bctx, l2, W / 2, y + 9, pal.text, { scale: 1, align: 'center' });
    return true;
  }

  function drawCoffeeTip(view, pal) {
    if (!view.coffeeTip) { tipLatchDistPx = null; return false; }
    if (tipLatchDistPx === null) {
      if (!view.pickups) return false;
      let best = null;
      for (let i = 0; i < view.pickups.length; i += 1) {
        const item = view.pickups[i];
        if (item.kind !== 'coffee') continue;
        const dy = item.distPx - view.distancePx;
        if (dy <= 0) continue;
        if (best === null || dy < best.dy) best = { item, dy };
      }
      if (best === null) return false;
      /* Latch only once the cup is genuinely in reading range, so a
         frame that arrives a few pixels early does not latch onto a
         cup and then refuse to draw it. */
      if (TUNING.render.playerYPx - best.dy < TUNING.render.hudBandHPx + 8) return false;
      tipLatchDistPx = best.item.distPx;
      tipLatchLane = best.item.lane;
    }

    const cupX = Math.round(laneCenterXPx(tipLatchLane));
    /* Once the cup reaches the car, hold the callout where it is for
       the rest of the window rather than chasing it off the bottom of
       the screen or teleporting to another cup. */
    const rawY = TUNING.render.playerYPx - (tipLatchDistPx - view.distancePx);
    const cupY = Math.round(Math.min(rawY, H - 40));
    if (cupY < TUNING.render.hudBandHPx + 8) return false;

    const l1 = 'Coffee is fuel';
    const l2 = 'Grab it';
    const w = Math.max(textWidth(l1, 1), textWidth(l2, 1)) + 8;
    const h = 15;
    /* clamped so the callout never hangs off the edge of a phone */
    const x = Math.max(3, Math.min(W - w - 3, Math.round(cupX - w / 2)));
    const y = cupY + 14;

    bctx.fillStyle = pal.outline;
    bctx.fillRect(cupX, cupY + 6, 1, y - cupY - 6);
    drawPlate(x, y, w, h, pal);
    drawText(bctx, l1, x + w / 2, y + 2, pal.edgeLine, { scale: 1, align: 'center' });
    drawText(bctx, l2, x + w / 2, y + 9, pal.text, { scale: 1, align: 'center' });
    return true;
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
    const x0 = 2;
    const barX = x0 + fb.labelWPx;
    const barY = fb.yPx;
    const low = view.fuel <= TUNING.fuel.lowThreshold;

    /*
      The gauge is labelled, and the label is also the warning. Players
      read BOOST and understand boost; the coffee gauge was the only
      thing on this HUD without a word, and it was the thing testers
      could not read. Under the low threshold the word alternates
      COFFEE and LOW, both red, with LOW centred inside COFFEE's own
      footprint so the eye has nothing to chase.
    */
    /*
      Row two was the one HUD element with no plate under it, and the
      label sits at x=2 while the road starts at x=30, so it was drawn
      over the bright green shoulder. Red on that, under the 55% band,
      measured 1.49:1 on five pixel type: the most urgent state in the
      run was the least readable thing on screen, and it was legible
      right up until the moment it mattered and then vanished.

      A dark chip fixes the background rather than the foreground, so
      the warning no longer depends on what is scrolling underneath.
      On it the amber reaches 8.10:1 and the resting white 12.63:1.
      Amber rather than red because red on any dark ground is about
      3.3:1; the red stays where it still works, on the bar fill.
    */
    /* drawPlate with the outline as its own interior: the same pixel
       rounded silhouette every other HUD element wears, in the one
       colour dark enough to carry five pixel type. */
    drawPlate(1, barY - 1, 25, 7, pal, pal.outline);

    const blinkLow = low
      && Math.floor(worldNow() / TUNING.render.lowBlinkMs) % 2 === 0;
    if (blinkLow) {
      drawText(bctx, 'Low', x0 + textWidth('Coffee', 1) / 2, barY + 1, pal.hazardLight,
        { scale: 1, align: 'center' });
    } else {
      drawText(bctx, 'Coffee', x0, barY + 1, low ? pal.hazardLight : pal.text,
        { scale: 1, align: 'left' });
    }

    /* capsule outline with pixel rounded corners */
    bctx.fillStyle = pal.outline;
    bctx.fillRect(barX + 1, barY - 2, fb.wPx - 2, fb.hPx + 4);
    bctx.fillRect(barX - 1, barY, fb.wPx + 2, fb.hPx);
    bctx.fillRect(barX, barY - 1, fb.wPx, fb.hPx + 2);

    /* empty interior */
    bctx.fillStyle = pal.road;
    bctx.fillRect(barX + 1, barY, fb.wPx - 2, fb.hPx);

    /* fill with highlight and shadow bands; a fresh cup makes the
       whole gauge flash bright for a beat */
    const flashOn = gaugeFlashFrames > 0 && Math.floor(gaugeFlashFrames / 4) % 2 === 0;
    if (gaugeFlashFrames > 0) gaugeFlashFrames = Math.max(0, gaugeFlashFrames - units);
    const frac = Math.max(0, Math.min(1, view.fuel / TUNING.fuel.max));
    const fillW = Math.round((fb.wPx - 2) * frac);
    if (fillW > 0) {
      bctx.fillStyle = flashOn ? pal.dash : (low ? pal.carBody : pal.edgeLine);
      bctx.fillRect(barX + 1, barY, fillW, fb.hPx);
      bctx.fillStyle = flashOn ? '#ffffff' : pal.dash;
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

    /* No ring around the coffee gauge while boosting. It read as
       measurement scaffolding rather than as state, and the boost pill
       two inches to the right already fills white for the whole
       duration, with the rubber off the back wheels saying the same
       thing. */

    /* labeled boost meter on the right third of the row */
    const bp = TUNING.render.boostPill;
    const labelX = barX + fb.wPx + 8;
    const hintOn = view.boostHint && !view.boosting
      && (Math.floor(worldNow() / TUNING.render.boostHintBlinkMs) % 2 === 0);
    /* Matching chip, so row two reads as one designed row rather than
       one labelled element and one bare one. */
    drawPlate(labelX - 1, barY - 1, textWidth('Boost', 1) + 3, 7, pal, pal.outline);
    drawText(bctx, 'Boost', labelX, barY + 1, hintOn ? pal.dash : pal.text,
      { scale: 1, align: 'left' });
    const bpX = labelX + 22;
    const bpY = Math.round(barY + fb.hPx / 2 - bp.hPx / 2);
    drawPlate(bpX, bpY, bp.wPx, bp.hPx, pal);
    if (view.boosting) {
      bctx.fillStyle = pal.dash;
      bctx.fillRect(bpX + 1, bpY + 1, Math.round((bp.wPx - 2) * view.boostFrac), bp.hPx - 2);
    } else if (view.boostReady) {
      /* A banked nitro reads as its own colour, not as a full coffee
         gauge: the player has to be able to tell at a glance that the
         next boost is the free one that works when the cup is empty. */
      const charged = view.nitroCharges > 0;
      bctx.fillStyle = charged ? pal.wigWagBlue : (hintOn ? pal.dash : pal.edgeLine);
      bctx.fillRect(bpX + 1, bpY + 1, bp.wPx - 2, bp.hPx - 2);
      bctx.fillStyle = charged ? pal.carWindow : pal.carDark;
      bctx.fillRect(bpX + 1, bpY + bp.hPx - 2, bp.wPx - 2, 1);
      /* one notch per banked charge */
      if (charged) {
        bctx.fillStyle = pal.text;
        for (let i = 0; i < view.nitroCharges; i += 1) {
          bctx.fillRect(bpX + 2 + i * 3, bpY + 2, 2, bp.hPx - 4);
        }
      }
    }
    /* pulse ring around the pill while the hint is live */
    if (hintOn) {
      bctx.fillStyle = pal.dash;
      bctx.fillRect(bpX - 1, bpY - 3, bp.wPx + 2, 1);
      bctx.fillRect(bpX - 1, bpY + bp.hPx + 2, bp.wPx + 2, 1);
      bctx.fillRect(bpX - 3, bpY - 1, 1, bp.hPx + 2);
      bctx.fillRect(bpX + bp.wPx + 2, bpY - 1, 1, bp.hPx + 2);
    }
  }

  /* Brief HUD: score, high score, fuel meter, stumble indicator, all
     in the same cartoon capsule style on the shaded band. Row one is
     the double size digits. */
  /*
    The pause control's geometry, shared by the drawing and the hit
    test so they cannot drift.
  */
  function pauseRect() {
    const p = TUNING.render.hudPlate;
    const b = TUNING.render.pauseBtn;
    return { x: W - p.marginPx - b.wPx, y: p.yPx, w: b.wPx, h: b.hPx };
  }

  /*
    A tap pauses only inside the band. Steering resolves a tap to a
    lane by its x alone, so an unbounded corner target would swallow
    every tap a player made to move into the right hand lane.
  */
  function hitTestPause(lx, ly) {
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) return false;
    const b = TUNING.render.pauseBtn;
    return lx >= W - b.hitWPx && ly >= 0 && ly <= TUNING.render.hudBandHPx;
  }

  /* Two bars, the pause glyph, drawn wherever it is asked for. */
  function drawPauseGlyph(x, y, pal) {
    bctx.fillStyle = pal.text;
    bctx.fillRect(x + 6, y + 5, 2, 7);
    bctx.fillRect(x + 10, y + 5, 2, 7);
  }

  /*
    Row one, left to right: help, distance, lives, best, pause. Five
    things in 180 pixels, which only works because the hearts were
    being measured wrong.

    The heart spacing was taken from item_heart, the 15 by 13 pickup
    sprite, while the row actually draws ui_heart_full, which is 9 by
    8. Three hearts were reserving 49 pixels to draw 31 and sitting
    loosely spaced because of it. Measuring the sprite that is drawn
    is both correct and what pays for the two corner buttons.

    What did not fit, even so, is the muted speaker glyph. Sound state
    is on the title screen in two places now, the Sound row and a
    plain note under it, and on the paused menu; a glyph in the run
    band was the third and the least of them. Six things do not fit in
    this row and this is the one whose absence costs least.
  */
  function drawScore(view, pal) {
    const p = TUNING.render.hudPlate;
    const hp = TUNING.render.hudHighPlate;
    const pb = pauseRect();
    const hb = helpRect();

    drawHelpButton(view, pal);

    const scoreX = hb.x + hb.w + 3;
    drawPlate(scoreX, p.yPx, p.wPx, p.hPx, pal);
    drawText(bctx, view.meters + 'M', scoreX + p.wPx / 2, p.yPx + 4, pal.text,
      { scale: 2, align: 'center' });

    const hiX = pb.x - 2 - hp.wPx;
    drawPlate(hiX, p.yPx, hp.wPx, p.hPx, pal);
    drawText(bctx, String(view.high), hiX + hp.wPx / 2, p.yPx + 4, pal.edgeLine,
      { scale: 2, align: 'center' });

    const down = view.pressedMenuId === 'hudPause' ? 1 : 0;
    drawPlate(pb.x, pb.y + down, pb.w, pb.h, pal, down ? pal.outline : undefined);
    drawPauseGlyph(pb.x, pb.y + down, pal);

    /* the hearts centre in the gap the two plates leave */
    const heartSpr = getSprite('ui_heart_full');
    const heartsW = TUNING.lives.max * (heartSpr.width + 2) - 2;
    let hx = Math.round((scoreX + p.wPx + hiX) / 2 - heartsW / 2);
    const hy = p.yPx + Math.round(p.hPx / 2 - heartSpr.height / 2);
    for (let i = 0; i < TUNING.lives.max; i += 1) {
      const spr = getSprite(i < view.hearts ? 'ui_heart_full' : 'ui_heart_empty');
      bctx.drawImage(spr, hx, hy);
      hx += spr.width + 2;
    }
  }

  /*
    The reward for reaching a tier used to be the least readable thing
    in the game at the moment it was celebrating: the wash starts at
    its 0.45 maximum on the first frame and the amber on top of it
    measured 1.79:1 over road and 1.07:1 over the shoulder, so the
    words only became legible once the flash, and the moment, had
    passed.

    Same answer as the coffee lesson: fix the background rather than
    the foreground. The callout sits on the plate every other piece of
    type in this game sits on, drawn after the wash, so the amber is
    against a dark chip from the first frame and the flash washes over
    the road behind it instead of through it.
  */
  function drawTierBanner(view, pal) {
    if (view.tierFlashFrames <= 0) return;
    const f = view.tierFlashFrames;
    /* strongest at the moment of the change, fading out */
    const alpha = Math.min(0.45, (f / 90) * 0.45);
    bctx.fillStyle = 'rgba(255, 255, 255, ' + alpha.toFixed(3) + ')';
    bctx.fillRect(0, 0, W, H);
    const l1 = 'Tier ' + (view.tier + 1);
    const l2 = 'Faster. Denser.';
    const w = Math.max(textWidth(l1, 2), textWidth(l2, 1)) + 12;
    const h = 28;
    const x = Math.round((W - w) / 2);
    const y = 112;
    drawPlate(x, y, w, h, pal);
    drawText(bctx, l1, W / 2, y + 4, pal.edgeLine, { scale: 2, align: 'center' });
    drawText(bctx, l2, W / 2, y + 18, pal.text, { scale: 1, align: 'center' });
  }

  /*
    Menus. One primary button plus option rows, laid out from tuning
    and hit tested in logical coordinates by the app. Starting a run
    is ONLY ever the primary button; stray taps and keys do nothing.
  */
  function menuLayout(mode, showSoundTip, hapticsSupported = true) {
    const m = TUNING.render.menu;
    const items = [];
    /* The legend screen is a single button: everything above it is
       reading. */
    if (mode === 'howto') {
      return [{ id: 'primary', label: 'Back', x: Math.round((W - m.primary.wPx) / 2), y: 210, w: m.primary.wPx, h: m.primary.hPx }];
    }
    let y = mode === 'title' ? 150 : (mode === 'paused' ? 116 : 122);
    const primaryLabel = mode === 'title' ? 'Start' : (mode === 'paused' ? 'Resume' : 'Go again');
    items.push({ id: 'primary', label: primaryLabel, x: Math.round((W - m.primary.wPx) / 2), y, w: m.primary.wPx, h: m.primary.hPx });
    y += m.primary.hPx + m.option.gapPx + 6;
    /* No rumble row where rumble cannot happen. Safari has never
       implemented navigator.vibrate on iOS or the desktop, so on an
       iPhone this row could only ever read N/A, and a control that
       does nothing is worse than no control. Android still gets it. */
    const optionIds = hapticsSupported ? ['car', 'sound', 'haptics'] : ['car', 'sound'];
    for (const id of optionIds) {
      items.push({ id, x: Math.round((W - m.option.wPx) / 2), y, w: m.option.wPx, h: m.option.hPx });
      y += m.option.hPx + m.option.gapPx;
    }
    if (mode === 'paused') {
      /* Restart throws the run away with no confirmation, and it used
         to sit 6px below Sound wearing the same plate and the same
         label colour as the two toggles. With the hit pad that left
         one logical pixel between a reversible toggle and an
         irreversible run ender. It now gets real clearance, and
         drawMenu gives it the hazard colours. */
      items.push({ id: 'restart', label: 'Restart', x: Math.round((W - m.option.wPx) / 2), y: y + m.destructiveGapPx, w: m.option.wPx, h: m.option.hPx });
    }
    /* The phone's own ring switch mutes the game and no browser can
       read it, so this is a hint rather than a readout. It sits last
       so its padded hit box can never steal a tap from a real row, and
       it hangs off the last row rather than sitting at a constant y,
       which is what used to bury it under the board. */
    if (mode === 'title' && showSoundTip) {
      items.push({ id: 'soundtip', x: 10, y: y + 6, w: W - 20, h: 24 });
    }
    return items;
  }

  /*
    The pad is 6 on every side and the gap between rows is 7, so every
    adjacent pair of padded boxes overlaps by 5 logical pixels. That
    padding is what carries the 44pt touch target on a small viewport,
    so shrinking it is the wrong trade. Instead the overlap band is
    resolved by which row's centre is nearer, rather than by whichever
    happens to be first in layout order: a tap aimed just above Sound
    used to cycle the car every time, and now it lands where the
    finger actually was.
  */
  /*
    The pad has to grow when the picture shrinks.

    scale is floored to a whole device pixel, so the whole interface
    drops a step at once: a 22 logical pixel row is 44 CSS pixels on an
    iPhone 15 Pro, 33 on an SE 3, and 29 inside a 320x480 itch iframe
    on a dpr 3 phone. The padded box was a constant 6 logical pixels,
    so it shrank in step with the thing it was rescuing. It is now
    sized in CSS pixels: whatever the scale, the box a finger has to
    hit is at least the 44 point minimum. Rows overlap more at small
    scales, which is safe, because a tap in an overlap resolves to the
    nearer row's centre.
  */
  function hitPadFor(itemH) {
    const min = TUNING.render.menu.hitPadPx;
    const needed = (TUNING.render.menu.minTargetCssPx / cssPerLogical - itemH) / 2;
    return Math.max(min, Math.ceil(needed));
  }

  function hitTestMenu(mode, lx, ly, showSoundTip, hapticsSupported = true) {
    if (mode !== 'title' && mode !== 'paused' && mode !== 'gameOver' && mode !== 'howto') return null;
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) return null;
    let bestId = null;
    let bestD = Infinity;
    for (const item of menuLayout(mode, showSoundTip, hapticsSupported)) {
      const pad = hitPadFor(item.h);
      if (lx < item.x - pad || lx > item.x + item.w + pad) continue;
      if (ly < item.y - pad || ly > item.y + item.h + pad) continue;
      const d = Math.abs(ly - (item.y + item.h / 2));
      if (d < bestD) { bestD = d; bestId = item.id; }
    }
    return bestId;
  }

  /*
    A button with no press state on a phone is a button you are not
    sure you hit, so you hit it again. Pressed rows sink one pixel and
    lose their top highlight, which is the whole vocabulary a pixel
    button needs: the plate stops catching the light and sits lower in
    its own socket. Render only, and cleared by the app on release, on
    a drag off the button, and on an OS cancel, so a press that is
    thought better of leaves nothing behind.
  */
  function drawMenu(view, pal, mode) {
    const pressed = view.pressedMenuId;
    for (const item of menuLayout(mode, view.soundTip, view.hapticsSupported)) {
      const down = item.id === pressed ? 1 : 0;
      /* Where the keyboard is. Drawn only once the keyboard has been
         used, so a player on a phone never sees a cursor they did not
         ask for. */
      if (item.id === view.selectedMenuId && item.id !== 'soundtip') {
        bctx.fillStyle = pal.edgeLine;
        bctx.fillRect(item.x - 3, item.y + down - 3, item.w + 6, 1);
        bctx.fillRect(item.x - 3, item.y + down + item.h + 2, item.w + 6, 1);
        bctx.fillRect(item.x - 3, item.y + down - 2, 1, item.h + 4);
        bctx.fillRect(item.x + item.w + 2, item.y + down - 2, 1, item.h + 4);
      }
      if (item.id === 'soundtip') {
        /* Drawn by drawSoundNote, after the parked car. The car is
           painted over this screen last so it keeps its colour
           against the dim layer, and it used to land straight on top
           of this text. The menu item stays, because it is the hit
           box that dismisses the hint. */
        continue;
      } else if (item.id === 'primary') {
        const iy = item.y + down;
        bctx.fillStyle = pal.outline;
        bctx.fillRect(item.x + 1, iy - 1, item.w - 2, item.h + 2);
        bctx.fillRect(item.x - 1, iy + 1, item.w + 2, item.h - 2);
        bctx.fillRect(item.x, iy, item.w, item.h);
        bctx.fillStyle = pal.edgeLine;
        bctx.fillRect(item.x + 1, iy + 1, item.w - 2, item.h - 2);
        /* The shadow row under the face is what makes it read as
           raised, so a pressed button does not get one. */
        if (!down) {
          bctx.fillStyle = pal.carDark;
          bctx.fillRect(item.x + 1, iy + item.h - 2, item.w - 2, 1);
        } else {
          bctx.fillStyle = pal.carDark;
          bctx.fillRect(item.x + 1, iy + 1, item.w - 2, 1);
        }
        drawText(bctx, item.label, item.x + item.w / 2, iy + Math.round(item.h / 2) - 5, pal.outline, { scale: 2, align: 'center' });
      } else if (item.id === 'restart') {
        /* Destructive, so it does not wear the toggle's clothes. */
        drawPlate(item.x, item.y + down, item.w, item.h, pal, down ? pal.outline : pal.carDark);
        drawText(bctx, item.label, item.x + item.w / 2, item.y + down + Math.round(item.h / 2) - 2, pal.text, { scale: 1, align: 'center' });
      } else {
        drawPlate(item.x, item.y + down, item.w, item.h, pal, down ? pal.outline : undefined);
        let label;
        let value;
        if (item.id === 'car') {
          label = 'Car';
          value = (view.vehicleName || '').toUpperCase();
        } else if (item.id === 'sound') {
          label = 'Sound';
          value = view.soundOn ? 'ON' : 'OFF';
        } else {
          /* No N/A case: menuLayout leaves the row out entirely where
             rumble cannot happen, so the only way to read this row is
             to have it. The fallback that used to live here was
             unreachable, and would have drawn as "N A" anyway, since
             the font has no slash. */
          label = 'Rumble';
          value = view.hapticsOn ? 'ON' : 'OFF';
        }
        const ty = item.y + down + Math.round(item.h / 2) - 2;
        drawText(bctx, label, item.x + 7, ty, pal.text, { scale: 1, align: 'left' });
        drawText(bctx, value, item.x + item.w - 7, ty, pal.edgeLine, { scale: 1, align: 'right' });
      }
    }
  }

  /*
    The silence note. Two states, one message each, drawn last so the
    parked car cannot land on it, on a plate so it does not depend on
    what is behind it, and with its first line at double size because
    at five pixels it was the least readable thing on the screen.

    Short copy on purpose: NO SOUND? at scale 2 is 70 pixels wide in a
    180 pixel buffer, and the sentence it replaced would have been
    246.
  */
  function drawSoundNote(view, pal) {
    const note = view.soundNote;
    if (!note) return;
    const y = menuBottomY('title', view.hapticsSupported) + 6;
    const h = 24;
    drawPlate(10, y, W - 20, h, pal, pal.outline);
    if (note === 'off') {
      drawText(bctx, 'Sound is off', W / 2, y + 3, pal.hazardLight,
        { scale: 2, align: 'center' });
      drawText(bctx, 'TAP SOUND TO TURN IT ON', W / 2, y + 16, pal.text,
        { scale: 1, align: 'center' });
      return;
    }
    drawText(bctx, 'No sound?', W / 2, y + 3, pal.hazardLight,
      { scale: 2, align: 'center' });
    drawText(bctx, 'CHECK THE SIDE SWITCH. TAP TO HIDE', W / 2, y + 16, pal.text,
      { scale: 1, align: 'center' });
  }

  /*
    The top five. Rank and initials read left, distance reads right,
    and the row just earned is picked out in the accent so a player
    can find themselves without counting. An empty board says so
    rather than drawing nothing, and the ring switch hint hangs off
    the bottom of whichever of the two is on screen.
  */
  function drawBoard(view, pal, topY) {
    const rows = view.board || [];
    const slots = view.boardSlots || rows.length;
    /*
      Always five rows, whether they are earned or not. Drawing only
      what exists meant the board changed height as it filled and, on
      a first run, showed a single line where the thing being competed
      for is a top five. The empty ranks are dashes and a zero, in the
      recessive colour, so the shape of the goal is visible from the
      first game over and a filled row reads as progress against it.
    */
    /*
      Opaque, not the translucent HUD band. At one or two rows the
      world showing through was texture; at a guaranteed five it is a
      car driving across the text, and the dimmest rows on it are the
      placeholders. The game over headline above made the same move
      for the same reason.
    */
    drawPlate(27, topY - 5, W - 54, 12 + slots * 7, pal, pal.outline);
    drawText(bctx, 'Top five', W / 2, topY, pal.edgeLine, { scale: 1, align: 'center' });
    for (let i = 0; i < slots; i += 1) {
      const y = topY + 8 + i * 7;
      const row = rows[i];
      if (!row) {
        drawText(bctx, (i + 1) + ' ---', 42, y, pal.building, { scale: 1, align: 'left' });
        drawText(bctx, '0M', W - 42, y, pal.building, { scale: 1, align: 'right' });
        continue;
      }
      const mine = i === view.newEntryIndex;
      const color = mine ? pal.edgeLine : pal.text;
      drawText(bctx, (i + 1) + ' ' + row.name, 42, y, color, { scale: 1, align: 'left' });
      drawText(bctx, row.meters + 'M', W - 42, y, color, { scale: 1, align: 'right' });
    }
  }

  /*
    The way in to the legend. A row in the menu would have cost the
    board its space on the shorter layout, so it is a corner button,
    the same shape and the same hit box as the pause control during a
    run: top right, bounded in y by the band it sits in.
  */
  function helpRect() {
    const b = TUNING.render.pauseBtn;
    return { x: TUNING.render.hudPlate.marginPx, y: 3, w: b.wPx, h: b.hPx };
  }

  function hitTestHelp(lx, ly) {
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) return false;
    const b = TUNING.render.pauseBtn;
    return lx <= b.hitWPx && ly >= 0 && ly <= TUNING.render.hudBandHPx;
  }

  function drawHelpButton(view, pal) {
    const r = helpRect();
    const down = view.pressedMenuId === 'help' ? 1 : 0;
    drawPlate(r.x, r.y + down, r.w, r.h, pal, down ? pal.outline : undefined);
    drawText(bctx, '?', r.x + r.w / 2, r.y + down + 4, pal.text, { scale: 2, align: 'center' });
  }

  /*
    The legend. Every character in it is in the font, and the lines are
    the verbs in the order a player meets them: steer, boost, fuel,
    pause. It is reachable from the title for as long as anyone wants
    it, which is the half of the teaching the one time prompts cannot
    do, because a returning player has already spent those.
  */
  /*
    Every row is a verb at double size with the detail under it, and
    an icon on the left. It was two lines of five pixel type before,
    which is the smallest thing in the product, on the one screen
    whose entire job is to be read.

    The icons are the game's own: the coffee cup is the sprite the
    player collects, and the pause bars are the button they will
    press. Lane and boost get drawn arrows in the same chevron
    language the overtaker warnings use, because there is no sprite
    that says "tap here" and inventing one would say less than an
    arrow does.

    No commas anywhere. The font has A to Z, 0 to 9, ampersand, full
    stop, exclamation, plus and slash, and drawText skips silently
    past anything else.
  */
  const HOW_TO_ROWS = [
    { icon: 'lanes', title: 'Steer', detail: 'Tap a lane to move into it' },
    { icon: 'boost', title: 'Boost', detail: 'Swipe up or tap your own lane' },
    { icon: 'dodge', title: 'Dodge', detail: 'Weave around cones and rubble' },
    { icon: 'coffee', title: 'Fuel', detail: 'Grab every coffee cup' },
    { icon: 'heart', title: 'Hearts', detail: 'Your lives. Grab a spare' },
    { icon: 'nitro', title: 'Nitro', detail: 'A free boost. No coffee used' }
  ];

  /* A chevron, pointing up or left or right, in the accent. */
  function drawChevron(cx, cy, dir, pal) {
    bctx.fillStyle = pal.outline;
    for (let k = -4; k <= 4; k += 1) {
      const d = Math.abs(k) - 4;
      if (dir === 'up') bctx.fillRect(cx + k, cy + d, 1, 5);
      else bctx.fillRect(cx - d * (dir === 'left' ? -1 : 1) - 2, cy + k, 5, 1);
    }
    bctx.fillStyle = pal.edgeLine;
    for (let k = -3; k <= 3; k += 1) {
      const d = Math.abs(k) - 3;
      if (dir === 'up') bctx.fillRect(cx + k, cy + d + 1, 1, 3);
      else bctx.fillRect(cx - d * (dir === 'left' ? -1 : 1) - 1, cy + k, 3, 1);
    }
  }

  /*
    The icon column, centred on cx. Four of the six rows show the thing
    itself, straight out of the atlas, so what the screen teaches and
    what the road shows are the same picture. The two gestures have no
    object to show, so they get chevrons.
  */
  const HOW_TO_ICON_SPRITES = {
    coffee: 'pickup_coffee', dodge: 'obs_cone', heart: 'item_heart', nitro: 'item_nitro'
  };

  function drawHowToIcon(kind, cx, cy, pal) {
    const key = HOW_TO_ICON_SPRITES[kind];
    if (key) {
      const spr = getSprite(key);
      bctx.drawImage(spr, Math.round(cx - spr.width / 2), Math.round(cy - spr.height / 2));
      return;
    }
    if (kind === 'boost') {
      drawChevron(cx, Math.round(cy) - 5, 'up', pal);
      drawChevron(cx, Math.round(cy) + 2, 'up', pal);
      return;
    }
    drawChevron(cx - 5, Math.round(cy), 'left', pal);
    drawChevron(cx + 5, Math.round(cy), 'right', pal);
  }

  /*
    Six rows in 180 by 320, with the Back button under them and the
    parked car under that. The row height is set by the tallest icon:
    the nitro canister is 24 pixels, so 27 is the smallest row that
    frames it rather than crowding it. Everything else follows from
    that, which is why the header is a thin bar rather than the deeper
    plate the four row version could afford.
  */
  const HOW_TO_ROW_H = 27;
  const HOW_TO_TOP_Y = 32;

  function drawHowTo(view, pal) {
    bctx.fillStyle = pal.dim;
    bctx.fillRect(0, 0, W, H);
    drawPlate(8, 10, W - 16, 18, pal);
    drawText(bctx, 'How to play', W / 2, 14, pal.edgeLine, { scale: 2, align: 'center' });
    let y = HOW_TO_TOP_Y;
    for (const row of HOW_TO_ROWS) {
      const h = HOW_TO_ROW_H;
      drawPlate(8, y, W - 16, h, pal);
      drawHowToIcon(row.icon, 22, y + h / 2, pal);
      drawText(bctx, row.title, 40, y + 4, pal.edgeLine, { scale: 2, align: 'left' });
      drawText(bctx, row.detail, 40, y + 17, pal.text, { scale: 1, align: 'left' });
      y += h + 2;
    }
    drawMenu(view, pal, 'howto');
    drawParkedCar(view);
  }

  /*
    The build tag.

    It is the only version signal this game has. There is no telemetry
    behind it, so when a player says something is broken, the thing on
    this line is the whole of what can be established about which code
    they were running. It was drawn in the scenery grey on whatever
    the shoulder happened to be, which measured about 1.1 to 1 against
    the dimmed offroad on some themes: present, and unreadable.

    It keeps its place and its size, because it is not for the player
    in the ordinary case. It gets the same dark plate the rest of the
    interface uses, so it reads at a consistent contrast whichever
    theme is scrolling underneath, and stops being scenery.
  */
  function drawBuildTag(pal) {
    const w = textWidth(BUILD_TAG, 1) + 6;
    const x = W - 2 - w;
    const y = H - 11;
    drawPlate(x, y, w, 11, pal);
    drawText(bctx, BUILD_TAG, W - 5, y + 3, pal.text, { scale: 1, align: 'right' });
  }

  function drawTitle(view, pal) {
    bctx.fillStyle = pal.dim;
    bctx.fillRect(0, 0, W, H);
    const badge = getSprite('ui_badge');
    bctx.drawImage(badge, Math.round((W - badge.width) / 2), 16);
    drawMenu(view, pal, 'title');
    /*
      No board here any more.

      The car parks at the bottom of this screen and does not move,
      which is what stops choosing one making it jump, and the board's
      band was the space it parks in. One of the two had to give, and
      the board is the one that already has somewhere else to be: the
      game over screen, where a score has just been earned and the top
      five is the thing being asked about. On the title it was a list
      of other people's runs in front of the car you were choosing.
    */
    drawParkedCar(view);
    drawSoundNote(view, pal);
    drawBuildTag(pal);
    drawHelpButton(view, pal);
  }

  /*
    Reads in the order the player asks the questions: what happened,
    how far did I get, how does that compare, now let me go again. The
    top five used to sit above all of that, which put someone else's
    score in front of your own result. It now sits under the menu,
    where it is still there to look at and no longer the headline.
  */
  /*
    The only advance warning the game gives of a threat coming from
    behind, and it was the least visible thing on the road: red on
    undimmed tarmac at 1.60:1, sitting in the last 7% of the canvas
    under the player's thumb, and painted before the traffic layer so
    a car parked in the same lane covered it.

    Now amber with a dark keyline (3.92:1 as a graphic, 8.10:1 at the
    glyph edge), lifted clear of the thumb, and drawn last so nothing
    can paint over it. The 3Hz blink stays: it is what makes the thing
    read as a warning rather than road furniture.
  */
  function drawOvertakerWarnings(view, pal) {
    const t = worldNow() / 1000;
    if (Math.floor(t * 6) % 2 !== 0) return;
    for (let i = 0; i < view.overtakers.length; i += 1) {
      const ov = view.overtakers[i];
      const screenY = TUNING.render.playerYPx - (ov.distPx - view.distancePx);
      if (screenY <= H + 40) continue;
      const cx = Math.round(laneCenterXPx(ov.lane));
      for (let c = 0; c < 2; c += 1) {
        const baseY = H - 22 - c * 7;
        /* keyline first, then the arrow inside it */
        bctx.fillStyle = pal.outline;
        for (let k = -4; k <= 4; k += 1) {
          bctx.fillRect(cx + k, baseY + Math.abs(k) - 5, 1, 5);
        }
        bctx.fillStyle = pal.hazardLight;
        for (let k = -3; k <= 3; k += 1) {
          bctx.fillRect(cx + k, baseY + Math.abs(k) - 3, 1, 3);
        }
      }
    }
  }

  function drawGameOver(pal, view) {
    bctx.fillStyle = pal.dim;
    bctx.fillRect(0, 0, W, H);
    /*
      The world keeps scrolling behind this screen, so the headline
      was drawn on a background that changed every frame: 2.87:1 over
      road, 1.67:1 over the green shoulder, 1.14:1 when a pale car
      passed under it. drawBoard's comment two functions down explains
      exactly this and gives the board a band; the lesson was never
      applied to the line that says why you died, which matters more.
      A translucent band is not enough here (it only reaches 2.34:1
      over a white car), so this one is opaque: the result block now
      has a fixed background whatever is driving past behind it.
    */
    drawPlate(14, 42, W - 28, 72, pal, pal.outline);
    /* one highlight row, the same bevel the plates carry */
    bctx.fillStyle = pal.road;
    bctx.fillRect(15, 43, W - 30, 1);
    const cause = view.deathCause === 'fuel' ? 'Out of coffee' : 'Crashed';
    drawText(bctx, cause, W / 2, 50, pal.carBody, { scale: 2, align: 'center' });
    drawText(bctx, view.meters + ' m', W / 2, 78, pal.text, { scale: 2, align: 'center' });
    if (view.newBest) {
      drawText(bctx, 'New best!', W / 2, 104, pal.edgeLine, { scale: 1, align: 'center' });
    } else {
      drawText(bctx, 'Best ' + view.high + ' m', W / 2, 104, pal.text, { scale: 1, align: 'center' });
    }
    drawMenu(view, pal, 'gameOver');
    /*
      The board hangs off the last menu row rather than sitting at a
      fixed y. It used to be pinned at 252, which is where the longest
      layout ends, so on a phone with no Rumble row (every iPhone) the
      menu stopped 29 pixels short and the gap read as a missing
      element. Anchoring keeps the same spacing on both, and the board
      is 47 pixels tall against a 320 pixel screen, so the longer
      layout still clears the bottom with room to spare.
    */
    drawBoard(view, pal, menuBottomY('gameOver', view.hapticsSupported) + 11);
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
  let prevMode = null;

  function drawFrame(view) {
    tickWorldClock(view.mode);
    if (view.mode !== prevMode) {
      /* Resuming is not starting: the car did not go anywhere. */
      if (view.mode === 'playing' && prevMode !== 'paused') {
        startRunIntro();
        clearSkids();
      }
      prevMode = view.mode;
    }
    units = frameUnits();
    const pal = TUNING.palette.city;
    const sx = view.shakeX | 0;
    const sy = view.shakeY | 0;
    bctx.save();
    bctx.translate(sx, sy);
    drawRoad(view.distancePx, pal, view.tier);
    drawSpeedLines(view, pal);
    drawSkids(view, pal);
    drawHazards(view);
    drawPickups(view);
    drawOvertakers(view, pal);
    drawTraffic(view);
    drawOvertakerWarnings(view, pal);
    /* On the title and the legend the car is drawn by those screens,
       on top of their dim layer, so it keeps its colour. */
    if (view.mode !== 'title' && view.mode !== 'howto') drawPlayer(view);
    drawParticles();
    boostTipDrawn = false;
    view.coffeeTipDrawn = drawCoffeeTip(view, pal);
    view.steerTipDrawn = drawSteerTip(view, pal);
    bctx.restore();
    /* The game over screen states the distance and the best in full
       size, so the run HUD is redundant there, and dropping it frees
       the top band for the board. */
    if (view.mode === 'playing' || view.mode === 'paused') {
      drawHudBand(pal);
      drawFuelBar(view, pal);
      drawScore(view, pal);
      drawTierBanner(view, pal);
    }
    view.boostTipDrawn = boostTipDrawn;
    if (view.mode === 'title') drawTitle(view, pal);
    if (view.mode === 'howto') drawHowTo(view, pal);
    if (view.mode === 'paused') drawPaused(view, pal);
    if (view.mode === 'gameOver') drawGameOver(pal, view);
    ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
  }

  /* The rows a keyboard can move between, in the order they are
     drawn. The ring switch hint is not one: it is a line of text with
     a tap target, not a control. */
  function menuIds(mode, hapticsSupported) {
    return menuLayout(mode, false, hapticsSupported)
      .filter((item) => item.id !== 'soundtip')
      .map((item) => item.id);
  }

  return { drawFrame, resize, screenToLogicalX, screenToLogical, hitTestMenu, hitTestPause, hitTestHelp, menuIds, addPuff, addPickupPop };
}
