/*
  Initials entry, drawn in the game rather than in the page.

  This used to be an HTML card with a text input, which meant a phone
  raised its own keyboard over the screen and a canvas arcade game
  suddenly looked like a form. It carried three iOS bugs of its own
  (a field that would not take a caret, a Save button the keyboard
  buried, and no way out), all of them fixed, and all of them only
  ever problems because there was a text field at all.

  So there is no text field. Three columns of one character each,
  changed with the chevrons above and below them, the way every
  arcade machine has done it since the early eighties. Nothing to
  focus, no keyboard to raise, no second design system on top of the
  game.

  This module is state and rules only: which characters exist, where
  the cursor is, and what a move does. Drawing lives in the renderer
  and input in the app, the same split as everything else here.
*/

import { NAME_LENGTH } from './leaderboard.js';

/*
  What a name can be made of. The board accepts A to Z and 0 to 9
  (cleanName strips the rest), and the 3 by 5 font can draw all of
  them, so the wheel holds exactly that and nothing a player could
  pick would be rejected on the way in.
*/
export const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function createInitialsPicker() {
  let open = false;
  let meters = 0;
  let col = 0;
  const at = new Array(NAME_LENGTH).fill(0);

  function name() {
    let s = '';
    for (let i = 0; i < NAME_LENGTH; i += 1) s += GLYPHS[at[i]];
    return s;
  }

  return {
    isOpen() { return open; },

    show(m) {
      open = true;
      meters = m;
      col = 0;
      for (let i = 0; i < NAME_LENGTH; i += 1) at[i] = 0;
    },

    close() { open = false; },

    /* Everything the renderer needs and nothing it does not. */
    state() {
      return { letters: name().split(''), col, meters };
    },

    name,

    /* Wraps, because a wheel that stops at Z is a wheel with a wrong
       end. dir is -1 for the chevron above, which walks toward A. */
    step(column, dir) {
      if (column < 0 || column >= NAME_LENGTH) return;
      col = column;
      at[column] = (at[column] + dir + GLYPHS.length) % GLYPHS.length;
    },

    select(column) {
      if (column < 0 || column >= NAME_LENGTH) return;
      col = column;
    },

    /* Keyboard: left and right walk the columns, and they wrap too,
       so a player holding one arrow never gets stuck at an edge. */
    moveCursor(dir) {
      col = (col + dir + NAME_LENGTH) % NAME_LENGTH;
    },

    cursor() { return col; }
  };
}
