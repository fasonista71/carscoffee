/*
  Procedural placeholder sprites behind a registry keyed by name.

  The swap seam: when real PNG spritesheets arrive, this file changes
  to load and slice them under the same keys, and nothing outside
  render/ changes. Game logic never sees a sprite, only sprite keys.

  Placeholder art rules from the brief: chunky pixels, hard edges,
  1 to 2 px dark outlines, readable by silhouette alone.
*/

import { TUNING } from '../game/tuning.js';

const registry = new Map();

/*
  Pixel maps. Each string is one row, one character per pixel.
  '.' is transparent. Other characters index into the sprite's colors.
*/
function cityColors() {
  const pal = TUNING.palette.city;
  return {
    O: pal.outline,
    R: pal.carBody,
    D: pal.carDark,
    W: pal.carWindow,
    T: pal.tire
  };
}

const SPRITE_DEFS = {
  player_car: () => ({
    colors: cityColors(),
    rows: [
      '....OOOO....',
      '...ORRRRO...',
      '..ORRRRRRO..',
      '.ORRRRRRRRO.',
      'TTORRWWRROTT',
      'TTORWWWWROTT',
      '.ORWWWWWWRO.',
      '.ORRWWWWRRO.',
      '.ORRRRRRRRO.',
      '.ORRRRRRRRO.',
      '.ORDRRRRDRO.',
      '.ORRRRRRRRO.',
      '.ORRRRRRRRO.',
      'TTORRRRRROTT',
      'TTORRRRRROTT',
      '.ORRRRRRRRO.',
      '..ORRRRRRO..',
      '..ORDDDDRO..',
      '...OOOOOO...',
      '............'
    ]
  })
};

export function getSprite(key) {
  if (registry.has(key)) return registry.get(key);
  const def = SPRITE_DEFS[key];
  if (!def) throw new Error('Unknown sprite key: ' + key);
  const { colors, rows } = def();
  const h = rows.length;
  const w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const color = colors[ch];
      if (!color) throw new Error('Sprite ' + key + ' uses unmapped char ' + ch);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  registry.set(key, c);
  return c;
}
