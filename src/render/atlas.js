/*
  The atlas contract: which frame names the game needs, and how to read
  them out of the packed atlas.

  This is the half of sprites.js that touches no pixels, split out so
  the node tests can hold the same list the renderer uses rather than a
  copy of it. The atlas is a generated artefact: one repack with
  different padding and every collision box in TRAFFIC_VARIANTS could
  disagree with the art it is drawn from, with nothing anywhere saying
  so. test/atlas.test.js is that something, and it can only be honest
  if it imports this.

  Nothing here uses the document, so it stays importable outside a
  browser.
*/

import { TRAFFIC_VARIANTS, OBSTACLE_SPRITES } from '../game/tuning.js';

/* Registry keys used by the game map to atlas frame names here. */
export const ALIASES = {
  player_coupe: 'sport_coupe',
  player_4x4: 'fourbyfour',
  player_classic: 'classic'
};

/* Frames the game asks for by name rather than through a list: the two
   halves of an oil slick, and the two pickups. */
export const EXTRA_FRAMES = ['obs_oil_left', 'obs_oil_right', 'item_heart', 'item_nitro'];

/*
  Everything sliced out of the atlas. The set is explicit rather than
  "slice every frame" so a frame the game does not actually use is a
  loud missing name error at load instead of silent dead weight in
  memory.
*/
export function neededFrames() {
  return new Set([
    ...Object.values(ALIASES),
    ...TRAFFIC_VARIANTS.map((v) => v.sprite),
    ...OBSTACLE_SPRITES,
    ...EXTRA_FRAMES
  ]);
}

/*
  libGDX TexturePacker text atlas. Note the first line names the page
  image, and it parses as a frame with no fields, which is harmless
  because nothing ever asks for it by that name.
*/
export function parseAtlas(text) {
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

/* The page image the atlas names at the top, so a caller can tell the
   header apart from the frames that follow it. The file this repo
   ships opens with a blank line, so it is the first line with anything
   on it rather than the first line. */
export function pageName(text) {
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) return line.trim();
  }
  return '';
}
