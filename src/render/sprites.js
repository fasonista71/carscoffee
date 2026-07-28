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

import { TRAFFIC_VARIANTS } from '../game/tuning.js';

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
  });
}

export function getSprite(key) {
  const spr = registry.get(ALIASES[key] || key);
  if (!spr) throw new Error('Sprite not loaded: ' + key);
  return spr;
}

export function getTrafficSprite(variant) {
  return getSprite(TRAFFIC_VARIANTS[variant % TRAFFIC_VARIANTS.length].sprite);
}
