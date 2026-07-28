/*
  Sprite registry, now backed by a real spritesheet.

  Car art: "Road To Rage" vehicle pack by TMD Studios,
  tmdstudios.wordpress.com, used with attribution per the license note
  shipped in assets/CARS_CREDITS.txt.

  The atlas is a libGDX TexturePacker text atlas. Coordinates were
  verified empirically against the sheet: xy is measured from the TOP
  LEFT of the image, which matches drawImage source coordinates
  directly. Each named frame is sliced once at load into its own
  small backing surface, so drawing stays a single blit.

  The swap seam holds: game logic knows sprite keys and art variant
  indices, never files or pixels. Swapping art means editing the urls,
  aliases, and variant list below. Nothing outside render/ changes.
*/

const ATLAS_URL = 'assets/cars.atlas';
const IMAGE_URL = 'assets/cars.png';

import { TUNING, TRAFFIC_VARIANTS } from '../game/tuning.js';

/* Registry keys used by the game map to atlas frame names here. */
const ALIASES = {
  player_car: 'porsche'
};

const registry = new Map();

function parseAtlas(text) {
  const frames = {};
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) { current = null; continue; }
    const indented = raw.startsWith(' ') || raw.startsWith('\t');
    if (!indented && !raw.includes(':')) {
      current = raw.trim();
      frames[current] = {};
      continue;
    }
    if (current && raw.includes(':')) {
      const idx = raw.indexOf(':');
      const key = raw.slice(0, idx).trim();
      const val = raw.slice(idx + 1).trim();
      if (key === 'xy' || key === 'size') {
        const [a, b] = val.split(',').map((n) => parseInt(n.trim(), 10));
        if (key === 'xy') { frames[current].x = a; frames[current].y = b; }
        else { frames[current].w = a; frames[current].h = b; }
      }
    }
  }
  return frames;
}

const COFFEE_URL = 'assets/coffee.png';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load ' + url));
    img.src = url;
  });
}

function toSurface(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  return c;
}

export function loadSprites() {
  const imageReady = loadImage(IMAGE_URL);
  const coffeeReady = loadImage(COFFEE_URL).then((img) => {
    registry.set('pickup_coffee', toSurface(img));
  });
  const atlasReady = fetch(ATLAS_URL).then((r) => {
    if (!r.ok) throw new Error('Could not load ' + ATLAS_URL);
    return r.text();
  });
  return Promise.all([atlasReady, imageReady, coffeeReady]).then(([text, img]) => {
    const frames = parseAtlas(text);
    const needed = new Set([
      ...Object.values(ALIASES),
      ...TRAFFIC_VARIANTS.map((v) => v.sprite)
    ]);
    for (const name of needed) {
      const f = frames[name];
      if (!f || f.w == null || f.x == null) {
        throw new Error('Atlas frame missing or incomplete: ' + name);
      }
      const c = document.createElement('canvas');
      c.width = f.w;
      c.height = f.h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      registry.set(name, c);
    }
    buildProcedural();
  });
}

/*
  Procedural sprites for things the sheet does not cover: hazards and
  HUD icons. Built once at load, same registry, same swap seam: PNG
  replacements later just claim these keys.
*/
function buildSurface(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx);
  return c;
}

function buildSlick(dir) {
  const pal = TUNING.palette.city;
  const w = 26;
  const h = 12;
  return buildSurface(w, h, (ctx) => {
    /* outline blob then inner puddle */
    for (let y = 0; y < h; y += 1) {
      const ry = ((y + 0.5) / h) * 2 - 1;
      const half = Math.floor(Math.sqrt(Math.max(0, 1 - ry * ry)) * (w / 2));
      if (half <= 0) continue;
      ctx.fillStyle = pal.outline;
      ctx.fillRect(w / 2 - half, y, half * 2, 1);
      if (y > 0 && y < h - 1 && half > 2) {
        ctx.fillStyle = pal.slick;
        ctx.fillRect(w / 2 - half + 1, y, half * 2 - 2, 1);
      }
    }
    /* three chevrons pointing in the slide direction */
    ctx.fillStyle = pal.slickArrow;
    const cy = Math.floor(h / 2);
    for (let c0 = 0; c0 < 3; c0 += 1) {
      const baseX = dir > 0 ? 6 + c0 * 6 : w - 8 - c0 * 6;
      for (let k = -2; k <= 2; k += 1) {
        const off = 2 - Math.abs(k);
        const x = dir > 0 ? baseX + off : baseX - off;
        ctx.fillRect(x, cy + k, 1, 1);
      }
    }
  });
}

/*
  Rubble: a chunky mound of overlapping rock lumps, sized to read at
  speed. Lit from the top, shadowed at the base, dark outline.
*/
function buildRubble() {
  const pal = TUNING.palette.city;
  const w = 24;
  const h = 16;
  const lumps = [
    { cx: 7, cy: 10, rx: 6.5, ry: 5 },
    { cx: 16, cy: 9, rx: 6.5, ry: 5.5 },
    { cx: 11, cy: 6, rx: 5, ry: 4 }
  ];
  const inside = (x, y) => lumps.some((l) => {
    const dx = (x - l.cx) / l.rx;
    const dy = (y - l.cy) / l.ry;
    return dx * dx + dy * dy <= 1;
  });
  return buildSurface(w, h, (ctx) => {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!inside(x, y)) continue;
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        let color;
        if (edge) color = pal.outline;
        else if (y <= 5) color = pal.rubbleLight;
        else if (y >= 12) color = pal.rubbleDark;
        else color = ((x * 7 + y * 5) % 11 < 3) ? pal.rubbleDark : pal.rubbleMid;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

const HEART_ROWS = [
  '.RR...RR.',
  'RWRR.RRRR',
  'RRRRRRRRR',
  'RRRRRRRRR',
  '.RRRRRRR.',
  '..RRRRR..',
  '...RRR...',
  '....R....'
];

function buildPixmap(rows, colors) {
  const h = rows.length;
  const w = rows[0].length;
  for (const r of rows) {
    if (r.length !== w) throw new Error('Pixmap row length mismatch');
  }
  return buildSurface(w, h, (ctx) => {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        const color = colors[ch];
        if (!color) throw new Error('Pixmap uses unmapped char ' + ch);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

function buildProcedural() {
  const pal = TUNING.palette.city;
  registry.set('obstacle_slick_left', buildSlick(-1));
  registry.set('obstacle_slick_right', buildSlick(1));
  registry.set('obstacle_rubble', buildRubble());
  registry.set('ui_heart_full', buildPixmap(HEART_ROWS, {
    R: pal.carBody, W: pal.dash
  }));
  registry.set('ui_heart_empty', buildPixmap(HEART_ROWS, {
    R: pal.heartEmpty, W: pal.heartEmpty
  }));
}

export function getSprite(key) {
  const spr = registry.get(ALIASES[key] || key);
  if (!spr) throw new Error('Sprite not loaded: ' + key);
  return spr;
}

export function getTrafficSprite(variant) {
  return getSprite(TRAFFIC_VARIANTS[variant % TRAFFIC_VARIANTS.length].sprite);
}
