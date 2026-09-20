import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLYPH_CHARS, drawText } from '../src/render/font.js';

/*
  The boot card draws its own text, because it is the thing that has
  to still work when the module graph does not load, so it carries a
  flat copy of the 3x5 font rather than importing one. A copy drifts.
  This regenerates the string from the font module and compares, so
  adding a glyph to the game and forgetting the card is a failing
  test rather than a missing character on the first screen anyone
  sees.
*/

function rowsFor(ch) {
  const rows = [0, 0, 0, 0, 0];
  const ctx = {
    fillStyle: '',
    fillRect(x, y) { rows[y] |= 1 << (2 - x); }
  };
  drawText(ctx, ch, 0, 0, '#fff', { scale: 1 });
  return rows.join('');
}

function bootFont() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const decl = html.match(/var FONT = ([\s\S]*?);\n/);
  assert.ok(decl, 'the boot card still declares a FONT string');
  const parts = decl[1].match(/'([^']*)'/g);
  assert.ok(parts && parts.length > 0, 'the FONT string is made of quoted parts');
  return parts.map((p) => p.slice(1, -1)).join('');
}

test('the boot card font is the game font', () => {
  const expected = GLYPH_CHARS.map((ch) => ch + rowsFor(ch)).join('');
  assert.equal(bootFont(), expected);
});

test('every boot font entry is six characters', () => {
  const font = bootFont();
  assert.equal(font.length % 6, 0);
  for (let i = 0; i < font.length; i += 6) {
    const digits = font.substr(i + 1, 5);
    assert.match(digits, /^[0-7]{5}$/, 'rows are octal digits at ' + i);
  }
});

/* The card's own strings, so a wording change that reaches for a
   character the font does not have is caught here rather than
   rendering as a gap. */
test('the card only writes characters the font can draw', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const spoken = [
    'Cars & Coffee', 'Try again', 'Loading',
    'Still loading. Your connection may have dropped.',
    'Could not load the game files.',
    'Could not load the game.', 'Something went wrong.'
  ];
  for (const line of spoken) {
    assert.ok(html.includes(line), 'the card still says: ' + line);
    for (const ch of line.toUpperCase()) {
      assert.ok(GLYPH_CHARS.includes(ch), 'no glyph for ' + JSON.stringify(ch) + ' in ' + line);
    }
  }
});
