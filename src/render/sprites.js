/*
  Sprite registry, now backed by a real spritesheet.

  Car art: original artwork commissioned for this project by Jason
  Fields (Fasonista), cut from the 30 vehicle top-down sheet and
  reduced to game resolution. The third party "Road To Rage" pack this
  file used to name is gone; none of its art remains in the atlas.
  assets/CARS_CREDITS.txt is the record.

  The atlas is a libGDX TexturePacker text atlas. Coordinates were
  verified empirically against the sheet: xy is measured from the TOP
  LEFT of the image, which matches drawImage source coordinates
  directly. Each named frame is sliced once at load into its own
  small backing surface, so drawing stays a single blit.

  The swap seam holds: game logic knows sprite keys and art variant
  indices, never files or pixels. Swapping art means editing the urls,
  aliases, and variant list below. Nothing outside render/ changes.
*/

/*
  Resolved against this module, not against the page. That is what
  lets the packaging step drop the whole tree into one content
  versioned directory: move src/ and assets/ together and the art
  follows the code, so a browser holding an old build cannot pair its
  cached atlas with a new sheet. A page relative string would have
  resolved to the site root and broken that.
*/
const asset = (name) => new URL('../../assets/' + name, import.meta.url).href;
/* The boot card shows whatever these errors say, and a player does
   not need a content hashed absolute url; the file name is the part
   that means anything. */
const shortName = (url) => String(url).split('/').pop();

const ATLAS_URL = asset('cars.atlas');
const IMAGE_URL = asset('cars.png');

import { TUNING, TRAFFIC_VARIANTS } from '../game/tuning.js';
/* The frame names and the parser live in atlas.js, which is the half
   of this file that touches no pixels, so the node tests can hold the
   same list rather than a copy of it. */
import { ALIASES, neededFrames, parseAtlas } from './atlas.js';

const registry = new Map();

const COFFEE_URL = asset('coffee.png');
const BADGE_URL = asset('badge.png');

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load ' + shortName(url)));
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
  const badgeReady = loadImage(BADGE_URL).then((img) => {
    registry.set('ui_badge', toSurface(img));
  });
  const atlasReady = fetch(ATLAS_URL).then((r) => {
    if (!r.ok) throw new Error('Could not load ' + shortName(ATLAS_URL));
    return r.text();
  });
  return Promise.all([atlasReady, imageReady, coffeeReady, badgeReady]).then(([text, img]) => {
    const frames = parseAtlas(text);
    for (const name of neededFrames()) {
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


/*
  Rubble: a chunky mound of overlapping rock lumps, sized to read at
  speed. Lit from the top, shadowed at the base, dark outline.
*/

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

/*
  Muted speaker, drawn at heart size so it sits in the HUD top row
  without disturbing the spacing. S is the cone, X the slash.
*/
const MUTE_ROWS = [
  '....SS..X',
  '...SSS.X.',
  '..SSSSX..',
  'SSSSSX...',
  'SSSSXS...',
  'SSSXSS...',
  '..XSSS...',
  '.X.SSS...',
  'X...SS...'
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
  /* Obstacles and the two directional slicks now come from the atlas
     and are registered by their frame names in the loop above. The
     old buildSlick and buildRubble generators are gone with them. */
  registry.set('ui_heart_full', buildPixmap(HEART_ROWS, {
    R: pal.carBody, W: pal.dash
  }));
  registry.set('ui_heart_empty', buildPixmap(HEART_ROWS, {
    R: pal.heartEmpty, W: pal.heartEmpty
  }));
  /* The cone has to carry against the road and the shaded HUD band,
     so it takes the text colour; only the slash is red. */
  registry.set('ui_mute', buildPixmap(MUTE_ROWS, {
    S: pal.text, X: pal.carBody
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
